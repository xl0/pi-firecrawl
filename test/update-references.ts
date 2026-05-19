import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fetchImpl, searchImpl } from "../extensions/web-tools/index.js"
import type { WebToolsConfig } from "../extensions/web-tools/providers/types.js"
import { loadTestEnv } from "./env.js"

interface TestCase {
	id: string
	tool: string
	args: Record<string, unknown>
	providers: string[]
}

loadTestEnv(join(import.meta.dirname, ".env"))

const cases = JSON.parse(readFileSync(join(import.meta.dirname, "cases.json"), "utf-8")) as TestCase[]

const refDir = join(import.meta.dirname, "references")
mkdirSync(refDir, { recursive: true })

let failed = 0

for (const c of cases) {
	const config: WebToolsConfig = {
		webSearch: { provider: "tavily" },
		webFetch: { provider: "tavily" },
		webApiKeys: {}
	}

	console.log(`Updating reference: ${c.id} (${c.tool})`)

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
			failed++
			continue
		}

		const text = result.content[0]?.text ?? ""
		const refPath = join(refDir, `ref-${c.id}.txt`)
		writeFileSync(refPath, text)
		console.log(`  → wrote ${refPath} (${text.length} chars)`)
	} catch (err) {
		failed++
		console.error(`  ✗ FAILED: ${err instanceof Error ? err.message : String(err)}`)
	}
}

console.log(`\nDone. ${failed} failed.`)
process.exit(failed > 0 ? 1 : 0)
