# Code

## Purpose
Minimal Pi extension package providing multi-provider web access (Firecrawl, Exa, Tavily, Brave) for Pi.

## Package
- Published package name: `@xl0/pi-lovely-web` at version `0.1.4`.
- Pi entry: `extensions/` via `package.json#pi.extensions`.
- Published files include `extensions/`, `README.md`, and `LICENSE`; package gallery image metadata points at GitHub-hosted screenshots under `assets/`.
- Zero runtime dependencies. Pi APIs are peer dependencies with minimum version `>=0.75.4`.

## Test infrastructure
`test/cases.json` — 3 query-pattern cases (`search`, `search-fetch`, `fetch`), each tested against applicable providers. `search` runs on firecrawl+exa+tavily+brave; `search-fetch`/`fetch` run on firecrawl+exa+tavily (brave is search-only). Queries are stable topics to avoid content drift.
`test/references/ref-*.txt` — shared reference snapshots, generated from Tavily (provider-agnostic). All providers compare against the same refs; LLM judges formatting/structure, not content.
`test/.env` — API keys for providers (gitignored), loaded by test scripts without overriding existing environment variables.
`test/env.ts` — tiny `.env` loader shared by test scripts.
`test/run.ts` — runs each case/provider pair sequentially via `spawn("pi", ...)` in Pi JSON mode. Per-provider config written to `.pi/xl0-pi-lovely-web.json` and removed in a `finally` block. Each run writes artifacts under `test/results/<run-id>/`: per-case JSONL stdout, stderr, Pi sessions under `sessions/`, and `summary.json` with extracted `tool_execution_end` results. LLM compares output structure to reference with per-case expectations; final assistant text must end with exact `OK` or `FAIL: ...`. Summary at end, exits non-zero on failures.
`test/update-references.ts` — imports `searchImpl`/`fetchImpl` directly, calls providers with keys from `test/.env`/environment, saves tool text as reference, exits non-zero on failures.
`test/image.ts` — direct external-network smoke test for `imageImpl`: small PNG from httpbin remains unresized; large Picsum JPEG is resized to Pi inline limits.

## Extension
`extensions/lovely-web/index.ts` is the Pi entrypoint. It applies active-tool config on `session_start`, registers tools via `tools.ts`, and registers `/lovely-web` via `command.ts`. Tests import tool impl modules directly instead of through the extension entrypoint.

- `tools.ts`: registers `web_search`, `web_fetch`, and `web_image`; owns tool schemas, prompt snippets/guidelines, call/result rendering hooks, and execute wrappers.
- `tool-impl.ts`: exports standalone `searchImpl`/`fetchImpl`. Search/fetch take `WebToolsConfig` + params + optional signal/onUpdate and call provider methods. Both return `{content, details}`.
- `image.ts`: exports standalone `imageImpl`; downloads direct image URLs without provider config/API keys. Supports PNG/JPEG/WebP/GIF, default 5 MB download cap, maximum 20 MB, optional timeout/maxBytes. Downloaded images are passed through Pi's `resizeImage()` before returning to the LLM; if decoding/resizing cannot fit inline limits, the image is omitted with a note. Metadata lives in `details`; Pi's generic image-content renderer displays the image block.
- `command.ts`: `/lovely-web` SettingsList-based interactive command to configure providers, API keys, search/fetch disabled state (`provider:null`), and image enabled state. Active-tool changes are applied immediately through Pi `setActiveTools()`.
- `render.ts`: shared collapsed text result renderer for search/fetch.

Tools:
- `web_search`: web/news/images search dispatching to configured search provider. Result rendering shows the first few output lines until expanded. Auto-fetches first result by default; image searches first try direct image fetch/resizing and fall back to page markdown fetch if the result URL is not image content.
- `web_fetch`: fetch one URL as cleaned markdown dispatching to configured fetch provider. Public options: `url`, optional `waitFor`, optional `timeout`, optional `includeMetadata`. Tool call rendering shows supplied non-default args. Result rendering shows the first few output lines until expanded.
- `web_image`: fetch a direct image URL and return a short text note plus one image content block, matching Pi `read` image behavior. Resizing is controlled by config (`webImage.resize`, default true) and max longest side (`webImage.maxSize`, default 2000 px).

