# pi-lovely-web

Lovely Pi extension for accessing the web.

## Supply chain

This extension uses plain REST API - not the provider-specific packages.
We add zero dependencies, minimizing the supply chain attack surface.

## Install

```bash
pi install npm:@xl0/pi-lovely-web
```

## Tools

- `web_search` - Compact search results; includes markdown from the first result when `web_fetch` is configured.

The plain-text tool output looks like this:

> `web_search "pi coding agent harness earendil" (web, limit 5, fetch first)`

```
1. GitHub - earendil-works/pi: AI agent toolkit
    https://github.com/earendil-works/pi
    Markdown:
[markdown of the first hit if `fetch_first` is not false]

2. packages/coding-agent/README.md at main · earendil-works/pi
   https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md
   The page describes the pi project from earendil-works, a minimal, extensible terminal coding harness designed to adapt to your workflow. Key points:
   - Pi is an AI agent toolkit for coding: CLI, unified LLM API, TUI/Web UI libraries, Slack bot, and vLLM pods.
   - Core idea: extendable with TypeScript E…

3. Pi Coding Agent
   https://pi.dev/
   Pi Coding Agent is a minimal, highly customizable terminal coding harness. It adapts to your workflow with extensible packages, themes, skills, and prompts.
```

- `web_fetch` - The single web page in markdown format
- `web_image` - The single image, returned as media content. Respects the Pi image resizing settings:

![web_image](https://raw.githubusercontent.com/xl0/pi-lovely-web/master/assets/web_image.png)


## Configuration

Run `/lovely-web` in Pi to configure providers interactively:

![settings](https://raw.githubusercontent.com/xl0/pi-lovely-web/master/assets/settings.png)

The settings are stored in `~/.pi/agent/xl0-pi-lovely-web.json` (global) or `.pi/xl0-pi-lovely-web.json` (project):

```json
{
  "webSearch": { "provider": "firecrawl" },
  "webFetch":  { "provider": "firecrawl" },
  "webImage":  { "enabled": true },
  "webApiKeys": {
    "firecrawl": "fc-...",
    "exa": "...",
    "tavily": "...",
    "brave": "..."
  }
}
```

API keys can also be set via environment variables: `FIRECRAWL_API_KEY`, `EXA_API_KEY`, `TAVILY_API_KEY`, `BRAVE_API_KEY`.

Search defaults to Firecrawl. Fetch has no default; configure `webFetch.provider` to enable `web_fetch` and first-result fetches from `web_search`. Set `provider:null` on `webSearch` or `webFetch` to remove that tool from Pi's active tool list. Set `webImage.enabled:false` to disable `web_image`.

`waitFor` is provider-specific: Firecrawl supports it as an extra pre-capture delay; Exa and Tavily ignore it and `web_fetch` returns a warning if supplied.

`web_image` fetches a direct image URL without provider config/API keys and returns a short text note plus image content to vision-capable models, matching Pi's `read` image behavior. Supported MIME types: PNG, JPEG, WebP, GIF. Defaults to a 5 MB download cap and resizes through Pi's inline image helper before returning content.

## Providers

| Provider      | Search | Fetch | Auth |
|---------------|--------|-------|------|
| Firecrawl     | ✓      | ✓     | `Authorization: Bearer` |
| Exa           | ✓      | ✓     | `x-api-key` |
| Tavily        | ✓      | ✓     | `Authorization: Bearer` |
| Brave Search  | ✓      | -     | `X-Subscription-Token` |
