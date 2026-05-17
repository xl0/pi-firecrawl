# Plan

## High-level
- Keep package minimal: one Pi extension, two Firecrawl-backed tools.
- Prefer readable tool output for the model; keep full structured data in `details`.
- Use `fetch` terminology for page markdown retrieval.

## Todo
- [x] Register `search` and `fetch` tools.
- [x] Render compact call arguments in the TUI.
- [x] Format search output as numbered text.
- [x] Fetch and display first search result markdown by default.
- [x] Keep first-result fetch behavior documented in `details.piFirecrawl`.
- [x] Keep fetch metadata verbose and opt-in.
- [x] Verify with `bun run check`.
