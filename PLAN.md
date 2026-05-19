# Plan

## High-level
- Package is `@xl0/pi-web-tools` (multi-provider web tools).
- Keep `web_search` and `web_fetch` tool names; dispatch to configured provider at runtime.
- Search and fetch providers configurable independently.
- Persist config in `xl0-web-tools.json` (`~/.pi/agent/` + project `.pi/`, project overrides global).
- Register `/web-tools` for interactive provider/API-key config.
- Providers use plain `fetch()`; zero runtime deps beyond Pi peer deps.
- API key resolution: `webApiKeys.<providerId>` → provider env var → error.
- No defaults/no backwards compat: missing config errors with guidance.

## Architecture
```
extensions/web-tools/
  index.ts              - registers tools + command, reads config, dispatches
  format.ts             - formatSearchOutput, stringify, asErrorMessage
  providers/
    types.ts            - Provider/WebToolsConfig interfaces
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
  readonly hasFetch?: boolean // default true; false for search-only providers
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
- Brave is search-only; fetch menu excludes it and `web_fetch` errors if Brave is the only resolved fetch provider.
- Source mapping is provider-specific: Firecrawl uses `sources`; Exa/Tavily map `news` to their news category/topic and treat `images` as unsupported/no-op; Brave uses separate web/news/images endpoints.
- Each provider normalizes API responses into `SearchResult[]` and exposes raw API response in `details`.
- `format.ts` remains provider-agnostic.

## Test plan
- Keep LLM-judged integration tests as smoke coverage over live providers.
- Prefer adding cheap direct tests for deterministic logic if this grows: formatting, config/provider resolution, Brave fetch rejection, env loading.

## Done
- [x] Package renamed, zero runtime deps, old extension removed, checks pass.
- [x] `searchImpl`/`fetchImpl` extracted for testing.
- [x] Firecrawl, Exa, Tavily, Brave providers implemented.
- [x] `/web-tools` provider-driven config command implemented.
- [x] Integration tests: 10 cases pass (3 firecrawl + 3 exa + 3 tavily + 1 brave).
- [x] Test harness loads `test/.env`, avoids config races, removes temp config in `finally`, parses exact final verdicts, and reference updates exit non-zero on failures.
