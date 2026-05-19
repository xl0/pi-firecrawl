import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fetchImpl, searchImpl } from "../extensions/web-tools/index.js"
import type { WebToolsConfig } from "../extensions/web-tools/providers/types.js"

interface TestCase {
	id: string
	provider: string
	tool: string
	args: Record<string, unknown>
}

const cases = JSON.parse(readFileSync(join(import.meta.dirname, "cases.json"), "utf-8")) as TestCase[]

const refDir = join(import.meta.dirname, "references")
mkdirSync(refDir, { recursive: true })

for (const c of cases) {
	const config: WebToolsConfig = {
		webSearch: { provider: c.provider },
		webFetch: { provider: c.provider },
		webApiKeys: {}
	}

	console.log(`Updating reference: ${c.id} (${c.tool}, provider=${c.provider})`)

	try {
		let result: { content: Array<{ type: "text"; text: string }> }
		const args = c.args
		if (c.tool === "search") {
			const params: { query: string; limit?: number; source?: string; fetchResult?: boolean } = {
				query: args["query"] as string
			}
			if (args["limit"] !== undefined) params.limit = args["limit"] as number
			if (args["source"] !== undefined) params.source = args["source"] as string
			if (args["fetchResult"] !== undefined) params.fetchResult = args["fetchResult"] as boolean
			result = await searchImpl(config, params)
		} else if (c.tool === "fetch") {
			const params: { url: string; waitFor?: number; timeout?: number; includeMetadata?: boolean } = {
				url: args["url"] as string
			}
			if (args["waitFor"] !== undefined) params.waitFor = args["waitFor"] as number
			if (args["timeout"] !== undefined) params.timeout = args["timeout"] as number
			if (args["includeMetadata"] !== undefined) params.includeMetadata = args["includeMetadata"] as boolean
			result = await fetchImpl(config, params)
		} else {
			console.error(`  Unknown tool: ${c.tool}`)
			continue
		}

		const text = result.content[0]?.text ?? ""
		const refPath = join(refDir, `ref-${c.id}.txt`)
		writeFileSync(refPath, text)
		console.log(`  → wrote ${refPath} (${text.length} chars)`)
	} catch (err) {
		console.error(`  ✗ FAILED: ${err instanceof Error ? err.message : String(err)}`)
	}
}

console.log("\nDone.")
