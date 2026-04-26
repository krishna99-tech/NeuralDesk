const openai = require("./openai");
const claude = require("./claude");
const gemini = require("./gemini");
const ollama = require("./ollama");
const deepseek = require("./deepseek");
const db = require("../db/sqlite");

async function callAI({ provider, model, prompt, type, tools }) {
  // Fetch real-time settings from DB
  const row = db.prepare("SELECT data FROM settings WHERE id = 1").get();
  const settings = row ? JSON.parse(row.data) : {};
  const keys = settings.apiKeys || {};
  const endpoints = settings.endpoints || {};
  const aiParams = settings.ai || {};
  
  // Use global defaults if not provided
  const temperature = aiParams.temperature ?? 0.7;
  const maxTokens = aiParams.maxTokens ?? 2048;
  const systemPrompt = settings.systemPrompt || "";

  const options = { 
    model, 
    prompt, 
    temperature, 
    maxTokens, 
    systemPrompt,
    tools 
  };

  if (provider === "openai") {
    return openai({ ...options, apiKey: keys.openai, baseUrl: endpoints.openaiCompatibleBaseUrl });
  }
  if (provider === "claude") {
    return claude({ ...options, apiKey: keys.anthropic });
  }
  if (provider === "gemini") {
    return gemini({ ...options, apiKey: keys.gemini });
  }
  if (provider === "deepseek") {
    return deepseek({ ...options, apiKey: keys.deepseek });
  }
  if (provider === "ollama") {
    return ollama({ ...options, baseUrl: endpoints.ollamaBaseUrl });
  }

  throw new Error(`Invalid provider: ${provider}`);
}

module.exports = callAI;
