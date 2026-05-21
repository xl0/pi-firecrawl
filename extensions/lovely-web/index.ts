import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { registerLovelyWebCommand } from "./command.js"
import { applyToolConfig, loadConfig } from "./config.js"
import { registerLovelyWebTools } from "./tools.js"

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		applyToolConfig(pi, loadConfig(ctx.cwd))
	})
	registerLovelyWebTools(pi)
	registerLovelyWebCommand(pi)
}
