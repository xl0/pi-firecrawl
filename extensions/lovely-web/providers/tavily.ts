import { StringEnum } from "@earendil-works/pi-ai"
import { Type } from "typebox"
import { DEFAULT_TIMEOUT_MS } from "../constants.js"
import { requestJson } from "./http.js"
import type { Provider, SearchResult } from "./types.js"

const BASE_URL = "https://api.tavily.com"

interface SearchBody {
	query: string
	max_results: number
	search_depth: string
	topic?: string
	time_range?: string
	country?: string
	include_images?: boolean
	include_image_descriptions?: boolean
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

interface TavilyImageResult {
	url: string
	description?: string
}

interface TavilySearchResponse {
	query: string
	answer?: string
	results?: TavilySearchResult[]
	images?: TavilyImageResult[]
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
	searchParameters: {
		topic: Type.Optional(StringEnum(["general", "news", "finance"])),
		includeImages: Type.Optional(Type.Boolean({ description: "Return query-related image URLs instead of page results." })),
		country: Type.Optional(Type.String({ description: "Country name to boost general-topic results, e.g. colombia." })),
		timeRange: Type.Optional(StringEnum(["day", "week", "month", "year", "d", "w", "m", "y"]))
	},
	fetchParameters: {
		extractDepth: Type.Optional(
			StringEnum(["basic", "advanced"], { description: "Advanced extraction retrieves more data such as tables; costs more." })
		)
	},

	async search(apiKey, query, opts, signal) {
		const body: SearchBody = {
			query,
			max_results: opts.limit,
			search_depth: "basic"
		}
		if (opts.source) throw new Error("Tavily search uses topic/includeImages, not source.")
		const topic = opts.topic
		if (topic && topic !== "general") body.topic = topic
		if (opts.timeRange) body.time_range = opts.timeRange
		if (opts.country && topic !== "news" && topic !== "finance") body.country = opts.country.toLowerCase()
		if (opts.includeImages) {
			body.include_images = true
			body.include_image_descriptions = true
		}

		const raw = await postJson(`${BASE_URL}/search`, body, apiKey, opts.timeout ?? DEFAULT_TIMEOUT_MS, signal)
		const data = raw as TavilySearchResponse

		if (opts.includeImages) {
			const results: SearchResult[] = (data.images ?? []).map(item => ({
				title: item.description || item.url,
				url: item.url,
				description: item.description || ""
			}))
			return { results, raw }
		}

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
			extract_depth: opts.extractDepth ?? "basic",
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
