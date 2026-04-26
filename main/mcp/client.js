const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

/**
 * NeuralDesk MCP Client Wrapper
 * Provides a standardized way to connect to and interact with MCP servers.
 */
class McpClientWrapper {
  constructor(name, command, args, env) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.env = env;
    this.client = null;
    this.transport = null;
    this.tools = [];
  }

  async connect() {
    try {
      this.transport = new StdioClientTransport({
        command: this.command,
        args: this.args,
        env: { ...process.env, ...this.env }
      });

      this.client = new Client({
        name: "NeuralDesk-Client",
        version: "1.0.0"
      }, {
        capabilities: {
          tools: {}
        }
      });

      await this.client.connect(this.transport);
      
      // Fetch available tools immediately
      const response = await this.client.listTools();
      this.tools = response.tools || [];
      
      console.log(`[MCP] Connected to ${this.name}, found ${this.tools.length} tools.`);
      return true;
    } catch (err) {
      console.error(`[MCP] Failed to connect to ${this.name}:`, err.message);
      return false;
    }
  }

  async callTool(toolName, toolArgs) {
    if (!this.client) throw new Error(`MCP Client ${this.name} not connected.`);
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

module.exports = McpClientWrapper;
