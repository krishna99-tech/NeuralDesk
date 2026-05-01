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
const connectionManager_1 = require("../mcp/services/connectionManager");
const vault = require("../security/vault");
const session_1 = __importDefault(require("../core/session"));
const intentParser_1 = require("../core/intentParser");
const dataService_1 = require("../services/dataService");
const mcpRuntime = new Map();
const logger = require("../logger");
const mcpConnectionManager = new connectionManager_1.McpConnectionManager({
    startServer: (name, server) => startMcpServer(name, server),
    stopServer: (name) => stopMcpServer(name),
    getStatuses: () => getMcpStatuses()
});
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
                chatTimeoutMs: Number(entry.chatTimeoutMs) > 0 ? Number(entry.chatTimeoutMs) : undefined,
                credentialRef: entry.credentialRef || ""
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
    const credentialRef = String(server?.credentialRef || "").trim();
    const credentialSecret = credentialRef ? vault.getSecret(credentialRef) : "";
    const envWithCredential = credentialSecret
        ? { ...env, MCP_CREDENTIAL: credentialSecret }
        : env;
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
                ...envWithCredential
            }
        });
        runtime.process = child;
        logger.logAppEvent("INFO", "MCP", "MCP_SERVER_SPAWNED", `MCP server spawned: ${name}`, { pid: child.pid, serverName: name, startupLog: startupLogPath });
        runtime.status = "running";
        logStream.write(`[${new Date().toISOString()}] process spawned pid=${child.pid}\n`);
        child.stdout.on("data", (chunk) => {
            logStream.write(`[stdout] ${chunk.toString()}`);
        });
        child.stderr.on("data", (chunk) => {
            logStream.write(`[stderr] ${chunk.toString()}`);
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
        const mcpClient = new client_1.default(name, command, args, envWithCredential);
        mcpClient.connect().then(ok => {
            if (ok)
                registry_1.activeClients.set(name, mcpClient);
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
    mcpConnectionManager.startHealthMonitor(() => readMcpConfig(), 15000);
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
    return async (event, ...args) => {
        try {
            return await handlerFn(event, ...args);
        } catch (err) {
            logger.logAppEvent("ERROR", "IPC", `IPC_HANDLER_ERROR_${name.toUpperCase()}`, `Unhandled error in IPC handler '${name}': ${err.message}`, { handler: name, error: err.message, stack: err.stack });
            return { ok: false, error: err.message };
        }
    };
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
    const credentialRef = String(server?.credentialRef || "").trim();
    const credentialSecret = credentialRef ? vault.getSecret(credentialRef) : "";
    const startupEnvWithCredential = credentialSecret
        ? { ...startupEnv, MCP_CREDENTIAL: credentialSecret }
        : startupEnv;
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
            env: { ...startupEnvWithCredential, ...chatEnv },
            timeoutMs: chatTimeout
        };
    }
    return {
        mode: "server",
        name,
        command: startupCommand,
        args: startupArgs,
        env: startupEnvWithCredential,
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
function persistToolCalls(sessionId, input, results) {
    if (!Array.isArray(results) || results.length === 0)
        return;
    const insert = sqlite_1.default.prepare(`
        INSERT INTO tool_calls (sessionId, serverName, toolName, input, output, ok, latencyMs)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of results) {
        const output = [r.stdout || "", r.stderr || ""].filter(Boolean).join("\n\n").slice(0, 12000);
        insert.run(sessionId, r.name || "unknown", r.name || "mcp_tool", String(input || ""), output, r.ok ? 1 : 0, Number(r.durationMs || 0));
    }
}
function isGreetingInput(raw) {
    const text = String(raw || "").trim().toLowerCase();
    return /^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening|hola)\b[!.?]*$/.test(text);
}
function launchOAuthFlow(payload) {
    return new Promise((resolve) => {
        const authUrl = String(payload?.authUrl || "").trim();
        const redirectUri = String(payload?.redirectUri || "").trim();
        if (!authUrl || !redirectUri) {
            resolve({ ok: false, error: "authUrl and redirectUri are required" });
            return;
        }
        const parent = electron_1.BrowserWindow.getFocusedWindow() || null;
        const win = new electron_1.BrowserWindow({
            width: 980,
            height: 760,
            parent,
            modal: !!parent,
            autoHideMenuBar: true,
            webPreferences: {
                contextIsolation: true,
                sandbox: true
            }
        });
        let settled = false;
        const done = (result) => {
            if (settled)
                return;
            settled = true;
            try {
                if (!win.isDestroyed())
                    win.close();
            }
            catch { }
            resolve(result);
        };
        const handleUrl = (url) => {
            if (!url || !url.startsWith(redirectUri))
                return false;
            try {
                const u = new URL(url);
                const code = u.searchParams.get("code");
                const error = u.searchParams.get("error");
                if (error) {
                    done({ ok: false, error, url });
                }
                else {
                    done({ ok: !!code, code, url });
                }
            }
            catch (err) {
                done({ ok: false, error: err?.message || "Invalid redirect URL" });
            }
            return true;
        };
        win.webContents.on("will-redirect", (event, url) => {
            if (handleUrl(url))
                event.preventDefault();
        });
        win.webContents.on("will-navigate", (event, url) => {
            if (handleUrl(url))
                event.preventDefault();
        });
        win.on("closed", () => {
            if (!settled) {
                done({ ok: false, error: "OAuth window closed before completion" });
            }
        });
        win.loadURL(authUrl);
    });
}
function registerIpcHandlers() {
    sqlite_1.default.exec(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            input TEXT,
            output TEXT,
            agent TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
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
        let chatId = "default";
        try {
            let input, agent, modelType, tools, systemHint;
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
            const rawTools = Array.isArray(tools) ? tools : [];
            const normalizedTools = rawTools
                .map(t => String(t || "").trim().toLowerCase())
                .filter(Boolean);
            const mcpEnabledFromTools = normalizedTools.some(t => t === "mcp" || t === "mcp tools" || t === "mcp_tools" || t.includes("mcp"));
            logger.logAppEvent("INFO", "IPC", "IPC_ASK_AI_REQUEST", `User asked AI: ${truncateText(input, 200)}`, {
                chatId,
                selectedAgent: agent || "auto",
                selectedModel: modelType || "fast",
                mcpEnabled: mcpEnabledFromTools,
                incognitoMode
            });

            const selectedAgent = agent || "auto";
            const selectedModel = modelType || "fast";
            const selectedTools = normalizedTools;
            const mcpEnabled = mcpEnabledFromTools;
            const sessionId = chatId || "default";
            const session = session_1.default.getSession(sessionId);
            const userInput = String(input || "");
            session_1.default.pushMessage(sessionId, "user", userInput);
            if (isGreetingInput(userInput)) {
                const greetingText = "Hi there! How can I help?";
                session_1.default.pushMessage(sessionId, "assistant", greetingText);
                return {
                    text: greetingText,
                    intent: "greeting",
                    chartData: session.data.length ? session.data : null,
                    model: selectedModel,
                    mcpResults: []
                };
            }
            const { intent } = (0, intentParser_1.parseIntent)(userInput);
            session.lastIntent = intent;
            if (intent === "predict" && !mcpEnabled) {
                const data = Array.isArray(session.data) ? session.data : [];
                if (data.length) {
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
            }
            if (intent === "plot" && !mcpEnabled) {
                const data = Array.isArray(session.data) ? session.data : [];
                if (data.length) {
                    session_1.default.pushMessage(sessionId, "assistant", "Data plotted.");
                    return {
                        text: "Here is your data plotted.",
                        intent: "plot",
                        chartData: data,
                        model: "data-service",
                        mcpResults: []
                    };
                }
            }
            const promptInput = userInput;
            let mcpResults = [];
            if (mcpEnabled) {
                mcpResults = await executeMcpForPrompt(promptInput);
                mcpResults.forEach(r => {
                    if (r.ok)
                        session_1.default.cacheMcpResult(sessionId, r.name, r.stdout);
                });
            }
            let result;
            if (selectedAgent === "orchestrator") {
                const contextSnapshot = session_1.default.getContextSnapshot(sessionId);
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
                    aipipeToken: aipipeToken
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
            if (mcpEnabled && mcpResults.length > 0) {
                persistToolCalls(sessionId, userInput, mcpResults);
            }
            const logOutput = mcpEnabled && mcpOutputSummary
                ? `${result.text}\n\nMCP Tool Output:\n${mcpOutputSummary}`
                : result.text;
            
            if (!incognitoMode) {
                sqlite_1.default.prepare(`INSERT INTO logs (input, output, agent) VALUES (?, ?, ?)`)
                    .run(userInput, logOutput, selectedAgent);
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
                chartData: result.chartData || ((intent === "plot" || intent === "predict") && session.data.length ? session.data : null),
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
        return { ok: true };
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
    electron_1.ipcMain.handle("vault-set-secret", async (_, { name, value }) => {
        return vault.setSecret(name, value);
    });
    electron_1.ipcMain.handle("vault-get-secret", async (_, name) => {
        return { ok: true, value: vault.getSecret(name) };
    });
    electron_1.ipcMain.handle("vault-delete-secret", async (_, name) => {
        return vault.deleteSecret(name);
    });
    electron_1.ipcMain.handle("vault-list-meta", async () => {
        return { ok: true, items: vault.listSecretMetadata() };
    });
    electron_1.ipcMain.handle("oauth-launch", async (_, payload) => {
        return await launchOAuthFlow(payload || {});
    });
    electron_1.ipcMain.handle("get-tool-calls", async (_, limit = 100) => {
        try {
            const capped = Math.min(Math.max(Number(limit) || 100, 1), 500);
            const rows = sqlite_1.default.prepare(`
                SELECT id, sessionId, serverName, toolName, input, output, ok, latencyMs, createdAt
                FROM tool_calls
                ORDER BY id DESC
                LIMIT ?
            `).all(capped);
            return rows;
        }
        catch (err) {
            return [];
        }
    });
    electron_1.ipcMain.handle("export-tool-calls", async () => {
        try {
            const rows = sqlite_1.default.prepare(`
                SELECT id, sessionId, serverName, toolName, input, output, ok, latencyMs, createdAt
                FROM tool_calls
                ORDER BY id DESC
                LIMIT 5000
            `).all();
            const defaultName = `tool-calls-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
            const save = await electron_1.dialog.showSaveDialog({
                title: "Export Tool Calls",
                defaultPath: defaultName,
                filters: [{ name: "JSON", extensions: ["json"] }]
            });
            if (save.canceled || !save.filePath) {
                return { ok: false, canceled: true };
            }
            fs.writeFileSync(save.filePath, JSON.stringify(rows, null, 2), "utf8");
            return { ok: true, path: save.filePath, count: rows.length };
        }
        catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
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
