"use strict";

const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const logStreams = new Map();

function getLogDir() {
    const logDir = path.join(app.getPath("userData"), "logs");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    return logDir;
}

function truncateText(value, maxLen = 6000) {
    const text = String(value || "");
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen)}\n...[truncated ${text.length - maxLen} chars]`;
}

function logAppEvent(level, source, event, message, details = {}) {
    try {
        const fileName = `${String(source || "app").toLowerCase().replace(/[^a-z0-9]/g, "_")}.log`;
        const filePath = path.join(getLogDir(), fileName);

        if (!logStreams.has(filePath)) {
            logStreams.set(filePath, fs.createWriteStream(filePath, { flags: "a", encoding: "utf8" }));
        }

        const stream = logStreams.get(filePath);
        const timestamp = new Date().toISOString();
        const entry = `[${timestamp}] [${level}] [${event}] ${message}\nDetails: ${JSON.stringify(details)}\n\n`;
        stream.write(entry);
    } catch (err) {
        console.error("Logger Error:", err.message);
    }
}

module.exports = { logAppEvent, truncateText };