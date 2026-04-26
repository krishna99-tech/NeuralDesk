"use strict";
/**
 * NeuralDesk Intent Parser
 * Classifies the user's query into an intent without requiring an LLM call.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseIntent = parseIntent;
const INTENT_PATTERNS = {
    predict: [/predict/i, /forecast/i, /next\s+\d+/i, /future/i, /trend/i, /extrapolate/i],
    plot: [/plot/i, /graph/i, /chart/i, /visuali[sz]e/i, /show.*data/i, /draw/i],
    query: [/find/i, /search/i, /fetch/i, /get/i, /list/i, /show\s+(me\s+)?the/i, /database/i, /collection/i, /mongo/i],
    analyze: [/analyze/i, /analyse/i, /insight/i, /summar/i, /explain.*data/i, /what.*data/i],
    reset: [/clear/i, /reset/i, /start over/i, /new session/i],
};
/**
 * Parse the intent from a query string
 */
function parseIntent(query) {
    const q = String(query || "").toLowerCase();
    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(q)) {
                return { intent, confidence: 0.9 };
            }
        }
    }
    return { intent: "text", confidence: 0.5 };
}
