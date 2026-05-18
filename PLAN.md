# Plan

## High-level
- Keep package minimal: one Pi extension, two Firecrawl-backed tools.
- Prefer readable tool output for the model; keep full structured data in `details`.
- Use `fetch` terminology for page markdown retrieval.

## Todo
- [x] Register `web_search` and `web_fetch` tools.
- [x] Render compact call arguments in the TUI.
- [x] Format search output as numbered text.
- [x] Fetch and display first search result markdown by default.
- [x] Keep first-result fetch behavior documented in `details.piFirecrawl`.
- [x] Keep fetch metadata verbose and opt-in.
- [x] Rename tools to `web_search` and `web_fetch`.
- [x] Bump package version to `0.2.0`.
- [x] Verify with `bun run check`.
