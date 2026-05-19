# @xl0/pi-web-tools

Pi extension package providing `web_search` and `web_fetch` tools backed by Firecrawl and Exa.

## Install

```bash
pi install npm:@xl0/pi-web-tools
```

Or load without installing:

```bash
pi -e npm:@xl0/pi-web-tools
```

## Configuration

Run `/web-provider` in Pi to configure providers interactively, or create
`~/.pi/agent/xl0-web-tools.json` (global) or `.pi/xl0-web-tools.json` (project):

```json
{
  "webSearch": { "provider": "firecrawl" },
  "webFetch":  { "provider": "firecrawl" },
  "webApiKeys": {
    "firecrawl": "fc-...",
    "exa": "exa-..."
  }
}
```

API keys can also be set via environment variables: `FIRECRAWL_API_KEY`, `EXA_API_KEY`.

Search and fetch can use different providers. If only `webSearch.provider` is set,
`web_fetch` falls back to it.

## Providers

| Provider   | Search | Fetch | Auth |
|------------|--------|-------|------|
| Firecrawl  | ✓      | ✓     | `Authorization: Bearer` |
| Exa        | ✓      | ✓     | `x-api-key` |
