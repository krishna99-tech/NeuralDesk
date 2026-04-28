"use strict";
/**
 * NeuralDesk Intent Parser (No changes needed)
 * Classifies the user's query into an intent without requiring an LLM call.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseIntent = parseIntent;
const INTENT_PATTERNS = {
    predict: [/\bpredict\b/i, /\bforecast\b/i, /\bprojection\b/i, /\bnext\s+\d+\b/i, /\bfuture\b/i, /\btrend\b/i, /\bextrapolate\b/i],
    plot: [/\bplot\b/i, /\bgraph\b/i, /\bchart\b/i, /\bvisuali[sz]e\b/i, /\bshow.*data\b/i, /\bdraw\b/i, /\btable\b/i, /\bdisplay.*data\b/i, /\bdashboard\b/i],
    query: [/\bfind\b/i, /\bsearch\b/i, /\bfetch\b/i, /\bget\b/i, /\blist\b/i, /\bshow\s+(me\s+)?the\b/i, /\bdatabase\b/i, /\bcollection\b/i, /\bmongo(db)?\b/i],
    analyze: [/\banaly[sz]e\b/i, /\banalysis\b/i, /\binsight(s)?\b/i, /\bsummar(y|i[sz]e)\b/i, /\bexplain.*data\b/i, /\bwhat.*data\b/i],
    reset: [/\bclear\b/i, /\breset\b/i, /\bstart over\b/i, /\bnew session\b/i],
    compare: [/\bcompare\b/i, /\bvs\b/i, /\bversus\b/i, /\bdifference\b/i, /\bwhich is better\b/i],
    transform: [/\bconvert\b/i, /\btransform\b/i, /\breformat\b/i, /\bclean\b/i, /\bnormalize\b/i, /\bmap\b/i],
    export: [/\bexport\b/i, /\bdownload\b/i, /\bcsv\b/i, /\bxlsx\b/i, /\bjson\b/i, /\breport\b/i],
    stats: [/\bmean\b/i, /\bmedian\b/i, /\bmode\b/i, /\bstd\b/i, /\bvariance\b/i, /\bdistribution\b/i],
    code: [/\bcode\b/i, /\bscript\b/i, /\bdebug\b/i, /\bfix\b/i, /\brefactor\b/i, /\bfunction\b/i, /\bapi\b/i],
    explain: [/\bexplain\b/i, /\bhow does\b/i, /\bwhat is\b/i, /\bwhy\b/i],
    translate: [/\btranslate\b/i, /\btranslat(e|ion)\b/i, /\bin english\b/i, /\bto hindi\b/i, /\bto spanish\b/i],
    classify: [/\bclassify\b/i, /\bcategorize\b/i, /\btag\b/i, /\blabel\b/i],
    summarize: [/\bsummar(y|ize|ise)\b/i, /\btl;dr\b/i, /\bbrief\b/i],
    greet: [/\bhello\b/i, /\bhi\b/i, /\bhey\b/i, /\bgood (morning|afternoon|evening)\b/i],
    help: [/\bhelp\b/i, /\bhow to use\b/i, /\bguide\b/i, /\bwhat can you do\b/i],
};
const INTENT_PRIORITY = {
    reset: 12,
    export: 11,
    query: 10,
    plot: 9,
    predict: 8,
    analyze: 7,
    compare: 6,
    stats: 5,
    transform: 4,
    classify: 4,
    summarize: 3,
    code: 3,
    explain: 2,
    translate: 2,
    help: 1,
    greet: 1,
    text: 0
};
/**
 * Parse the intent from a query string
 */
function parseIntent(query) {
    const q = String(query || "");
    const scores = {};
    let maxPatternCount = 1;
    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
        let score = 0;
        for (const pattern of patterns) {
            if (pattern.test(q))
                score += 1;
        }
        scores[intent] = score;
        if (patterns.length > maxPatternCount)
            maxPatternCount = patterns.length;
    }
    const ranked = Object.entries(scores)
        .filter(([, score]) => score > 0)
        .sort((a, b) => {
        if (b[1] !== a[1])
            return b[1] - a[1];
        return (INTENT_PRIORITY[b[0]] || 0) - (INTENT_PRIORITY[a[0]] || 0);
    });
    if (ranked.length === 0) {
        return { intent: "text", confidence: 0.5 };
    }
    const [intent, score] = ranked[0];
    const confidence = Math.min(0.99, 0.55 + (score / maxPatternCount) * 0.45);
    return { intent, confidence: Number(confidence.toFixed(2)) };
}
