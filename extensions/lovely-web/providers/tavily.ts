import { requestJson } from "./http.js"
import type { Provider, SearchResult } from "./types.js"

const BASE_URL = "https://api.tavily.com"
const DEFAULT_TIMEOUT_MS = 30_000

interface SearchBody {
	query: string
	max_results: number
	search_depth: string
	topic?: string
}

interface ExtractBody {
	urls: string[]
	extract_depth: string
	format: string
}

interface TavilySearchResult {
	title: string
	url: string
	content: string
	raw_content?: string
	score: number
}

interface TavilySearchResponse {
	query: string
	answer?: string
	results?: TavilySearchResult[]
	images?: unknown[]
	response_time: number
}

interface TavilyExtractResult {
	url: string
	raw_content: string
	images?: unknown[]
	favicon?: string
}

interface TavilyExtractResponse {
	results?: TavilyExtractResult[]
	failed_results?: Array<{ url: string; error: string }>
	response_time: number
}

function sourceToTopic(source?: string): string | undefined {
	if (source === "news") return "news"
	return undefined
}

function postJson(url: string, body: unknown, apiKey: string, timeout: number, signal?: AbortSignal): Promise<unknown> {
	return requestJson(
		"Tavily",
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

export const tavilyProvider: Provider = {
	id: "tavily",
	label: "Tavily",
	envApiKey: "TAVILY_API_KEY",

	async search(apiKey, query, opts, signal) {
		const body: SearchBody = {
			query,
			max_results: opts.limit,
			search_depth: "basic"
		}
		const topic = sourceToTopic(opts.source)
		if (topic) body.topic = topic

		const raw = await postJson(`${BASE_URL}/search`, body, apiKey, opts.timeout ?? DEFAULT_TIMEOUT_MS, signal)
		const data = raw as TavilySearchResponse
		const items = data.results ?? []

		const results: SearchResult[] = items.map(item => {
			const r: SearchResult = {
				title: item.title || "Untitled",
				url: item.url
			}
			if (item.content) r.description = item.content
			return r
		})

		return { results, raw }
	},

	async fetch(apiKey, url, opts, signal) {
		const body: ExtractBody = {
			urls: [url],
			extract_depth: "basic",
			format: "markdown"
		}

		const raw = await postJson(`${BASE_URL}/extract`, body, apiKey, opts.timeout ?? DEFAULT_TIMEOUT_MS, signal)
		const data = raw as TavilyExtractResponse

		const failed = data.failed_results?.find(f => f.url === url)
		if (failed) {
			throw new Error(`Tavily could not extract ${url}: ${failed.error}`)
		}

		const result = data.results?.find(r => r.url === url)
		if (!result?.raw_content) {
			throw new Error(`Tavily returned no content for ${url}`)
		}

		const metadata: { images?: unknown[]; favicon?: string } = {}
		if (result.images?.length) metadata.images = result.images
		if (result.favicon) metadata.favicon = result.favicon

		return {
			markdown: result.raw_content.trim(),
			metadata: Object.keys(metadata).length ? metadata : undefined,
			raw
		}
	}
}
