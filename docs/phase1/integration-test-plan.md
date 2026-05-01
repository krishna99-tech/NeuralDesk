# Phase 1 Integration Test Plan

## A. MCP Server Manager

1. Add at least one MCP server in settings.
2. Restart app.
3. Verify server appears as running/connected in MCP panel.
4. Kill server process externally.
5. Verify reconnect behavior (status transitions visible).

Expected:
- No renderer crash.
- Status eventually returns to running or clear error state.

## B. Tool Call Persistence

1. Enable MCP tool and run a request that triggers MCP.
2. Open right panel -> Tools.
3. Verify entries appear with server name, status, latency, and output summary.
4. Close and relaunch app.
5. Verify entries still load from SQLite.

Expected:
- Entries persist across sessions.
- Sort order is newest first.

## C. Export Logs

1. Click `Export JSON` in Tools tab.
2. Save file.
3. Open JSON and validate shape:
   - id, sessionId, serverName, toolName, input, output, ok, latencyMs, createdAt

Expected:
- Export succeeds and file contains non-empty array after MCP calls.

## D. Chat + Tool Viz Sync

1. Send several chats: one plain, one MCP-enabled.
2. Observe tools panel refresh after each response.

Expected:
- Plain chat does not create fake tool rows.
- MCP chat creates rows with accurate status.

## E. Regression Checks

1. Verify settings save/load still works.
2. Verify chat history still saves.
3. Verify MCP config open/edit still works.

Expected:
- No regressions in existing behavior.
