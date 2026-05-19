# Plan

## High-level
- Rename package: `@xl0/pi-firecrawl` → `@xl0/pi-web-tools` (multi-provider web tools).
- Keep `web_search` and `web_fetch` tool names — dispatch to configured provider at runtime.
- Search and fetch providers configurable independently.
- Persist config in `xl0-web-tools.json` (~/.pi/agent/ + .pi/ merge, project overrides global).
- Register a `/web-tools` command for interactive provider selection and API key config.
- Both providers use plain `fetch()` — zero runtime dependencies beyond Pi peer deps.
- Tool labels/descriptions/progress messages made provider-agnostic (no "Firecrawl" branding).
- Keep provider-specific fetch behavior minimal: Firecrawl honors `waitFor`; Exa ignores it and `web_fetch` warns.
- Remove `dotenv` dependency — API keys from config or `process.env` only.
- No backwards compat: both providers must be explicitly configured, or tools error with guidance.

## Architecture
```
extensions/web-tools/
  index.ts              - registers tools + command, reads config, dispatches
  providers/
    types.ts            - Provider interface
    firecrawl.ts        - Firecrawl search (POST /v1/search) + fetch (POST /v1/scrape)
    exa.ts              - Exa search (POST /search) + fetch (POST /contents)
  format.ts             - formatSearchOutput (works on SearchResult[]), stringify, asErrorMessage (provider-agnostic)
```

## Shared types
```ts
interface SearchResult {
  title: string
  url: string
  description?: string
  markdown?: string // populated for first result when fetchResult=true
}
```

## Provider interface
```ts
interface Provider {
  readonly id: string
  readonly label: string
  readonly envApiKey: string
  search(query: string, opts: {limit: number; source?: string; timeout?: number}, signal?: AbortSignal): Promise<{results: SearchResult[]; raw: unknown}>
  fetch(url: string, opts: {waitFor?: number; timeout?: number}, signal?: AbortSignal): Promise<{markdown: string; metadata?: unknown; raw: unknown}>
}
```
- Each provider normalizes its API response into `SearchResult[]`. `raw` is the untouched API response for `details`.
- `format.ts` works on `SearchResult[]` only — provider-agnostic.

## Config shape (in xl0-web-tools.json)
```json
{
  "webSearch": { "provider": "exa" },
  "webFetch":  { "provider": "firecrawl" },
  "webApiKeys": {
    "firecrawl": "fc-...",
    "exa": "..."
  }
}
```
- Source param (`web`/`news`/`images`) mapping per provider: Firecrawl uses sources array; Exa maps `web`→no filter, `news`→category:"news", `images`→no filter (unsupported).
- No defaults — if not configured, tool errors with pointer to `/web-tools`.
- API key resolution: `webApiKeys.<providerId>` → `process.env[PROVIDER_ENV_KEY]` → error.
- Config files: `~/.pi/agent/xl0-web-tools.json` (global) and `.pi/xl0-web-tools.json` (project). Project merges over global.
- `/web-tools` command writes to user-chosen scope (global or project).

## Command: `/web-tools`
Sequential dialogs using ctx.ui.select / ctx.ui.input:
- First: select scope (global `~/.pi/agent/` or project `.pi/`)
- Show current config for that scope (search/fetch provider, which keys are set)
- Menu: "Set search provider" / "Set fetch provider" → select from available / "Set API key for <provider>" → input
- Writes to the chosen scope's `xl0-web-tools.json`

## New providers: Tavily + Brave Search

### Tavily (`providers/tavily.ts`)
- **Base**: `https://api.tavily.com`
- **Search**: POST `/search` — body: `{query, max_results, search_depth:"basic", topic:?<general|news>, time_range?:<day|week|month|year>, include_raw_content?:boolean, include_answer?:boolean}`
  - Auth: `Authorization: Bearer <key>`
  - Source mapping: `web`→no topic filter, `news`→topic:"news", `images`→unsupported (same as Exa approach)
  - Response: `{query, answer?, results:[{title, url, content, score, raw_content?}], images, response_time}`
  - `fetchResult=true` case: Tavily search can return `raw_content` inline when `include_raw_content:true`. For simplicity, default `include_raw_content` to `true` when `fetchResult` would be used (so single request). If `fetchResult=false`, don't request raw_content.
  - `description` = `content` field (semantic snippet)
- **Fetch**: POST `/extract` — body: `{urls:<url>, extract_depth:"basic", format:"markdown"}`
  - Returns: `{results:[{url, raw_content, images, favicon}], failed_results[], response_time}`
  - `markdown` = result.raw_content; metadata = `{images, favicon}`
  - `waitFor` ignored (no JS rendering), `web_fetch` warns if supplied
- Auth header: `Authorization: Bearer <key>`
- Env key: `TAVILY_API_KEY`

### Brave Search (`providers/brave.ts`)
- **Base**: `https://api.search.brave.com/res/v1`
- **Search-only provider** (no fetch). `webFetch` fallback will not resolve to Brave — if configured as only provider, `web_fetch` errors.
- **Search**: GET `/web/search` with query params: `q, count, freshness?`, and optionally `/news/search` for news source. Can also use `/images/search` for images.
  - Auth: `X-Subscription-Token` header
  - Source mapping: `web`→GET `/web/search`, `news`→GET `/news/search`, `images`→GET `/images/search`
  - Web response: `{web:{results:[{title, url, description, extra_snippets?}]}}`
  - News response: `{results:[{title, url, description}]}`
  - `description` = `description` field (query-dependent snippet, may contain `<strong>` tags — strip them)
- **No fetch**: if Brave is the only configured provider and `web_fetch` is called, it errors with a clear message about needing a fetch-capable provider.
- Env key: `BRAVE_API_KEY`

### `index.ts` changes
- `providers` map gains `tavily` and `brave` entries
- `providerNames` array updated
- `resolveProviderId` for fetch: if resolved provider has no `fetch` (Brave), error with guidance
- `/web-tools` command: menu items for Tavily/Brave API keys added dynamically from provider list (not hardcoded "Firecrawl" / "Exa")

### Provider interface changes
- Add optional `hasFetch` boolean (default `true`). Brave sets it `false`.
- `index.ts` uses it to reject fetch-only selection and to skip fetch providers from fetch menu.

## Done
- [x] Package renamed, zero runtime deps, old extension removed, all files created, checks pass.
- [x] Plan for Tavily + Brave Search providers
- [x] Restructured `index.ts`: extracted `searchImpl`/`fetchImpl` standalone functions (exported for testing)
- [x] Test infrastructure: LLM-judged integration tests with parallel runner, reference snapshots, update script
- [x] 6 tests pass: firecrawl-search, firecrawl-search-fetch, firecrawl-fetch, exa-search, exa-search-fetch, exa-fetch

## Remaining
- [ ] Add `hasFetch` to Provider type
- [ ] Create `tavily.ts` provider (search + fetch)
- [ ] Create `brave.ts` provider (search-only)
- [ ] Update `index.ts`: register both, update `/web-tools` to be provider-driven
- [ ] Run `bun run check`
