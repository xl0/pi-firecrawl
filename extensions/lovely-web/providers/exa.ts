import { StringEnum } from "@earendil-works/pi-ai"
import { Type } from "typebox"
import { DEFAULT_TIMEOUT_MS } from "../constants.js"
import { requestJson } from "./http.js"
import type { Provider, SearchResult } from "./types.js"

const BASE_URL = "https://api.exa.ai"

interface SearchBody {
	query: string
	numResults: number
	type: string
	contents: { summary: boolean }
	category?: string
	userLocation?: string
}

interface ContentsBody {
	urls: string[]
	text: boolean
	maxAgeHours?: number
}

interface ExaSearchResult {
	title: string
	url: string
	summary?: string
}

interface ExaContentsResult {
	id: string
	url: string
	title?: string
	text?: string
}

function stripSummaryLabel(text: string): string {
	return text.replace(/^Summary:\s*/i, "")
}

function fetchJson(url: string, body: unknown, apiKey: string, timeout: number, signal?: AbortSignal): Promise<unknown> {
	return requestJson(
		"Exa",
		url,
		{
			method: "POST",
			headers: {
				"x-api-key": apiKey,
				"Content-Type": "application/json"
			},
			body: JSON.stringify(body)
		},
		timeout,
		signal
	)
}

export const exaProvider: Provider = {
	id: "exa",
	label: "Exa",
	envApiKey: "EXA_API_KEY",
	searchParameters: {
		category: Type.Optional(StringEnum(["company", "people", "research paper", "news", "personal site", "financial report"])),
		country: Type.Optional(Type.String({ description: "Two-letter ISO user location for result localization, e.g. US, DE, CO." }))
	},
	fetchParameters: {
		maxAgeHours: Type.Optional(
			Type.Integer({ description: "Maximum cache age in hours; 0 fetches fresh content, -1 uses cache only.", minimum: -1, maximum: 720 })
		)
	},

	async search(apiKey, query, opts, signal) {
		const body: SearchBody = {
			query,
			numResults: opts.limit,
			type: "auto",
			contents: { summary: true }
		}
		if (opts.source) throw new Error("Exa search uses category, not source. Omit category for general web search, or set category: news.")
		if (opts.category) body.category = opts.category
		if (opts.country) body.userLocation = opts.country

		const raw = await fetchJson(`${BASE_URL}/search`, body, apiKey, opts.timeout ?? DEFAULT_TIMEOUT_MS, signal)
		const data = (raw as { results?: ExaSearchResult[] }).results ?? []

		const results: SearchResult[] = data.map(item => {
			const r: SearchResult = {
				title: item.title || "Untitled",
				url: item.url
			}
			if (item.summary) r.description = stripSummaryLabel(item.summary)
			return r
		})

		return { results, raw }
	},

	async fetch(apiKey, url, opts, signal) {
		const body: ContentsBody = {
			urls: [url],
			text: true
		}
		if (opts.maxAgeHours !== undefined) body.maxAgeHours = opts.maxAgeHours

		const raw = await fetchJson(`${BASE_URL}/contents`, body, apiKey, opts.timeout ?? DEFAULT_TIMEOUT_MS, signal)
		const results = (raw as { results?: ExaContentsResult[] }).results
		const first = results?.[0]

		if (!first?.text) {
			const statuses = (raw as { statuses?: Array<{ id: string; status: string; error?: { tag: string } }> }).statuses
			const status = statuses?.find(s => s.id === url)
			const detail = status?.error?.tag ?? "no content"
			throw new Error(`Exa could not fetch content for ${url}: ${detail}`)
		}

		return {
			markdown: first.text.trim(),
			metadata: first.title ? { title: first.title } : undefined,
			raw
		}
	}
}
