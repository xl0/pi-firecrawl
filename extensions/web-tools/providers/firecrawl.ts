import type { Provider, SearchResult } from "./types.js"

const BASE_URL = "https://api.firecrawl.dev/v1"
const DEFAULT_TIMEOUT_MS = 30_000

interface SearchBody {
	query: string
	limit: number
	sources?: string[]
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

async function fetchJson(url: string, body: unknown, apiKey: string, timeout: number, signal?: AbortSignal): Promise<unknown> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeout)
	signal?.addEventListener("abort", () => controller.abort(), { once: true })

	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify(body),
			signal: controller.signal
		})

		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Firecrawl request failed (${res.status}): ${text}`)
		}

		return res.json()
	} finally {
		clearTimeout(timer)
	}
}

export const firecrawlProvider: Provider = {
	id: "firecrawl",
	label: "Firecrawl",
	envApiKey: "FIRECRAWL_API_KEY",

	async search(apiKey, query, opts, signal) {
		const body: SearchBody = { query, limit: opts.limit }
		if (opts.source) body.sources = [opts.source]

		const raw = await fetchJson(`${BASE_URL}/search`, body, apiKey, opts.timeout ?? DEFAULT_TIMEOUT_MS, signal)
		throwIfError(raw)
		const data = raw.data as Array<{ title: string; url: string; description: string }>

		const results: SearchResult[] = data.map(item => {
			const r: SearchResult = { title: item.title, url: item.url }
			if (item.description) r.description = item.description
			return r
		})

		return { results, raw }
	},

	async fetch(apiKey, url, opts, signal) {
		const body: ScrapeBody = {
			url,
			formats: ["markdown"],
			onlyMainContent: opts.onlyMainContent ?? true
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
