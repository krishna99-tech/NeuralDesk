"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenAI } = require("@langchain/google-genai");
const { ChatOllama } = require("@langchain/ollama");
const { DynamicStructuredTool } = require("@langchain/core/tools");
const { AgentExecutor, createOpenAIToolsAgent } = require("@langchain/classic/agents");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");
const { convertToOpenAITool } = require("@langchain/core/utils/function_calling");
const sqlite_1 = __importDefault(require("../db/sqlite"));
const router_1 = __importDefault(require("../ai/router"));
const mcpRegistry = require("../mcp/registry");
const fs = require("fs");
const zod = require("zod");
const { logAppEvent } = require("../logger");
const HISTORY_WINDOW_MESSAGES = 8;

function isGreetingInput(raw) {
    const text = String(raw || "").trim().toLowerCase();
    return /^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening|hola)\b[!.?]*$/.test(text);
}

function isVagueMcpCommand(raw) {
    const text = String(raw || "").trim().toLowerCase();
    return /^(use mcp|mcp|use tools|use tool)$/.test(text);
}

function normalizeHistoryMessages(messages) {
    if (!Array.isArray(messages)) return [];
    return messages
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m) => ({ role: m.role, content: m.content }));
}

function hasEmptyAggregationStage(args) {
    const pipeline = args?.pipeline;
    if (!Array.isArray(pipeline)) return false;
    return pipeline.some((stage) => {
        if (!stage || typeof stage !== "object" || Array.isArray(stage)) return true;
        return Object.keys(stage).length === 0;
    });
}

function jsonSchemaToZod(schema) {
    if (!schema) return zod.z.object({}).describe("No parameters required");
    let zType;
    switch (schema.type) {
        case "string": zType = zod.z.string(); break;
        case "number":
        case "integer": zType = zod.z.number(); break;
        case "boolean": zType = zod.z.boolean(); break;
        case "object":
            const shape = {};
            const props = schema.properties || {};
            const required = schema.required || [];
            for (const key in props) {
                let propType = jsonSchemaToZod(props[key]);
                if (!required.includes(key)) propType = propType.optional();
                shape[key] = propType;
            }
            zType = zod.z.object(shape);
            break;
        case "array": zType = zod.z.array(jsonSchemaToZod(schema.items)); break;
        default: zType = zod.z.object({});
    }
    if (schema.description) zType = zType.describe(schema.description);
    return zType;
}

/**
 * NeuralDesk LangChain Integration
 * Implements the Bridge protocol: LLM + Tools + RAG
 */
