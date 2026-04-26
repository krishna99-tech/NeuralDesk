const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = async ({ prompt, model, apiKey, systemPrompt, temperature, maxTokens, tools }) => {
  if (!apiKey) throw new Error("Google Gemini API Key is missing. Please configure it in Settings.");
  const genAI = new GoogleGenerativeAI(apiKey);
  const requestedModel = model || "gemini-2.5-flash";

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
    const call = response.candidates[0].content.parts.find(p => p.functionCall);

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

    return { text: response.text() };
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

/**
 * Sanitizes JSON Schema for Gemini's strict requirements.
 */
function sanitizeSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  
  const res = Array.isArray(schema) ? [] : {};
  
  for (const key in schema) {
    // Remove unsupported fields
    if (key === "additionalProperties") continue;
    if (key === "default" && typeof schema[key] === "undefined") continue;

    const val = schema[key];
    if (typeof val === "object" && val !== null) {
      res[key] = sanitizeSchema(val);
    } else {
      res[key] = val;
    }
  }
  
  return res;
}
