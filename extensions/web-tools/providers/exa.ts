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
	maxAgeHours?: number
	livecrawlTimeout?: number
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

async function fetchJson(url: string, body: unknown, apiKey: string, timeout: number, signal?: AbortSignal): Promise<unknown> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeout)
	signal?.addEventListener("abort", () => controller.abort(), { once: true })

	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"x-api-key": apiKey,
				"Content-Type": "application/json"
			},
			body: JSON.stringify(body),
			signal: controller.signal
		})

		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Exa request failed (${res.status}): ${text}`)
		}

		return res.json()
	} finally {
		clearTimeout(timer)
	}
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
			if (item.summary) r.description = item.summary
			return r
		})

		return { results, raw }
	},

	async fetch(apiKey, url, opts, signal) {
		const body: ContentsBody = {
			ids: [url],
			text: true
		}
		if (opts.waitFor !== undefined) {
			body.maxAgeHours = 0
			body.livecrawlTimeout = Math.ceil(opts.waitFor / 1000)
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
