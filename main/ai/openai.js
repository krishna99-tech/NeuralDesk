const axios = require("axios");

module.exports = async ({ prompt, model, apiKey, baseUrl }) => {
  if (!apiKey) throw new Error("OpenAI API Key is missing. Please configure it in Settings.");
  const url = baseUrl ? `${baseUrl.replace(/\/$/, "")}/chat/completions` : "https://api.openai.com/v1/chat/completions";
  const requestedModel = model || "gpt-4o-mini";
  const requestBody = {
    model: requestedModel,
    messages: [{ role: "user", content: prompt }]
  };
  const headers = {
    Authorization: `Bearer ${apiKey}`
  };

  try {
    const res = await axios.post(url, requestBody, { headers });
    const text = res?.data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new Error("OpenAI returned an unexpected response format.");
    }
    return { text };
  } catch (err) {
    const status = err?.response?.status ?? err?.status;
    const msg = err?.response?.data?.error?.message || err?.message || "";
    const isModelNotFound =
      status === 404 ||
      (typeof msg === "string" &&
        (msg.toLowerCase().includes("model") &&
          (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("does not exist"))));

    if (isModelNotFound && requestedModel !== "gpt-4o-mini") {
      const retry = await axios.post(
        url,
        { ...requestBody, model: "gpt-4o-mini" },
        { headers }
      );
      const fallbackText = retry?.data?.choices?.[0]?.message?.content;
      if (typeof fallbackText !== "string") {
        throw new Error("OpenAI fallback returned an unexpected response format.");
      }
      return { text: fallbackText };
    }

    throw err;
  }
};
