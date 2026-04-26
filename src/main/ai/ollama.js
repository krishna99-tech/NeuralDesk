"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
exports.default = async ({ prompt, model, baseUrl, systemPrompt, temperature, maxTokens }) => {
    const endpointBase = (baseUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
    const requestedModel = model || "llama3";
    const res = await axios_1.default.post(`${endpointBase}/api/generate`, {
        model: requestedModel,
        prompt,
        system: systemPrompt || undefined,
        stream: false,
        options: {
            temperature: temperature ?? 0.7,
            num_predict: maxTokens ?? 2048
        }
    });
    return { text: res.data.response, model: requestedModel };
};
