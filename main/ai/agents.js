const callAI = require("./router");
const MODELS = require("./models");
const { Agent, run, tool } = require("@openai/agents");
const { z } = require("zod");
const mcpRegistry = require("../mcp/registry");

/**
 * Dynamically converts MCP tools into OpenAI-compatible tools
 */
function getMcpAgentTools() {
  const mcpTools = mcpRegistry.getAllTools();
  return mcpTools.map(t => {
    return {
      name: `mcp_${t.serverName}_${t.name}`,
      description: `[From ${t.serverName}] ${t.description || "Execute an MCP tool"}`,
      parameters: t.inputSchema || { type: "object", properties: {} },
      execute: async (args) => {
        console.log(`[Agent] Calling MCP tool: ${t.name} on ${t.serverName}`);
        const result = await mcpRegistry.callTool(t.serverName, t.name, args);
        return JSON.stringify(result.content);
      }
    };
  });
}

const agents = {
  analyzer: {
    provider: "gemini",
    modelType: "fast",
    prompt: (i) => `Analyze the following input and provide a concise summary:\n${i}`
  },

  reasoner: {
    provider: "claude",
    modelType: "smart",
    prompt: (i) => `Explain this deeply and provide step-by-step reasoning:\n${i}`
  },

  geminiAgent: {
    provider: "gemini",
    modelType: "fast",
    prompt: (i) => `You are a helpful assistant. Answer the user's request directly in clear, concise language.
Do not describe your internal reasoning process, channels, or methodology.
Avoid section-heavy or overly verbose formatting unless the user asks for it.

User request:
${i}`
  },

  local: {
    provider: "ollama",
    modelType: "fast",
    name: "Local Agent",
    instructions: "You are a local LLM running via Ollama. You provide fast, offline assistance."
  },

  deepseekAgent: {
    provider: "deepseek",
    modelType: "fast",
    name: "DeepSeek Agent",
    instructions: "You are a helpful assistant powered by DeepSeek AI."
  },

  historyTutor: {
    provider: "openai",
    modelType: "smart",
    sdkAgent: true,
    name: "History tutor",
    instructions: "You answer history questions clearly and concisely. Use history_fun_fact when it helps.",
    tools: [
      tool({
        name: "history_fun_fact",
        description: "Return a short history fact.",
        parameters: z.object({}),
        async execute() {
          return "Sharks are older than trees.";
        },
      })
    ]
  },

  mathTutor: {
    provider: "openai",
    modelType: "smart",
    sdkAgent: true,
    name: "Math tutor",
    instructions: "Explain math step by step and include worked examples."
  },

  triage: {
    provider: "openai",
    modelType: "smart",
    sdkAgent: true,
    name: "Homework triage",
    instructions: "Route each homework question to the right specialist.",
    handoffs: ["historyTutor", "mathTutor"]
  },

  master: {
    provider: "openai",
    modelType: "smart",
    sdkAgent: true,
    name: "Master Orchestrator",
    instructions: `You are the central intelligence of NeuralDesk. 
Your goal is to satisfy the user request by:
1. Planning the necessary steps.
2. Using tools to acquire information or perform actions.
3. Handing off to specialist agents when their expertise is needed.

PRESENTATION RULES:
- If you receive data (like from MongoDB), ALWAYS format it as a beautiful Markdown Table.
- For visualizations and UI, use the Artifact system:
  - Use \`\`\`artifact:chart\`\`\` for data graphs.
  - Use \`\`\`artifact:html\`\`\` for complex UI components or interactive layouts.
  - Use \`\`\`artifact:svg\`\`\` for custom diagrams or graphics.
  - Use \`\`\`artifact:code\`\`\` for scripts or code snippets.
- ALWAYS give each artifact a descriptive title: \`\`\`artifact:type title="Your Title"\`\`\`
- NEVER dump raw JSON to the user. Always summarize and format it.

Specialists:
- historyTutor: Deep knowledge of history and ancient civilizations.
- mathTutor: Mathematical problem solving and explanations.
- analyzer: General data analysis and summarization.

Always strive for the most accurate and helpful response.`,
    handoffs: ["historyTutor", "mathTutor", "analyzer"],
    tools: [
      tool({
        name: "search_local_files",
        description: "Searches for a specific file or lists files in the current workspace to understand the project structure.",
        parameters: z.object({
          directory: z.string().optional().describe("Directory to search in (default is current workspace)")
        }),
        async execute({ directory }) {
          const fs = require("fs");
          const path = require("path");
          const target = directory || process.cwd();
          try {
            const files = fs.readdirSync(target);
            return `Files in ${target}:\n${files.join("\n")}`;
          } catch (e) {
            return `Error accessing directory: ${e.message}`;
          }
        }
      })
    ]
  }
};

function getModel(provider, type) {
  return MODELS[provider][type];
}

