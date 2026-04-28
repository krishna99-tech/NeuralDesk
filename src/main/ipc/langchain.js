"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const { ChatOpenAI } = require("@langchain/openai");
const { DynamicStructuredTool } = require("@langchain/core/tools");
const { AgentExecutor, createOpenAIToolsAgent } = require("@langchain/classic/agents");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");
const { convertToOpenAITool } = require("@langchain/core/utils/function_calling");
const sqlite_1 = __importDefault(require("../db/sqlite"));
const mcpRegistry = require("../mcp/registry");
const fs = require("fs");
const zod = require("zod");
const { logAppEvent } = require("../logger");

/**
 * NeuralDesk LangChain Integration
 * Implements the Bridge protocol: LLM + Tools + RAG
 */
async function runLangChainAgent({ input, model, history, sender, agentConfig, chatId }) {
    logAppEvent("INFO", "LangChain", "SESSION_START", `Initiating LangChain bridge for chat: ${chatId || 'default'}`, { model });
    const row = sqlite_1.default.prepare("SELECT data FROM settings WHERE id = 1").get();
    const settings = row ? JSON.parse(row.data) : {};
    const apiKey = settings.apiKeys?.openai;

    if (!apiKey) throw new Error("OpenAI API Key required for LangChain agent.");

    const chatModel = new ChatOpenAI({
        openAIApiKey: apiKey,
        modelName: model === "smart" ? "gpt-4o" : "gpt-4o-mini",
        temperature: settings.ai?.temperature ?? 0.7,
        configuration: {
            baseURL: settings.endpoints?.openaiCompatibleBaseUrl || undefined
        }
    });

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
        return new DynamicStructuredTool({
            name: `mcp_${t.serverName}_${t.name}`,
            description: `[MCP:${t.serverName}] ${t.description}`,
            schema: zod.z.any(), // Simplified for dynamic mapping
            func: async (args) => {
                const result = await mcpRegistry.callTool(t.serverName, t.name, args);
                return JSON.stringify(result.content);
            }
        });
    });

    const tools = [ragTool, ...mcpTools, ...(agentConfig?.tools || [])];

    // Load long-term history from SQLite if session is new or chatId is provided
    let messages = history || [];
    if (messages.length <= 1 && chatId) {
        const chatRow = sqlite_1.default.prepare("SELECT messages FROM chats WHERE id = ?").get(chatId);
        if (chatRow && chatRow.messages) {
            const storedMessages = JSON.parse(chatRow.messages);
            // Keep the last message (current user input) and prepend stored history
            messages = [...storedMessages, ...messages.slice(-1)];
        }
    }

    // 3. Create the Planning Loop
    const prompt = ChatPromptTemplate.fromMessages([
        ["system", agentConfig?.instructions || settings.ai?.systemPrompt || "You are a helpful assistant."],
        new MessagesPlaceholder("chat_history"),
        ["human", "{input}"],
        new MessagesPlaceholder("agent_scratchpad"),
    ]);

    const agent = await createOpenAIToolsAgent({
        llm: chatModel,
        tools,
        prompt,
    });

    const executor = new AgentExecutor({
        agent,
        tools,
        verbose: true,
    });

    // Format history for LangChain
    const chatHistory = messages.map(m => {
        if (m.role === "user") return ["human", m.content];
        return ["ai", m.content];
    });

    if (sender) {
        logAppEvent("INFO", "LangChain", "PLANNING_START", "Executing agent planning loop");
        sender.send("tool-event", { type: "planning", message: "LangChain Bridge initiating planning loop..." });
    }

    const result = await executor.invoke({
        input,
        chat_history: chatHistory,
    });

    logAppEvent("INFO", "LangChain", "PLANNING_SUCCESS", "Final answer synthesized by bridge");

    // Persist the interaction to the database
    if (chatId) {
        const updatedMessages = [...messages, { role: "assistant", content: result.output }];
        sqlite_1.default.prepare("UPDATE chats SET messages = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?")
            .run(JSON.stringify(updatedMessages), chatId);
    }

    return {
        text: result.output,
        model: chatModel.modelName
    };
}

exports.runLangChainAgent = runLangChainAgent;
