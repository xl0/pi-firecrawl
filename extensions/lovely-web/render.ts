import type { Theme } from "@earendil-works/pi-coding-agent"
import { Text } from "@earendil-works/pi-tui"

const COLLAPSED_RESULT_LINES = 6

export function renderTextResult(
	result: { content: Array<{ type: string; text?: string }> },
	expanded: boolean,
	theme: Theme,
	partialLabel: string
) {
	const content = result.content[0]
	if (content?.type !== "text" || content.text === undefined) return new Text(theme.fg("error", "No text output"), 0, 0)
	if (!content.text.trim()) return new Text(theme.fg("dim", partialLabel), 0, 0)

	const lines = content.text.split("\n")
	const shown = expanded ? lines : lines.slice(0, COLLAPSED_RESULT_LINES)
	let text = shown.map(line => theme.fg("toolOutput", line)).join("\n")
	if (!expanded && lines.length > COLLAPSED_RESULT_LINES) {
		text += `\n${theme.fg("muted", `... ${lines.length - COLLAPSED_RESULT_LINES} more lines (ctrl-o to expand)`)}`
	}
	return new Text(text, 0, 0)
}
