import type { SearchResult } from "./providers/types.js"

export function stringify(value: unknown) {
	return JSON.stringify(value, null, 2)
}

export function asErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error)
}

const MAX_DESCRIPTION_LENGTH = 300

function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text
	return `${text.slice(0, maxLen)}…`
}

export function formatSearchOutput(results: SearchResult[]) {
	if (results.length === 0) return "No results."

	return results
		.map((result, index) => {
			const title = result.title || "Untitled"
			const url = result.url
			const description = result.description
			const markdown = result.markdown?.trim()
			const lines = [`${index + 1}. ${title}`]

			if (url) lines.push(`   ${url}`)
			if (description && !(index === 0 && markdown)) {
				lines.push(`   ${truncate(description, MAX_DESCRIPTION_LENGTH)}`)
			}
			if (index === 0 && markdown) lines.push("", "   Markdown:", markdown)

			return lines.join("\n")
		})
		.join("\n\n")
}
