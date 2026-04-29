/**
 * Shared frontend runtime "types" for NeuralDesk (JS + JSDoc).
 * This keeps message/event payloads consistent across renderer modules.
 */

/** @typedef {"user"|"assistant"|"system"} ChatRole */
/** @typedef {"fast"|"smart"|"latest"} ModelTier */
/** @typedef {"idle"|"running"|"ok"|"error"|"stopped"} UsageStatus */

/**
 * @typedef {Object} ChatMessage
 * @property {ChatRole} role
 * @property {string} content
 */

/**
 * @typedef {Object} ChatRecord
 * @property {string} id
 * @property {string} title
 * @property {string} timestamp
 * @property {ChatMessage[]} messages
 */

/**
 * @typedef {Object} AskAIRequest
 * @property {string} input
 * @property {string} chatId
 * @property {string} [agent]
 * @property {ModelTier} [modelType]
 * @property {string[]} [tools]
 * @property {string} [systemHint]
 * @property {Object} [options]
 * @property {string|null} [aipipeToken]
 */

/**
 * @typedef {Object} AskAIResponse
 * @property {string} text
 * @property {string} [intent]
 * @property {Array<Object|number>|null} [chartData]
 * @property {Array<Object>|null} [steps]
 * @property {Array<Object>} [mcpResults]
 * @property {string} [model]
 */

/** @typedef {"start"|"token"|"done"} AIStreamEventType */

/**
 * @typedef {Object} AIStreamEvent
 * @property {AIStreamEventType} type
 * @property {string} chatId
 * @property {string} [token]
 */

/** @typedef {"planning"|"plan_ready"|"step_start"|"step_done"|"step_error"|"step_skip"|"chart_ready"|"synthesizing"|"done"} ToolEventType */

/**
 * @typedef {Object} ToolEvent
 * @property {ToolEventType} type
 * @property {number} [index]
 * @property {string} [tool]
 * @property {string} [reason]
 * @property {string} [summary]
 * @property {string} [error]
 * @property {string} [message]
 * @property {Array<Object>} [steps]
 * @property {Array<Object|number>} [data]
 */

/**
 * @typedef {Object} UsageMetrics
 * @property {UsageStatus} status
 * @property {number} tools
 * @property {string} model
 * @property {number} latencyMs
 * @property {number} turns
 */

export const ROLES = Object.freeze({
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
});

export const MODEL_TIERS = Object.freeze({
  FAST: "fast",
  SMART: "smart",
  LATEST: "latest",
});

export const USAGE_STATUS = Object.freeze({
  IDLE: "idle",
  RUNNING: "running",
  OK: "ok",
  ERROR: "error",
  STOPPED: "stopped",
});

export const AI_STREAM_EVENT = Object.freeze({
  START: "start",
  TOKEN: "token",
  DONE: "done",
});

export const TOOL_EVENT = Object.freeze({
  PLANNING: "planning",
  PLAN_READY: "plan_ready",
  STEP_START: "step_start",
  STEP_DONE: "step_done",
  STEP_ERROR: "step_error",
  STEP_SKIP: "step_skip",
  CHART_READY: "chart_ready",
  SYNTHESIZING: "synthesizing",
  DONE: "done",
});

/** @returns {UsageMetrics} */
export function createDefaultUsageMetrics() {
  return {
    status: USAGE_STATUS.IDLE,
    tools: 0,
    model: "n/a",
    latencyMs: 0,
    turns: 0,
  };
}

/** @param {unknown} value @returns {value is AIStreamEvent} */
export function isAIStreamEvent(value) {
  if (!value || typeof value !== "object") return false;
  const v = /** @type {any} */ (value);
  return typeof v.type === "string" && typeof v.chatId === "string";
}

/** @param {unknown} value @returns {value is ToolEvent} */
export function isToolEvent(value) {
  if (!value || typeof value !== "object") return false;
  const v = /** @type {any} */ (value);
  return typeof v.type === "string";
}
