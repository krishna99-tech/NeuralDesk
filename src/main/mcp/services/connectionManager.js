/**
 * Phase 1 MCP Connection Manager service skeleton.
 * This keeps connection lifecycle isolated from IPC handlers and can be expanded
 * to support SSE/HTTP transports in later phases.
 */
class McpConnectionManager {
  constructor({ startServer, stopServer, getStatuses }) {
    this.startServer = startServer;
    this.stopServer = stopServer;
    this.getStatuses = getStatuses;
    this._interval = null;
  }

  startHealthMonitor(configProvider, intervalMs = 15000) {
    this.stopHealthMonitor();
    this._interval = setInterval(() => {
      try {
        const config = configProvider();
        const servers = config?.mcpServers || {};
        const statuses = this.getStatuses();
        for (const [name, server] of Object.entries(servers)) {
          const state = statuses?.[name]?.status || 'off';
          if (server && state !== 'running' && state !== 'starting') {
            this.startServer(name, server);
          }
        }
      } catch (err) {
        // keep monitor resilient; errors are logged by caller
      }
    }, intervalMs);
  }

  stopHealthMonitor() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

module.exports = { McpConnectionManager };
