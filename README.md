# @xl0/pi-lovely-web

Pi extension package providing `web_search`, `web_fetch`, and `web_image` tools backed by Firecrawl, Exa, Tavily, and Brave Search.

## Install

```bash
pi install npm:@xl0/pi-lovely-web
```

Or load without installing:

```bash
pi -e npm:@xl0/pi-lovely-web
```

## Configuration

Run `/lovely-web` in Pi to configure providers interactively, or create
`~/.pi/agent/xl0-pi-lovely-web.json` (global) or `.pi/xl0-pi-lovely-web.json` (project):

```json
{
  "webSearch": { "provider": "firecrawl", "enabled": true },
  "webFetch":  { "provider": "firecrawl", "enabled": true },
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

Search and fetch can use different providers. If only `webSearch.provider` is set,
`web_fetch` falls back to it when that provider supports fetch. Set `enabled:false`
on `webSearch`, `webFetch`, or `webImage` to remove that tool from Pi's active tool list.

`waitFor` is provider-specific: Firecrawl supports it as an extra pre-capture delay; Exa and Tavily ignore it and `web_fetch` returns a warning if supplied.

`web_image` fetches a direct image URL without provider config/API keys and returns a short text note plus image content to vision-capable models, matching Pi's `read` image behavior. Supported MIME types: PNG, JPEG, WebP, GIF. Defaults to a 5 MB download cap and resizes through Pi's inline image helper before returning content.

## Providers

| Provider      | Search | Fetch | Auth |
|---------------|--------|-------|------|
| Firecrawl     | ✓      | ✓     | `Authorization: Bearer` |
| Exa           | ✓      | ✓     | `x-api-key` |
| Tavily        | ✓      | ✓     | `Authorization: Bearer` |
| Brave Search  | ✓      | -     | `X-Subscription-Token` |
