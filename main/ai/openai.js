const { Agent, run } = require("@openai/agents");

module.exports = async ({ prompt, model, apiKey, baseUrl, systemPrompt, temperature, maxTokens }) => {
  if (!apiKey) throw new Error("OpenAI API Key is missing. Please configure it in Settings.");
  
  // Set the API key for the SDK
  process.env.OPENAI_API_KEY = apiKey;
  if (baseUrl) process.env.OPENAI_BASE_URL = baseUrl;

  const requestedModel = model || "gpt-4o-mini";

  const agent = new Agent({
    name: "NeuralDesk Assistant",
    instructions: systemPrompt || "You are a helpful assistant. Provide clear and concise answers.",
    model: requestedModel,
  });

  try {
    const result = await run(agent, prompt);
    return { text: result.finalOutput };
  } catch (err) {
    const status = err?.response?.status ?? err?.status;
    const msg = err?.response?.data?.error?.message || err?.message || "";
    const isModelNotFound =
      status === 404 ||
      (typeof msg === "string" &&
        (msg.toLowerCase().includes("model") &&
          (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("does not exist"))));

    if (isModelNotFound && requestedModel !== "gpt-4o-mini") {
      const fallbackAgent = new Agent({
        name: "NeuralDesk Assistant (Fallback)",
        instructions: "You are a helpful assistant.",
        model: "gpt-4o-mini",
      });
      const result = await run(fallbackAgent, prompt);
      return { text: result.finalOutput };
    }

    throw err;
  }
};
