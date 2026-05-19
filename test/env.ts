import { existsSync, readFileSync } from "node:fs"

export function loadTestEnv(path: string): void {
	if (!existsSync(path)) return

	const raw = readFileSync(path, "utf-8")
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith("#")) continue

		const eq = trimmed.indexOf("=")
		if (eq <= 0) continue

		const key = trimmed.slice(0, eq).trim()
		let value = trimmed.slice(eq + 1).trim()
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1)
		}
		process.env[key] ??= value
	}
}
