# Code

## Purpose
Minimal Pi extension package providing Firecrawl-backed `search` and `scrape` tools.

## Structure
- `package.json`: published package metadata for `@xl0/pi-firecrawl`, Pi extension entry, release/check scripts, Firecrawl/runtime peer dependencies.
- `extensions/firecrawl-web-search/index.ts`: registers `search` and `scrape` tools via Pi extension API; loads `FIRECRAWL_API_KEY` from env or `~/.pi/agent/.env`; wraps Firecrawl search and scrape APIs; renders compact tool-call args in the TUI.
- `README.md`: install and config docs for the package.

## Behavior
- `search`: query web/news/images via Firecrawl, optional result scraping to markdown; success output omits Firecrawl's redundant `success` flag.
- `scrape`: fetch one URL via Firecrawl, return markdown, optional metadata.
- Both tools surface progress updates and return structured error text/details on failure.
