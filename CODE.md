# Code

## Purpose
Minimal Pi extension package providing Firecrawl-backed web access for Pi.

## Package
- Published package name: `@xl0/pi-firecrawl`.
- Pi entry: `extensions/` via `package.json#pi.extensions`.
- Runtime dependencies: Firecrawl SDK and dotenv. Pi APIs are peer dependencies.

## Extension
`extensions/firecrawl-web-search/index.ts` registers two tools:

- `search`: web/news/images search via Firecrawl.
- `fetch`: fetch one URL as cleaned markdown via Firecrawl's page scrape API.

The extension loads `FIRECRAWL_API_KEY` from `process.env` or `~/.pi/agent/.env`.

## Tool behavior
- `search` returns compact numbered text for the model and structured result data in `details`.
- `search.fetchResult` defaults to `true`; when enabled, the tool fetches only the first search result and displays its markdown. Other results remain title/url/description only.
- When first-result markdown is displayed, that result's description is omitted as redundant.
- `search` adds `details.piFirecrawl` documenting first-result fetch defaults and behavior.
- `fetch` returns page markdown; verbose metadata is opt-in via `includeMetadata` and always remains available in `details`.
- Both tools render compact call arguments in the TUI and surface progress updates/errors.
