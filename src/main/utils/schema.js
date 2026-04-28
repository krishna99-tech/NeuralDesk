"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeSchema = sanitizeSchema;
/**
 * Sanitizes JSON Schema for strict LLM requirements (like Gemini).
 */
function sanitizeSchema(schema) {
    if (!schema || typeof schema !== "object")
        return schema;
    const res = Array.isArray(schema) ? [] : {};
    for (const key in schema) {
        if (key === "additionalProperties" || key === "$schema")
            continue;
        if (key === "default" && typeof schema[key] === "undefined")
            continue;
        const val = schema[key];
        if (typeof val === "object" && val !== null) {
            res[key] = sanitizeSchema(val);
        }
        else {
            res[key] = val;
        }
    }
    return res;
}