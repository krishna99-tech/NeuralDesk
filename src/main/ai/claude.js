"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
exports.default = async ({ prompt, model, apiKey, systemPrompt, temperature, maxTokens }) => {
    if (!apiKey)
        throw new Error("Anthropic API Key is missing. Please configure it in Settings.");
    const requestedModel = model || "claude-3-haiku-20240307";
    const url = "https://api.anthropic.com/v1/messages";
    const body = {
        model: requestedModel,
        max_tokens: maxTokens ?? 2048,
        temperature: temperature ?? 0.7,
        system: systemPrompt || undefined,
        messages: [{ role: "user", content: prompt }]
    };
    const headers = {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
    };
    try {
        const res = await axios_1.default.post(url, body, { headers });
        const text = res?.data?.content?.[0]?.text;
        if (typeof text !== "string") {
            throw new Error("Anthropic returned an unexpected response format.");
        }
        return { text, model: requestedModel };
    }
    catch (err) {
        const status = err?.response?.status ?? err?.status;
        const msg = err?.response?.data?.error?.message || err?.message || "";
        const isModelNotFound = status === 404 ||
            (typeof msg === "string" &&
                msg.toLowerCase().includes("model") &&
                msg.toLowerCase().includes("not found"));
        if (isModelNotFound && requestedModel !== "claude-3-haiku-20240307") {
            const retry = await axios_1.default.post(url, { ...body, model: "claude-3-haiku-20240307" }, { headers });
            const fallbackText = retry?.data?.content?.[0]?.text;
            if (typeof fallbackText !== "string") {
                throw new Error("Anthropic fallback returned an unexpected response format.");
            }
            return { text: fallbackText, model: "claude-3-haiku-20240307" };
        }
        throw err;
    }
};
