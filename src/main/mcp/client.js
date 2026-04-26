"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
/**
 * NeuralDesk MCP Client Wrapper
 * Provides a standardized way to connect to and interact with MCP servers.
 */
class McpClientWrapper {
    name;
    command;
    args;
    env;
    client = null;
    transport = null;
    tools = [];
    constructor(name, command, args, env) {
        this.name = name;
        this.command = command;
        this.args = args;
        this.env = env;
    }
    async connect() {
        try {
            this.transport = new stdio_js_1.StdioClientTransport({
                command: this.command,
                args: this.args,
                env: { ...process.env, ...this.env }
            });
            this.client = new index_js_1.Client({
                name: "NeuralDesk-Client",
                version: "1.0.0"
            }, {
                capabilities: {}
            });
            await this.client.connect(this.transport);
            const response = await this.client.listTools();
            this.tools = response.tools || [];
            console.log(`[MCP] Connected to ${this.name}, found ${this.tools.length} tools.`);
            return true;
        }
        catch (err) {
            console.error(`[MCP] Failed to connect to ${this.name}:`, err.message);
            return false;
        }
    }
    async callTool(toolName, toolArgs) {
        if (!this.client)
            throw new Error(`MCP Client ${this.name} not connected.`);
        return await this.client.callTool({
            name: toolName,
            arguments: toolArgs
        });
    }
    async disconnect() {
        if (this.transport) {
            await this.transport.close();
        }
        this.client = null;
        this.transport = null;
    }
}
exports.default = McpClientWrapper;
