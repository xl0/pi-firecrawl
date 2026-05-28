import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { registerLovelyWebCommand } from "./command.js"
import { applyToolConfig, loadConfig } from "./config.js"
import { asErrorMessage } from "./format.js"
import { registerLovelyWebSearchTool, registerLovelyWebStaticTools } from "./tools.js"

export default function (pi: ExtensionAPI) {
	registerLovelyWebStaticTools(pi)
	pi.on("session_start", async (_event, ctx) => {
		try {
			const config = loadConfig(ctx.cwd)
			registerLovelyWebSearchTool(pi, config)
			registerLovelyWebStaticTools(pi, config)
			applyToolConfig(pi, config)
		} catch (error) {
			ctx.ui.notify(`Lovely Web config error: ${asErrorMessage(error)}`, "error")
		}
	})
	registerLovelyWebCommand(pi)
}