async function runLangChainAgent({ input, provider: requestedProvider, model, history, sender, agentConfig, chatId, aipipeToken }) {
    logAppEvent("INFO", "LangChain", "SESSION_START", `Initiating LangChain bridge for chat: ${chatId || 'default'}`, { model });
    if (isGreetingInput(input)) {
        return { output: "Hi there! How can I help?", text: "Hi there! How can I help?" };
    }
    if (isVagueMcpCommand(input)) {
        const help = "MCP is enabled. Tell me exactly what to run, for example: `list databases`, `list collections in esp32_data`, or `analyze esp32_data.sensor_readings and plot hourly averages`.";
        return { output: help, text: help };
    }
    const row = sqlite_1.default.prepare("SELECT data FROM settings WHERE id = 1").get();
    const settings = row ? JSON.parse(row.data) : {};
    const provider = requestedProvider || agentConfig?.provider || settings.ai?.defaultProvider || "openai";
    const apiKeys = settings.apiKeys || {};
    const providerKeyMap = {
        openai: apiKeys.openai,
        gemini: apiKeys.gemini,
        deepseek: apiKeys.deepseek,
        aipipe: apiKeys.aipipe
    };

    const effectiveApiKey = provider === "aipipe" ? (aipipeToken || apiKeys.aipipe) : providerKeyMap[provider];

    if (provider !== "ollama" && !effectiveApiKey) {
        throw new Error(`API key required for provider '${provider}'. Please set it in Settings.`);
    }

    // Determine Base URL for OpenAI-compatible providers
    let baseURL = settings.endpoints?.openaiCompatibleBaseUrl;
    if (provider === "deepseek") baseURL = "https://api.deepseek.com";
    if (provider === "aipipe") baseURL = "https://aipipe.org/openrouter/v1";
    if (provider === "ollama") baseURL = settings.endpoints?.ollamaBaseUrl || "http://127.0.0.1:11434/v1";

    // Map internal model names to provider specific names if necessary
    let modelName = model;
    if (provider === "openai") {
        modelName = model === "smart" ? "gpt-4o" : "gpt-4o-mini";
    } else if (provider === "aipipe") {
        modelName = model || "openai/gpt-5-nano";
    } else if (provider === "deepseek") {
        modelName = model === "smart" ? "deepseek-reasoner" : "deepseek-chat";
    }

    let chatModel;
    if (provider === "gemini") {
        chatModel = new ChatGoogleGenAI({
            apiKey: effectiveApiKey,
            modelName: modelName || "gemini-1.5-pro",
            temperature: settings.ai?.temperature ?? 0.7,
        });
    } else if (provider === "ollama") {
        chatModel = new ChatOllama({
            baseUrl: baseURL || "http://127.0.0.1:11434",
            model: modelName || "llama3",
            temperature: settings.ai?.temperature ?? 0.7,
        });
    } else {
        chatModel = new ChatOpenAI({
            openAIApiKey: effectiveApiKey || "dummy-key",
            apiKey: effectiveApiKey || "dummy-key", // some versions of langchain prefer apiKey
            modelName: modelName,
            temperature: settings.ai?.temperature ?? 0.7,
            streaming: true,
            configuration: {
                baseURL: baseURL || undefined
            }
        });
    }

    // 1. Define RAG Tool (Self-RAG using SQLite Logs)
    const ragTool = new DynamicStructuredTool({
        name: "retrieve_knowledge",
        description: "Search through past conversation logs to retrieve context from previous interactions. You can optionally filter by specific agent names or dates.",
        schema: zod.z.object({ 
            query: zod.z.string().describe("The search term to find in past logs"),
            agent: zod.z.string().optional().describe("Filter results by a specific agent name (e.g. 'historyTutor', 'mathTutor', 'analyzer')"),
            date: zod.z.string().optional().describe("Filter results by date (format: YYYY-MM-DD)")
        }),
        func: async ({ query, agent, date }) => {
            try {
                // Build the SQL query dynamically to support filtering
                const searchPattern = `%${query}%`;
                let sql = "SELECT input, output, agent FROM logs WHERE (input LIKE ? OR output LIKE ?)";
                const params = [searchPattern, searchPattern];

                if (agent) {
                    sql += " AND agent = ?";
                    params.push(agent);
                }

                if (date) {
                    const logCols = sqlite_1.default.prepare("PRAGMA table_info(logs)").all();
                    const hasCreatedAt = Array.isArray(logCols) && logCols.some((c) => c?.name === "createdAt");
                    const hasCreatedAtSnake = Array.isArray(logCols) && logCols.some((c) => c?.name === "created_at");
                    const dateColumn = hasCreatedAt ? "createdAt" : (hasCreatedAtSnake ? "created_at" : null);
                    if (dateColumn) {
                        sql += ` AND date(${dateColumn}) = ?`;
                        params.push(date);
                    }
                }

                sql += " LIMIT 3";
                const logs = sqlite_1.default.prepare(sql).all(...params);

                if (!logs || logs.length === 0) {
                    return `No relevant information found in past logs for: "${query}"${agent ? ` with agent: ${agent}` : ''}${date ? ` on date: ${date}` : ''}`;
                }

                let context = `Relevant past interactions found for "${query}":\n\n`;
                logs.forEach((log, index) => {
                    context += `[Entry ${index + 1}] (Agent: ${log.agent})\nUser: ${log.input}\nAssistant: ${log.output}\n\n`;
                });

                return context;
            } catch (err) {
                logAppEvent("ERROR", "LangChain", "RAG_TOOL_ERROR", `Knowledge retrieval failed: ${err.message}`, { query, stack: err.stack });
                return `Failed to search past logs: ${err.message}`;
            }
        }
    });

    // 2. Map MCP Tools to LangChain format
    const mcpTools = mcpRegistry.getAllTools().map(t => {
        const schemaString = t.inputSchema ? JSON.stringify(t.inputSchema) : "{}";
        let zSchema;
        try {
            zSchema = jsonSchemaToZod(t.inputSchema);
            if (!(zSchema instanceof zod.ZodObject)) {
                zSchema = zod.z.object({ _meta: zod.z.string().optional() }).catchall(zod.z.any());
            }
        } catch (e) {
            zSchema = zod.z.object({ _meta: zod.z.string().optional() }).catchall(zod.z.any());
        }

        return new DynamicStructuredTool({
            name: `mcp_${t.serverName}_${t.name}`,
            description: `[MCP:${t.serverName}] ${t.description}\nIMPORTANT: Pass arguments matching this schema: ${schemaString}`,
            schema: zSchema,
            func: async (args) => {
                if (args && '_meta' in args) delete args._meta;
                if (t.serverName === "mongodb-analyzer" && t.name === "run_aggregation" && hasEmptyAggregationStage(args)) {
                    return JSON.stringify({
                        error: "invalid_args",
                        tool: `mcp_${t.serverName}_${t.name}`,
                        message: "Invalid aggregation pipeline: each stage must be a non-empty object with exactly one MongoDB operator field (e.g., {$match:{...}}).",
                        received: args
                    });
                }
                try {
                    const result = await mcpRegistry.callTool(t.serverName, t.name, args);
                    return JSON.stringify(result.content);
                } catch (err) {
                    return `Error executing tool ${t.name}: ${err.message}`;
                }
            }
        });
    });

    const tools = [ragTool, ...mcpTools, ...(agentConfig?.tools || [])];

    // Use a single source of truth for chat history and keep it bounded.
    let persistedMessages = [];
    if (chatId) {
        const chatRow = sqlite_1.default.prepare("SELECT messages FROM chats WHERE id = ?").get(chatId);
        if (chatRow && chatRow.messages) {
            try {
                persistedMessages = normalizeHistoryMessages(JSON.parse(chatRow.messages));
            } catch {
                persistedMessages = [];
            }
        }
    }
    if (!persistedMessages.length) {
        persistedMessages = normalizeHistoryMessages(history || []);
    }
    const messages = persistedMessages.slice(-HISTORY_WINDOW_MESSAGES);

    // 3. Build the prompt template
    const systemPrompt = agentConfig?.systemPrompt ||
        "You are a helpful AI assistant with access to tools and past conversation history. " +
        "Use the retrieve_knowledge tool to look up relevant past interactions when needed.\n" +
        "Tool-calling guardrails:\n" +
        "- Do not call the same tool multiple times with identical arguments in one turn.\n" +
        "- For mcp_mongodb-analyzer_run_aggregation, each pipeline stage must contain exactly one Mongo operator (example: {{\\$match:{{...}}}}).\n" +
        "- Never send empty aggregation stages like {{}}.\n" +
        "- If the user request is ambiguous, ask a clarifying question instead of guessing tool arguments.\n" +
        "Visualization formatting rules:\n" +
        "- For explainers/tutorials/comparisons, prefer artifact blocks.\n" +
        "- Use ```artifact:table title=\"...\"``` with JSON rows/columns for structured comparisons.\n" +
        "- Use ```artifact:chart title=\"...\"``` with JSON data for numeric trends.\n" +
        "- Keep a short plain-language summary before artifacts.";

    const prompt = ChatPromptTemplate.fromMessages([
        ["system", systemPrompt],
        new MessagesPlaceholder("chat_history"),
        ["human", "{input}"],
        new MessagesPlaceholder("agent_scratchpad"),
    ]);

    // 4. Create the agent
    const agent = await createOpenAIToolsAgent({
        llm: chatModel,
        tools,
        prompt,
    });

    const agentExecutor = new AgentExecutor({
        agent,
        tools,
        verbose: false,
        maxIterations: agentConfig?.maxIterations || 5,
        handleParsingErrors: true,
    });

    // 5. Run the agent
    logAppEvent("INFO", "LangChain", "AGENT_INVOKE", `Running agent with ${tools.length} tools`, { chatId });

    let output = "";
    try {
        if (sender && !sender.isDestroyed()) {
            sender.send("ai-stream", { type: "start", chatId: chatId || "default" });
            sender.send("tool-event", { type: "planning", message: "Preparing tools and context..." });
        }
        let toolStepIndex = 0;
        const toolStepMap = new Map();
        const callbacks = [{
            handleLLMNewToken(token) {
                if (!token || !sender || sender.isDestroyed()) return;
                sender.send("ai-stream", { type: "token", token, chatId: chatId || "default" });
            },
            handleToolStart(tool, toolInput, runId) {
                if (!sender || sender.isDestroyed()) return;
                const idx = toolStepIndex++;
                toolStepMap.set(runId || `tool_${idx}`, idx);
                sender.send("tool-event", {
                    type: "step_start",
                    index: idx,
                    tool: String(tool?.name || "tool"),
                    reason: "Running tool call"
                });
            },
            handleToolEnd(output, runId) {
                if (!sender || sender.isDestroyed()) return;
                const key = runId || [...toolStepMap.keys()].pop();
                const idx = toolStepMap.get(key);
                if (typeof idx === "number") {
                    sender.send("tool-event", {
                        type: "step_done",
                        index: idx,
                        tool: "tool",
                        summary: String(output || "").slice(0, 200)
                    });
                }
            },
            handleToolError(err, runId) {
                if (!sender || sender.isDestroyed()) return;
                const key = runId || [...toolStepMap.keys()].pop();
                const idx = toolStepMap.get(key);
                if (typeof idx === "number") {
                    sender.send("tool-event", {
                        type: "step_error",
                        index: idx,
                        tool: "tool",
                        error: String(err?.message || err || "Tool error")
                    });
                }
            }
        }];
        logAppEvent("INFO", "LangChain", "PAYLOAD_SIZE", "Final LangChain payload sizes", {
            chatId: chatId || "default",
            inputLength: String(input || "").length,
            chatHistoryLength: messages.length
        });
        const result = await agentExecutor.invoke({
            input: String(input || ""),
            chat_history: messages,
        }, { callbacks });
        output = result.output || "";
        if (output === "Agent stopped due to max iterations.") {
            output = "The agent ran into multiple errors while trying to use tools and reached its iteration limit. The tool call failed because of invalid arguments. Please try rephrasing your request or checking the MCP logs.";
        } else if (!output || output.trim() === "") {
            output = "The agent finished its thoughts but didn't return a text response. This usually happens if the model got confused during tool calling. Please check the terminal logs for verbose details.";
        }
    } catch (err) {
        logAppEvent("ERROR", "LangChain", "AGENT_ERROR", `Agent invocation failed: ${err.message}`);
        output = `Error during agent execution: ${err.message}`;
    } finally {
        if (sender && !sender.isDestroyed()) {
            sender.send("ai-stream", { type: "done", chatId: chatId || "default" });
            sender.send("tool-event", { type: "done" });
        }
    }

    // 6. Persist the updated chat history to SQLite
    if (chatId) {
        const updatedMessages = [
            ...persistedMessages,
            { role: "user", content: String(input || "") },
            { role: "assistant", content: output },
        ];
        sqlite_1.default.prepare(
            "INSERT INTO chats (id, messages) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET messages = excluded.messages"
        ).run(chatId, JSON.stringify(updatedMessages));
    }

    logAppEvent("INFO", "LangChain", "SESSION_END", `LangChain agent completed for chat: ${chatId || 'default'}`);

    return { output, text: output };
}

exports.runLangChainAgent = runLangChainAgent;
