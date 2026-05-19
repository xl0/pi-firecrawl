# Code

## Purpose
Minimal Pi extension package providing multi-provider web access (Firecrawl + Exa) for Pi.

## Package
- Published package name: `@xl0/pi-web-tools` at version `0.3.0`.
- Pi entry: `extensions/` via `package.json#pi.extensions`.
- Zero runtime dependencies. Pi APIs are peer dependencies.

## Test infrastructure
`test/cases.json` — 6 test cases (firecrawl + exa: search, search+fetch, fetch per provider). Queries are stable topics to avoid content drift.
`test/references/ref-*.txt` — expected tool output snapshots (generated, committed).
`test/.env` — API keys for providers (gitignored).
`test/run.ts` — groups cases by provider, runs each group in parallel via `spawn("pi", ...)`. Per-group provider config written to `.pi/xl0-web-tools.json`. LLM compares tool output to reference, replies OK/FAIL. Summary at end, exits non-zero on failures.
`test/update-references.ts` — imports `searchImpl`/`fetchImpl` directly, calls providers with keys from `test/.env`, saves `formatSearchOutput` result as reference.

## Extension
`extensions/web-tools/index.ts` registers two tools and one command.
Exports `searchImpl` and `fetchImpl` standalone functions for testing — they take `WebToolsConfig` + params + optional signal/onUpdate, call provider methods, return `{content, details}`.

- `web_search`: web/news/images search dispatching to configured search provider.
- `web_fetch`: fetch one URL as cleaned markdown dispatching to configured fetch provider. Public options: `url`, optional `waitFor`, optional `timeout`, optional `includeMetadata`. Tool call rendering shows supplied non-default args.
- `/web-tools`: interactive command to configure providers and API keys.

## Provider dispatch
Search and fetch providers configurable independently in `xl0-web-tools.json` (`~/.pi/agent/` global, `.pi/` project, project overrides). If only `webSearch.provider` is set, `webFetch` falls back to it.

API key resolution: `webApiKeys.<providerId>` in config → `process.env[PROVIDER_ENV_KEY]` → error.

## Providers

### Firecrawl (`providers/firecrawl.ts`)
- Base: `https://api.firecrawl.dev/v1`
- Search: POST `/v1/search` with query, limit, optional sources array.
- Fetch: POST `/v1/scrape` with url, formats:["markdown"], `onlyMainContent:true`, optional waitFor.
- Auth: `Authorization: Bearer <key>`.
- Response wrapped in `{ success, data }` — provider checks success before mapping.

### Exa (`providers/exa.ts`)
- Search: POST `/search` with query, numResults, type:"auto", contents:{summary:true}. Source `web`→no category filter, `news`→category:"news", `images`→unsupported (no filter).
- Search result descriptions use Exa's semantic `summary` field (abstractive, query-tailored page summaries).
- Fetch: POST `/contents` with ids:[url], text:true. `waitFor` is ignored for Exa; `web_fetch` returns a warning if the caller supplies it.
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
