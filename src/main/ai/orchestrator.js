"use strict";
/**
 * NeuralDesk Advanced Orchestrator
 * A production-grade, multi-step planning agent with real-time tool-event emission.
 */
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
exports.setSender = setSender;
exports.orchestrate = orchestrate;
const router_1 = __importDefault(require("./router"));
const mcpRegistry = __importStar(require("../mcp/registry"));
const dataService_1 = require("../services/dataService");
// ─── Tool Event Emitter ──────────────────────────────────────────────────────
let _sender = null;
function setSender(sender) { _sender = sender; }
function emitToolEvent(event) {
    if (_sender && !_sender.isDestroyed()) {
        _sender.send("tool-event", event);
    }
}
// ─── Built-in Orchestrator Tools ─────────────────────────────────────────────
function getBuiltInTools() {
    return [
        {
            name: "generate_data",
            description: "Generate synthetic time-series data for analysis or demonstration",
            parameters: {
                type: "object",
                properties: {
                    points: { type: "number", description: "Number of data points (default 10)" }
                }
            },
            execute: async ({ points = 10 }) => {
                const data = (0, dataService_1.generateData)(points);
                return { data, summary: `Generated ${data.length} data points` };
            }
        },
        {
            name: "predict_trend",
            description: "Predict future values from existing time-series data using linear regression",
            parameters: {
                type: "object",
                properties: {
                    steps: { type: "number", description: "How many future steps to predict" }
                }
            },
            execute: async ({ steps = 10 }, sessionData) => {
                const base = sessionData?.data?.length ? sessionData.data : (0, dataService_1.generateData)();
                const predictions = (0, dataService_1.predictNext)(base, steps);
                return { data: [...base, ...predictions], predicted: predictions, summary: `Predicted ${steps} future steps` };
            }
        },
        {
            name: "run_code",
            description: "Execute a safe JavaScript expression and return the result",
            parameters: {
                type: "object",
                properties: {
                    expression: { type: "string", description: "A safe JS expression to evaluate" }
                },
                required: ["expression"]
            },
            execute: async ({ expression }) => {
                try {
                    // eslint-disable-next-line no-new-func
                    const fn = new Function(`"use strict"; return (${expression})`);
                    const result = fn();
                    return { result: String(result), summary: `Evaluated: ${expression} → ${result}` };
                }
                catch (err) {
                    return { error: err.message, summary: `Code execution failed: ${err.message}` };
                }
            }
        }
    ];
}
// ─── Merge MCP + Built-in tools ──────────────────────────────────────────────
function getAllTools() {
    const mcpTools = mcpRegistry.getAllTools().map(t => ({
        name: `mcp_${t.serverName}_${t.name}`,
        description: `[MCP:${t.serverName}] ${t.description || "MCP tool"}`,
        parameters: sanitizeSchemaForPlanning(t.inputSchema || { type: "object", properties: {} }),
        execute: async (args) => {
            const result = await mcpRegistry.callTool(t.serverName, t.name, args);
            const text = Array.isArray(result.content)
                ? result.content.map((c) => c.text || JSON.stringify(c)).join("\n")
                : JSON.stringify(result.content);
            return { summary: text, raw: result.content, data: result.content };
        }
    }));
    return [...getBuiltInTools(), ...mcpTools];
}
function sanitizeSchemaForPlanning(schema) {
    if (!schema || typeof schema !== "object")
        return schema;
    const res = Array.isArray(schema) ? [] : {};
    for (const key in schema) {
        if (key === "additionalProperties")
            continue;
        const val = schema[key];
        res[key] = (typeof val === "object" && val !== null) ? sanitizeSchemaForPlanning(val) : val;
    }
    return res;
}
// ─── Planning Prompt ─────────────────────────────────────────────────────────
function buildPlanningPrompt(userQuery, tools, history) {
    const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join("\n");
    const historyText = history.slice(-6)
        .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");
    return `You are an advanced AI orchestrator. Your job is to plan a sequence of tool calls to best answer the user.

Available tools:
${toolList}

Conversation history:
${historyText || "(none)"}

User request: ${userQuery}

Respond ONLY with a JSON array of steps. Each step: { "tool": "<tool_name>", "args": {}, "reason": "<why>" }.
For simple text queries, return: [{ "tool": "none", "args": {}, "reason": "Direct answer" }]
Do not add any text outside the JSON array.`;
}
// ─── Synthesis Prompt ─────────────────────────────────────────────────────────
function buildSynthesisPrompt(userQuery, steps, history) {
    const resultsText = steps.map((s, i) => `Step ${i + 1} [${s.tool}]: ${JSON.stringify(s.result?.summary || s.result || s.error || "")}`).join("\n");
    const historyText = history.slice(-6)
        .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");
    return `You are NeuralDesk AI. Synthesize a final answer using the tool results below.

PRESENTATION RULES:
- Format tabular data as Markdown Tables.
- Mention key numbers and insights clearly.
- Be concise but thorough.

Conversation history:
${historyText || "(none)"}

User request: ${userQuery}

Tool Results:
${resultsText}

Provide a comprehensive, well-formatted final answer.`;
}
// ─── Main Orchestrate Function ─────────────────────────────────────────────────
async function orchestrate({ input, provider, model, sessionData, history, sender }) {
    if (sender)
        setSender(sender);
    const tools = getAllTools();
    emitToolEvent({ type: "planning", message: "Analyzing your request and planning steps..." });
    // ── PHASE 1: PLAN ──
    let plan = [];
    try {
        const planResponse = await (0, router_1.default)({
            provider,
            model,
            prompt: buildPlanningPrompt(input, tools, history || [])
        });
        const raw = planResponse.text.trim();
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            plan = JSON.parse(jsonMatch[0]);
        }
        else {
            plan = [{ tool: "none", args: {}, reason: "Direct answer" }];
        }
    }
    catch (err) {
        console.warn("[Orchestrator] Planning failed:", err.message);
        plan = [{ tool: "none", args: {}, reason: "Planning unavailable, direct answer" }];
    }
    emitToolEvent({ type: "plan_ready", steps: plan.map((s) => ({ tool: s.tool, reason: s.reason })) });
    // ── PHASE 2: EXECUTE ──
    const executedSteps = [];
    let chartData = null;
    for (let i = 0; i < plan.length; i++) {
        const step = plan[i];
        if (step.tool === "none") {
            emitToolEvent({ type: "step_skip", index: i, reason: step.reason });
            break;
        }
        const tool = tools.find(t => t.name === step.tool);
        if (!tool) {
            emitToolEvent({ type: "step_error", index: i, tool: step.tool, error: "Tool not found" });
            executedSteps.push({ ...step, error: `Tool not found: ${step.tool}` });
            continue;
        }
        emitToolEvent({ type: "step_start", index: i, tool: step.tool, args: step.args, reason: step.reason });
        try {
            const result = await tool.execute(step.args || {}, sessionData);
            // Check if result has chart data
            if (result.data) {
                chartData = result.data;
                emitToolEvent({ type: "chart_ready", data: chartData });
            }
            emitToolEvent({ type: "step_done", index: i, tool: step.tool, summary: result.summary || JSON.stringify(result).slice(0, 200) });
            executedSteps.push({ ...step, result });
        }
        catch (err) {
            emitToolEvent({ type: "step_error", index: i, tool: step.tool, error: err.message });
            executedSteps.push({ ...step, error: err.message });
        }
    }
    // ── PHASE 3: SYNTHESIZE ──
    emitToolEvent({ type: "synthesizing", message: "Composing final answer..." });
    let finalText = "";
    try {
        const hasRealResults = executedSteps.some(s => s.result && !s.error);
        const synthesisPrompt = hasRealResults
            ? buildSynthesisPrompt(input, executedSteps, history || [])
            : input;
        const synthResponse = await (0, router_1.default)({ provider, model, prompt: synthesisPrompt });
        finalText = synthResponse.text;
    }
    catch (err) {
        finalText = `I planned ${executedSteps.length} steps but encountered an error during synthesis: ${err.message}`;
    }
    emitToolEvent({ type: "done", message: "Orchestration complete." });
    return {
        text: finalText,
        chartData,
        steps: executedSteps,
        model
    };
}
