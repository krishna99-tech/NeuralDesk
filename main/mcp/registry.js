/**
 * Shared registry for active MCP clients
 */
const activeClients = new Map();

module.exports = {
  activeClients,
  
  /**
   * Get all tools across all connected MCP servers
   */
  getAllTools: () => {
    const allTools = [];
    for (const [serverName, client] of activeClients.entries()) {
      const tools = client.tools.map(tool => ({
        ...tool,
        serverName
      }));
      allTools.push(...tools);
    }
    return allTools;
  },

  /**
   * Call a tool on a specific server
   */
  callTool: async (serverName, toolName, args) => {
    const client = activeClients.get(serverName);
    if (!client) throw new Error(`MCP Server ${serverName} not found or not connected.`);
    return await client.callTool(toolName, args);
  }
};
