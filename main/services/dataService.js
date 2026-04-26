/**
 * NeuralDesk Data Service
 * Generates and manipulates time-series data for analysis and prediction.
 * Maps to blueprint's services/dataService.ts + predictService.ts
 */

/**
 * Generate synthetic time-series data
 * @param {number} points - number of data points to generate
 * @param {number} seed - base value for randomness
 */
function generateData(points = 10, seed = 10) {
  return Array.from({ length: points }, (_, i) => ({
    time: i + 1,
    value: parseFloat((seed + Math.random() * 5).toFixed(2))
  }));
}

/**
 * Simple linear-slope prediction (extendable to LSTM via external service)
 * @param {Array} data - existing time-series data
 * @param {number} steps - how many future steps to predict
 */
function predictNext(data, steps = 10) {
  if (!Array.isArray(data) || data.length < 2) return [];

  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const slope = last.value - prev.value;

  return Array.from({ length: steps }, (_, i) => ({
    time: last.time + i + 1,
    value: parseFloat((last.value + slope * (i + 1)).toFixed(2)),
    predicted: true   // Flag so the UI can style these differently
  }));
}

/**
 * Normalize numeric data for chart display
 * @param {Array} data
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
 * @param {Array} data
 */
async function predictWithLSTM(data) {
  try {
    const axios = require("axios");
    const res = await axios.post("http://localhost:5000/predict", { data }, { timeout: 10000 });
    return res.data;
  } catch (err) {
    console.warn("[DataService] LSTM service unavailable, falling back to linear prediction.");
    return predictNext(data, 10);
  }
}

module.exports = { generateData, predictNext, normalizeData, predictWithLSTM };
