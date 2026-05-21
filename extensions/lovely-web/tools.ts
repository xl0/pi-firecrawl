import { StringEnum } from "@earendil-works/pi-ai"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Text } from "@earendil-works/pi-tui"
import { Type } from "typebox"
import { getImageMaxSize, getProvider, isImageEnabled, isImageResizeEnabled, loadConfig } from "./config.js"
import { asErrorMessage } from "./format.js"
import { DEFAULT_MAX_IMAGE_BYTES, imageImpl, MAX_IMAGE_BYTES } from "./image.js"
import { renderTextResult } from "./render.js"
import { fetchImpl, searchImpl } from "./tool-impl.js"

export function registerLovelyWebTools(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: "Search the web.",
		promptSnippet: "Use web_search for current web information.",
		promptGuidelines: [
			"Use web_search when the user asks for current web information, discovery, or sources beyond the local workspace.",
			"Use web_fetch after web_search when you need the full content of a specific page."
		],
		parameters: Type.Object({
			query: Type.String({ description: "The web search query." }),
			limit: Type.Optional(
				Type.Integer({
					description: "Maximum number of results to return. Defaults to 5.",
					minimum: 1,
					maximum: 20
				})
			),
			source: Type.Optional(StringEnum(["web", "news", "images"] as const)),
			fetchResult: Type.Optional(
				Type.Boolean({
					description: "Whether to fetch the first result and include markdown. Defaults to true."
				})
			)
		}),
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0)
			const bits = [args.source ?? "web", `limit ${args.limit ?? 5}`]
			if (args.fetchResult ?? true) bits.push("fetch first")
			text.setText(
				`${theme.fg("toolTitle", theme.bold("web_search "))}${theme.fg("muted", `"${args.query}"`)} ${theme.fg("dim", `(${bits.join(", ")})`)}`
			)
			return text
		},
		renderResult(result, { expanded, isPartial }, theme) {
			return renderTextResult(result, expanded, theme, isPartial ? "Searching..." : "No results")
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			try {
				const config = loadConfig(ctx.cwd)
				const searchProvider = getProvider("search", config)
				onUpdate?.({
					content: [{ type: "text", text: `Searching web with ${searchProvider.label} for: ${params.query}` }],
					details: undefined as unknown
				})
				return await searchImpl(config, params, signal, onUpdate)
			} catch (error) {
				return {
					content: [{ type: "text", text: `Web search failed: ${asErrorMessage(error)}` }],
					details: { error: asErrorMessage(error) },
					isError: true
				}
			}
		}
	})

	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description: "Fetch a page as markdown. Metadata is verbose and opt-in.",
		promptSnippet: "Use web_fetch to fetch a URL as markdown.",
		promptGuidelines: [
			"Use web_fetch when you need the full readable markdown content of a known URL.",
			"Prefer web_fetch over bash/curl for web pages because web_fetch returns cleaned markdown suitable for agent context."
		],
		parameters: Type.Object({
			url: Type.String({ description: "The URL to fetch.", format: "uri" }),
			waitFor: Type.Optional(
				Type.Integer({
					description: "Milliseconds to wait before capturing content, useful for JS-heavy pages.",
					minimum: 0
				})
			),
			timeout: Type.Optional(Type.Integer({ description: "Request timeout in milliseconds. Defaults to 30000.", minimum: 1 })),
			includeMetadata: Type.Optional(
				Type.Boolean({
					description:
						"Append verbose page metadata to the markdown output. Defaults to false. Full metadata is always available in details."
				})
			)
		}),
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0)
			const bits: string[] = []
			if (args.waitFor !== undefined) bits.push(`wait ${args.waitFor}ms`)
			if (args.timeout !== undefined) bits.push(`timeout ${args.timeout}ms`)
			if (args.includeMetadata) bits.push("metadata")
			const suffix = bits.length ? ` ${theme.fg("dim", `(${bits.join(", ")})`)}` : ""
			text.setText(`${theme.fg("toolTitle", theme.bold("web_fetch "))}${theme.fg("muted", args.url)}${suffix}`)
			return text
		},
		renderResult(result, { expanded, isPartial }, theme) {
			return renderTextResult(result, expanded, theme, isPartial ? "Fetching..." : "No content")
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			try {
				const config = loadConfig(ctx.cwd)
				const fetchProvider = getProvider("fetch", config)
				onUpdate?.({
					content: [{ type: "text", text: `Fetching page with ${fetchProvider.label}: ${params.url}` }],
					details: undefined as unknown
				})
				return await fetchImpl(config, params, signal, onUpdate)
			} catch (error) {
				return {
					content: [{ type: "text", text: `Web fetch failed: ${asErrorMessage(error)}` }],
					details: { error: asErrorMessage(error) },
					isError: true
				}
			}
		}
	})

	pi.registerTool({
		name: "web_image",
		label: "Web Image",
		description: "Fetch an image URL and return it as image content for vision-capable models.",
		promptSnippet: "Use web_image to fetch an image URL as image content.",
		promptGuidelines: [
			"Use web_image when you need to inspect a specific image URL with a vision-capable model.",
			"Prefer web_image only for selected images; web pages can contain many irrelevant images."
		],
		parameters: Type.Object({
			url: Type.String({ description: "The image URL to fetch.", format: "uri" }),
			timeout: Type.Optional(Type.Integer({ description: "Request timeout in milliseconds. Defaults to 30000.", minimum: 1 })),
			maxBytes: Type.Optional(
				Type.Integer({
					description: `Maximum image size in bytes. Defaults to ${DEFAULT_MAX_IMAGE_BYTES}; maximum ${MAX_IMAGE_BYTES}.`,
					minimum: 1,
					maximum: MAX_IMAGE_BYTES
				})
			)
		}),
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0)
			const bits: string[] = []
			if (args.timeout !== undefined) bits.push(`timeout ${args.timeout}ms`)
			if (args.maxBytes !== undefined) bits.push(`max ${args.maxBytes} bytes`)
			const suffix = bits.length ? ` ${theme.fg("dim", `(${bits.join(", ")})`)}` : ""
			text.setText(`${theme.fg("toolTitle", theme.bold("web_image "))}${theme.fg("muted", args.url)}${suffix}`)
			return text
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			try {
				const config = loadConfig(ctx.cwd)
				if (!isImageEnabled(config)) throw new Error("web_image is disabled. Enable it via /lovely-web.")
				onUpdate?.({
					content: [{ type: "text", text: `Fetching image: ${params.url}` }],
					details: undefined as unknown
				})
				return await imageImpl(
					{
						url: params.url,
						timeout: params.timeout,
						maxBytes: params.maxBytes,
						resize: isImageResizeEnabled(config),
						maxSize: getImageMaxSize(config)
					},
					signal,
					onUpdate
				)
			} catch (error) {
				return {
					content: [{ type: "text", text: `Web image failed: ${asErrorMessage(error)}` }],
					details: { error: asErrorMessage(error) },
					isError: true
				}
			}
		}
	})
}
