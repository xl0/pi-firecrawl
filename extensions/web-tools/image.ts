import { formatDimensionNote, type ResizedImage, resizeImage } from "@earendil-works/pi-coding-agent"
import { getImageDimensions } from "@earendil-works/pi-tui"
import { DEFAULT_TIMEOUT_MS } from "./config.js"
import type { ToolResult } from "./tool-impl.js"

export const DEFAULT_MAX_IMAGE_BYTES = 5_000_000
export const MAX_IMAGE_BYTES = 20_000_000
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"])

async function fetchImageContent(
	url: string,
	opts: { timeout: number; maxBytes: number },
	signal?: AbortSignal
): Promise<{ data: string; mimeType: string; bytes: number; contentLength?: number }> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), opts.timeout)
	const abort = () => controller.abort()
	if (signal?.aborted) controller.abort()
	else signal?.addEventListener("abort", abort, { once: true })

	try {
		const res = await fetch(url, { signal: controller.signal })
		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Image request failed (${res.status}): ${text}`)
		}

		const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
		if (!mimeType || !SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
			throw new Error(`Unsupported image content-type: ${mimeType || "missing"}`)
		}

		const contentLength = res.headers.get("content-length")
		const parsedContentLength = contentLength ? Number(contentLength) : undefined
		if (parsedContentLength !== undefined && parsedContentLength > opts.maxBytes) {
			throw new Error(`Image too large: ${parsedContentLength} bytes exceeds ${opts.maxBytes}`)
		}
		if (!res.body) throw new Error("Image response had no body")

		let bytes = 0
		const chunks: Uint8Array[] = []
		const reader = res.body.getReader()
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			bytes += value.byteLength
			if (bytes > opts.maxBytes) {
				await reader.cancel()
				throw new Error(`Image too large: exceeded ${opts.maxBytes} bytes`)
			}
			chunks.push(value)
		}

		return {
			data: Buffer.concat(chunks).toString("base64"),
			mimeType,
			bytes,
			...(parsedContentLength !== undefined ? { contentLength: parsedContentLength } : {})
		}
	} finally {
		clearTimeout(timer)
		signal?.removeEventListener("abort", abort)
	}
}

export async function imageImpl(
	params: {
		url: string
		timeout?: number | undefined
		maxBytes?: number | undefined
		resize?: boolean | undefined
		maxSize?: number | undefined
	},
	signal?: AbortSignal,
	onUpdate?: (result: ToolResult) => void
): Promise<ToolResult> {
	const maxBytes = params.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES
	if (maxBytes > MAX_IMAGE_BYTES) throw new Error(`maxBytes cannot exceed ${MAX_IMAGE_BYTES}`)

	const image = await fetchImageContent(params.url, { timeout: params.timeout ?? DEFAULT_TIMEOUT_MS, maxBytes }, signal)
	if (signal?.aborted) throw new Error("Image fetch cancelled")

	const originalDimensions = getImageDimensions(image.data, image.mimeType) ?? undefined
	const shouldResize = params.resize !== false
	const resized = shouldResize
		? ((await resizeImage(
				{ type: "image", data: image.data, mimeType: image.mimeType },
				{ maxWidth: params.maxSize ?? 2000, maxHeight: params.maxSize ?? 2000 }
			)) as ResizedImage | null)
		: null
	if (!resized) {
		const note = `Fetched image [${image.mimeType}]\n[Image omitted: could not be decoded or resized below the inline image size limit.]`
		const result: ToolResult = {
			content: [{ type: "text" as const, text: note }],
			details: {
				url: params.url,
				mimeType: image.mimeType,
				bytes: image.bytes,
				contentLength: image.contentLength,
				dimensions: originalDimensions
			}
		}
		onUpdate?.(result)
		return result
	}

	const dimensionNote = formatDimensionNote(resized)
	const note = `Fetched image [${resized.mimeType}]${dimensionNote ? `\n${dimensionNote}` : ""}`
	const dimensions = { widthPx: resized.width, heightPx: resized.height }
	const result: ToolResult = {
		content: [
			{ type: "text" as const, text: note },
			{ type: "image" as const, data: resized.data, mimeType: resized.mimeType }
		],
		details: {
			url: params.url,
			mimeType: resized.mimeType,
			bytes: image.bytes,
			contentLength: image.contentLength,
			dimensions,
			originalDimensions,
			wasResized: resized.wasResized
		}
	}
	onUpdate?.(result)
	return result
}
