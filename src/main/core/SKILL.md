# Intent Parser Skill

This skill documents and standardizes rule-based intent parsing for `src/main/core/intentParser.js`.

## Purpose
- Classify user input quickly without an LLM call.
- Keep routing deterministic and cheap.
- Reduce ambiguity using weighted regex scoring + priority tie-breaks.

## Import
```js
const { parseIntent } = require("./intentParser");
// parseIntent("show me a chart")
// -> { intent: "plot", confidence: 0.65 }
```

## Current Intents
- `predict`
- `plot`
- `query`
- `analyze`
- `reset`
- `compare`
- `transform`
- `export`
- `stats`
- `code`
- `explain`
- `translate`
- `classify`
- `summarize`
- `greet`
- `help`
- fallback: `text`

## Matching Strategy
1. Normalize input to string.
2. Score each intent by counting matched patterns.
3. Choose highest score.
4. If tie, choose by `INTENT_PRIORITY`.
5. If no match, return `text`.

## Confidence
- Confidence scales with score density:
- `0.55 + (score / maxPatternCount) * 0.45` capped to `0.99`.

## How to Add More Intents
1. Add a new key under `INTENT_PATTERNS`.
2. Use word boundaries where possible (`\bterm\b`) to reduce false positives.
3. Add priority value in `INTENT_PRIORITY`.
4. Keep `text` as the fallback.
5. Validate with sample phrases.

Example:
```js
INTENT_PATTERNS.alert = [/\balert\b/i, /\bnotify\b/i, /\bthreshold\b/i];
INTENT_PRIORITY.alert = 6;
```

## Recommended Pattern Rules
- Prefer specific patterns first (`\bmongodb\b` vs `\bdata\b`).
- Avoid overly broad tokens (`/show/i`) unless paired with context (`/show.*data/i`).
- Keep each pattern short and interpretable.

## Quick Test Phrases
- `"forecast next 10 days"` -> `predict`
- `"show me a graph"` -> `plot`
- `"fetch users from mongodb"` -> `query`
- `"analyze this csv"` -> `analyze`
- `"start over"` -> `reset`
- `"download as csv"` -> `export`
- `"compare model A vs B"` -> `compare`
- `"what is standard deviation"` -> `stats`
