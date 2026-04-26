"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = callAI;
const openai_1 = __importDefault(require("./openai"));
const claude_1 = __importDefault(require("./claude"));
const gemini_1 = __importDefault(require("./gemini"));
const ollama_1 = __importDefault(require("./ollama"));
const deepseek_1 = __importDefault(require("./deepseek"));
const sqlite_1 = __importDefault(require("../db/sqlite"));
async function callAI({ provider, model, prompt, tools }) {
    // Fetch real-time settings from DB
    const row = sqlite_1.default.prepare("SELECT data FROM settings WHERE id = 1").get();
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
        return (0, openai_1.default)({ ...options, apiKey: keys.openai, baseUrl: endpoints.openaiCompatibleBaseUrl });
    }
    if (provider === "claude") {
        return (0, claude_1.default)({ ...options, apiKey: keys.anthropic });
    }
    if (provider === "gemini") {
        return (0, gemini_1.default)({ ...options, apiKey: keys.gemini });
    }
    if (provider === "deepseek") {
        return (0, deepseek_1.default)({ ...options, apiKey: keys.deepseek });
    }
    if (provider === "ollama") {
        return (0, ollama_1.default)({ ...options, baseUrl: endpoints.ollamaBaseUrl });
    }
    throw new Error(`Invalid provider: ${provider}`);
}
