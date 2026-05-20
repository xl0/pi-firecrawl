import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { type ImageContent, StringEnum, type TextContent } from "@earendil-works/pi-ai"
import {
	type ExtensionAPI,
	ExtensionInputComponent,
	formatDimensionNote,
	getSelectListTheme,
	getSettingsListTheme,
	resizeImage,
	type Theme
} from "@earendil-works/pi-coding-agent"
import { Container, getImageDimensions, SelectList, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui"
import { Type } from "typebox"
import { asErrorMessage, formatSearchOutput, stringify } from "./format.js"
import { braveProvider } from "./providers/brave.js"
import { exaProvider } from "./providers/exa.js"
import { firecrawlProvider } from "./providers/firecrawl.js"
import { tavilyProvider } from "./providers/tavily.js"
import type { Provider, WebToolsConfig } from "./providers/types.js"

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_IMAGE_BYTES = 5_000_000
const MAX_IMAGE_BYTES = 20_000_000
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"])
const COLLAPSED_RESULT_LINES = 6
const DISABLED_LABEL = "Disabled"

// ── Config ──────────────────────────────────────────────────────────────────

const providers: Record<string, Provider> = {
	firecrawl: firecrawlProvider,
	exa: exaProvider,
	tavily: tavilyProvider,
	brave: braveProvider
}

const providerNames = Object.keys(providers)

function isSearchEnabled(config: WebToolsConfig): boolean {
	return config.webSearch?.enabled !== false
}

function isFetchEnabled(config: WebToolsConfig): boolean {
	return config.webFetch?.enabled !== false
}

function isImageEnabled(config: WebToolsConfig): boolean {
	return config.webImage?.enabled !== false
}

function resolveProviderId(type: "search" | "fetch", config: WebToolsConfig): string {
	if (type === "search" && !isSearchEnabled(config)) throw new Error("web_search is disabled. Enable it via /web-tools.")
	if (type === "fetch" && !isFetchEnabled(config)) throw new Error("web_fetch is disabled. Enable it via /web-tools.")

	const direct = type === "search" ? config.webSearch?.provider : config.webFetch?.provider
	const fallback = type === "fetch" && isSearchEnabled(config) ? config.webSearch?.provider : undefined
	const id = direct || fallback
	if (!id) {
		const hint = type === "search" ? "webSearch.provider" : "webFetch.provider"
		throw new Error(`No ${type} provider configured. Set ${hint} via /web-tools.`)
	}
	if (!providers[id]) throw new Error(`Unknown provider "${id}". Available: ${Object.keys(providers).join(", ")}.`)
	return id
}

function getProvider(type: "fetch", config: WebToolsConfig): Provider & { fetch: NonNullable<Provider["fetch"]> }
function getProvider(type: "search", config: WebToolsConfig): Provider
function getProvider(type: "search" | "fetch", config: WebToolsConfig): Provider {
	const id = resolveProviderId(type, config)
	const provider = providers[id]
	if (!provider) throw new Error(`Provider "${id}" not found.`)
	if (type === "fetch" && !provider.fetch) {
		throw new Error(
			`${provider.label} does not support fetching pages. Configure a fetch-capable provider (e.g. firecrawl, exa, tavily) via /web-tools.`
		)
	}
	return provider as Provider & { fetch: NonNullable<Provider["fetch"]> }
}

function resolveApiKey(provider: Provider, config: WebToolsConfig): string {
	const key = config.webApiKeys?.[provider.id]
	if (key) return key
	const envKey = process.env[provider.envApiKey]
	if (envKey) return envKey
	throw new Error(`No API key for ${provider.label}. Set it via /web-tools or set the ${provider.envApiKey} environment variable.`)
}

function loadConfig(cwd: string): WebToolsConfig {
	const global = readConfigFile(join(homedir(), ".pi", "agent", "xl0-web-tools.json"))
	const project = readConfigFile(resolve(cwd, ".pi", "xl0-web-tools.json"))
	return {
		...global,
		...project,
		webApiKeys: { ...global.webApiKeys, ...project.webApiKeys }
	}
}

function readConfigFile(path: string): WebToolsConfig {
	try {
		if (!existsSync(path)) return {}
		const raw = readFileSync(path, "utf-8")
		return JSON.parse(raw) as WebToolsConfig
	} catch {
		return {}
	}
}

function writeConfigFile(path: string, config: WebToolsConfig): void {
	mkdirSync(resolve(path, ".."), { recursive: true })
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
}

function applyToolConfig(pi: ExtensionAPI, config: WebToolsConfig): void {
	const active = new Set(pi.getActiveTools())
	if (isSearchEnabled(config)) active.add("web_search")
	else active.delete("web_search")
	if (isFetchEnabled(config)) active.add("web_fetch")
	else active.delete("web_fetch")
	if (isImageEnabled(config)) active.add("web_image")
	else active.delete("web_image")
	pi.setActiveTools([...active])
}

function providerLabel(id: string | undefined): string {
	return id ? (providers[id]?.label ?? id) : "(not set)"
}

function providerIdFromLabel(label: string): string | undefined {
	return providerNames.find(id => providers[id]?.label === label)
}

function maskApiKey(key: string | undefined): string {
	if (!key) return "(not set)"
	const maskLength = Math.max(5, key.length - 8)
	const visible = Math.max(0, key.length - maskLength)
	const startLength = Math.min(4, Math.ceil(visible / 2))
	const endLength = Math.min(4, visible - startLength)
	return `${key.slice(0, startLength)}${"*".repeat(maskLength)}${endLength > 0 ? key.slice(-endLength) : ""}`
}

function providerSubmenu(title: string, labels: string[], currentValue: string, done: (selectedValue?: string) => void) {
	const container = new Container()
	container.addChild(new Text(title, 1, 1))
	const list = new SelectList(
		labels.map(label => ({ value: label, label })),
		Math.min(labels.length, 10),
		getSelectListTheme()
	)
	list.setSelectedIndex(Math.max(0, labels.indexOf(currentValue)))
	list.onSelect = item => done(item.value)
	list.onCancel = () => done(undefined)
	container.addChild(list)
	return {
		render: (width: number) => container.render(width),
		invalidate: () => container.invalidate(),
		handleInput: (data: string) => list.handleInput(data)
	}
}

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
			throw new Error(`Image too large: ${contentLength} bytes exceeds ${opts.maxBytes}`)
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

export interface ToolResult {
	content: Array<TextContent | ImageContent>
	details: unknown
	isError?: boolean
}

function renderTextResult(
	result: { content: Array<{ type: string; text?: string }> },
	expanded: boolean,
	theme: Theme,
	partialLabel: string
) {
	const content = result.content[0]
	if (content?.type !== "text" || content.text === undefined) return new Text(theme.fg("error", "No text output"), 0, 0)
	if (!content.text.trim()) return new Text(theme.fg("dim", partialLabel), 0, 0)

	const lines = content.text.split("\n")
	const shown = expanded ? lines : lines.slice(0, COLLAPSED_RESULT_LINES)
	let text = shown.map(line => theme.fg("toolOutput", line)).join("\n")
	if (!expanded && lines.length > COLLAPSED_RESULT_LINES) {
		text += `\n${theme.fg("muted", `... ${lines.length - COLLAPSED_RESULT_LINES} more lines (ctrl-o to expand)`)}`
	}
	return new Text(text, 0, 0)
}

// ── Standalone tool implementations (exported for testing) ──────────────────

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
	if (shouldFetch && first?.url) {
		onUpdate?.({
			content: [{ type: "text" as const, text: `Fetching first result: ${first.url}` }],
			details: undefined as unknown
		})
		try {
			const fetchProvider = getProvider("fetch", config)
			const fetchApiKey = resolveApiKey(fetchProvider, config)
			const fetched = await fetchProvider.fetch(fetchApiKey, first.url, { timeout: DEFAULT_TIMEOUT_MS }, signal)

			if (signal?.aborted) throw new Error("Search cancelled")
			first.markdown = fetched.markdown
			if (fetched.metadata) (first as { metadata?: unknown }).metadata = fetched.metadata
		} catch (err) {
			first.description = first.description || `[Fetch failed: ${asErrorMessage(err)}]`
		}
	}

	const result: ToolResult = {
		content: [{ type: "text" as const, text: formatSearchOutput(searchResult.results) }],
		details: searchResult.raw
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

export async function imageImpl(
	params: { url: string; timeout?: number; maxBytes?: number },
	signal?: AbortSignal,
	onUpdate?: (result: ToolResult) => void
): Promise<ToolResult> {
	const maxBytes = params.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES
	if (maxBytes > MAX_IMAGE_BYTES) throw new Error(`maxBytes cannot exceed ${MAX_IMAGE_BYTES}`)

	const image = await fetchImageContent(params.url, { timeout: params.timeout ?? DEFAULT_TIMEOUT_MS, maxBytes }, signal)
	if (signal?.aborted) throw new Error("Image fetch cancelled")

	const originalDimensions = getImageDimensions(image.data, image.mimeType) ?? undefined
	const resized = await resizeImage({ type: "image", data: image.data, mimeType: image.mimeType })
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

// ── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		applyToolConfig(pi, loadConfig(ctx.cwd))
	})

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
				if (!isImageEnabled(loadConfig(ctx.cwd))) throw new Error("web_image is disabled. Enable it via /web-tools.")
				onUpdate?.({
					content: [{ type: "text", text: `Fetching image: ${params.url}` }],
					details: undefined as unknown
				})
				return await imageImpl(params, signal, onUpdate)
			} catch (error) {
				return {
					content: [{ type: "text", text: `Web image failed: ${asErrorMessage(error)}` }],
					details: { error: asErrorMessage(error) },
					isError: true
				}
			}
		}
	})

	pi.registerCommand("web-tools", {
		description: "Configure web search, fetch, and image tools",
		async handler(_args, ctx) {
			if (!ctx.hasUI) {
				ctx.ui.notify("The /web-tools command is only available in interactive mode.", "warning")
				return
			}

			const scope = await ctx.ui.select("Config scope:", ["Global (~/.pi/agent/)", "Project (.pi/)"])
			if (scope === undefined) return

			const configPath = scope.startsWith("Global")
				? join(homedir(), ".pi", "agent", "xl0-web-tools.json")
				: resolve(ctx.cwd, ".pi", "xl0-web-tools.json")

			const config = readConfigFile(configPath)
			const save = () => {
				writeConfigFile(configPath, config)
				applyToolConfig(pi, loadConfig(ctx.cwd))
			}

			await ctx.ui.custom((_tui, theme, _keybindings, done) => {
				const searchLabels = [DISABLED_LABEL, ...providerNames.map(id => providers[id]?.label ?? id)]
				const fetchLabels = [DISABLED_LABEL, ...providerNames.filter(id => providers[id]?.fetch).map(id => providers[id]?.label ?? id)]
				const items: SettingItem[] = [
					{
						id: "search",
						label: "web_search",
						currentValue: isSearchEnabled(config) ? providerLabel(config.webSearch?.provider) : DISABLED_LABEL,
						description: "Search provider, or disabled to remove web_search from active tools.",
						submenu: (currentValue, done) => providerSubmenu("Select search provider", searchLabels, currentValue, done)
					},
					{
						id: "fetch",
						label: "web_fetch",
						currentValue: isFetchEnabled(config) ? providerLabel(config.webFetch?.provider) : DISABLED_LABEL,
						description: "Fetch provider, or disabled to remove web_fetch from active tools.",
						submenu: (currentValue, done) => providerSubmenu("Select fetch provider", fetchLabels, currentValue, done)
					},
					{
						id: "image",
						label: "web_image",
						currentValue: isImageEnabled(config) ? "enabled" : "disabled",
						description: "Enable or disable direct image URL fetching.",
						values: ["enabled", "disabled"]
					},
					...providerNames.map(id => ({
						id: `key:${id}`,
						label: `${providers[id]?.label ?? id} API key`,
						currentValue: maskApiKey(config.webApiKeys?.[id]),
						description: `Set API key for ${providers[id]?.label ?? id}.`,
						submenu: (_currentValue: string, done: (selectedValue?: string) => void) =>
							new ExtensionInputComponent(
								`API key for ${providers[id]?.label ?? id}${config.webApiKeys?.[id] ? ` (current: ${maskApiKey(config.webApiKeys[id])})` : ""}:`,
								"Enter API key",
								value => {
									config.webApiKeys ??= {}
									config.webApiKeys[id] = value
									save()
									done(maskApiKey(value))
								},
								() => done(undefined),
								{ tui: _tui }
							)
					}))
				]
				const container = new Container()
				container.addChild(new Text(theme.fg("accent", theme.bold("Web tools")), 1, 1))
				const list = new SettingsList(
					items,
					Math.min(items.length, 12),
					getSettingsListTheme(),
					(id, newValue) => {
						if (id === "search") {
							if (newValue === DISABLED_LABEL) config.webSearch = { ...config.webSearch, enabled: false }
							else {
								const providerId = providerIdFromLabel(newValue)
								if (providerId) config.webSearch = { provider: providerId, enabled: true }
							}
						} else if (id === "fetch") {
							if (newValue === DISABLED_LABEL) config.webFetch = { ...config.webFetch, enabled: false }
							else {
								const providerId = providerIdFromLabel(newValue)
								if (providerId) config.webFetch = { provider: providerId, enabled: true }
							}
						} else if (id === "image") {
							config.webImage = { enabled: newValue === "enabled" }
						}
						save()
					},
					() => done(undefined)
				)
				container.addChild(list)
				return {
					render: (width: number) => container.render(width),
					invalidate: () => container.invalidate(),
					handleInput: (data: string) => list.handleInput(data)
				}
			})
			ctx.ui.notify("Config saved.", "info")
		}
	})
}
