import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SETTING_KEYS = [
  "TARGET_PROVIDER",
  "TARGET_BASE_URL",
  "TARGET_CHAT_MODEL",
  "TARGET_REASONER_MODEL",
  "TARGET_TIMEOUT_MS",
  "WORKSPACE_ROOTS",
  "TOOL_RESULT_MAX_CHARS",
  "EVENT_PAYLOAD_MAX_CHARS",
  "DEEPSEEK_AUTO_REASONER",
  "HOST",
  "PORT",
  "AGENT_UI_TOKEN",
];

export function getSettings(_request, response, { sendJson, root }) {
  return sendJson(response, 200, publicSettings(root));
}

export async function saveSettings(request, response, { readJsonBody, sendJson, root }) {
  const body = await readJsonBody(request, 200_000);
  const envPath = path.join(root, ".env");
  const current = readEnvFile(envPath);
  const next = { ...current };

  setIfString(next, "TARGET_PROVIDER", body.provider);
  setIfString(next, "TARGET_BASE_URL", body.baseUrl);
  setIfString(next, "TARGET_CHAT_MODEL", body.chatModel);
  setIfString(next, "TARGET_REASONER_MODEL", body.reasonerModel);
  setIfString(next, "TARGET_TIMEOUT_MS", body.timeoutMs);
  setIfString(next, "WORKSPACE_ROOTS", body.workspaceRoots);
  setIfString(next, "TOOL_RESULT_MAX_CHARS", body.toolResultMaxChars);
  setIfString(next, "EVENT_PAYLOAD_MAX_CHARS", body.eventPayloadMaxChars);
  setIfString(next, "DEEPSEEK_AUTO_REASONER", body.autoReasoner);
  setIfString(next, "HOST", body.host);
  setIfString(next, "PORT", body.port);
  setIfString(next, "AGENT_UI_TOKEN", body.uiToken);

  if (typeof body.apiKey === "string" && body.apiKey.trim()) {
    next.TARGET_API_KEY = body.apiKey.trim();
  }

  writeEnvFile(envPath, next);
  for (const [key, value] of Object.entries(next)) process.env[key] = value;
  return sendJson(response, 200, publicSettings(root));
}

function publicSettings(root) {
  const envPath = path.join(root, ".env");
  const fileSettings = readEnvFile(envPath);
  const value = (key, fallback = "") => process.env[key] ?? fileSettings[key] ?? fallback;
  return {
    envPath,
    provider: value("TARGET_PROVIDER", "deepseek"),
    baseUrl: value("TARGET_BASE_URL", "https://api.deepseek.com"),
    apiKeySet: Boolean(value("TARGET_API_KEY")),
    chatModel: value("TARGET_CHAT_MODEL", "deepseek-chat"),
    reasonerModel: value("TARGET_REASONER_MODEL", "deepseek-reasoner"),
    timeoutMs: value("TARGET_TIMEOUT_MS", "120000"),
    workspaceRoots: value("WORKSPACE_ROOTS"),
    toolResultMaxChars: value("TOOL_RESULT_MAX_CHARS", "6000"),
    eventPayloadMaxChars: value("EVENT_PAYLOAD_MAX_CHARS", "20000"),
    autoReasoner: value("DEEPSEEK_AUTO_REASONER", "true"),
    host: value("HOST", "127.0.0.1"),
    port: value("PORT", "4317"),
    uiTokenSet: Boolean(value("AGENT_UI_TOKEN")),
  };
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const result = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}

function writeEnvFile(filePath, values) {
  const ordered = ["TARGET_PROVIDER", "TARGET_BASE_URL", "TARGET_API_KEY", "TARGET_CHAT_MODEL", "TARGET_REASONER_MODEL", ...SETTING_KEYS.filter((key) => !key.startsWith("TARGET_") && key !== "AGENT_UI_TOKEN"), "AGENT_UI_TOKEN"];
  const keys = [...new Set([...ordered, ...Object.keys(values)])];
  const lines = keys.filter((key) => values[key] !== undefined).map((key) => `${key}=${escapeEnvValue(values[key])}`);
  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function setIfString(target, key, value) {
  if (typeof value === "string") target[key] = value.trim();
}

function escapeEnvValue(value) {
  const text = String(value ?? "");
  return /[\s#"']/.test(text) ? JSON.stringify(text) : text;
}
