# Phase 2 Integration Test Plan

## A. Vault Basics

1. Save any API key in settings and click Save.
2. Call `vault-list-meta` (through app flow) and verify entries exist.
3. Restart app and verify vault metadata still present.

Expected:
- Secrets are persisted encrypted on disk.
- No plaintext keys in `settings` required for retrieval by vault APIs.

## B. OAuth Flow

1. Go to Settings -> External Services.
2. Click Connect Google/GitHub/Slack.
3. Provide valid OAuth URL + redirect URI.
4. Complete provider consent.

Expected:
- OAuth popup closes when redirect URI is reached.
- Captured `code` is stored in vault under `oauth.<provider>.code`.

## C. MCP Credential Assignment

1. Add MCP server with Credential Reference = `my_test_token`.
2. Save secret `my_test_token` in vault.
3. Run MCP-enabled request.

Expected:
- MCP server process receives `MCP_CREDENTIAL` env var.
- Requests execute without embedding secrets in config JSON.

## D. Regression

1. Existing chat, history, settings, tool logs remain functional.
2. MCP server add/delete/status remains functional.

Expected:
- No regressions introduced by phase 2 changes.
