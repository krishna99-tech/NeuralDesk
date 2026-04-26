const { ipcMain, app, shell } = require("electron");
const db = require("../db/sqlite");
const { runAgent, autoAgent } = require("../ai/agents");
const MODELS = require("../ai/models");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const McpClientWrapper = require("../mcp/client");
const { activeClients } = require("../mcp/registry");
const mcpRuntime = new Map();

function getMcpConfigPath() {
  return path.join(app.getPath("userData"), "mcp_config.json");
}

function normalizeMcpConfig(raw) {
  const cfg = raw && typeof raw === "object" ? raw : {};
  const servers = cfg.mcpServers;
  if (Array.isArray(servers)) {
    const mapped = {};
    for (const entry of servers) {
      if (!entry || typeof entry !== "object") continue;
      const name = (entry.name || "").trim();
      if (!name) continue;
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
  } else if (!servers || typeof servers !== "object") {
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
  } catch {
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
  const logDir = path.join(app.getPath("userData"), "logs", "mcp");
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
  const runtime = mcpRuntime.get(name);
  if (!runtime || !runtime.process) return;
  try {
    runtime.process.kill();
  } catch {}
}

function startMcpServer(name, server) {
  const command = String(server?.command || "").trim();
  const args = Array.isArray(server?.args) ? server.args : [];
  const env = server?.env && typeof server.env === "object" ? server.env : {};
  if (!name || !command) return;

  const existing = mcpRuntime.get(name);
  if (existing?.process && !existing.process.killed) return;

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

    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        ...env
      }
    });
    runtime.process = child;
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
    });

    child.on("close", (code) => {
      runtime.lastExitCode = code;
      runtime.status = code === 0 ? "stopped" : "error";
      activeClients.delete(name);
      logStream.write(`[${new Date().toISOString()}] closed exitCode=${code}\n`);
      logStream.end();
    });

    // Initialize persistent client for tool access
    const mcpClient = new McpClientWrapper(name, command, args, env);
    mcpClient.connect().then(ok => {
      if (ok) activeClients.set(name, mcpClient);
    });

  } catch (err) {
    runtime.status = "error";
    runtime.lastError = String(err?.message || "Failed to spawn MCP server.");
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

function truncateText(value, maxLen = 6000) {
  const text = String(value || "");
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n...[truncated ${text.length - maxLen} chars]`;
}

function pickMcpServers(prompt, serverNames) {
  const all = Array.isArray(serverNames) ? serverNames : [];
  if (all.length === 0) return [];
  const query = String(prompt || "").toLowerCase();
  const explicit = all.filter((name) => query.includes(name.toLowerCase()));
  return explicit.length > 0 ? explicit : all.slice(0, 3);
}

function executeMcpServer({ name, command, args, env, prompt, timeoutMs = 45000 }) {
  return new Promise((resolve) => {
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

    const processedArgs = (Array.isArray(args) ? args : []).map(arg => 
      String(arg)
        .replace(/{{query}}/g, String(prompt || ""))
        .replace(/{{prompt}}/g, String(prompt || ""))
    );

    const child = spawn(command, processedArgs, {
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
      if (done) return;
      done = true;
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
      } catch {}
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      logStream.write(`[stdout] ${text}`);
      if (stdout.length > maxBuffer) stdout = stdout.slice(0, maxBuffer);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      logStream.write(`[stderr] ${text}`);
      if (stderr.length > maxBuffer) stderr = stderr.slice(0, maxBuffer);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
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

async function executeMcpForPrompt(prompt) {
  const config = readMcpConfig();
  const names = Object.keys(config.mcpServers || {});
  const targets = pickMcpServers(prompt, names);
  if (targets.length === 0) return [];

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
  if (!Array.isArray(results) || results.length === 0) return "No MCP results.";
  return results.map((r) => {
    const parts = [];
    parts.push(`[MCP ${r.name}] status=${r.ok ? "ok" : "error"} exit=${r.exitCode} timeout=${r.timedOut}`);
    if (r.stdout) parts.push(`stdout:\n${r.stdout}`);
    if (r.stderr) parts.push(`stderr:\n${r.stderr}`);
    return parts.join("\n");
  }).join("\n\n");
}

function formatMcpResultsForUser(results) {
  if (!Array.isArray(results) || results.length === 0) return "";
  return results.map((r) => {
    const parts = [];
    parts.push(`- ${r.name}: ${r.ok ? "ok" : "error"} (exit=${r.exitCode}, timeout=${r.timedOut}, ${r.durationMs}ms)`);
    if (r.stdout) parts.push(`  stdout: ${truncateText(r.stdout.replace(/\s+/g, " ").trim(), 300)}`);
    if (r.stderr) parts.push(`  stderr: ${truncateText(r.stderr.replace(/\s+/g, " ").trim(), 240)}`);
    if (r.logPath) parts.push(`  log: ${r.logPath}`);
    return parts.join("\n");
  }).join("\n");
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

// ===== AGENT HANDLERS =====
ipcMain.handle("ask-ai", async (event, arg1, arg2, arg3) => {
  try {
    // Resilience logic: Handle both object payload or separate args
    let input, agent, modelType, tools;
    if (typeof arg1 === "object" && arg1 !== null) {
      ({ input, agent, modelType, tools } = arg1);
    } else {
      [input, agent, modelType] = [arg1, arg2, arg3];
      tools = [];
    }

    // Default values if missing
    const selectedAgent = agent || "auto";
    const selectedModel = modelType || "fast";
    const selectedTools = Array.isArray(tools)
      ? tools.map(t => String(t || "").trim()).filter(Boolean)
      : [];
    const mcpEnabled = selectedTools.includes("mcp");

    let promptInput = String(input || "");
    let mcpResults = [];
    if (mcpEnabled) {
      mcpResults = await executeMcpForPrompt(promptInput);
    }

    if (selectedTools.length > 0) {
      const toolLines = [];
      toolLines.push(`Active tools: ${selectedTools.join(", ")}`);

        if (mcpEnabled) {
          const cfg = readMcpConfig();
          const serverNames = Object.keys(cfg.mcpServers || {});
          toolLines.push(
            serverNames.length > 0
              ? `Available MCP servers: ${serverNames.join(", ")}`
              : "Available MCP servers: none configured"
          );
          
          const mcpRegistry = require("../mcp/registry");
          const allMcpTools = mcpRegistry.getAllTools();
          if (allMcpTools.length > 0) {
            toolLines.push("Available MCP Tools (Callable via tool_use):");
            allMcpTools.forEach(t => {
              toolLines.push(`- mcp_${t.serverName}_${t.name}: ${t.description || "No description"}`);
            });
          }

          if (mcpResults.length > 0) {
            toolLines.push(`MCP execution output:\n${formatMcpResultsForPrompt(mcpResults)}`);
          } else {
            toolLines.push("MCP execution output: no servers executed.");
          }
        }

      toolLines.push(
        "Tool usage guidance: Use only the selected tools when useful. If selected tools cannot directly execute in this app, still answer helpfully and clearly explain assumptions."
      );
      promptInput = `${toolLines.join("\n")}\n\nUser request:\n${promptInput}`;
    }

    const result = (selectedAgent === "auto")
      ? await autoAgent(promptInput, selectedModel)
      : await runAgent(selectedAgent, promptInput, selectedModel);

    const mcpOutputSummary = mcpEnabled ? formatMcpResultsForUser(mcpResults) : "";
    // Format text summary for internal logs
    const logOutput = mcpEnabled && mcpOutputSummary 
      ? `${result.text}\n\nMCP Tool Output:\n${mcpOutputSummary}` 
      : result.text;

    db.prepare(`
      INSERT INTO logs (input, output, agent)
      VALUES (?, ?, ?)
    `).run(promptInput, logOutput, selectedAgent);

    return {
      text: result.text,
      mcpResults: mcpEnabled ? mcpResults : [],
      model: result.model
    };
  } catch (e) {
    console.error("IPC AskAI Error:", e);
    return `Error in Agent Flow: ${e.message}`;
  }
});

ipcMain.handle("get-models", async () => {
  return MODELS;
});

ipcMain.handle("get-data", async () => {
  return db.prepare("SELECT * FROM logs ORDER BY id DESC LIMIT 20").all();
});

// ===== AUTH HANDLERS =====
ipcMain.handle("signup", async (_, { username, password, email }) => {
  try {
    const id = "u_" + Date.now();
    db.prepare("INSERT INTO users (id, username, password, email) VALUES (?, ?, ?, ?)").run(id, username, password, email);
    return { ok: true, user: { id, username, email } };
  } catch (e) {
    return { ok: false, error: e.message.includes("UNIQUE") ? "Username already exists" : e.message };
  }
});

ipcMain.handle("login", async (_, { username, password }) => {
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, password);
  if (!user) return { ok: false, error: "Invalid username or password" };
  return { ok: true, user: { id: user.id, username: user.username, email: user.email } };
});

// ===== SETTINGS HANDLERS =====
ipcMain.handle("get-app-settings", async () => {
  const row = db.prepare("SELECT data FROM settings WHERE id = 1").get();
  return row ? JSON.parse(row.data) : {};
});

ipcMain.handle("save-app-settings", async (_, newSettings) => {
  const exists = db.prepare("SELECT 1 FROM settings WHERE id = 1").get();
  if (exists) {
    db.prepare("UPDATE settings SET data = ? WHERE id = 1").run(JSON.stringify(newSettings));
  } else {
    db.prepare("INSERT INTO settings (id, data) VALUES (1, ?)").run(JSON.stringify(newSettings));
  }
  return newSettings;
});

// ===== CHAT HANDLERS =====
ipcMain.handle("get-user-chats", async (_, userId) => {
  const rows = db.prepare("SELECT * FROM chats WHERE userId = ? ORDER BY updatedAt DESC").all(userId);
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    messages: JSON.parse(r.messages),
    timestamp: r.updatedAt
  }));
});

ipcMain.handle("save-user-chats", async (_, { userId, chats }) => {
  const upsert = db.prepare(`
    INSERT INTO chats (id, userId, title, messages, updatedAt)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      messages = excluded.messages,
      updatedAt = CURRENT_TIMESTAMP
  `);

  const transaction = db.transaction((userChats) => {
    for (const chat of userChats) {
      upsert.run(chat.id, userId, chat.title, JSON.stringify(chat.messages));
    }

    const ids = userChats.map(c => c.id).filter(Boolean);
    if (ids.length === 0) {
      db.prepare("DELETE FROM chats WHERE userId = ?").run(userId);
    } else {
      const placeholders = ids.map(() => "?").join(", ");
      db.prepare(`DELETE FROM chats WHERE userId = ? AND id NOT IN (${placeholders})`)
        .run(userId, ...ids);
    }
  });

  transaction(chats);
  return { ok: true };
});

// ===== MEMORY HANDLERS =====
ipcMain.handle("db:find", async (_, { collection, query }) => {
  if (collection === "memory") {
    return db.prepare("SELECT * FROM memories WHERE userId = ?").all(query.userId);
  }
  return [];
});

// ===== UTILS =====
ipcMain.handle("open-mcp-config", async () => {
  const configPath = getMcpConfigPath();
  if (!fs.existsSync(configPath)) writeMcpConfig({ mcpServers: {} });
  await shell.openPath(configPath);
  return configPath;
});

ipcMain.handle("get-mcp-config", async () => {
  return readMcpConfig();
});

ipcMain.handle("get-mcp-statuses", async () => {
  return getMcpStatuses();
});

ipcMain.handle("start-mcp-servers", async () => {
  startConfiguredMcpServers();
  return getMcpStatuses();
});

ipcMain.handle("add-mcp-server", async (_, server) => {
  const name = (server?.name || "").trim();
  const command = (server?.command || "").trim();
  if (!name) throw new Error("MCP server name is required.");
  if (!command) throw new Error("MCP command is required.");

  const config = readMcpConfig();
  const existing = config.mcpServers[name] || {};
  config.mcpServers[name] = {
    ...existing,
    command,
    args: Array.isArray(server?.args)
      ? server.args.map(v => String(v).trim()).filter(Boolean)
      : [],
    env: server?.env && typeof server.env === "object" ? server.env : {},
    chatCommand: String(server?.chatCommand || "").trim(),
    chatArgs: Array.isArray(server?.chatArgs)
      ? server.chatArgs.map(v => String(v).trim()).filter(Boolean)
      : []
  };
  const saved = writeMcpConfig(config);
  startMcpServer(name, saved.mcpServers[name]);
  return saved;
});

ipcMain.handle("remove-mcp-server", async (_, name) => {
  const key = String(name || "").trim();
  if (!key) throw new Error("MCP server name is required.");
  const config = readMcpConfig();
  stopMcpServer(key);
  mcpRuntime.delete(key);
  delete config.mcpServers[key];
  return writeMcpConfig(config);
});

startConfiguredMcpServers();
