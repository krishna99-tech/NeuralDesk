"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = deepseek;
const axios_1 = __importDefault(require("axios"));
async function deepseek({ model, prompt, apiKey, temperature, maxTokens, systemPrompt }) {
    if (!apiKey)
        throw new Error("DeepSeek API Key is missing. Please add it in Settings > API Keys.");
    const messages = [];
    if (systemPrompt)
        messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });
    try {
        const response = await axios_1.default.post('https://api.deepseek.com/chat/completions', {
            model: model || 'deepseek-chat',
            messages,
            temperature: temperature ?? 0.7,
            max_tokens: maxTokens ?? 2048,
            stream: false
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        });
        return {
            text: response.data.choices[0].message.content,
            model: response.data.model
        };
    }
    catch (error) {
        console.error("DeepSeek API Error:", error.response?.data || error.message);
        const errorMsg = error.response?.data?.error?.message || error.message;
        throw new Error(`DeepSeek Error: ${errorMsg}`);
    }
}
