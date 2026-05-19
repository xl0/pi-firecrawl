export interface SearchResult {
	title: string
	url: string
	description?: string
	markdown?: string // populated for first result when fetchResult=true
}

export interface Provider {
	readonly id: string
	readonly label: string
	readonly envApiKey: string
	search(
		apiKey: string,
		query: string,
		opts: { limit: number; source?: string; timeout?: number },
		signal?: AbortSignal
	): Promise<{ results: SearchResult[]; raw: unknown }>
	fetch(
		apiKey: string,
		url: string,
		opts: { onlyMainContent?: boolean; waitFor?: number; timeout?: number },
		signal?: AbortSignal
	): Promise<{ markdown: string; metadata?: unknown; raw: unknown }>
}

export interface WebToolsConfig {
	webSearch?: { provider: string }
	webFetch?: { provider: string }
	webApiKeys?: Record<string, string>
}
