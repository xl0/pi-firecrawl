import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { braveProvider } from "./providers/brave.js"
import { exaProvider } from "./providers/exa.js"
import { firecrawlProvider } from "./providers/firecrawl.js"
import { tavilyProvider } from "./providers/tavily.js"
import type { Provider, WebToolsConfig } from "./providers/types.js"

export const DEFAULT_TIMEOUT_MS = 30_000
export const DEFAULT_PROVIDER_ID = "firecrawl"
export const DISABLED_LABEL = "Disabled"

export const providers: Record<string, Provider> = {
	firecrawl: firecrawlProvider,
	exa: exaProvider,
	tavily: tavilyProvider,
	brave: braveProvider
}

export const providerNames = Object.keys(providers)

export function isSearchEnabled(config: WebToolsConfig): boolean {
	return config.webSearch?.provider !== null
}

export function isFetchEnabled(config: WebToolsConfig): boolean {
	return config.webFetch?.provider !== null
}

export function isImageEnabled(config: WebToolsConfig): boolean {
	return config.webImage?.enabled !== false
}

export function isImageResizeEnabled(config: WebToolsConfig): boolean {
	return config.webImage?.resize !== false
}

export function getImageMaxSize(config: WebToolsConfig): number {
	return config.webImage?.maxSize ?? 2000
}

function resolveProviderId(type: "search" | "fetch", config: WebToolsConfig): string {
	if (type === "search" && !isSearchEnabled(config)) throw new Error("web_search is disabled. Enable it via /lovely-web.")
	if (type === "fetch" && !isFetchEnabled(config)) throw new Error("web_fetch is disabled. Enable it via /lovely-web.")

	const direct = type === "search" ? config.webSearch?.provider : config.webFetch?.provider
	const fallback = type === "fetch" && isSearchEnabled(config) ? config.webSearch?.provider : undefined
	const id = direct ?? fallback ?? DEFAULT_PROVIDER_ID
	if (!providers[id]) throw new Error(`Unknown provider "${id}". Available: ${Object.keys(providers).join(", ")}.`)
	return id
}

export function getProvider(type: "fetch", config: WebToolsConfig): Provider & { fetch: NonNullable<Provider["fetch"]> }
export function getProvider(type: "search", config: WebToolsConfig): Provider
export function getProvider(type: "search" | "fetch", config: WebToolsConfig): Provider {
	const id = resolveProviderId(type, config)
	const provider = providers[id]
	if (!provider) throw new Error(`Provider "${id}" not found.`)
	if (type === "fetch" && !provider.fetch) {
		throw new Error(
			`${provider.label} does not support fetching pages. Configure a fetch-capable provider (e.g. firecrawl, exa, tavily) via /lovely-web.`
		)
	}
	return provider as Provider & { fetch: NonNullable<Provider["fetch"]> }
}

export function resolveApiKey(provider: Provider, config: WebToolsConfig): string {
	const key = config.webApiKeys?.[provider.id]
	if (key) return key
	const envKey = process.env[provider.envApiKey]
	if (envKey) return envKey
	throw new Error(`No API key for ${provider.label}. Set it via /lovely-web or set the ${provider.envApiKey} environment variable.`)
}

export function loadConfig(cwd: string): WebToolsConfig {
	const global = readConfigFile(join(homedir(), ".pi", "agent", "xl0-pi-lovely-web.json"))
	const project = readConfigFile(resolve(cwd, ".pi", "xl0-pi-lovely-web.json"))
	return {
		...global,
		...project,
		webSearch: { provider: DEFAULT_PROVIDER_ID, ...global.webSearch, ...project.webSearch },
		webFetch: { provider: DEFAULT_PROVIDER_ID, ...global.webFetch, ...project.webFetch },
		webImage: { ...global.webImage, ...project.webImage },
		webApiKeys: { ...global.webApiKeys, ...project.webApiKeys }
	}
}

export function readConfigFile(path: string): WebToolsConfig {
	try {
		if (!existsSync(path)) return {}
		const raw = readFileSync(path, "utf-8")
		return JSON.parse(raw) as WebToolsConfig
	} catch {
		return {}
	}
}

export function writeConfigFile(path: string, config: WebToolsConfig): void {
	mkdirSync(resolve(path, ".."), { recursive: true })
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
}

export function applyToolConfig(pi: ExtensionAPI, config: WebToolsConfig): void {
	const active = new Set(pi.getActiveTools())
	if (isSearchEnabled(config)) active.add("web_search")
	else active.delete("web_search")
	if (isFetchEnabled(config)) active.add("web_fetch")
	else active.delete("web_fetch")
	if (isImageEnabled(config)) active.add("web_image")
	else active.delete("web_image")
	pi.setActiveTools([...active])
}

export function providerLabel(id: string | undefined): string {
	return id ? (providers[id]?.label ?? id) : "(not set)"
}

export function providerIdFromLabel(label: string): string | undefined {
	return providerNames.find(id => providers[id]?.label === label)
}

export function maskApiKey(key: string | undefined): string {
	if (!key) return "(not set)"
	const maskLength = Math.max(5, key.length - 8)
	const visible = Math.max(0, key.length - maskLength)
	const startLength = Math.min(4, Math.ceil(visible / 2))
	const endLength = Math.min(4, visible - startLength)
	return `${key.slice(0, startLength)}${"*".repeat(maskLength)}${endLength > 0 ? key.slice(-endLength) : ""}`
}
