import { requestJson } from "./http.js"
import type { Provider, SearchResult } from "./types.js"

const BASE_URL = "https://api.search.brave.com/res/v1"
const DEFAULT_TIMEOUT_MS = 30_000

interface BraveWebResult {
	title: string
	url: string
	description: string
}

interface BraveWebResponse {
	web?: { results?: BraveWebResult[] }
}

interface BraveNewsResult {
	title: string
	url: string
	description: string
}

interface BraveNewsResponse {
	results?: BraveNewsResult[]
}

interface BraveImageResult {
	url: string
	title?: string
	description?: string
	properties?: { url?: string }
	thumbnail?: { src?: string }
}

interface BraveImageResponse {
	results?: BraveImageResult[]
}

function stripHtmlTags(text: string): string {
	return text.replace(/<[^>]+>/g, "")
}

function fetchJson(url: string, apiKey: string, timeout: number, signal?: AbortSignal): Promise<unknown> {
	return requestJson(
		"Brave",
		url,
		{
			headers: {
				"X-Subscription-Token": apiKey,
				Accept: "application/json"
			}
		},
		timeout,
		signal
	)
}

function buildSearchUrl(
	source: string | undefined,
	query: string,
	count: number,
	opts: { country?: string; searchLang?: string; freshness?: string }
): string {
	const endpoint = source === "news" ? "news" : source === "images" ? "images" : "web"
	const url = new URL(`${BASE_URL}/${endpoint}/search`)
	url.searchParams.set("q", query)
	url.searchParams.set("count", String(count))
	if (opts.country) url.searchParams.set("country", opts.country.toUpperCase())
	if (opts.searchLang) url.searchParams.set("search_lang", opts.searchLang)
	if (opts.freshness && source !== "images") url.searchParams.set("freshness", opts.freshness)
	return url.toString()
}

export const braveProvider: Provider = {
	id: "brave",
	label: "Brave Search",
	envApiKey: "BRAVE_API_KEY",

	async search(apiKey, query, opts, signal) {
		const url = buildSearchUrl(opts.source, query, opts.limit, opts)
		const raw = await fetchJson(url, apiKey, opts.timeout ?? DEFAULT_TIMEOUT_MS, signal)

		let items: SearchResult[] = []

		if (opts.source === "news") {
			const data = raw as BraveNewsResponse
			items = (data.results ?? []).map(item => ({
				title: item.title || "Untitled",
				url: item.url,
				description: stripHtmlTags(item.description || "")
			}))
		} else if (opts.source === "images") {
			const data = raw as BraveImageResponse
			items = (data.results ?? []).map(item => ({
				title: item.title || item.properties?.url || item.url,
				url: item.properties?.url || item.thumbnail?.src || item.url,
				description: item.description || item.url || ""
			}))
		} else {
			const data = raw as BraveWebResponse
			items = (data.web?.results ?? []).map(item => ({
				title: item.title || "Untitled",
				url: item.url,
				description: stripHtmlTags(item.description || "")
			}))
		}

		return { results: items, raw }
	}
}
