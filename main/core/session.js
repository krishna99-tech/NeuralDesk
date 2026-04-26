/**
 * NeuralDesk Core Session Store
 * Stateful session management for chat, data, and predictions.
 * Maps to the blueprint's core/session.ts — integrated as a JS module.
 */

const db = require("../db/sqlite");

class SessionStore {
  constructor() {
    this._sessions = new Map(); // chatId → session
  }

  /**
   * Get or create a session for a chat ID
   */
  getSession(chatId) {
    if (!this._sessions.has(chatId)) {
      this._sessions.set(chatId, {
        chatId,
        history: [],        // { role, content }[]
        data: [],           // { time, value }[] — time-series data
        lastIntent: "",     // "predict" | "plot" | "query" | "text"
        lastModel: "",
        mcpContext: {},     // cached tool results keyed by tool name
        createdAt: Date.now()
      });
    }
    return this._sessions.get(chatId);
  }

  /**
   * Append a message to a session's history
   */
  pushMessage(chatId, role, content) {
    const session = this.getSession(chatId);
    session.history.push({ role, content });
    // Keep the last 50 messages in memory to bound context length
    if (session.history.length > 50) {
      session.history = session.history.slice(-50);
    }
  }

  /**
   * Update the time-series data for a session
   */
  setData(chatId, data) {
    const session = this.getSession(chatId);
    session.data = data;
  }

  /**
   * Merge a key-value pair into the session's MCP context cache
   */
  cacheMcpResult(chatId, toolName, result) {
    const session = this.getSession(chatId);
    session.mcpContext[toolName] = result;
  }

  /**
   * Get a serializable snapshot of the session for the AI prompt
   */
  getContextSnapshot(chatId) {
    const session = this.getSession(chatId);
    return {
      history: session.history,
      data: session.data,
      lastIntent: session.lastIntent,
      mcpContext: session.mcpContext
    };
  }

  /**
   * Clear session data
   */
  clearSession(chatId) {
    this._sessions.delete(chatId);
  }
}

module.exports = new SessionStore();
