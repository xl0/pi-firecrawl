# Plan

## High-level
- Rename package: `@xl0/pi-firecrawl` → `@xl0/pi-web-tools` (multi-provider web tools).
- Keep `web_search` and `web_fetch` tool names — dispatch to configured provider at runtime.
- Search and fetch providers configurable independently.
- Persist config in `xl0-web-tools.json` (~/.pi/agent/ + .pi/ merge, project overrides global).
- Register a `/web-provider` command for interactive provider selection and API key config.
- Both providers use plain `fetch()` — zero runtime dependencies beyond Pi peer deps.
- Tool labels/descriptions/progress messages made provider-agnostic (no "Firecrawl" branding).
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
  fetch(url: string, opts: {onlyMainContent?: boolean; waitFor?: number; timeout?: number}, signal?: AbortSignal): Promise<{markdown: string; metadata?: unknown; raw: unknown}>
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
- No defaults — if not configured, tool errors with pointer to `/web-provider`.
- API key resolution: `webApiKeys.<providerId>` → `process.env[PROVIDER_ENV_KEY]` → error.
- Config files: `~/.pi/agent/xl0-web-tools.json` (global) and `.pi/xl0-web-tools.json` (project). Project merges over global.
- `/web-provider` command writes to user-chosen scope (global or project).

## Command: `/web-provider`
Sequential dialogs using ctx.ui.select / ctx.ui.input:
- First: select scope (global `~/.pi/agent/` or project `.pi/`)
- Show current config for that scope (search/fetch provider, which keys are set)
- Menu: "Set search provider" / "Set fetch provider" → select from available / "Set API key for <provider>" → input
- Writes to the chosen scope's `xl0-web-tools.json`

## Todo
- [ ] Rename package.json → @xl0/pi-web-tools, bump to 0.3.0; remove dotenv + @mendable/firecrawl-js deps (zero runtime deps)
- [ ] Remove extensions/firecrawl-web/
- [ ] Create extensions/web-tools/ directory
- [ ] Create providers/types.ts (Provider interface + SearchResult)
- [ ] Create format.ts (formatSearchOutput, stringify, asErrorMessage — provider-agnostic)
- [ ] Create providers/firecrawl.ts (fetch-based, env key: FIRECRAWL_API_KEY)
- [ ] Create providers/exa.ts (fetch-based, env key: EXA_API_KEY)
- [ ] Create index.ts (tools + command + config load/dispatch)
- [ ] Update README.md
- [ ] Verify with bun run check
