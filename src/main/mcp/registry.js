"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activeClients = void 0;
exports.getAllTools = getAllTools;
exports.callTool = callTool;
/**
 * Shared registry for active MCP clients
 */
exports.activeClients = new Map();
/**
 * Get all tools across all connected MCP servers
 */
function getAllTools() {
    const allTools = [];
    for (const [serverName, client] of exports.activeClients.entries()) {
        const tools = client.tools.map((tool) => ({
            ...tool,
            serverName
        }));
        allTools.push(...tools);
    }
    return allTools;
}
/**
 * Call a tool on a specific server
 */
async function callTool(serverName, toolName, args) {
    const client = exports.activeClients.get(serverName);
    if (!client)
        throw new Error(`MCP Server ${serverName} not found or not connected.`);
    return await client.callTool(toolName, args);
}
