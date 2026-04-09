# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) server for Mailchimp Marketing API v3. Exposes 100+ tools across 17 categories (account, audiences, subscribers, campaigns, campaign feedback, templates, reports, automations, customer journeys, segments, ecommerce, landing pages, webhooks, file manager, batch operations, verified domains, activity feed) that Claude can invoke to manage Mailchimp resources.

Uses stdio transport for local integrations with Claude Desktop/Cowork/Code. Requires `MAILCHIMP_API_KEY` env var (format: `<hash>-<datacenter>`, e.g. `abc123-us21`).

## Commands

```bash
npm run build     # TypeScript compile (tsc) → dist/
npm run dev       # Watch mode with tsx
npm start         # Run compiled server (node dist/index.js)
npm run clean     # Remove dist/
```

No test framework is configured. No linter is configured.

## Architecture

**Entry point**: `src/index.ts` — Creates an `McpServer` instance, registers all tool groups, connects via `StdioServerTransport`.

**Tool registration pattern**: Each tool category lives in `src/tools/<category>.ts` and exports a `register<Category>Tools(server: McpServer)` function. Tools are registered with `server.registerTool()` using:
- A tool name string (prefixed `mailchimp_`)
- A config object with `title`, `description`, `inputSchema` (Zod), and `annotations` (read-only/destructive hints)
- An async handler that calls the Mailchimp API and returns `{ content: [{ type: "text", text: ... }] }`

**API client**: `src/services/mailchimp-client.ts` — Singleton Axios instance configured from `MAILCHIMP_API_KEY`. Exports:
- `mailchimpRequest<T>(endpoint, method, data?, params?)` — Makes authenticated API calls
- `handleApiError(error)` — Formats Axios/Mailchimp errors into user-friendly messages; used in every tool's catch block

**Shared schemas**: `src/schemas/common.ts` — `PaginationSchema` (Zod) and `paginationMeta()` helper, reused by list-type tools.

**Constants**: `src/constants.ts` — `CHARACTER_LIMIT` (25000), `DEFAULT_PAGE_SIZE` (20), `MAX_PAGE_SIZE` (100), `REQUEST_TIMEOUT` (30000ms).

## Adding a New Tool

1. Create or edit `src/tools/<category>.ts`
2. Define Zod input schema, register with `server.registerTool()`
3. Use `mailchimpRequest()` + `handleApiError()` pattern from existing tools
4. Import and call `register<Category>Tools(server)` in `src/index.ts`
5. Set appropriate `annotations` (readOnlyHint, destructiveHint, etc.)

## Key Conventions

- ESM modules (`"type": "module"` in package.json); all local imports use `.js` extension
- All tool handlers return markdown-formatted text responses
- Tool responses are capped at `CHARACTER_LIMIT` (25000 chars) to avoid overwhelming LLM context
- API errors are caught per-tool and returned as text content (not thrown), so the MCP connection stays alive
- TypeScript strict mode with `ES2022` target and `Node16` module resolution
