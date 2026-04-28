"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const generative_ai_1 = require("@google/generative-ai"); // No changes needed here
const { logAppEvent } = require("../logger");
const { sanitizeSchema } = require("../utils/schema");

exports.default = async ({ prompt, model, apiKey, systemPrompt, temperature, maxTokens, tools }) => {
    if (!apiKey)
        throw new Error("Google Gemini API Key is missing. Please configure it in Settings.");
    const requestedModel = model || "gemini-1.5-flash";
    logAppEvent("INFO", "Gemini", "GEMINI_REQUEST", `Sending request to model: ${requestedModel}`, { model: requestedModel });
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);

    try {
        const modelOptions = {
            model: requestedModel,
            systemInstruction: systemPrompt || undefined,
            generationConfig: {
                temperature: temperature ?? 0.7,
                maxOutputTokens: maxTokens ?? 2048
            }
        };
        // Convert tools to Gemini format
        if (Array.isArray(tools) && tools.length > 0) {
            modelOptions.tools = [{
                    functionDeclarations: tools.map(t => ({
                        name: t.name,
                        description: t.description,
                        parameters: sanitizeSchema(t.parameters)
                    }))
                }];
        }
        const m = genAI.getGenerativeModel(modelOptions);
        const result = await m.generateContent(prompt);
        const response = result.response;
        const parts = response.candidates?.[0]?.content?.parts || [];
        const call = parts.find((p) => p.functionCall);
        if (call) {
            return {
                text: "",
                toolCalls: [{
                        id: `call_${Date.now()}`,
                        function: {
                            name: call.functionCall.name,
                            arguments: JSON.stringify(call.functionCall.args)
                        }
                    }]
            };
        }
        logAppEvent("INFO", "Gemini", "GEMINI_RESPONSE", "Received successful response from Gemini");
        return { text: response.text(), model: requestedModel };
    }
    catch (err) {
        const rawMessage = String(err?.message || "");
        const lowerMessage = rawMessage.toLowerCase();
        const isApiKeyInvalid = (err && err.status === 400) &&
            (lowerMessage.includes("api_key_invalid") ||
                lowerMessage.includes("api key expired") ||
                lowerMessage.includes("invalid api key"));
        if (isApiKeyInvalid) {
            logAppEvent("ERROR", "Gemini", "GEMINI_AUTH_ERROR", "Invalid or expired API key detected");
            throw new Error("Gemini API key is invalid or expired. Open Settings > API Keys & Integrations, update the Google AI key, and save.");
        }
        const isModelNotFound = (err && err.status === 404) ||
            (typeof err?.message === "string" &&
                err.message.toLowerCase().includes("is not found"));
        if (isModelNotFound && requestedModel !== "gemini-1.5-flash") {
            logAppEvent("WARN", "Gemini", "GEMINI_FALLBACK", `Model '${requestedModel}' not found. Attempting fallback to gemini-1.5-flash.`);
            const fallback = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const retry = await fallback.generateContent(prompt);
            return { text: retry.response.text(), model: "gemini-1.5-flash" };
        }
        if (isModelNotFound) {
            logAppEvent("ERROR", "Gemini", "GEMINI_MODEL_ERROR", `Model '${requestedModel}' is unavailable.`);
            throw new Error(`Gemini model '${requestedModel}' is unavailable. Try 'gemini-1.5-flash' or 'gemini-1.5-pro' in your model config.`);
        }
        logAppEvent("ERROR", "Gemini", "GEMINI_API_ERROR", err.message, { stack: err.stack });
        throw err;
    }
};
