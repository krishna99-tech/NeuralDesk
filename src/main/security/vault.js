"use strict";
const { app, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

function getVaultPath() {
  return path.join(app.getPath("userData"), "vault.json");
}

function deriveFallbackKey() {
  const seed = `${app.getName()}::${app.getPath("userData")}::${process.platform}`;
  return crypto.createHash("sha256").update(seed).digest();
}

function encryptText(value) {
  const text = String(value || "");
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(text);
    return { mode: "safeStorage", payload: encrypted.toString("base64") };
  }
  const key = deriveFallbackKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return { mode: "aes-256-cbc", iv: iv.toString("base64"), payload: enc.toString("base64") };
}

function decryptText(record) {
  if (!record || typeof record !== "object") return "";
  if (record.mode === "safeStorage") {
    const buf = Buffer.from(String(record.payload || ""), "base64");
    return safeStorage.decryptString(buf);
  }
  if (record.mode === "aes-256-cbc") {
    const key = deriveFallbackKey();
    const iv = Buffer.from(String(record.iv || ""), "base64");
    const payload = Buffer.from(String(record.payload || ""), "base64");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const out = Buffer.concat([decipher.update(payload), decipher.final()]);
    return out.toString("utf8");
  }
  return "";
}

function loadVault() {
  const p = getVaultPath();
  if (!fs.existsSync(p)) return { secrets: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!parsed || typeof parsed !== "object") return { secrets: {} };
    parsed.secrets = parsed.secrets && typeof parsed.secrets === "object" ? parsed.secrets : {};
    return parsed;
  } catch {
    return { secrets: {} };
  }
}

function saveVault(vault) {
  const p = getVaultPath();
  fs.writeFileSync(p, JSON.stringify(vault, null, 2), "utf8");
}

function setSecret(name, value) {
  const key = String(name || "").trim();
  if (!key) return { ok: false, error: "Missing secret name" };
  const vault = loadVault();
  vault.secrets[key] = {
    ...encryptText(value || ""),
    updatedAt: new Date().toISOString(),
  };
  saveVault(vault);
  return { ok: true };
}

function getSecret(name) {
  const key = String(name || "").trim();
  if (!key) return "";
  const vault = loadVault();
  const rec = vault.secrets[key];
  if (!rec) return "";
  try {
    return decryptText(rec);
  } catch {
    return "";
  }
}

function deleteSecret(name) {
  const key = String(name || "").trim();
  if (!key) return { ok: false, error: "Missing secret name" };
  const vault = loadVault();
  delete vault.secrets[key];
  saveVault(vault);
  return { ok: true };
}

function listSecretMetadata() {
  const vault = loadVault();
  return Object.entries(vault.secrets || {}).map(([name, rec]) => ({
    name,
    mode: rec.mode || "unknown",
    updatedAt: rec.updatedAt || null,
  }));
}

module.exports = { setSecret, getSecret, deleteSecret, listSecretMetadata };
