"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));

exports.default = async ({ prompt, model, aipipeToken, systemPrompt, temperature, maxTokens }) => {
    if (!aipipeToken) {
        throw new Error("AIpipe token is missing. Please ensure you are logged in via AIpipe.org.");
    }

    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    try {
        const response = await axios_1.default.post(
            "https://aipipe.org/openrouter/v1/chat/completions",
            {
                model: model || "openai/gpt-5-nano", // Default model for aipipe
                messages,
                temperature: temperature ?? 0.7,
                max_tokens: maxTokens ?? 2048,
                stream: false, // Assuming non-streaming for simplicity, can be extended
            },
            {
                headers: {
                    "Authorization": `Bearer ${aipipeToken}`,
                    "Content-Type": "application/json",
                },
            }
        );

        return {
            text: response.data.choices[0].message.content,
            model: response.data.model,
        };
    } catch (error) {
        console.error("AIpipe API Error:", error.response?.data || error.message);
        const errorMsg = error.response?.data?.error?.message || error.message;
        throw new Error(`AIpipe Error: ${errorMsg}`);
    }
};