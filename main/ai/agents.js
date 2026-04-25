const callAI = require("./router");
const MODELS = require("./models");

const agents = {
  analyzer: {
    provider: "gemini",
    modelType: "fast",
    prompt: (i) => `Analyze the following input and provide a concise summary:\n${i}`
  },

  reasoner: {
    provider: "claude",
    modelType: "smart",
    prompt: (i) => `Explain this deeply and provide step-by-step reasoning:\n${i}`
  },

  geminiAgent: {
    provider: "gemini",
    modelType: "fast",
    prompt: (i) => `You are a helpful assistant. Answer the user's request directly in clear, concise language.
Do not describe your internal reasoning process, channels, or methodology.
Avoid section-heavy or overly verbose formatting unless the user asks for it.

User request:
${i}`
  },

  local: {
    provider: "ollama",
    modelType: "fast",
    prompt: (i) => `Process this request locally for maximum privacy:\n${i}`
  }
};

function getModel(provider, type) {
  return MODELS[provider][type];
}

async function runAgent(name, input, overrideType) {
  // Hardcoded Orchestration & Fallback
  const agentName = name || "analyzer";
  const a = agents[agentName] || agents.analyzer;
  
  if (!a) throw new Error(`Agent configuration missing for: ${agentName}`);
  
  const model = getModel(a.provider, overrideType || a.modelType);

  return callAI({
    provider: a.provider,
    model,
    prompt: a.prompt(input)
  });
}

// SMART AUTO ORCHESTRATION
async function autoAgent(input, preferredType = "fast") {
  const query = input.toLowerCase();
  const type = (preferredType === "smart" || preferredType === "fast") ? preferredType : "fast";
  
  // Hardcoded routing rules
  if (query.includes("code") || query.includes("python") || query.includes("script")) {
    return runAgent("analyzer", input, type);
  }
  
  if (query.includes("analyze") || query.includes("data") || query.includes("viz")) {
    return runAgent("geminiAgent", input, type);
  }

  if (query.length > 300 || query.includes("explain") || query.includes("why")) {
    return runAgent("reasoner", input, type);
  }
  
  return runAgent("analyzer", input, type);
}

module.exports = { runAgent, autoAgent, agents };
