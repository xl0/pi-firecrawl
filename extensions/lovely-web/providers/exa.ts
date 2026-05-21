import { requestJson } from "./http.js"
import type { Provider, SearchResult } from "./types.js"

const BASE_URL = "https://api.exa.ai"
const DEFAULT_TIMEOUT_MS = 30_000

interface SearchBody {
	query: string
	numResults: number
	type: string
	contents: { summary: boolean }
	category?: string
}

interface ContentsBody {
	ids: string[]
	text: boolean
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

function sourceToCategory(source?: string): string | undefined {
	if (source === "news") return "news"
	return undefined
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

	async search(apiKey, query, opts, signal) {
		const body: SearchBody = {
			query,
			numResults: opts.limit,
			type: "auto",
			contents: { summary: true }
		}
		const category = sourceToCategory(opts.source)
		if (category) body.category = category

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
			ids: [url],
			text: true
		}

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
