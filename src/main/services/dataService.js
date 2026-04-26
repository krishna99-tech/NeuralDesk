"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateData = generateData;
exports.predictNext = predictNext;
exports.normalizeData = normalizeData;
exports.predictWithLSTM = predictWithLSTM;
/**
 * NeuralDesk Data Service
 * Generates and manipulates time-series data for analysis and prediction.
 */
const axios_1 = __importDefault(require("axios"));
/**
 * Generate synthetic time-series data
 */
function generateData(points = 10, seed = 10) {
    return Array.from({ length: points }, (_, i) => ({
        time: i + 1,
        value: parseFloat((seed + Math.random() * 5).toFixed(2))
    }));
}
/**
 * Simple linear-slope prediction
 */
function predictNext(data, steps = 10) {
    if (!Array.isArray(data) || data.length < 2)
        return [];
    const last = data[data.length - 1];
    const prev = data[data.length - 2];
    const slope = last.value - prev.value;
    return Array.from({ length: steps }, (_, i) => ({
        time: last.time + i + 1,
        value: parseFloat((last.value + slope * (i + 1)).toFixed(2)),
        predicted: true
    }));
}
/**
 * Normalize numeric data for chart display
 */
function normalizeData(data) {
    const values = data.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return data.map(d => ({
        ...d,
        normalizedValue: parseFloat(((d.value - min) / range).toFixed(4))
    }));
}
/**
 * Optional: Call an external LSTM microservice for advanced predictions
 */
async function predictWithLSTM(data) {
    try {
        const res = await axios_1.default.post("http://localhost:5000/predict", { data }, { timeout: 10000 });
        return res.data;
    }
    catch (err) {
        console.warn("[DataService] LSTM service unavailable, falling back to linear prediction.");
        return predictNext(data, 10);
    }
}
