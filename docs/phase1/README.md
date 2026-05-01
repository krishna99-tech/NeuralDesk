# Phase 1 - Scaffold + MCP Manager + Basic Chat + Tool Call Visualization

## 1) Folder and File Structure

```text
src/
  main/
    mcp/
      services/
        connectionManager.js         # lifecycle + health monitor scaffold
    ipc/
      handlers.js                    # IPC endpoints + tool call persistence/export
    db/
      sqlite.js                      # tool_calls table
    preload.js                       # secure renderer API bridge for tool logs
  renderer/
    index.js                         # loads tool calls panel + export handler
    chat.js                          # refreshes tool log view after requests
  shared/
    schemas/
      mcpServer.schema.ts            # TypeScript schema for MCP server configs
index.html                           # right panel "Tools" tab
docs/
  phase1/
    integration-test-plan.md
```

## 2) Core Implementation Included

- Added persistent `tool_calls` table to SQLite.
- Added IPC APIs:
  - `get-tool-calls(limit)`
  - `export-tool-calls()`
- Added secure preload bridge for these APIs.
- Added right-panel `Tools` tab showing recent tool calls with:
  - tool/server
  - latency
  - success/error badge
  - output summary
  - timestamp
- Export tool call logs to JSON with save dialog.
- Added MCP connection manager scaffold (`McpConnectionManager`) with health-monitor loop.

## 3) MCP Server Configuration Schema

See: `src/shared/schemas/mcpServer.schema.ts`

- Supports `stdio`, `sse`, `http` transports.
- Includes command/args/env/timeouts and chat override fields.
- Includes typed config for `mcpServers` map.

## 4) UI Components in Phase 1

- Existing 3-panel UI preserved.
- Added `Tools` tab in right panel.
- Added export action (`Export JSON`).
- Existing chat remains center panel.

## 5) Phase 1 Integration Notes

- Current app remains JS-based to avoid destabilizing runtime.
- TypeScript schema is introduced as forward-compatible contract for Phase 2 migration.
- Health monitor service is scaffolded and ready to be wired deeper into MCP boot lifecycle.
