import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { type ExtensionAPI, ExtensionInputComponent, getSelectListTheme, getSettingsListTheme } from "@earendil-works/pi-coding-agent"
import { Container, SelectList, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui"
import {
	applyToolConfig,
	DEFAULT_PROVIDER_ID,
	DISABLED_LABEL,
	getImageMaxSize,
	isFetchEnabled,
	isImageEnabled,
	isImageResizeEnabled,
	isSearchEnabled,
	loadConfig,
	maskApiKey,
	providerIdFromLabel,
	providerLabel,
	providerNames,
	providers,
	readConfigFile,
	writeConfigFile
} from "./config.js"

function providerSubmenu(title: string, labels: string[], currentValue: string, done: (selectedValue?: string) => void) {
	const container = new Container()
	container.addChild(new Text(title, 1, 1))
	const list = new SelectList(
		labels.map(label => ({ value: label, label })),
		Math.min(labels.length, 10),
		getSelectListTheme()
	)
	list.setSelectedIndex(Math.max(0, labels.indexOf(currentValue)))
	list.onSelect = item => done(item.value)
	list.onCancel = () => done(undefined)
	container.addChild(list)
	return {
		render: (width: number) => container.render(width),
		invalidate: () => container.invalidate(),
		handleInput: (data: string) => list.handleInput(data)
	}
}

export function registerLovelyWebCommand(pi: ExtensionAPI) {
	pi.registerCommand("lovely-web", {
		description: "Configure Lovely Web search, fetch, and image tools",
		async handler(_args, ctx) {
			if (!ctx.hasUI) {
				ctx.ui.notify("The /lovely-web command is only available in interactive mode.", "warning")
				return
			}

			const scope = await ctx.ui.select("Config scope:", ["Global (~/.pi/agent/)", "Project (.pi/)"])
			if (scope === undefined) return

			const configPath = scope.startsWith("Global")
				? join(homedir(), ".pi", "agent", "xl0-pi-lovely-web.json")
				: resolve(ctx.cwd, ".pi", "xl0-pi-lovely-web.json")

			const config = readConfigFile(configPath)
			const save = () => {
				writeConfigFile(configPath, config)
				applyToolConfig(pi, loadConfig(ctx.cwd))
			}

			await ctx.ui.custom((_tui, theme, _keybindings, done) => {
				const searchLabels = [DISABLED_LABEL, ...providerNames.map(id => providers[id]?.label ?? id)]
				const fetchLabels = [DISABLED_LABEL, ...providerNames.filter(id => providers[id]?.fetch).map(id => providers[id]?.label ?? id)]
				const items: SettingItem[] = [
					{
						id: "search",
						label: "web_search",
						currentValue: isSearchEnabled(config) ? providerLabel(config.webSearch?.provider ?? DEFAULT_PROVIDER_ID) : DISABLED_LABEL,
						description: "Search provider, or disabled to remove web_search from active tools.",
						submenu: (currentValue, done) => providerSubmenu("Select search provider", searchLabels, currentValue, done)
					},
					{
						id: "fetch",
						label: "web_fetch",
						currentValue: isFetchEnabled(config) ? providerLabel(config.webFetch?.provider ?? DEFAULT_PROVIDER_ID) : DISABLED_LABEL,
						description: "Fetch provider, or disabled to remove web_fetch from active tools.",
						submenu: (currentValue, done) => providerSubmenu("Select fetch provider", fetchLabels, currentValue, done)
					},
					{
						id: "image",
						label: "web_image",
						currentValue: isImageEnabled(config) ? "enabled" : "disabled",
						description: "Enable or disable direct image URL fetching.",
						values: ["enabled", "disabled"]
					},
					{
						id: "image-resize",
						label: "Resize images",
						currentValue: isImageResizeEnabled(config) ? "on" : "off",
						description: "Resize fetched images to fit within the max size limit.",
						values: ["on", "off"]
					},
					{
						id: "image-max-size",
						label: "Max image size",
						currentValue: String(getImageMaxSize(config)),
						description: "Maximum longest side in pixels for resized images.",
						submenu: (_currentValue: string, done: (selectedValue?: string) => void) =>
							new ExtensionInputComponent(
								"Max image size (px):",
								"Enter size",
								value => {
									const n = Number(value)
									if (!Number.isFinite(n) || n < 1) {
										done(undefined)
										return
									}
									config.webImage ??= {}
									config.webImage.maxSize = n
									save()
									done(String(n))
								},
								() => done(undefined),
								{ tui: _tui }
							)
					},
					...providerNames.map(id => ({
						id: `key:${id}`,
						label: `${providers[id]?.label ?? id} API key`,
						currentValue: maskApiKey(config.webApiKeys?.[id]),
						description: `Set API key for ${providers[id]?.label ?? id}.`,
						submenu: (_currentValue: string, done: (selectedValue?: string) => void) =>
							new ExtensionInputComponent(
								`API key for ${providers[id]?.label ?? id}${config.webApiKeys?.[id] ? ` (current: ${maskApiKey(config.webApiKeys[id])})` : ""}:`,
								"Enter API key",
								value => {
									config.webApiKeys ??= {}
									config.webApiKeys[id] = value
									save()
									done(maskApiKey(value))
								},
								() => done(undefined),
								{ tui: _tui }
							)
					}))
				]
				const container = new Container()
				container.addChild(new Text(theme.fg("accent", theme.bold("Lovely Web")), 1, 1))
				const list = new SettingsList(
					items,
					Math.min(items.length, 12),
					getSettingsListTheme(),
					(id, newValue) => {
						if (id === "search") {
							if (newValue === DISABLED_LABEL) config.webSearch = { provider: null }
							else {
								const providerId = providerIdFromLabel(newValue)
								if (providerId) config.webSearch = { provider: providerId }
							}
						} else if (id === "fetch") {
							if (newValue === DISABLED_LABEL) config.webFetch = { provider: null }
							else {
								const providerId = providerIdFromLabel(newValue)
								if (providerId) config.webFetch = { provider: providerId }
							}
						} else if (id === "image") {
							config.webImage = { ...config.webImage, enabled: newValue === "enabled" }
						} else if (id === "image-resize") {
							config.webImage = { ...config.webImage, resize: newValue === "on" }
						}
						save()
					},
					() => done(undefined)
				)
				container.addChild(list)
				return {
					render: (width: number) => container.render(width),
					invalidate: () => container.invalidate(),
					handleInput: (data: string) => list.handleInput(data)
				}
			})
		}
	})
}
