import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

interface TestCase {
	id: string
	provider: string
	tool: string
	args: Record<string, unknown>
}

interface CaseResult {
	id: string
	status: string
	output: string
}

const cases = JSON.parse(readFileSync(join(import.meta.dirname, "cases.json"), "utf-8")) as TestCase[]
const projectRoot = resolve(import.meta.dirname, "..")
const refDir = join(import.meta.dirname, "references")
const configPath = join(projectRoot, ".pi", "xl0-web-tools.json")

function writePerCaseConfig(provider: string) {
	mkdirSync(join(projectRoot, ".pi"), { recursive: true })
	writeFileSync(configPath, `${JSON.stringify({ webSearch: { provider }, webFetch: { provider } }, null, 2)}\n`, "utf-8")
}

const systemPrompt = [
	"You are a test validator.",
	"Use only the read, web_search, and web_fetch tools.",
	"You have NO other tools available.",
	"Follow instructions exactly."
].join(" ")

function runPi(args: string[], timeout: number): Promise<{ stdout: string; stderr: string; error?: Error }> {
	return new Promise(resolve => {
		const child = spawn("pi", args, {
			cwd: projectRoot,
			env: { ...process.env },
			timeout,
			stdio: ["ignore", "pipe", "pipe"]
		})
		let stdout = ""
		let stderr = ""
		child.stdout?.on("data", d => {
			stdout += d.toString()
		})
		child.stderr?.on("data", d => {
			stderr += d.toString()
		})
		child.on("error", err => resolve({ stdout, stderr, error: err }))
		child.on("close", () => resolve({ stdout, stderr }))
	})
}

function parseVerdict(stdout: string): { verdict: string; tail: string } {
	const lines = stdout.split("\n").filter(l => l.trim())
	const verdict = lines.find(l => l.startsWith("OK") || l.startsWith("FAIL")) ?? ""
	const tail = lines.slice(-3).join("\n")
	return { verdict, tail }
}

async function runCase(c: TestCase): Promise<CaseResult> {
	const refPath = join(refDir, `ref-${c.id}.txt`)
	if (!existsSync(refPath)) return { id: c.id, status: "SKIP", output: "reference file not found" }

	const argsStr = Object.entries(c.args)
		.map(([k, v]) => `${k}=${typeof v === "string" ? `'${v}'` : JSON.stringify(v)}`)
		.join(" ")

	const testPrompt = [
		`Read the file test/references/ref-${c.id}.txt. Then use ${c.tool === "search" ? "web_search" : "web_fetch"} with ${argsStr}.`,
		`Compare the tool output to the reference. If they have the same structure and the results are substantively equivalent (content may differ slightly), reply with exactly: OK`,
		`Otherwise reply with exactly: FAIL: <brief reason>`
	].join("\n")

	const { stdout, stderr, error } = await runPi(
		[
			"-p",
			"--model",
			"accounts/fireworks/models/kimi-k2p6",
			"--system-prompt",
			systemPrompt,
			"--no-context-files",
			"--no-extensions",
			"--no-skills",
			"--no-prompt-templates",
			"--no-themes",
			"--tools",
			"read,web_search,web_fetch",
			"-e",
			"extensions/web-tools/index.ts",
			testPrompt
		],
		120_000
	)

	if (error) return { id: c.id, status: "ERROR", output: error.message }

	const trimmed = stdout.trim()
	const { verdict, tail } = parseVerdict(trimmed)

	if (verdict.startsWith("OK")) {
		return { id: c.id, status: "PASS", output: verdict }
	}
	if (verdict.startsWith("FAIL")) {
		return { id: c.id, status: "FAIL", output: verdict }
	}

	const debug = `No verdict. Last output:\n    ${tail.replace(/\n/g, "\n    ")}${stderr.trim() ? `\n  stderr:\n    ${stderr.trim().replace(/\n/g, "\n    ")}` : ""}`
	return { id: c.id, status: "UNCLEAR", output: debug }
}

// Group cases by provider
const groups = new Map<string, TestCase[]>()
for (const c of cases) {
	const g = groups.get(c.provider) ?? []
	g.push(c)
	groups.set(c.provider, g)
}

const allResults: CaseResult[] = []
let passed = 0
let failed = 0

for (const [provider, groupCases] of groups) {
	writePerCaseConfig(provider)

	process.stdout.write(`Running ${groupCases.length} ${provider} cases in parallel...\n`)

	const promises = groupCases.map(c => runCase(c))
	const groupResults = await Promise.all(promises)

	for (const r of groupResults) {
		if (r.status === "PASS") {
			console.log(`  PASS  ${r.id}`)
			passed++
		} else if (r.status === "FAIL") {
			console.log(`  FAIL  ${r.id}: ${r.output}`)
			failed++
		} else if (r.status === "ERROR") {
			console.log(`  ERROR ${r.id}: ${r.output}`)
			failed++
		} else {
			console.log(`  ??    ${r.id}:\n    ${r.output.replace(/\n/g, "\n    ")}`)
			failed++
		}
		allResults.push(r)
	}
}

// Clean up temp config
try {
	writeFileSync(configPath, "{}\n", "utf-8")
} catch {
	/* ok */
}

console.log(`\n───\nResults: ${passed} passed, ${failed} failed, ${allResults.length} total`)

process.exit(failed > 0 ? 1 : 0)
