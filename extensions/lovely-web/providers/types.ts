export interface SearchResult {
	title: string
	url: string
	description?: string
	markdown?: string // populated for first result when fetchResult=true
}

export interface SearchOptions {
	limit: number
	source?: string
	timeout?: number
	category?: string
	location?: string
	country?: string
	tbs?: string
	timeRange?: string
	topic?: string
	includeImages?: boolean
	searchLang?: string
	freshness?: string
}

export interface Provider {
	readonly id: string
	readonly label: string
	readonly envApiKey: string
	search(apiKey: string, query: string, opts: SearchOptions, signal?: AbortSignal): Promise<{ results: SearchResult[]; raw: unknown }>
	fetch?(
		apiKey: string,
		url: string,
		opts: { waitFor?: number; timeout?: number },
		signal?: AbortSignal
	): Promise<{ markdown: string; metadata?: unknown; raw: unknown }>
}

export interface WebToolsConfig {
	webSearch?: { provider?: string | null }
	webFetch?: { provider?: string | null }
	webImage?: { enabled?: boolean; resize?: boolean; maxSize?: number }
	webApiKeys?: Record<string, string>
}
