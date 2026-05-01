# Phase 2 - Secure Vault + OAuth + Credential Assignment

## Delivered in this phase

1. Secure local secret vault service
- File: `src/main/security/vault.js`
- Uses Electron `safeStorage` encryption when available.
- Fallback AES-256-CBC encryption for environments without safeStorage.
- Supports set/get/delete/list metadata APIs.

2. OAuth launcher (embedded browser)
- IPC endpoint: `oauth-launch`
- Opens modal BrowserWindow, tracks redirect URI, captures `code`/`error`.
- Renderer helper: `window.launchOAuth(provider)`.

3. MCP per-server credential assignment
- MCP config now supports `credentialRef`.
- UI adds "Credential Reference" field in MCP settings form.
- Runtime injects resolved secret into tool/server env as `MCP_CREDENTIAL`.

4. Secure IPC bridges
- `vaultSetSecret`, `vaultGetSecret`, `vaultDeleteSecret`, `vaultListMeta`
- `launchOAuth`

5. Renderer integration
- External services pane has OAuth connector buttons.
- Settings save now mirrors entered key/token values into vault.

## Notes
- Existing app behavior is preserved (no migration break).
- This phase provides secure secret infrastructure and runtime wiring; deeper provider-specific OAuth token exchange/refresh can be implemented in Phase 3.
