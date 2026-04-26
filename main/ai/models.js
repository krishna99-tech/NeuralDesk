const MODELS = {
  openai: {
    fast: "gpt-4o-mini",
    latest: "gpt-5.5",
    smart: "gpt-4o",
    cheap: "gpt-3.5-turbo"
  },
  claude: {
    fast: "claude-3-haiku-20240307",
    smart: "claude-3-sonnet-20240229"
  },
  gemini: {
    fast: "gemini-2.5-flash",
    smart: "gemini-2.5-pro"
  },
  ollama: {
    fast: "llama3",
    smart: "mistral"
  },
  deepseek: {
    fast: "deepseek-chat",
    smart: "deepseek-reasoner"
  }
};

module.exports = MODELS;
