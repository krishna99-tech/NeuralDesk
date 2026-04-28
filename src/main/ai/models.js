"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const MODELS = {
    openai: {
        fast: "gpt-4o-mini",
        latest: "gpt-4o",
        smart: "gpt-4o",
        cheap: "gpt-3.5-turbo",
        metadata: {
            "gpt-4o-mini": { limit: "128k", price: "$0.15/1M" },
            "gpt-4o": { limit: "128k", price: "$2.50/1M" },
            "gpt-3.5-turbo": { limit: "16k", price: "$0.50/1M" }
        }
    },
    claude: {
        fast: "claude-3-5-haiku-20241022",
        smart: "claude-3-5-sonnet-20241022",
        metadata: {
            "claude-3-5-haiku-20241022": { limit: "200k", price: "$0.25/1M" },
            "claude-3-5-sonnet-20241022": { limit: "200k", price: "$3.00/1M" }
        }
    },
    gemini: {
        fast: "gemini-1.5-flash",
        smart: "gemini-1.5-pro",
        metadata: {
            "gemini-1.5-flash": { limit: "1M", price: "Free/Low" },
            "gemini-1.5-pro": { limit: "2M", price: "$3.50/1M" }
        }
    },
    ollama: {
        fast: "llama3",
        smart: "llama3.3",
        metadata: {
            "llama3.3": { limit: "128k", price: "Local" },
            "llama3": { limit: "128k", price: "Local" },
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
    },
    aipipe: { // New AIpipe provider
        fast: "openai/gpt-5-nano",
        smart: "openai/gpt-5-nano", // Assuming gpt-5-nano is the primary model for now
        metadata: {
            "openai/gpt-5-nano": { limit: "128k", price: "$0.10/1M" } // Placeholder limits/prices
        }
    }
};
exports.default = MODELS;
