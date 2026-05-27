import type { ImageContent, TextContent } from "@earendil-works/pi-ai"
import { DEFAULT_TIMEOUT_MS, getImageMaxSize, getProvider, isImageResizeEnabled, resolveApiKey } from "./config.js"
import { asErrorMessage, formatSearchOutput, stringify } from "./format.js"
import { imageImpl } from "./image.js"
import type { WebToolsConfig } from "./providers/types.js"

export interface ToolResult {
	content: Array<TextContent | ImageContent>
	details: unknown
	isError?: boolean
}

export async function searchImpl(
	config: WebToolsConfig,
	params: { query: string; limit?: number; source?: string; fetchResult?: boolean },
	signal?: AbortSignal,
	onUpdate?: (result: ToolResult) => void
): Promise<ToolResult> {
	const searchProvider = getProvider("search", config)
	const apiKey = resolveApiKey(searchProvider, config)

	const searchResult = await searchProvider.search(
		apiKey,
		params.query,
		{
			limit: params.limit ?? 5,
			timeout: DEFAULT_TIMEOUT_MS,
			...(params.source !== undefined ? { source: params.source } : {})
		},
		signal
	)

	if (signal?.aborted) throw new Error("Search cancelled")

	const shouldFetch = params.fetchResult ?? true
	const first = searchResult.results[0]
	let fetchedImage: ToolResult | undefined
	if (shouldFetch && first?.url) {
		onUpdate?.({
			content: [{ type: "text" as const, text: `Fetching first result: ${first.url}` }],
			details: undefined as unknown
		})
		try {
			if (params.source === "images") {
				try {
					fetchedImage = await imageImpl(
						{
							url: first.url,
							timeout: DEFAULT_TIMEOUT_MS,
							resize: isImageResizeEnabled(config),
							maxSize: getImageMaxSize(config)
						},
						signal
					)
				} catch {
					const fetchProvider = getProvider("fetch", config)
					const fetchApiKey = resolveApiKey(fetchProvider, config)
					const fetched = await fetchProvider.fetch(fetchApiKey, first.url, { timeout: DEFAULT_TIMEOUT_MS }, signal)
					first.markdown = fetched.markdown
					if (fetched.metadata) (first as { metadata?: unknown }).metadata = fetched.metadata
				}
			} else {
				const fetchProvider = getProvider("fetch", config)
				const fetchApiKey = resolveApiKey(fetchProvider, config)
				const fetched = await fetchProvider.fetch(fetchApiKey, first.url, { timeout: DEFAULT_TIMEOUT_MS }, signal)
				first.markdown = fetched.markdown
				if (fetched.metadata) (first as { metadata?: unknown }).metadata = fetched.metadata
			}

			if (signal?.aborted) throw new Error("Search cancelled")
		} catch (err) {
			first.description = first.description || `[Fetch failed: ${asErrorMessage(err)}]`
		}
	}

	const result: ToolResult = {
		content: [{ type: "text" as const, text: formatSearchOutput(searchResult.results) }, ...(fetchedImage?.content || [])],
		details: fetchedImage ? { search: searchResult.raw, image: fetchedImage.details } : searchResult.raw
	}
	onUpdate?.(result)
	return result
}

export async function fetchImpl(
	config: WebToolsConfig,
	params: { url: string; waitFor?: number; timeout?: number; includeMetadata?: boolean },
	signal?: AbortSignal,
	onUpdate?: (result: ToolResult) => void
): Promise<ToolResult> {
	const fetchProvider = getProvider("fetch", config)
	const apiKey = resolveApiKey(fetchProvider, config)

	const result = await fetchProvider.fetch(
		apiKey,
		params.url,
		{
			timeout: params.timeout ?? DEFAULT_TIMEOUT_MS,
			...(params.waitFor !== undefined ? { waitFor: params.waitFor } : {})
		},
		signal
	)

	if (signal?.aborted) throw new Error("Fetch cancelled")

	const warning =
		["exa", "tavily"].includes(fetchProvider.id) && params.waitFor !== undefined
			? `Warning: ${fetchProvider.label} ignores waitFor; request sent without any extra page-load delay.\n\n`
			: ""
	const metadata = params.includeMetadata && result.metadata ? `\n\nMetadata:\n${stringify(result.metadata)}` : ""

	const toolResult: ToolResult = {
		content: [{ type: "text" as const, text: `${warning}${result.markdown}${metadata}` }],
		details: result.raw
	}
	onUpdate?.(toolResult)
	return toolResult
}
