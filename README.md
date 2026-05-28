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

- `web_search` - Compact search results. Set `fetchResult:true` to include markdown from the first result when `web_fetch` is configured.

The plain-text tool output looks like this:

> `web_search "pi coding agent harness earendil" (web, limit 5)`

```
1.
   title: GitHub - earendil-works/pi: AI agent toolkit
   url: https://github.com/earendil-works/pi
   desc: Pi is an AI agent toolkit for coding: CLI, unified LLM API, TUI/Web UI libraries, Slack bot, and vLLM pods.

2.
   title: packages/coding-agent/README.md at main · earendil-works/pi
   url: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md
   desc: The page describes the pi project from earendil-works, a minimal, extensible terminal coding harness designed to adapt to your workflow.

3.
   title: Pi Coding Agent
   url: https://pi.dev/
   desc: Pi Coding Agent is a minimal, highly customizable terminal coding harness.
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

Search defaults to Firecrawl. Fetch has no default; configure `webFetch.provider` to enable `web_fetch` and `fetchResult:true` first-result fetches from `web_search`. Set `provider:null` on `webSearch` or `webFetch` to remove that tool from Pi's active tool list. Set `webImage.enabled:false` to disable `web_image`.

`web_search` parameters are provider-specific and update dynamically when you change the search provider. Changing providers changes the tool schema, which invalidates Pi's prefill cache.

Search params:

| Provider | Extra `web_search` params |
|----------|---------------------------|
| Firecrawl | `source:web|news|images`, `category:github|research|pdf`, `location`, `country`, `tbs` |
| Exa | `category:company|people|research paper|news|personal site|financial report`, `country` |
| Tavily | `topic:general|news|finance`, `includeImages`, `country`, `timeRange` |
| Brave Search | `source:web|news|images`, `country`, `searchLang`, `freshness` |

`waitFor` is fetch-provider-specific: Firecrawl supports it as an extra pre-capture delay; Exa and Tavily ignore it and `web_fetch` returns a warning if supplied.

`web_image` fetches a direct image URL without provider config/API keys and returns a short text note plus image content to vision-capable models, matching Pi's `read` image behavior. Supported MIME types: PNG, JPEG, WebP, GIF. Defaults to a 5 MB download cap and resizes through Pi's inline image helper before returning content.

## Providers

| Provider      | Search | Fetch | Auth |
|---------------|--------|-------|------|
| Firecrawl     | ✓      | ✓     | `Authorization: Bearer` |
| Exa           | ✓      | ✓     | `x-api-key` |
| Tavily        | ✓      | ✓     | `Authorization: Bearer` |
| Brave Search  | ✓      | -     | `X-Subscription-Token` |
