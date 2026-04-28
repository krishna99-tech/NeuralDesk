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
exports.registerIpcHandlers = registerIpcHandlers;
const electron_1 = require("electron");
const sqlite_1 = __importDefault(require("../db/sqlite"));
const agents_1 = require("../ai/agents");
const orchestrator_1 = require("../ai/orchestrator");
const langchain_1 = require("./langchain");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const client_1 = __importDefault(require("../mcp/client"));
const registry_1 = require("../mcp/registry");
const session_1 = __importDefault(require("../core/session"));
const intentParser_1 = require("../core/intentParser");
const dataService_1 = require("../services/dataService");
const mcpRuntime = new Map();
const logger = require("../logger");
function getMcpConfigPath() {
    return path.join(electron_1.app.getPath("userData"), "mcp_config.json");
}

exports.logAppEvent = logger.logAppEvent;
const truncateText = logger.truncateText;

function normalizeMcpConfig(raw) {
    const cfg = raw && typeof raw === "object" ? raw : {};
    const servers = cfg.mcpServers;
    if (Array.isArray(servers)) {
        const mapped = {};
        for (const entry of servers) {
            if (!entry || typeof entry !== "object")
                continue;
            const name = (entry.name || "").trim();
            if (!name)
                continue;
            mapped[name] = {
                command: entry.command || "",
                args: Array.isArray(entry.args) ? entry.args : [],
                env: entry.env && typeof entry.env === "object" ? entry.env : {},
                timeoutMs: Number(entry.timeoutMs) > 0 ? Number(entry.timeoutMs) : undefined,
                chatCommand: entry.chatCommand || "",
                chatArgs: Array.isArray(entry.chatArgs) ? entry.chatArgs : [],
                chatEnv: entry.chatEnv && typeof entry.chatEnv === "object" ? entry.chatEnv : {},
                chatTimeoutMs: Number(entry.chatTimeoutMs) > 0 ? Number(entry.chatTimeoutMs) : undefined
            };
        }
        cfg.mcpServers = mapped;
    }
    else if (!servers || typeof servers !== "object") {
        cfg.mcpServers = {};
    }
    return cfg;
}
function readMcpConfig() {
    const configPath = getMcpConfigPath();
    if (!fs.existsSync(configPath)) {
        const initial = { mcpServers: {} };
        fs.writeFileSync(configPath, JSON.stringify(initial, null, 2), "utf8");
        return initial;
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
        const normalized = normalizeMcpConfig(parsed);
        fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2), "utf8");
        return normalized;
    }
    catch {
        const reset = { mcpServers: {} };
        fs.writeFileSync(configPath, JSON.stringify(reset, null, 2), "utf8");
        return reset;
    }
}
function writeMcpConfig(config) {
    const normalized = normalizeMcpConfig(config);
    fs.writeFileSync(getMcpConfigPath(), JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
}
function getMcpLogDir() {
    const logDir = path.join(electron_1.app.getPath("userData"), "logs", "mcp");
    fs.mkdirSync(logDir, { recursive: true });
    return logDir;
}
function sanitizeFilePart(value) {
    return String(value || "mcp")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80) || "mcp";
}
function buildMcpLogPath(serverName) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = sanitizeFilePart(serverName);
    return path.join(getMcpLogDir(), `${stamp}_${safeName}.log`);
}
function buildMcpStartupLogPath(serverName) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = sanitizeFilePart(serverName);
    return path.join(getMcpLogDir(), `${stamp}_${safeName}_startup.log`);
}
function stopMcpServer(name) {
    logger.logAppEvent("INFO", "MCP", "MCP_SERVER_STOP_REQUEST", `Request to stop MCP server: ${name}`, { serverName: name });
    const runtime = mcpRuntime.get(name);
    if (!runtime || !runtime.process)
        return;
    try {
        runtime.process.kill();
    }
    catch { }
}
function startMcpServer(name, server) {
    logger.logAppEvent("INFO", "MCP", "MCP_SERVER_START_ATTEMPT", `Attempting to start MCP server: ${name}`, { serverName: name, command: server?.command, args: server?.args });
    const command = String(server?.command || "").trim();
    const args = Array.isArray(server?.args) ? server.args : [];
    const env = server?.env && typeof server.env === "object" ? server.env : {};
    if (!name || !command)
        return;
    const existing = mcpRuntime.get(name);
    if (existing?.process && !existing.process.killed)
        return;
    const runtime = {
        status: "starting",
        startedAt: new Date().toISOString(),
        lastError: "",
        lastExitCode: null,
        startupLogPath: "",
        process: null
    };
    mcpRuntime.set(name, runtime);
    try {
        const startupLogPath = buildMcpStartupLogPath(name);
        runtime.startupLogPath = startupLogPath;
        const logStream = fs.createWriteStream(startupLogPath, { flags: "a", encoding: "utf8" });
        logStream.write(`[${new Date().toISOString()}] MCP startup begin\n`);
        logStream.write(`server=${name}\ncommand=${command}\nargs=${JSON.stringify(args)}\n`);
        const child = (0, child_process_1.spawn)(command, args, {
            shell: false,
            windowsHide: true,
            env: {
                ...process.env,
                ...env
            }
        });
        runtime.process = child;
        logger.logAppEvent("INFO", "MCP", "MCP_SERVER_SPAWNED", `MCP server spawned: ${name}`, { pid: child.pid, serverName: name, startupLog: startupLogPath });
        runtime.status = "running";
        logStream.write(`[${new Date().toISOString()}] process spawned pid=${child.pid}\n`);
        child.stdout.on("data", (chunk) => {
            logStream.write(`[stdout] ${chunk.toString()}`); // Full stdout to file
        });
        child.stderr.on("data", (chunk) => {
            logStream.write(`[stderr] ${chunk.toString()}`); // Full stderr to file
        });
        child.on("error", (err) => {
            runtime.status = "error";
            runtime.lastError = String(err?.message || "Failed to start MCP server.");
            logStream.write(`[${new Date().toISOString()}] error: ${runtime.lastError}\n`);
            logStream.end();
            logger.logAppEvent("ERROR", "MCP", "MCP_SERVER_ERROR", `MCP server ${name} encountered an error: ${runtime.lastError}`, { serverName: name, error: err.message, startupLog: runtime.startupLogPath });
        });
        child.on("close", (code) => {
            runtime.lastExitCode = code;
            runtime.status = code === 0 ? "stopped" : "error";
            registry_1.activeClients.delete(name);
            logger.logAppEvent(code === 0 ? "INFO" : "ERROR", "MCP", "MCP_SERVER_STOPPED", `MCP server ${name} stopped with exit code: ${code}`, { serverName: name, exitCode: code, startupLog: runtime.startupLogPath });
            logStream.write(`[${new Date().toISOString()}] closed exitCode=${code}\n`);
            logStream.end();
        });
        // Initialize persistent client for tool access
        const mcpClient = new client_1.default(name, command, args, env);
        mcpClient.connect().then(ok => {
            if (ok)
                registry_1.activeClients.set(name, mcpClient); // This is where the client is actually registered
            logger.logAppEvent(ok ? "INFO" : "WARN", "MCP", "MCP_CLIENT_CONNECTED", `MCP client for ${name} connection status: ${ok ? 'success' : 'failed'}`, { serverName: name, connected: ok });
        });
    }
    catch (err) {
        runtime.status = "error";
        runtime.lastError = String(err?.message || "Failed to spawn MCP server.");
        logger.logAppEvent("ERROR", "MCP", "MCP_SERVER_SPAWN_FAILED", `Failed to spawn MCP server ${name}: ${runtime.lastError}`, { serverName: name, error: err.message });

    }
}
function startConfiguredMcpServers() {
    const config = readMcpConfig();
    const servers = config.mcpServers || {};
    const configured = new Set(Object.keys(servers));
    for (const existingName of mcpRuntime.keys()) {
        if (!configured.has(existingName)) {
            stopMcpServer(existingName);
            mcpRuntime.delete(existingName);
        }
    }
    for (const [name, server] of Object.entries(servers)) {
        startMcpServer(name, server);
    }
}
function getMcpStatuses() {
    const config = readMcpConfig();
    const statuses = {};
    for (const name of Object.keys(config.mcpServers || {})) {
        const rt = mcpRuntime.get(name);
        statuses[name] = {
            status: rt?.status || "off",
            startedAt: rt?.startedAt || null,
            lastError: rt?.lastError || "",
            lastExitCode: rt?.lastExitCode ?? null,
            startupLogPath: rt?.startupLogPath || ""
        };
    }
    return statuses;
}
function wrapIpcHandler(name, handlerFn) {
    // ... (existing wrapIpcHandler logic)
    // The implementation of wrapIpcHandler is provided in the previous turn.
}
function pickMcpServers(prompt, serverNames) {
    const all = Array.isArray(serverNames) ? serverNames : [];
    if (all.length === 0)
        return [];
    const query = String(prompt || "").toLowerCase();
    const explicit = all.filter((name) => query.includes(name.toLowerCase()));
    return explicit.length > 0 ? explicit : all.slice(0, 3);
}
function executeMcpServer({ name, command, args, env, prompt, timeoutMs = 45000 }) {
    return new Promise((resolve) => {
        logger.logAppEvent("INFO", "MCP", "MCP_TOOL_EXECUTION_START", `Executing MCP tool for server ${name}`, { serverName: name, command, prompt: truncateText(prompt, 200), timeoutMs });
        const start = Date.now();
        let stdout = "";
        let stderr = "";
        let done = false;
        let timedOut = false;
        const maxBuffer = 200000;
        const logPath = buildMcpLogPath(name);
        const logStream = fs.createWriteStream(logPath, { flags: "a", encoding: "utf8" });
        const startedAt = new Date().toISOString();
        logStream.write(`[${startedAt}] MCP execution start\n`);
        logStream.write(`server=${name}\ncommand=${command}\nargs=${JSON.stringify(Array.isArray(args) ? args : [])}\ntimeoutMs=${timeoutMs}\n`);
        const processedArgs = (Array.isArray(args) ? args : []).map(arg => String(arg)
            .replace(/{{query}}/g, String(prompt || ""))
            .replace(/{{prompt}}/g, String(prompt || "")));
        const child = (0, child_process_1.spawn)(command, processedArgs, {
            shell: false,
            windowsHide: true,
            env: {
                ...process.env,
                ...(env && typeof env === "object" ? env : {}),
                NEURALDESK_PROMPT: String(prompt || ""),
                ND_PROMPT: String(prompt || "")
            }
        });
        const finish = (result) => {
            if (done)
                return;
            done = true;
            logger.logAppEvent(result.ok ? "INFO" : "ERROR", "MCP", "MCP_TOOL_EXECUTION_END", `MCP tool execution for ${name} finished.`, {
                serverName: name,
                ok: result.ok,
                exitCode: result.exitCode,
                timedOut: result.timedOut,
                durationMs: Date.now() - start,
                logPath: logPath,
                stdoutSummary: truncateText(result.stdout, 500),
                stderrSummary: truncateText(result.stderr, 500),
                promptSummary: truncateText(prompt, 200)
            });
            logStream.write(`[${new Date().toISOString()}] MCP execution end\n`);
            logStream.write(`result=${JSON.stringify({ ok: result.ok, exitCode: result.exitCode, timedOut: result.timedOut, durationMs: Date.now() - start })}\n`);
            logStream.end();
            resolve({
                name,
                durationMs: Date.now() - start,
                logPath,
                ...result
            });
        };
        const timer = setTimeout(() => {
            timedOut = true;
            try {
                child.kill();
            }
            catch { }
        }, timeoutMs);
        child.stdout.on("data", (chunk) => {
            const text = chunk.toString();
            stdout += text;
            logStream.write(`[stdout] ${text}`);
            if (stdout.length > maxBuffer)
                stdout = stdout.slice(0, maxBuffer);
        });
        child.stderr.on("data", (chunk) => {
            const text = chunk.toString();
            stderr += text;
            logStream.write(`[stderr] ${text}`);
            if (stderr.length > maxBuffer)
                stderr = stderr.slice(0, maxBuffer);
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            logger.logAppEvent("ERROR", "MCP", "MCP_TOOL_EXECUTION_ERROR", `MCP tool execution for ${name} failed to spawn: ${error.message}`, { serverName: name, error: error.message, promptSummary: truncateText(prompt, 200) });
            finish({
                ok: false,
                exitCode: null,
                timedOut: false,
                stdout: truncateText(stdout, 2500),
                stderr: truncateText(error.message || stderr, 2500)
            });
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (timedOut && !stderr.trim()) {
                stderr = "Process timed out before completing. This command may be running a long-lived MCP server instead of a single analysis task.";
            }
            finish({
                ok: !timedOut && code === 0,
                exitCode: code,
                timedOut,
                stdout: truncateText(stdout, 4000),
                stderr: truncateText(stderr, 2500)
            });
        });
    });
}
function getMcpChatExecutionSpec(name, server) {
    const startupCommand = String(server?.command || "").trim();
    const startupArgs = Array.isArray(server?.args) ? server.args : [];
    const startupEnv = server?.env && typeof server.env === "object" ? server.env : {};
    const startupTimeout = Number(server?.timeoutMs) > 0 ? Number(server.timeoutMs) : 45000;
    const chatCommand = String(server?.chatCommand || "").trim();
    const chatArgs = Array.isArray(server?.chatArgs) ? server.chatArgs : [];
    const chatEnv = server?.chatEnv && typeof server.chatEnv === "object" ? server.chatEnv : {};
    const chatTimeout = Number(server?.chatTimeoutMs) > 0 ? Number(server.chatTimeoutMs) : startupTimeout;
    if (chatCommand) {
        return {
            mode: "one-shot",
            name,
            command: chatCommand,
            args: chatArgs,
            env: { ...startupEnv, ...chatEnv },
            timeoutMs: chatTimeout
        };
    }
    return {
        mode: "server",
        name,
        command: startupCommand,
        args: startupArgs,
        env: startupEnv,
        timeoutMs: startupTimeout
    };
}
async function executeMcpForPrompt(prompt) {
    const config = readMcpConfig();
    const names = Object.keys(config.mcpServers || {});
    const targets = pickMcpServers(prompt, names);
    if (targets.length === 0)
        return [];
    const results = [];
    for (const name of targets) {
        const server = config.mcpServers[name] || {};
        const spec = getMcpChatExecutionSpec(name, server);
        if (spec.mode === "server") {
            startMcpServer(name, server);
            const running = mcpRuntime.get(name);
            const isActive = running?.status === "running";
            results.push({
                name,
                ok: isActive,
                exitCode: running?.lastExitCode ?? null,
                timedOut: false,
                durationMs: 0,
                stdout: isActive
                    ? `MCP server '${name}' is connected and ready.`
                    : `MCP server '${name}' is ${running?.status || "off"}.`,
                stderr: isActive
                    ? "Interactive tools are available. The agent can call these tools dynamically during the conversation."
                    : (running?.lastError || "Server is not running."),
                logPath: running?.startupLogPath || ""
            });
            continue;
        }
        const command = String(spec.command || "").trim();
        if (!command) {
            results.push({
                name,
                ok: false,
                exitCode: null,
                timedOut: false,
                durationMs: 0,
                stdout: "",
                stderr: "Missing command"
            });
            continue;
        }
        const res = await executeMcpServer({
            name,
            command: spec.command,
            args: spec.args,
            env: spec.env,
            prompt,
            timeoutMs: spec.timeoutMs
        });
        results.push(res);
    }
    return results;
}
function formatMcpResultsForPrompt(results) {
    if (!Array.isArray(results) || results.length === 0)
        return "No MCP results.";
    return results.map((r) => {
        const parts = [];
        parts.push(`[MCP ${r.name}] status=${r.ok ? "ok" : "error"} exit=${r.exitCode} timeout=${r.timedOut}`);
        if (r.stdout)
            parts.push(`stdout:\n${r.stdout}`);
        if (r.stderr)
            parts.push(`stderr:\n${r.stderr}`);
        return parts.join("\n");
    }).join("\n\n");
}
function formatMcpResultsForUser(results) {
    if (!Array.isArray(results) || results.length === 0)
        return "";
    return results.map((r) => {
        const parts = [];
        parts.push(`- ${r.name}: ${r.ok ? "ok" : "error"} (exit=${r.exitCode}, timeout=${r.timedOut}, ${r.durationMs}ms)`);
        if (r.stdout)
            parts.push(`  stdout: ${truncateText(r.stdout.replace(/\s+/g, " ").trim(), 300)}`);
        if (r.stderr)
            parts.push(`  stderr: ${truncateText(r.stderr.replace(/\s+/g, " ").trim(), 240)}`);
        if (r.logPath)
            parts.push(`  log: ${r.logPath}`);
        return parts.join("\n");
    }).join("\n");
}
function registerIpcHandlers() {
    // Ensure logs table exists with a createdAt timestamp for RAG metadata filtering
    sqlite_1.default.exec(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            input TEXT,
            output TEXT,
            agent TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    // Log Cleanup: Deletes log entries based on user retention settings
    try {
        const row = sqlite_1.default.prepare("SELECT data FROM settings WHERE id = 1").get();
        const settings = row ? JSON.parse(row.data) : {};
        const days = settings.privacy?.logRetention || '30';
        const logCols = sqlite_1.default.prepare("PRAGMA table_info(logs)").all();
        const hasCreatedAt = Array.isArray(logCols) && logCols.some((c) => c?.name === "createdAt");
        const hasCreatedAtSnake = Array.isArray(logCols) && logCols.some((c) => c?.name === "created_at");
        const dateColumn = hasCreatedAt ? "createdAt" : (hasCreatedAtSnake ? "created_at" : null);
        if (!dateColumn) {
            logger.logAppEvent("WARN", "Database", "LOG_CLEANUP_SKIPPED", "Skipping log cleanup: no timestamp column (createdAt/created_at) found.");
        }
        else {
            const result = sqlite_1.default.prepare(`DELETE FROM logs WHERE ${dateColumn} < datetime('now', '-${days} days')`).run();
            if (result.changes > 0) {
                logger.logAppEvent("INFO", "Database", "LOG_CLEANUP", `Cleaned up ${result.changes} log entries older than ${days} days.`);
            }
        }
    } catch (err) {
        console.error("[Database] Log cleanup failed:", err.message);
    }

    electron_1.ipcMain.handle("ask-ai", async (event, arg1, arg2, arg3) => {
        try {
            let input, agent, modelType, tools, chatId, systemHint;
            if (typeof arg1 === "object" && arg1 !== null) {
                ({ input, agent, modelType, tools, chatId, systemHint } = arg1);
            }
            else {
                [input, agent, modelType] = [arg1, arg2, arg3];
                tools = [];
                chatId = "default";
            }
            const row = sqlite_1.default.prepare("SELECT data FROM settings WHERE id = 1").get();
            const settings = row ? JSON.parse(row.data) : {};
            const aipipeToken = settings.apiKeys?.aipipe || null;
            const incognitoMode = settings.privacy?.incognito || false;
            logger.logAppEvent("INFO", "IPC", "IPC_ASK_AI_REQUEST", `User asked AI: ${truncateText(input, 200)}`, {
                chatId,
                selectedAgent: agent || "auto",
                selectedModel: modelType || "fast",
                mcpEnabled: tools?.includes("mcp") || tools?.includes("mcp tools"),
                incognitoMode
            });

            const selectedAgent = agent || "auto";
            const selectedModel = modelType || "fast";
            const selectedTools = Array.isArray(tools)
                ? tools.map(t => String(t || "").trim().toLowerCase()).filter(Boolean)
                : [];
            const mcpEnabled = selectedTools.includes("mcp") || selectedTools.includes("mcp tools");
            const sessionId = chatId || "default";
            const session = session_1.default.getSession(sessionId);
            session_1.default.pushMessage(sessionId, "user", String(input || ""));
            const { intent } = (0, intentParser_1.parseIntent)(input);
            session.lastIntent = intent;
            if (intent === "predict") {
                let data = session.data;
                if (!data.length)
                    data = (0, dataService_1.generateData)();
                const predicted = (0, dataService_1.predictNext)(data, 10);
                const combined = [...data, ...predicted];
                session_1.default.setData(sessionId, combined);
                session_1.default.pushMessage(sessionId, "assistant", "Prediction completed.");
                return {
                    text: "Here is the prediction based on your current data trend.",
                    intent: "predict",
                    chartData: combined,
                    model: "data-service",
                    mcpResults: []
                };
            }
            if (intent === "plot") {
                const data = (0, dataService_1.generateData)();
                session_1.default.setData(sessionId, data);
                session_1.default.pushMessage(sessionId, "assistant", "Data plotted.");
                return {
                    text: "Here is your data plotted.",
                    intent: "plot",
                    chartData: data,
                    model: "data-service",
                    mcpResults: []
                };
            }
            let promptInput = String(input || "");
            if (systemHint) {
                promptInput = `System Hint: ${systemHint}\n\n${promptInput}`;
            }
            let mcpResults = [];
            if (mcpEnabled) {
                mcpResults = await executeMcpForPrompt(promptInput);
                mcpResults.forEach(r => {
                    if (r.ok)
                        session_1.default.cacheMcpResult(sessionId, r.name, r.stdout);
                });
            }
            const contextSnapshot = session_1.default.getContextSnapshot(sessionId);
            const historyContext = contextSnapshot.history.slice(-10)
                .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
                .join("\n");
            if (selectedTools.length > 0) {
                const toolLines = [];
                toolLines.push(`Active tools: ${selectedTools.join(", ")}`);
                if (mcpEnabled) {
                    const cfg = readMcpConfig();
                    const serverNames = Object.keys(cfg.mcpServers || {});
                    toolLines.push(serverNames.length > 0
                        ? `Available MCP servers: ${serverNames.join(", ")}`
                        : "Available MCP servers: none configured");
                    const allMcpTools = (0, registry_1.getAllTools)();
                    if (allMcpTools.length > 0) {
                        toolLines.push("Available MCP Tools (Callable via tool_use):");
                        allMcpTools.forEach((t) => {
                            toolLines.push(`- mcp_${t.serverName}_${t.name}: ${t.description || "No description"}`);
                        });
                    }
                    if (mcpResults.length > 0) {
                        toolLines.push(`MCP execution output:\n${formatMcpResultsForPrompt(mcpResults)}`);
                    }
                }
                toolLines.push("Tool usage guidance: Use only the selected tools when useful.");
                if (historyContext) {
                    promptInput = `Conversation History:\n${historyContext}\n\n${toolLines.join("\n")}\n\nUser request:\n${promptInput}`;
                }
                else {
                    promptInput = `${toolLines.join("\n")}\n\nUser request:\n${promptInput}`;
                }
            }
            else if (historyContext) {
                promptInput = `Conversation History:\n${historyContext}\n\nUser request:\n${promptInput}`;
            }
            let result;
            if (selectedAgent === "orchestrator") {
                const keys = settings.apiKeys || {};
                const orchProvider = settings.ai?.defaultProvider || "gemini";
                const orchModel = orchProvider === "openai" ? (keys.openai ? "gpt-4o" : "gpt-4o-mini")
                    : orchProvider === "claude" ? "claude-3-5-sonnet-20241022"
                        : "gemini-1.5-flash";
                result = await (0, orchestrator_1.orchestrate)({
                    input: String(input || ""),
                    provider: orchProvider,
                    model: orchModel,
                    sessionData: session,
                    history: contextSnapshot.history,
                    sender: event.sender,
                    aipipeToken: aipipeToken // Pass the token to orchestrator
                });
                if (result.chartData) {
                    session_1.default.setData(sessionId, result.chartData);
                }
            }
            else {
                result = (selectedAgent === "auto")
                    ? await (0, agents_1.autoAgent)(promptInput, selectedModel, event.sender, aipipeToken, "openai/gpt-5-nano", sessionId)
                    : await (0, agents_1.runAgent)(selectedAgent, promptInput, selectedModel, event.sender, aipipeToken, "openai/gpt-5-nano", sessionId);
            }
            session_1.default.pushMessage(sessionId, "assistant", result.text);
            const mcpOutputSummary = mcpEnabled ? formatMcpResultsForUser(mcpResults) : "";
            const logOutput = mcpEnabled && mcpOutputSummary
                ? `${result.text}\n\nMCP Tool Output:\n${mcpOutputSummary}`
                : result.text;
            
            // Only insert into logs if not in incognito mode
            if (!incognitoMode) {
                sqlite_1.default.prepare(`INSERT INTO logs (input, output, agent) VALUES (?, ?, ?)`)
                    .run(promptInput, logOutput, selectedAgent);
            } else {
                console.log("[Incognito Mode] Skipping log insertion.");
            }
            logger.logAppEvent("INFO", "IPC", "IPC_ASK_AI_RESPONSE", `AI responded to chat ID ${chatId}`, {
                chatId,
                selectedAgent,
                selectedModel,
                model: result.model,
                responseSummary: truncateText(result.text, 200),
                mcpResultsSummary: mcpEnabled ? truncateText(formatMcpResultsForUser(mcpResults), 200) : null
            });
            return {
                text: result.text,
                intent,
                chartData: result.chartData || (session.data.length ? session.data : null),
                steps: result.steps || null,
                mcpResults: mcpEnabled ? mcpResults : [],
                model: result.model
            };
        }
        catch (e) {
            console.error("IPC AskAI Error:", e);
            logger.logAppEvent("ERROR", "IPC", "IPC_ASK_AI_ERROR", `Error in ask-ai: ${e.message}`, {
                chatId,
                error: e.message,
                stack: e.stack
            });
            return `Error in Agent Flow: ${e.message}`;
        }
    });
    electron_1.ipcMain.handle("signup", async (_, { username, password, email }) => {
        try {
            const id = Date.now().toString();
            sqlite_1.default.prepare("INSERT INTO users (id, username, password, email) VALUES (?, ?, ?, ?)").run(id, username, password, email);
            return { ok: true, user: { id, username, email } };
        }
        catch (err) {
            return { ok: false, error: err.message };
        }
    });
    electron_1.ipcMain.handle("login", async (_, { username, password }) => {
        try {
            const user = sqlite_1.default.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, password);
            if (user) {
                return { ok: true, user: { id: user.id, username: user.username, email: user.email } };
            }
            return { ok: false, error: "Invalid credentials" };
        }
        catch (err) {
            return { ok: false, error: err.message };
        }
    });
    electron_1.ipcMain.handle("logout", async () => {
        return { ok: true };
    });
    electron_1.ipcMain.handle("check-session", async () => {
        return { ok: true }; // Stateless for now, handled by localStorage in renderer
    });
    electron_1.ipcMain.handle("get-data-key", async (_, key) => {
        if (key === "chatHistory") {
            const rows = sqlite_1.default.prepare("SELECT * FROM chats WHERE userId = ? ORDER BY updatedAt DESC").all("default");
            return rows.map(r => ({
                id: r.id,
                title: r.title,
                messages: JSON.parse(r.messages || "[]"),
                timestamp: r.updatedAt
            }));
        }
        return null;
    });
    electron_1.ipcMain.handle("save-data", async (_, { key, data }) => {
        if (key === "chatHistory") {
            try {
                const insert = sqlite_1.default.prepare("INSERT OR REPLACE INTO chats (id, userId, title, messages, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)");
                for (const chat of data) {
                    insert.run(chat.id, "default", chat.title, JSON.stringify(chat.messages));
                }
                return { ok: true };
            }
            catch (err) {
                return { ok: false, error: err.message };
            }
        }
        if (key === "settings") {
            try {
                const settings = data && typeof data === "object" ? data : {};
                sqlite_1.default.prepare("INSERT OR REPLACE INTO settings (id, data) VALUES (1, ?)").run(JSON.stringify(settings));
                return { ok: true };
            }
            catch (err) {
                return { ok: false, error: err.message };
            }
        }
        return { ok: false };
    });
    electron_1.ipcMain.handle("deleteChat", async (_, chatId) => {
        try {
            sqlite_1.default.prepare("DELETE FROM chats WHERE id = ?").run(chatId);
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err.message };
        }
    });
    electron_1.ipcMain.handle("get-settings", async () => {
        try {
            const row = sqlite_1.default.prepare("SELECT data FROM settings WHERE id = 1").get();
            return row ? JSON.parse(row.data) : {};
        }
        catch {
            return {};
        }
    });
    electron_1.ipcMain.handle("get-models", async () => {
        try {
            return require("../ai/models").default;
        } catch {
            return {};
        }
    });
    electron_1.ipcMain.handle("get-mcp-config", async () => {
        return readMcpConfig();
    });
    electron_1.ipcMain.handle("save-mcp-config", async (_, config) => {
        try {
            const saved = writeMcpConfig(config);
            startConfiguredMcpServers();
            return { ok: true, config: saved };
        }
        catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
    });
    electron_1.ipcMain.handle("get-mcp-statuses", async () => {
        return getMcpStatuses();
    });
    electron_1.ipcMain.handle("open-mcp-config-file", async () => {
        const filePath = getMcpConfigPath();
        const error = await electron_1.shell.openPath(filePath);
        return { ok: !error, error, path: filePath };
    });
    electron_1.ipcMain.handle("clear-chat-history", async (_, chatId) => {
        try {
            if (!chatId) return { ok: false, error: "No chat ID provided" };
            sqlite_1.default.prepare("UPDATE chats SET messages = '[]', updatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(chatId);
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err.message };
        }
    });
    electron_1.ipcMain.handle("clear-session", async (_, chatId) => {
        if (chatId)
            session_1.default.clearSession(chatId);
        return { ok: true };
    });
    startConfiguredMcpServers();
}
