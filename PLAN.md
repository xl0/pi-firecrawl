# Plan

## High-level
- Package is `@xl0/pi-web-tools` (multi-provider web tools).
- Keep `web_search` and `web_fetch` tool names; dispatch to configured provider at runtime.
- Add standalone `web_image` for URL → LLM image content; no provider/API key needed.
- Search and fetch providers configurable independently.
- Persist config in `xl0-web-tools.json` (`~/.pi/agent/` + project `.pi/`, project overrides global).
- Register `/web-tools` for interactive provider/API-key config.
- Providers use plain `fetch()`; zero runtime deps beyond Pi peer deps.
- API key resolution: `webApiKeys.<providerId>` → provider env var → error.
- No defaults/no backwards compat: missing config errors with guidance.

## Architecture
```
extensions/web-tools/
  index.ts              - registers tools + command, reads config, dispatches, downloads image URLs for `web_image`
  format.ts             - formatSearchOutput, stringify, asErrorMessage
  providers/
    types.ts            - Provider/WebToolsConfig interfaces
    http.ts             - shared JSON request helper
    firecrawl.ts        - Firecrawl search + fetch
    exa.ts              - Exa search + fetch
    tavily.ts           - Tavily search + fetch
    brave.ts            - Brave search-only provider
```

## Shared types
```ts
interface SearchResult {
  title: string
  url: string
  description?: string
  markdown?: string // populated for first result when fetchResult=true and fetch succeeds
}

interface Provider {
  readonly id: string
  readonly label: string
  readonly envApiKey: string
  search(apiKey: string, query: string, opts: {limit: number; source?: string; timeout?: number}, signal?: AbortSignal): Promise<{results: SearchResult[]; raw: unknown}>
  fetch?(apiKey: string, url: string, opts: {waitFor?: number; timeout?: number}, signal?: AbortSignal): Promise<{markdown: string; metadata?: unknown; raw: unknown}>
}
```

## Config shape
```json
{
  "webSearch": { "provider": "exa" },
  "webFetch":  { "provider": "firecrawl" },
  "webApiKeys": {
    "firecrawl": "fc-...",
    "exa": "...",
    "tavily": "...",
    "brave": "..."
  }
}
```

## Provider decisions
- Firecrawl honors `waitFor`; Exa and Tavily ignore it and `web_fetch` warns.
- Fetch capability is determined by whether a provider implements `fetch`; Brave is search-only and `web_fetch` errors if Brave is the only resolved fetch provider.
- Source mapping is provider-specific: Firecrawl uses `sources`; Exa/Tavily map `news` to their news category/topic and treat `images` as unsupported/no-op; Brave uses separate web/news/images endpoints.
- Each provider normalizes API responses into `SearchResult[]` and exposes raw API response in `details`.
- `format.ts` remains provider-agnostic.
- `web_image` is intentionally URL-only. Provider image discovery can expose URLs later; `web_image` decides which URL becomes actual image context.

## Test plan
- Keep LLM-judged integration tests as smoke coverage over live providers.
- Prefer adding cheap direct tests for deterministic logic if this grows: formatting, config/provider resolution, Brave fetch rejection, env loading, image MIME/size validation.

## Done
- [x] Package renamed, zero runtime deps, old extension removed, checks pass.
- [x] `searchImpl`/`fetchImpl` extracted for testing.
- [x] Firecrawl, Exa, Tavily, Brave providers implemented.
- [x] `/web-tools` provider-driven config command implemented.
- [x] Integration tests: 10 cases pass (3 firecrawl + 3 exa + 3 tavily + 1 brave).
- [x] Test harness loads `test/.env`, avoids config races, runs Pi with `--no-session`, removes temp config in `finally`, parses exact final verdicts, and reference updates exit non-zero on failures.
- [x] Provider HTTP timeout/error handling deduplicated in `providers/http.ts`; README provider list updated.
- [x] `web_image` implemented as URL-only image downloader with MIME/size validation and image content output.
