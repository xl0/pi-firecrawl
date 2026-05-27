import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { registerLovelyWebCommand } from "./command.js"
import { applyToolConfig, loadConfig } from "./config.js"
import { registerLovelyWebSearchTool, registerLovelyWebStaticTools } from "./tools.js"

export default function (pi: ExtensionAPI) {
	registerLovelyWebStaticTools(pi)
	pi.on("session_start", async (_event, ctx) => {
		const config = loadConfig(ctx.cwd)
		registerLovelyWebSearchTool(pi, config)
		applyToolConfig(pi, config)
	})
	registerLovelyWebCommand(pi)
}
