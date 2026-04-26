const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = async ({ prompt, model, apiKey, systemPrompt, temperature, maxTokens }) => {
  if (!apiKey) throw new Error("Google Gemini API Key is missing. Please configure it in Settings.");
  const genAI = new GoogleGenerativeAI(apiKey);
  const requestedModel = model || "gemini-2.5-flash";

  try {
    const m = genAI.getGenerativeModel({ 
      model: requestedModel,
      systemInstruction: systemPrompt || undefined,
      generationConfig: {
        temperature: temperature ?? 0.7,
        maxOutputTokens: maxTokens ?? 2048
      }
    });
    const res = await m.generateContent(prompt);
    return { text: res.response.text() };
  } catch (err) {
    const rawMessage = String(err?.message || "");
    const lowerMessage = rawMessage.toLowerCase();
    const isApiKeyInvalid =
      (err && err.status === 400) &&
      (lowerMessage.includes("api_key_invalid") ||
        lowerMessage.includes("api key expired") ||
        lowerMessage.includes("invalid api key"));

    if (isApiKeyInvalid) {
      throw new Error(
        "Gemini API key is invalid or expired. Open Settings > API Keys & Integrations, update the Google AI key, and save."
      );
    }

    const isModelNotFound =
      (err && err.status === 404) ||
      (typeof err?.message === "string" &&
        err.message.toLowerCase().includes("is not found"));

    if (isModelNotFound && requestedModel !== "gemini-2.5-flash") {
      const fallback = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const retry = await fallback.generateContent(prompt);
      return { text: retry.response.text() };
    }

    if (isModelNotFound) {
      throw new Error(
        `Gemini model '${requestedModel}' is unavailable for this API/version. Try 'gemini-2.5-flash' or 'gemini-2.5-pro' in your model config.`
      );
    }

    throw err;
  }
};
