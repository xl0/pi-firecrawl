import type { ImageContent, TextContent } from "@earendil-works/pi-ai"

export interface ToolResult {
	content: Array<TextContent | ImageContent>
	details: unknown
	isError?: boolean
}
