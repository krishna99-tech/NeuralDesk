"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.agents = void 0;
exports.runAgent = runAgent;
exports.autoAgent = autoAgent;
const router_1 = __importDefault(require("./router"));
const MODELS = __importStar(require("./models"));
const agents_1 = require("@openai/agents");
const zod_1 = require("zod");
const mcpRegistry = __importStar(require("../mcp/registry"));
const fs = __importStar(require("fs"));
const axios_1 = __importDefault(require("axios"));
const sqlite_1 = __importDefault(require("../db/sqlite"));
const langchain_1 = require("../ipc/langchain");
const { logAppEvent, truncateText } = require("../logger");
/**
 * Dynamically converts MCP tools into OpenAI-compatible tools
 */
function jsonSchemaToZod(schema) {
    if (!schema)
        return zod_1.z.object({}).describe("No parameters required");
    let zType;
    switch (schema.type) {
        case "string":
            zType = zod_1.z.string();
            break;
        case "number":
        case "integer":
            zType = zod_1.z.number();
            break;
        case "boolean":
            zType = zod_1.z.boolean();
            break;
        case "object":
            const shape = {};
            const props = schema.properties || {};
            const required = schema.required || [];
            for (const key in props) {
                let propType = jsonSchemaToZod(props[key]);
                if (!required.includes(key))
                    propType = propType.optional();
                shape[key] = propType;
            }
            zType = zod_1.z.object(shape);
            break;
        case "array":
            zType = zod_1.z.array(jsonSchemaToZod(schema.items));
            break;
        default:
            zType = zod_1.z.object({});
    }
    if (schema.description)
        zType = zType.describe(schema.description);
    return zType;
}
function getMcpAgentTools() {
    const mcpTools = mcpRegistry.getAllTools();
    return mcpTools.map(t => {
        return (0, agents_1.tool)({
            name: `mcp_${t.serverName}_${t.name}`,
            description: `[From ${t.serverName}] ${t.description || "Execute an MCP tool"}`,
            parameters: jsonSchemaToZod(t.inputSchema),
            execute: async (args) => {
                logAppEvent("INFO", "Agents", "MCP_TOOL_CALL", `Calling MCP tool: ${t.name}`, { server: t.serverName, args });
                const result = await mcpRegistry.callTool(t.serverName, t.name, args);
                return JSON.stringify(result.content);
            }
        });
    });
}
exports.agents = {
    analyzer: {
        provider: "gemini",
        modelType: "fast",
        prompt: (i) => `Analyze the following input and provide a concise summary. 
If you are analyzing database structures, collections, or query results, ALWAYS format the data using artifact tables:
\`\`\`artifact:table title="Your Title"\`\`\`
For numeric trends, use:
\`\`\`artifact:chart title="Your Title"\`\`\`

User request:
${i}`
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

PRESENTATION RULES:
- If you retrieve structured data, use \`\`\`artifact:table title="..."\`\`\` with JSON rows.
- If you retrieve numeric/time-series data, use \`\`\`artifact:chart title="..."\`\`\` with JSON data.
- Keep a short summary before the artifact.

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
        instructions: "You answer history questions clearly and concisely. Use 'history_fun_fact' for trivia or 'fetch_on_this_day' to get real events from a specific date.",
        tools: [
            (0, agents_1.tool)({
                name: "history_fun_fact",
                description: "Return a short history fact.",
                parameters: zod_1.z.object({}),
                async execute() {
                    return "Sharks are older than trees.";
                },
            }),
            (0, agents_1.tool)({
                name: "fetch_on_this_day",
                description: "Fetches historical events for a specific month and day from Wikimedia.",
                parameters: zod_1.z.object({
                    month: zod_1.z.number().min(1).max(12).describe("Month (1-12)"),
                    day: zod_1.z.number().min(1).max(31).describe("Day (1-31)")
                }),
                async execute({ month, day }) {
                    try {
                        const m = String(month).padStart(2, '0');
                        const d = String(day).padStart(2, '0');
                        const url = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/${m}/${d}`;
                        const response = await axios_1.default.get(url);
                        const events = response.data.selected || [];
                        return events.slice(0, 5).map(e => `[Year ${e.year}] ${e.text}`).join("\n");
                    } catch (err) {
                        return "Error fetching live history data: " + err.message;
                    }
                }
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
            (0, agents_1.tool)({
                name: "search_local_files",
                description: "Searches for a specific file or lists files in the current workspace to understand the project structure.",
                parameters: zod_1.z.object({
                    directory: zod_1.z.string().optional().describe("Directory to search in (default is current workspace)")
                }),
                async execute({ directory }) {
                    const target = directory || process.cwd();
                    try {
                        const files = fs.readdirSync(target);
                        return `Files in ${target}:\n${files.join("\n")}`;
                    }
                    catch (e) {
                        return `Error accessing directory: ${e.message}`;
                    }
                }
            })
        ],
    },
    aipipeAgent: {
        provider: "aipipe",
        modelType: "fast", // Assuming gpt-5-nano is fast
        prompt: (i) => `You are a helpful assistant powered by AIpipe's OpenAI/GPT-5 Nano model. Answer the user's request directly in clear, concise language.

PRESENTATION RULES:
- If you retrieve structured data, use \`\`\`artifact:table title="..."\`\`\` with JSON rows.
- If data has trends or metrics, use \`\`\`artifact:chart title="..."\`\`\` with JSON data.
- Keep a short summary before artifacts.

User request:
${i}`
        
    }
};
function getModel(provider, type) {
    const modelsDict = MODELS.default || MODELS;
    const p = modelsDict[provider];
    if (!p) {
        const fallback = modelsDict.openai;
        return fallback[type] || fallback.fast || fallback.smart;
    }
    return p[type] || p.fast || p.smart;
}
const ErrorType = {
    QUOTA: "QUOTA",
    INVALID_KEY: "INVALID_KEY",
    MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
    TRANSIENT: "TRANSIENT",
    UNKNOWN: "UNKNOWN"
};
function classifyError(err) {
    const msg = String(err.message || "").toLowerCase();
    const status = err.status || err.response?.status;
    if (status === 429 || msg.includes("429") || msg.includes("quota") || msg.includes("too many requests") || msg.includes("limit exceeded")) {
        return ErrorType.QUOTA;
    }
    if (status === 401 || status === 403 || msg.includes("api key") || msg.includes("invalid api key") || msg.includes("unauthorized") || msg.includes("api_key_invalid") || msg.includes("api key expired")) {
        return ErrorType.INVALID_KEY;
    }
    if (status === 404 || msg.includes("model not found") || msg.includes("does not exist") || msg.includes("is not found")) {
        return ErrorType.MODEL_NOT_FOUND;
    }
    if (status >= 500 || msg.includes("timeout") || msg.includes("network") || msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("enotfound") || msg.includes("socket hang up")) {
        return ErrorType.TRANSIENT;
    }
    return ErrorType.UNKNOWN;
}
async function runAgent(name, input, overrideType, sender, aipipeToken, aipipeModel = "openai/gpt-5-nano", chatId) {
    const agentName = name || "analyzer";
    const a = exports.agents[agentName] || exports.agents.analyzer;
    if (!a)
        throw new Error(`Agent configuration missing for: ${agentName}`);
    const execute = async (agentConfig, modelType) => {
        const row = sqlite_1.default.prepare("SELECT data FROM settings WHERE id = 1").get();
        const settings = row ? JSON.parse(row.data) : {};
        let provider = agentConfig.provider;
        if ((!provider || provider === "smart") && settings.ai?.defaultProvider) {
            provider = settings.ai.defaultProvider;
        }
        if (!provider)
            provider = "openai";
        const model = getModel(provider, modelType || agentConfig.modelType);

        // Use LangChain bridge for selected providers and models.
        if (provider === "openai" || provider === "deepseek" || provider === "aipipe") {
            return await (0, langchain_1.runLangChainAgent)({
                input,
                provider,
                model: model,
                agentConfig: agentConfig,
                sender,
                chatId,
                aipipeToken
            });
        }

        if (agentConfig.sdkAgent && provider === "openai") {
            const apiKey = settings.apiKeys?.openai;
            const baseUrl = settings.endpoints?.openaiCompatibleBaseUrl;
            if (!apiKey)
                throw new Error("OpenAI API Key is missing.");
            process.env.OPENAI_API_KEY = apiKey;
            if (baseUrl)
                process.env.OPENAI_BASE_URL = baseUrl;
            const handoffs = Array.isArray(agentConfig.handoffs)
                ? agentConfig.handoffs.map((h) => {
                    const target = exports.agents[h];
                    const targetProvider = target.provider || provider;
                    return new agents_1.Agent({
                        name: target.name || h,
                        instructions: target.instructions,
                        model: getModel(targetProvider, target.modelType)
                    });
                })
                : [];
            const mcpTools = getMcpAgentTools();
            const sdkAgent = new agents_1.Agent({
                name: agentConfig.name || agentName,
                instructions: agentConfig.instructions || settings.systemPrompt,
                model: model,
                tools: [...(agentConfig.tools || []), ...mcpTools],
                handoffs: handoffs
            });
            const result = await (0, agents_1.run)(sdkAgent, input);
            return {
                text: result.finalOutput,
                lastAgent: result.lastAgent?.name,
                model: model
            };
        }
        const mcpTools = getMcpAgentTools();
        let currentInput = typeof agentConfig.prompt === "function" ? agentConfig.prompt(input) : (agentConfig.instructions ? agentConfig.instructions + "\n\n" : "") + input;
        let iterations = 0;
        const maxIterations = 5;
        while (iterations < maxIterations) {
            const response = await (0, router_1.default)({
                provider,
                model,
                prompt: currentInput,
                tools: mcpTools,
                aipipeToken
            });
            if (response.toolCalls && response.toolCalls.length > 0) {
                logAppEvent("INFO", "Agents", "TOOL_CALL_REQUEST", `${provider} requested ${response.toolCalls.length} tool calls`, { provider });
                let toolResults = [];
                for (const call of response.toolCalls) {
                    const toolName = call.function.name;
                    const toolArgs = JSON.parse(call.function.arguments || "{}");
                    const targetTool = mcpTools.find(t => t.name === toolName);
                    if (targetTool) {
                        try {
                            const result = await targetTool.execute(toolArgs);
                            toolResults.push(`Tool ${toolName} output: ${result}`);
                        }
                        catch (err) {
                            toolResults.push(`Tool ${toolName} failed: ${err.message}`);
                        }
                    }
                    else {
                        toolResults.push(`Tool ${toolName} not found.`);
                    }
                }
                currentInput += `\n\nTool Results:\n${toolResults.join("\n")}\n\nPlease proceed based on this data.`;
                iterations++;
            }
            else {
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
    const executeWithRetry = async (agentConfig, modelType, retryCount = 0) => {
        const MAX_RETRIES = 2;
        try {
            return await execute(agentConfig, modelType);
        }
        catch (err) {
            const errorType = classifyError(err);
            const currentProvider = agentConfig.provider || "openai";
            // 1. Transient Error - Retry with exponential backoff
            if (errorType === ErrorType.TRANSIENT && retryCount < MAX_RETRIES) {
                const delay = Math.pow(2, retryCount) * 1000;
                logAppEvent("WARN", "Agents", "TRANSIENT_ERROR", `Transient error from ${currentProvider}. Retrying...`, { delay, attempt: retryCount + 1 });
                if (sender) {
                    sender.send('tool-event', {
                        type: 'fallback',
                        message: `Transient error on ${currentProvider}. Retrying in ${delay}ms...`
                    });
                }
                await new Promise(resolve => setTimeout(resolve, delay));
                return executeWithRetry(agentConfig, modelType, retryCount + 1);
            }
            // 2. Quota or Model Not Found - Attempt Fallback
            if (errorType === ErrorType.QUOTA || errorType === ErrorType.MODEL_NOT_FOUND) {
                const reason = errorType === ErrorType.QUOTA ? "Quota exceeded" : "Model not found";
                const providers = ["gemini", "openai", "claude", "deepseek"];
                const otherProviders = providers.filter(p => p !== currentProvider);
                const row = sqlite_1.default.prepare("SELECT data FROM settings WHERE id = 1").get();
                const settings = row ? JSON.parse(row.data) : {};
                const keys = settings.apiKeys || {};
                for (const targetProvider of otherProviders) {
                    const keyMap = {
                        openai: keys.openai,
                        claude: keys.anthropic,
                        deepseek: keys.deepseek,
                        gemini: keys.gemini
                    };
                    if (!keyMap[targetProvider])
                        continue;
                    logAppEvent("WARN", "Agents", "FALLBACK_TRIGGER", `${reason} on ${currentProvider}. Attempting fallback.`, { target: targetProvider });
                    if (sender) {
                        sender.send('tool-event', {
                            type: 'fallback',
                            message: `${reason} on ${currentProvider}. Falling back to ${targetProvider}...`
                        });
                    }
                    const fallbackAgent = targetProvider === "gemini" ? exports.agents.geminiAgent :
                        targetProvider === "claude" ? exports.agents.reasoner :
                            exports.agents.analyzer;
                    try {
                        const result = await execute({
                            ...fallbackAgent,
                            provider: targetProvider
                        }, modelType);
                        return {
                            ...result,
                            text: `[Fallback from ${currentProvider} to ${targetProvider} due to ${reason}] ${result.text}`,
                            model: result.model
                        };
                    }
                    catch (fallbackErr) {
                        console.error(`[Agent] Fallback to ${targetProvider} failed:`, fallbackErr.message);
                    }
                }
                // Last resort: Ollama
                if (settings.endpoints?.ollamaBaseUrl) {
                    logAppEvent("WARN", "Agents", "OLLAMA_FALLBACK", "All cloud providers failed. Attempting local Ollama.");
                    if (sender) {
                        sender.send('tool-event', {
                            type: 'fallback',
                            message: `All cloud providers failed. Attempting local Ollama fallback...`
                        });
                    }
                    try {
                        const result = await execute(exports.agents.local, modelType);
                        return {
                            ...result,
                            text: `[Fallback to Local Ollama] ${result.text}`,
                            model: result.model
                        };
                    }
                    catch (ollamaErr) {
                        console.error("[Agent] Ollama fallback failed:", ollamaErr.message);
                    }
                }
            }
            // Unrecoverable or all fallbacks failed
            throw err;
        }
    };
    return await executeWithRetry(a, overrideType);
}
async function autoAgent(input, preferredType = "fast", sender, aipipeToken, aipipeModel = "openai/gpt-5-nano", chatId) {
    const query = input.toLowerCase();
    const type = (preferredType === "smart" || preferredType === "fast") ? preferredType : "fast";
    if (query.includes("homework") || query.includes("triage")) {
        return runAgent("triage", input, type, sender, aipipeToken, aipipeModel, chatId);
    }
    if (query.includes("history") || query.includes("ancient") || query.includes("empire")) {
        return runAgent("historyTutor", input, type, sender, aipipeToken, aipipeModel, chatId);
    }
    if (query.includes("math") || query.includes("calculate") || query.includes("solve")) {
        return runAgent("mathTutor", input, type, sender, aipipeToken, aipipeModel, chatId);
    }
    if (query.includes("code") || query.includes("python") || query.includes("script")) {
        return runAgent("analyzer", input, type, sender, aipipeToken, aipipeModel, chatId);
    }
    if (query.includes("analyze") || query.includes("data") || query.includes("viz")) {
        return runAgent("geminiAgent", input, type, sender, aipipeToken, aipipeModel, chatId);
    }
    if (query.length > 300 || query.includes("plan") || query.includes("orchestrate") || query.includes("complex") || query.includes("mongodb") || query.includes("mongodbanalyzer")) {
        return runAgent("master", input, "smart", sender, aipipeToken, aipipeModel, chatId);
    }
    return runAgent("analyzer", input, type, sender, aipipeToken, aipipeModel, chatId);
}