## Provider dispatch
`extensions/lovely-web/config.ts` owns provider registry/config helpers. Search and fetch providers are configurable independently in `xl0-pi-lovely-web.json` (`~/.pi/agent/` global, `.pi/` project, project overrides). `webSearch.provider` and `webFetch.provider` default to `firecrawl`; setting either provider to `null` removes the corresponding tool from Pi's active tool list and gates execution. `webImage.enabled` defaults to true; setting it to false removes `web_image`. If only `webSearch.provider` is set on a raw config object and search is enabled, `webFetch` falls back to it when the provider implements fetch.

API key resolution: `webApiKeys.<providerId>` in config → `process.env[PROVIDER_ENV_KEY]` → error.

`providers/http.ts` contains shared JSON request handling for fetch timeouts, abort propagation, non-2xx errors, and JSON parsing.

## Providers

### Firecrawl (`providers/firecrawl.ts`)
- Base: `https://api.firecrawl.dev/v2`
- Search: POST `/v2/search` with query, limit, optional sources array. Maps the returned `web`/`news`/`images` arrays into `SearchResult[]`; image searches use `imageUrl` as the result URL when present.
- Fetch: POST `/v2/scrape` with url, formats:["markdown"], `onlyMainContent:true`, optional waitFor.
- Auth: `Authorization: Bearer <key>`.
- Response wrapped in `{ success, data }` — provider checks success before mapping.

### Exa (`providers/exa.ts`)
- Search: POST `/search` with query, numResults, type:"auto", contents:{summary:true}. Source `web`→no category filter, `news`→category:"news", `images`→unsupported (no filter).
- Search result descriptions use Exa's semantic `summary` field (abstractive, query-tailored page summaries) with a leading `Summary:` label stripped if Exa returns one.
- Fetch: POST `/contents` with ids:[url], text:true. `waitFor` is ignored for Exa; `web_fetch` returns a warning if the caller supplies it.
- Auth: `x-api-key` header.
- Results normalized from `results[]` array. Fetch checks `statuses` for per-URL errors.

### Tavily (`providers/tavily.ts`)
- Search: POST `/search` with query, max_results, search_depth:"basic", optional topic. Source `web`→no topic filter, `news`→topic:"news", `images`→unsupported.
- Search result descriptions use Tavily's `content` field (semantic snippets).
- Fetch: POST `/extract` with urls:[url], extract_depth:"basic", format:"markdown". Returns `{results:[{url, raw_content, images, favicon}], failed_results[]}`.
- `waitFor` is ignored for Tavily (no JS rendering); `web_fetch` warns if supplied.
- Auth: `Authorization: Bearer <key>`. Env key: `TAVILY_API_KEY`.

### Brave Search (`providers/brave.ts`)
- Search-only provider (no `fetch` implementation). `webFetch` fallback will not resolve to Brave.
- Search: GET `/web/search`, `/news/search`, or `/images/search` with query params `q`, `count`. Source determines endpoint.
- Web response: `{web:{results:[{title, url, description}]}}`. News response: `{results:[...]}`. Image response: `{results:[{url, title?, description?}]}`.
- `description` strips HTML tags (`<strong>` etc) from Brave snippets.
- If Brave is configured as the only provider and `web_fetch` is called, it errors with guidance about needing a fetch-capable provider.
- Auth: `X-Subscription-Token` header. Env key: `BRAVE_API_KEY`.

## Shared types (`providers/types.ts`)
```ts
SearchResult { title, url, description?, markdown? }
Provider { id, label, envApiKey, search(), fetch?() }
WebToolsConfig { webSearch?: {provider?: string | null}, webFetch?: {provider?: string | null}, webImage?: {enabled?}, webApiKeys? }
```

## Shared HTTP (`providers/http.ts`)
`requestJson()` wraps provider HTTP requests with timeout, abort propagation, non-2xx error text, and JSON parsing.
`web_image` downloads with `fetch()`, validates HTTP status, supported image MIME type, response body, and byte cap while streaming; then uses Pi's exported image resize helper to enforce inline image limits. Tool content contains a short text note plus the resized image block (or decode/resize omission note), with URL/mime/bytes/contentLength/dimensions/originalDimensions/wasResized metadata in `details`.

## Formatting (`format.ts`)
Provider-agnostic: `formatSearchOutput(results: SearchResult[])` truncates non-fetched result descriptions at 300 chars; `stringify()`, `asErrorMessage()`.
