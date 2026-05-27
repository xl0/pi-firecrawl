import { requestJson } from "./http.js"
import type { Provider, SearchResult } from "./types.js"

const BASE_URL = "https://api.firecrawl.dev/v2"
const DEFAULT_TIMEOUT_MS = 30_000

interface SearchBody {
	query: string
	limit: number
	sources?: string[]
	categories?: string[]
	location?: string
	country?: string
	tbs?: string
}

interface ScrapeBody {
	url: string
	formats: string[]
	onlyMainContent: boolean
	waitFor?: number
}

interface FirecrawlResponse {
	success: boolean
	data: unknown
	error?: string
}

function throwIfError(response: unknown): asserts response is FirecrawlResponse {
	if (!response || typeof response !== "object" || !("success" in response)) {
		throw new Error("Unexpected Firecrawl response")
	}
	const r = response as FirecrawlResponse
	if (r.success !== true) throw new Error(r.error || "Firecrawl request failed")
}

function fetchJson(url: string, body: unknown, apiKey: string, timeout: number, signal?: AbortSignal): Promise<unknown> {
	return requestJson(
		"Firecrawl",
		url,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify(body)
		},
		timeout,
		signal
	)
}

export const firecrawlProvider: Provider = {
	id: "firecrawl",
	label: "Firecrawl",
	envApiKey: "FIRECRAWL_API_KEY",

	async search(apiKey, query, opts, signal) {
		const body: SearchBody = { query, limit: opts.limit }
		if (opts.source) body.sources = [opts.source]
		if (opts.category) body.categories = [opts.category]
		if (opts.location) body.location = opts.location
		if (opts.country) body.country = opts.country
		if (opts.tbs) body.tbs = opts.tbs

		const raw = await fetchJson(`${BASE_URL}/search`, body, apiKey, opts.timeout ?? DEFAULT_TIMEOUT_MS, signal)
		throwIfError(raw)
		const data = raw.data as {
			web?: Array<{ title: string; url: string; description?: string; markdown?: string }>
			news?: Array<{ title: string; url: string; snippet?: string; markdown?: string }>
			images?: Array<{ title?: string; url: string; imageUrl?: string }>
		}
		const items = opts.source === "news" ? data.news || [] : opts.source === "images" ? data.images || [] : data.web || []

		const results: SearchResult[] = items.map(item => {
			const isImage = opts.source === "images"
			const r: SearchResult = {
				title: item.title || item.url,
				url: isImage && "imageUrl" in item && item.imageUrl ? item.imageUrl : item.url
			}
			const description = "description" in item ? item.description : "snippet" in item ? item.snippet : undefined
			if (description) r.description = description
			if ("markdown" in item && item.markdown) r.markdown = item.markdown
			return r
		})

		return { results, raw }
	},

	async fetch(apiKey, url, opts, signal) {
		const body: ScrapeBody = {
			url,
			formats: ["markdown"],
			onlyMainContent: true
		}
		if (opts.waitFor !== undefined) body.waitFor = opts.waitFor

		const raw = await fetchJson(`${BASE_URL}/scrape`, body, apiKey, opts.timeout ?? DEFAULT_TIMEOUT_MS, signal)
		throwIfError(raw)
		const data = raw.data as { markdown: string; metadata?: unknown }

		return {
			markdown: data.markdown?.trim() || "No markdown content returned.",
			metadata: data.metadata,
			raw
		}
	}
}
