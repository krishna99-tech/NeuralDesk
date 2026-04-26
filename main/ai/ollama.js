const axios = require("axios");

module.exports = async ({ prompt, model, baseUrl, systemPrompt, temperature, maxTokens }) => {
  const endpointBase = (baseUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
  const requestedModel = model || "llama3";

  const res = await axios.post(`${endpointBase}/api/generate`, {
    model: requestedModel,
    prompt,
    system: systemPrompt || undefined,
    stream: false,
    options: {
      temperature: temperature ?? 0.7,
      num_predict: maxTokens ?? 2048
    }
  });

  return { text: res.data.response };
};
