import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { StringEnum } from "@earendil-works/pi-ai"
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent"
import { Text } from "@earendil-works/pi-tui"
import { Type } from "typebox"
import { asErrorMessage, formatSearchOutput, stringify } from "./format.js"
import { braveProvider } from "./providers/brave.js"
import { exaProvider } from "./providers/exa.js"
import { firecrawlProvider } from "./providers/firecrawl.js"
import { tavilyProvider } from "./providers/tavily.js"
import type { Provider, WebToolsConfig } from "./providers/types.js"

const DEFAULT_TIMEOUT_MS = 30_000
const COLLAPSED_RESULT_LINES = 6

// ── Config ──────────────────────────────────────────────────────────────────

const providers: Record<string, Provider> = {
	firecrawl: firecrawlProvider,
	exa: exaProvider,
	tavily: tavilyProvider,
	brave: braveProvider
}

const providerNames = Object.keys(providers)

function resolveProviderId(type: "search" | "fetch", config: WebToolsConfig): string {
	const direct = type === "search" ? config.webSearch?.provider : config.webFetch?.provider
	const fallback = type === "fetch" ? config.webSearch?.provider : undefined
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

export interface ToolResult {
	content: Array<{ type: "text"; text: string }>
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

// ── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
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

	pi.registerCommand("web-tools", {
		description: "Configure web search and fetch providers",
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

			while (true) {
				const searchId = config.webSearch?.provider ?? "(not set)"
				const fetchId = config.webFetch?.provider ?? "(not set)"
				const keysInfo =
					Object.entries(config.webApiKeys ?? {})
						.map(([k, v]) => `${k}: ${v ? "****" : "(empty)"}`)
						.join(", ") || "none"

				ctx.ui.notify(`Search: ${searchId} | Fetch: ${fetchId} | Keys: ${keysInfo}`, "info")

				const menuItems = [
					`Set search provider (current: ${searchId})`,
					`Set fetch provider (current: ${fetchId})`,
					...providerNames.map(id => `Set API key for ${providers[id]?.label ?? id}`),
					"Done"
				]
				const action = await ctx.ui.select("What to configure?", menuItems)
				if (action === undefined) return

				if (action === "Done") {
					writeConfigFile(configPath, config)
					ctx.ui.notify("Config saved.", "info")
					return
				}

				if (action.includes("search provider")) {
					const choice = await ctx.ui.select(
						"Select search provider:",
						providerNames.map(id => providers[id]?.label ?? id)
					)
					if (choice === undefined) continue
					const providerId = providerNames.find(id => providers[id]?.label === choice)
					if (providerId) config.webSearch = { provider: providerId }
				} else if (action.includes("fetch provider")) {
					const choice = await ctx.ui.select(
						"Select fetch provider:",
						providerNames.filter(id => providers[id]?.fetch).map(id => providers[id]?.label ?? id)
					)
					if (choice === undefined) continue
					const providerId = providerNames.find(id => providers[id]?.label === choice)
					if (providerId) config.webFetch = { provider: providerId }
				} else {
					const keyEntry = providerNames.find(id => action.includes(providers[id]?.label ?? id))
					if (keyEntry) await setApiKey(ctx, config, keyEntry)
				}
			}
		}
	})
}

async function setApiKey(
	ctx: { ui: { input: (title: string, placeholder: string) => Promise<string | undefined> } },
	config: WebToolsConfig,
	providerId: string
) {
	const current = config.webApiKeys?.[providerId]
	const label = providers[providerId]?.label ?? providerId
	const key = await ctx.ui.input(`API key for ${label}${current ? " (current: ****)" : ""}:`, "Enter API key")
	if (key === undefined) return
	config.webApiKeys ??= {}
	config.webApiKeys[providerId] = key
}
