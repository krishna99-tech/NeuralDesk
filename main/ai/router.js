const openai = require("./openai");
const claude = require("./claude");
const gemini = require("./gemini");
const ollama = require("./ollama");
const db = require("../db/sqlite");

async function callAI({ provider, model, prompt }) {
  // Fetch real-time settings from DB
  const row = db.prepare("SELECT data FROM settings WHERE id = 1").get();
  const settings = row ? JSON.parse(row.data) : {};
  const keys = settings.apiKeys || {};
  const endpoints = settings.endpoints || {};

  if (provider === "openai") {
    return openai({ model, prompt, apiKey: keys.openai, baseUrl: endpoints.openaiCompatibleBaseUrl });
  }
  if (provider === "claude") {
    return claude({ model, prompt, apiKey: keys.anthropic });
  }
  if (provider === "gemini") {
    return gemini({ model, prompt, apiKey: keys.gemini });
  }
  if (provider === "ollama") {
    return ollama({ model, prompt, baseUrl: endpoints.ollamaBaseUrl });
  }

  throw new Error(`Invalid provider: ${provider}`);
}

module.exports = callAI;
