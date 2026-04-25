const axios = require("axios");

module.exports = async ({ prompt, model, baseUrl }) => {
  const endpointBase = (baseUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
  const requestedModel = model || "llama3";

  const res = await axios.post(`${endpointBase}/api/generate`, {
    model: requestedModel,
    prompt,
    stream: false
  });

  return { text: res.data.response };
};
