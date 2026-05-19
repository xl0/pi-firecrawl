# Code

## Purpose
Minimal Pi extension package providing multi-provider web access (Firecrawl + Exa) for Pi.

## Package
- Published package name: `@xl0/pi-web-tools` at version `0.3.0`.
- Pi entry: `extensions/` via `package.json#pi.extensions`.
- Zero runtime dependencies. Pi APIs are peer dependencies.

## Extension
`extensions/web-tools/index.ts` registers two tools and one command:

- `web_search`: web/news/images search dispatching to configured search provider.
- `web_fetch`: fetch one URL as cleaned markdown dispatching to configured fetch provider.
- `/web-provider`: interactive command to configure providers and API keys.

## Provider dispatch
Search and fetch providers configurable independently in `xl0-web-tools.json` (`~/.pi/agent/` global, `.pi/` project, project overrides). If only `webSearch.provider` is set, `webFetch` falls back to it.

API key resolution: `webApiKeys.<providerId>` in config → `process.env[PROVIDER_ENV_KEY]` → error.

## Providers

### Firecrawl (`providers/firecrawl.ts`)
- Base: `https://api.firecrawl.dev/v1`
- Search: POST `/v1/search` with query, limit, optional sources array.
- Fetch: POST `/v1/scrape` with url, formats:["markdown"], onlyMainContent, optional waitFor.
- Auth: `Authorization: Bearer <key>`.
- Response wrapped in `{ success, data }` — provider checks success before mapping.

### Exa (`providers/exa.ts`)
- Search: POST `/search` with query, numResults, type:"auto", contents:{summary:true}. Source `web`→no category filter, `news`→category:"news", `images`→unsupported (no filter).
- Search result descriptions use Exa's semantic `summary` field (abstractive, query-tailored page summaries).
- Fetch: POST `/contents` with ids:[url], text:true. When waitFor specified, adds maxAgeHours:0 + livecrawlTimeout for live crawl.
- Auth: `x-api-key` header.
- Results normalized from `results[]` array. Fetch checks `statuses` for per-URL errors.

## Shared types (`providers/types.ts`)
```ts
SearchResult { title, url, description?, markdown? }
Provider { id, label, envApiKey, search(), fetch() }
WebToolsConfig { webSearch?, webFetch?, webApiKeys? }
```

## Formatting (`format.ts`)
Provider-agnostic: `formatSearchOutput(results: SearchResult[])` truncates non-fetched result descriptions at 300 chars; `stringify()`, `asErrorMessage()`.
