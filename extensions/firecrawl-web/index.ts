import { homedir } from "node:os"
import { join } from "node:path"
import { StringEnum } from "@earendil-works/pi-ai"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Text } from "@earendil-works/pi-tui"
import type { ScrapeParams } from "@mendable/firecrawl-js"
import Firecrawl from "@mendable/firecrawl-js"
import { config as loadDotenv } from "dotenv"
import { Type } from "typebox"

const DEFAULT_TIMEOUT_MS = 30_000

let dotenvLoaded = false
let dotenvValues: Record<string, string> = {}

function readEnvValue(name: string) {
	const existing = process.env[name]
	if (existing) return existing

	if (!dotenvLoaded) {
		const result = loadDotenv({ path: join(homedir(), ".pi", "agent", ".env"), quiet: true })
		dotenvValues = result.parsed ?? {}
		dotenvLoaded = true
	}

	return process.env[name] || dotenvValues[name]
}

function createClient() {
	const apiKey = readEnvValue("FIRECRAWL_API_KEY")
	if (!apiKey) {
		throw new Error("Missing FIRECRAWL_API_KEY in environment or ~/.pi/agent/.env")
	}

	return new Firecrawl({ apiKey })
}

function stringify(value: unknown) {
	return JSON.stringify(value, null, 2)
}

function withoutStatus(value: unknown) {
	if (!value || typeof value !== "object" || !("success" in value)) return value
	const { success: _success, ...rest } = value
	return rest
}

function formatSearchOutput(value: unknown) {
	const output = withoutStatus(value)
	const data = output && typeof output === "object" && "data" in output ? (output as { data?: unknown }).data : undefined
	if (!Array.isArray(data)) return stringify(output)
	if (data.length === 0) return "No results."

	return data
		.map((item, index) => {
			if (!item || typeof item !== "object") return `${index + 1}. ${stringify(item)}`

			const result = item as { title?: unknown; url?: unknown; description?: unknown; markdown?: unknown }
			const title = typeof result.title === "string" ? result.title : "Untitled"
			const url = typeof result.url === "string" ? result.url : undefined
			const description = typeof result.description === "string" ? result.description : undefined
			const markdown = typeof result.markdown === "string" ? result.markdown.trim() : undefined
			const lines = [`${index + 1}. ${title}`]

			if (url) lines.push(`   ${url}`)
			if (description && !(index === 0 && markdown)) lines.push(`   ${description}`)
			if (index === 0 && markdown) lines.push("", "   Markdown:", markdown)

			return lines.join("\n")
		})
		.join("\n\n")
}

function asErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error)
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Firecrawl Web Search",
		description: "Search the web with Firecrawl.",
		promptSnippet: "Use web_search for current web information.",
		promptGuidelines: [
			"Use web_search when the user asks for current web information, discovery, or sources beyond the local workspace.",
			"Use web_fetch after web_search when you need the full markdown content of a specific page."
		],
		parameters: Type.Object({
			query: Type.String({ description: "The web search query." }),
			limit: Type.Optional(Type.Integer({ description: "Maximum number of results to return. Defaults to 5.", minimum: 1, maximum: 20 })),
			source: Type.Optional(StringEnum(["web", "news", "images"] as const)),
			fetchResult: Type.Optional(Type.Boolean({ description: "Whether to fetch the first result and include markdown. Defaults to true." }))
		}),
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0)
			const bits = [args.source ?? "web", `limit ${args.limit ?? 5}`]
			if (args.fetchResult ?? true) bits.push("fetch first")
			text.setText(
				`${theme.fg("toolTitle", theme.bold("web_search "))}${theme.fg("muted", `"${args.query}"`)} ${theme.fg("dim", `(${bits.join(", ")})`)}`
			)
			return text
		},
		async execute(_toolCallId, params, signal, onUpdate) {
			try {
				onUpdate?.({
					content: [{ type: "text", text: `Searching Firecrawl for: ${params.query}` }],
					details: undefined
				})

				const client = createClient()
				const result = await client.search(params.query, {
					limit: params.limit ?? 5,
					sources: [params.source ?? "web"],
					timeout: DEFAULT_TIMEOUT_MS
				})

				if (signal?.aborted) throw new Error("Search cancelled")

				const output = withoutStatus(result)
				const shouldFetch = params.fetchResult ?? true
				if (output && typeof output === "object") {
					const details = output as { data?: unknown; piFirecrawl?: unknown }
					details.piFirecrawl = {
						fetchResultDefault: true,
						fetchResultBehavior: "only the first result is fetched and displayed; all result metadata remains in details",
						fetchResultEnabled: shouldFetch
					}

					if (shouldFetch && Array.isArray(details.data)) {
						const first = details.data[0]
						if (first && typeof first === "object" && "url" in first && typeof first.url === "string") {
							onUpdate?.({
								content: [{ type: "text", text: `Fetching first Firecrawl result: ${first.url}` }],
								details: undefined
							})

							const document = await client.scrapeUrl(first.url, {
								formats: ["markdown"],
								onlyMainContent: true,
								timeout: DEFAULT_TIMEOUT_MS
							})

							if (signal?.aborted) throw new Error("Search cancelled")
							if (!document.success) throw new Error(document.error)

							if (document.markdown) (first as { markdown?: string }).markdown = document.markdown
							;(first as { metadata?: unknown }).metadata = document.metadata
						}
					}
				}

				return {
					content: [{ type: "text", text: formatSearchOutput(output) }],
					details: output
				}
			} catch (error) {
				return {
					content: [{ type: "text", text: `Firecrawl search failed: ${asErrorMessage(error)}` }],
					details: { error: asErrorMessage(error) },
					isError: true
				}
			}
		}
	})

	pi.registerTool({
		name: "web_fetch",
		label: "Firecrawl Page Fetch",
		description: "Fetch a page as markdown with Firecrawl. Metadata is verbose and opt-in.",
		promptSnippet: "Use web_fetch to fetch a URL as markdown.",
		promptGuidelines: [
			"Use web_fetch when you need the full readable markdown content of a known URL.",
			"Prefer web_fetch over bash/curl for web pages because web_fetch returns cleaned markdown suitable for agent context."
		],
		parameters: Type.Object({
			url: Type.String({ description: "The URL to fetch.", format: "uri" }),
			onlyMainContent: Type.Optional(Type.Boolean({ description: "Only return the main page content. Defaults to true." })),
			waitFor: Type.Optional(
				Type.Integer({ description: "Milliseconds to wait before capturing content, useful for JS-heavy pages.", minimum: 0 })
			),
			timeout: Type.Optional(Type.Integer({ description: "Request timeout in milliseconds. Defaults to 30000.", minimum: 1 })),
			includeMetadata: Type.Optional(
				Type.Boolean({
					description:
						"Append verbose page metadata to the markdown output. Defaults to false. Full metadata is always available in details."
				})
			)
		}),
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0)
			text.setText(`${theme.fg("toolTitle", theme.bold("web_fetch "))}${theme.fg("muted", args.url)}`)
			return text
		},
		async execute(_toolCallId, params, signal, onUpdate) {
			try {
				onUpdate?.({
					content: [{ type: "text", text: `Fetching page with Firecrawl: ${params.url}` }],
					details: undefined
				})

				const client = createClient()
				const scrapeParams = {
					formats: ["markdown"],
					onlyMainContent: params.onlyMainContent ?? true,
					timeout: params.timeout ?? DEFAULT_TIMEOUT_MS,
					...(params.waitFor === undefined ? {} : { waitFor: params.waitFor })
				} satisfies ScrapeParams
				const document = await client.scrapeUrl(params.url, scrapeParams)

				if (signal?.aborted) throw new Error("Fetch cancelled")
				if (!document.success) throw new Error(document.error)

				const metadata = params.includeMetadata && document.metadata ? `\n\nMetadata:\n${stringify(document.metadata)}` : ""
				const markdown = document.markdown?.trim() || "No markdown content returned."

				return {
					content: [{ type: "text", text: `${markdown}${metadata}` }],
					details: document
				}
			} catch (error) {
				return {
					content: [{ type: "text", text: `Firecrawl fetch failed: ${asErrorMessage(error)}` }],
					details: { error: asErrorMessage(error) },
					isError: true
				}
			}
		}
	})
}
