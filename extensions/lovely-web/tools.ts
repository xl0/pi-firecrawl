import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Text } from "@earendil-works/pi-tui"
import { type TSchema, Type } from "typebox"
import {
	DEFAULT_PROVIDER_ID,
	DEFAULT_TIMEOUT_MS,
	getImageMaxSize,
	getProvider,
	isFetchEnabled,
	isImageEnabled,
	isImageResizeEnabled,
	loadConfig,
	providers,
	resolveApiKey
} from "./config.js"
import { asErrorMessage, formatSearchOutput, stringify } from "./format.js"
import { DEFAULT_MAX_IMAGE_BYTES, imageImpl, MAX_IMAGE_BYTES } from "./image.js"
import type { SearchOptions, WebToolsConfig } from "./providers/types.js"
import { renderTextResult } from "./render.js"
import type { ToolResult } from "./types.js"

interface SearchToolArgs {
	query: string
	limit?: number
	source?: string
	fetchResult?: boolean
	category?: string
	location?: string
	country?: string
	tbs?: string
	timeRange?: string
	topic?: string
	includeImages?: boolean
	searchLang?: string
	freshness?: string
}

async function fetchSearchResultImage(config: WebToolsConfig, url: string, signal?: AbortSignal): Promise<ToolResult> {
	return imageImpl(
		{
			url,
			timeout: DEFAULT_TIMEOUT_MS,
			resize: isImageResizeEnabled(config),
			maxSize: getImageMaxSize(config)
		},
		signal
	)
}

async function fetchSearchResultMarkdown(config: WebToolsConfig, url: string, signal?: AbortSignal): Promise<string> {
	const fetchProvider = getProvider("fetch", config)
	const fetchApiKey = resolveApiKey(fetchProvider, config)
	const fetched = await fetchProvider.fetch(fetchApiKey, url, { timeout: DEFAULT_TIMEOUT_MS }, signal)
	return fetched.markdown
}

function getSearchParameters(config: WebToolsConfig) {
	const configured = config.webSearch?.provider
	const providerId = configured && providers[configured] ? configured : DEFAULT_PROVIDER_ID
	const params: Record<string, TSchema> = {
		query: Type.String({ description: "The search query." }),
		limit: Type.Optional(
			Type.Integer({
				description: "Maximum number of results to return. Defaults to 5.",
				minimum: 1,
				maximum: 20
			})
		),
		fetchResult: Type.Optional(
			Type.Boolean({
				description: "Whether to fetch the first result. Defaults to true; image searches fetch image content when possible."
			})
		)
	}

	Object.assign(params, providers[providerId]?.searchParameters)
	return Type.Object(params)
}

export function registerLovelyWebSearchTool(pi: ExtensionAPI, config: WebToolsConfig = {}) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: "Search the web.",
		promptSnippet: "Use web_search for current web information.",
		promptGuidelines: [
			"Use web_search when the user asks for current web information, discovery, or sources beyond the local workspace.",
			"Use web_fetch after web_search when you need the full content of a specific page."
		],
		parameters: getSearchParameters(config),
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0)
			const input = args as unknown as SearchToolArgs
			const mode = input.includeImages ? "images" : (input.source ?? input.topic ?? input.category ?? "web")
			const bits = [mode, `limit ${input.limit ?? 5}`]
			if (input.fetchResult ?? true) bits.push("fetch first")
			text.setText(
				`${theme.fg("toolTitle", theme.bold("web_search "))}${theme.fg("muted", `"${input.query}"`)} ${theme.fg("dim", `(${bits.join(", ")})`)}`
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
				const input = params as unknown as SearchToolArgs
				onUpdate?.({
					content: [{ type: "text", text: `Searching web with ${searchProvider.label} for: ${input.query}` }],
					details: undefined
				})

				const { query, fetchResult, limit, ...providerOptions } = input
				const searchOptions: SearchOptions = { ...providerOptions, limit: limit ?? 5, timeout: DEFAULT_TIMEOUT_MS }
				const searchResult = await searchProvider.search(resolveApiKey(searchProvider, config), query, searchOptions, signal)
				if (signal?.aborted) throw new Error("Search cancelled")

				const first = searchResult.results[0]
				let fetchedImage: ToolResult | undefined
				if ((fetchResult ?? true) && first?.url) {
					onUpdate?.({ content: [{ type: "text", text: `Fetching first result: ${first.url}` }], details: undefined })
					try {
						const isImageSearch = input.source === "images" || input.includeImages === true
						if (isImageSearch) {
							try {
								fetchedImage = await fetchSearchResultImage(config, first.url, signal)
							} catch {
								// Some image-search providers return source pages instead of direct image URLs.
							}
						}
						if (!fetchedImage && isFetchEnabled(config)) first.markdown = await fetchSearchResultMarkdown(config, first.url, signal)
						if (signal?.aborted) throw new Error("Search cancelled")
					} catch (err) {
						first.description = first.description || `[Fetch failed: ${asErrorMessage(err)}]`
					}
				}

				const result: ToolResult = {
					content: [{ type: "text", text: formatSearchOutput(searchResult.results) }, ...(fetchedImage?.content || [])],
					details: fetchedImage ? { search: searchResult.raw, image: fetchedImage.details } : searchResult.raw
				}
				onUpdate?.(result)
				return result
			} catch (error) {
				return {
					content: [{ type: "text", text: `Web search failed: ${asErrorMessage(error)}` }],
					details: { error: asErrorMessage(error) },
					isError: true
				}
			}
		}
	})
}

export function registerLovelyWebStaticTools(pi: ExtensionAPI) {
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
					details: undefined
				})

				const result = await fetchProvider.fetch(
					resolveApiKey(fetchProvider, config),
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
					content: [{ type: "text", text: `${warning}${result.markdown}${metadata}` }],
					details: result.raw
				}
				onUpdate?.(toolResult)
				return toolResult
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

export function registerLovelyWebTools(pi: ExtensionAPI, config: WebToolsConfig = {}) {
	registerLovelyWebSearchTool(pi, config)
	registerLovelyWebStaticTools(pi)
}
