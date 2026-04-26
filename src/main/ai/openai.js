"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const agents_1 = require("@openai/agents");
exports.default = async ({ prompt, model, apiKey, baseUrl, systemPrompt }) => {
    if (!apiKey)
        throw new Error("OpenAI API Key is missing. Please configure it in Settings.");
    process.env.OPENAI_API_KEY = apiKey;
    if (baseUrl)
        process.env.OPENAI_BASE_URL = baseUrl;
    const requestedModel = model || "gpt-4o-mini";
    const agent = new agents_1.Agent({
        name: "NeuralDesk Assistant",
        instructions: systemPrompt || "You are a helpful assistant. Provide clear and concise answers.",
        model: requestedModel,
    });
    try {
        const result = await (0, agents_1.run)(agent, prompt);
        return { text: result.finalOutput, model: requestedModel };
    }
    catch (err) {
        const status = err?.response?.status ?? err?.status;
        const msg = err?.response?.data?.error?.message || err?.message || "";
        const isModelNotFound = status === 404 ||
            (typeof msg === "string" &&
                (msg.toLowerCase().includes("model") &&
                    (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("does not exist"))));
        if (isModelNotFound && requestedModel !== "gpt-4o-mini") {
            const fallbackAgent = new agents_1.Agent({
                name: "NeuralDesk Assistant (Fallback)",
                instructions: "You are a helpful assistant.",
                model: "gpt-4o-mini",
            });
            const result = await (0, agents_1.run)(fallbackAgent, prompt);
            return { text: result.finalOutput, model: "gpt-4o-mini" };
        }
        throw err;
    }
};
