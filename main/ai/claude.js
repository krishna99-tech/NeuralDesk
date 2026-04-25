const axios = require("axios");

module.exports = async ({ prompt, model, apiKey }) => {
  if (!apiKey) throw new Error("Anthropic API Key is missing. Please configure it in Settings.");
  const requestedModel = model || "claude-3-haiku-20240307";
  const url = "https://api.anthropic.com/v1/messages";
  const body = {
    model: requestedModel,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }]
  };
  const headers = {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json"
  };

  try {
    const res = await axios.post(url, body, { headers });
    const text = res?.data?.content?.[0]?.text;
    if (typeof text !== "string") {
      throw new Error("Anthropic returned an unexpected response format.");
    }
    return { text };
  } catch (err) {
    const status = err?.response?.status ?? err?.status;
    const msg = err?.response?.data?.error?.message || err?.message || "";
    const isModelNotFound =
      status === 404 ||
      (typeof msg === "string" &&
        msg.toLowerCase().includes("model") &&
        msg.toLowerCase().includes("not found"));

    if (isModelNotFound && requestedModel !== "claude-3-haiku-20240307") {
      const retry = await axios.post(
        url,
        { ...body, model: "claude-3-haiku-20240307" },
        { headers }
      );
      const fallbackText = retry?.data?.content?.[0]?.text;
      if (typeof fallbackText !== "string") {
        throw new Error("Anthropic fallback returned an unexpected response format.");
      }
      return { text: fallbackText };
    }

    throw err;
  }
};
