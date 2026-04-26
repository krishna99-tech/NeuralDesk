"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const MODELS = {
    openai: {
        fast: "gpt-4o-mini",
        latest: "gpt-5.5",
        smart: "gpt-4o",
        cheap: "gpt-3.5-turbo",
        metadata: {
            "gpt-4o-mini": { limit: "128k", price: "$0.15/1M" },
            "gpt-4o": { limit: "128k", price: "$2.50/1M" },
            "gpt-3.5-turbo": { limit: "16k", price: "$0.50/1M" }
        }
    },
    claude: {
        fast: "claude-3-haiku-20240307",
        smart: "claude-3-sonnet-20240229",
        metadata: {
            "claude-3-haiku-20240307": { limit: "200k", price: "$0.25/1M" },
            "claude-3-sonnet-20240229": { limit: "200k", price: "$3.00/1M" }
        }
    },
    gemini: {
        fast: "gemini-2.5-flash",
        smart: "gemini-2.5-pro",
        metadata: {
            "gemini-2.5-flash": { limit: "1M", price: "Free/Low" },
            "gemini-2.5-pro": { limit: "2M", price: "$3.50/1M" }
        }
    },
    ollama: {
        fast: "llama3",
        smart: "mistral",
        metadata: {
            "llama3": { limit: "8k", price: "Local" },
            "mistral": { limit: "32k", price: "Local" }
        }
    },
    deepseek: {
        fast: "deepseek-chat",
        smart: "deepseek-reasoner",
        metadata: {
            "deepseek-chat": { limit: "128k", price: "$0.14/1M" },
            "deepseek-reasoner": { limit: "64k", price: "$0.55/1M" }
        }
    }
};
exports.default = MODELS;