async function runAgent(name, input, overrideType) {
  const agentName = name || "analyzer";
  const a = agents[agentName] || agents.analyzer;
  
  if (!a) throw new Error(`Agent configuration missing for: ${agentName}`);

  const execute = async (agentConfig, modelType) => {
    const db = require("../db/sqlite");
    const row = db.prepare("SELECT data FROM settings WHERE id = 1").get();
    const settings = row ? JSON.parse(row.data) : {};
    
    // Determine provider: Agent config > Settings Default > OpenAI (fallback)
    let provider = agentConfig.provider;
    if ((!provider || provider === "smart") && settings.ai?.defaultProvider) {
      provider = settings.ai.defaultProvider;
    }
    if (!provider) provider = "openai";

    const model = getModel(provider, modelType || agentConfig.modelType);

    // SDK-BASED AGENT EXECUTION (OpenAI specific)
    if (agentConfig.sdkAgent && provider === "openai") {
      const apiKey = settings.apiKeys?.openai;
      const baseUrl = settings.endpoints?.openaiCompatibleBaseUrl;

      if (!apiKey) throw new Error("OpenAI API Key is missing.");
      process.env.OPENAI_API_KEY = apiKey;
      if (baseUrl) process.env.OPENAI_BASE_URL = baseUrl;

      const { run, Agent } = require("@openai/agents");

      const handoffs = Array.isArray(agentConfig.handoffs) 
        ? agentConfig.handoffs.map(h => {
            const target = agents[h];
            const targetProvider = target.provider || provider;
            return new Agent({
              name: target.name || h,
              instructions: target.instructions,
              model: getModel(targetProvider, target.modelType)
            });
          })
        : [];

      const mcpTools = getMcpAgentTools();

      const sdkAgent = new Agent({
        name: agentConfig.name || agentName,
        instructions: agentConfig.instructions || settings.systemPrompt,
        model: model,
        tools: [...(agentConfig.tools || []), ...mcpTools],
        handoffs: handoffs
      });

      const result = await run(sdkAgent, input);
      return { 
        text: result.finalOutput,
        lastAgent: result.lastAgent?.name,
        model: model
      };
    }
    
    // UNIVERSAL TOOL LOOP (For non-SDK providers like Gemini, Claude, etc.)
    const mcpTools = getMcpAgentTools();
    let currentInput = typeof agentConfig.prompt === "function" ? agentConfig.prompt(input) : (agentConfig.instructions ? agentConfig.instructions + "\n\n" : "") + input;
    let iterations = 0;
    const maxIterations = 5;

    while (iterations < maxIterations) {
      const response = await callAI({
        provider,
        model,
        prompt: currentInput,
        tools: mcpTools
      });

      if (response.toolCalls && response.toolCalls.length > 0) {
        console.log(`[Agent] ${provider} requested ${response.toolCalls.length} tool calls...`);
        let toolResults = [];
        
        for (const call of response.toolCalls) {
          const toolName = call.function.name;
          const toolArgs = JSON.parse(call.function.arguments || "{}");
          const targetTool = mcpTools.find(t => t.name === toolName);
          
          if (targetTool) {
            try {
              const result = await targetTool.execute(toolArgs);
              toolResults.push(`Tool ${toolName} output: ${result}`);
            } catch (err) {
              toolResults.push(`Tool ${toolName} failed: ${err.message}`);
            }
          } else {
            toolResults.push(`Tool ${toolName} not found.`);
          }
        }
        
        // Append results to prompt for next iteration
        currentInput += `\n\nTool Results:\n${toolResults.join("\n")}\n\nPlease proceed based on this data.`;
        iterations++;
      } else {
        return {
          text: response.text,
          model
        };
      }
    }

    return {
      text: "Error: Maximum tool execution iterations reached without a final answer.",
      model
    };
  };

  try {
    return await execute(a, overrideType);
  } catch (err) {
    const msg = String(err.message || "");
    const isQuotaError = msg.includes("429") || msg.toLowerCase().includes("quota");
    
    if (isQuotaError && a.provider === "openai") {
      console.warn("OpenAI Quota exceeded. Attempting automatic fallback to Gemini...");
      const fallbackAgent = agents.geminiAgent;
      try {
        const result = await execute(fallbackAgent, overrideType);
        return {
          ...result,
          text: `[Fallback from OpenAI due to Quota] ${result.text}`,
          model: result.model
        };
      } catch (fallbackErr) {
        console.error("Fallback also failed:", fallbackErr);
        throw err; // Throw original error if fallback fails too
      }
    }
    throw err;
  }
}

// SMART AUTO ORCHESTRATION
async function autoAgent(input, preferredType = "fast") {
  const query = input.toLowerCase();
  const type = (preferredType === "smart" || preferredType === "fast") ? preferredType : "fast";
  
  // Hardcoded routing rules
  if (query.includes("homework") || query.includes("triage")) {
    return runAgent("triage", input, type);
  }

  if (query.includes("history") || query.includes("ancient") || query.includes("empire")) {
    return runAgent("historyTutor", input, type);
  }
  
  if (query.includes("math") || query.includes("calculate") || query.includes("solve")) {
    return runAgent("mathTutor", input, type);
  }

  if (query.includes("code") || query.includes("python") || query.includes("script")) {
    return runAgent("analyzer", input, type);
  }
  
  if (query.includes("analyze") || query.includes("data") || query.includes("viz")) {
    return runAgent("geminiAgent", input, type);
  }

  if (query.length > 300 || query.includes("plan") || query.includes("orchestrate") || query.includes("complex")) {
    return runAgent("master", input, "smart");
  }

  return runAgent("analyzer", input, type);
}

module.exports = { runAgent, autoAgent, agents };
