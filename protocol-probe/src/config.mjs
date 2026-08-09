import { readFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const result = {
    configPath: null,
    includeError: false,
    includeCancel: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--config") {
      result.configPath = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === "--include-error") {
      result.includeError = true;
    } else if (argument === "--include-cancel") {
      result.includeCancel = true;
    } else if (argument === "--help" || argument === "-h") {
      result.help = true;
    } else {
      throw new Error(`未知参数: ${argument}`);
    }
  }

  return result;
}

async function readJsonConfig(configPath) {
  if (!configPath) {
    return {};
  }

  const absolutePath = path.resolve(configPath);
  const content = await readFile(absolutePath, "utf8");
  return JSON.parse(content);
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} 必须是正整数`);
  }
  return parsed;
}

export async function loadConfig(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const fileConfig = await readJsonConfig(args.configPath);

  const config = {
    baseUrl: env.TARGET_BASE_URL ?? fileConfig.baseUrl,
    apiKey: env.TARGET_API_KEY,
    chatModel: env.TARGET_CHAT_MODEL ?? fileConfig.chatModel,
    reasoningModel:
      env.TARGET_REASONING_MODEL ?? fileConfig.reasoningModel,
    timeoutMs: parsePositiveInteger(
      env.TARGET_TIMEOUT_MS ?? fileConfig.timeoutMs,
      120_000,
      "timeoutMs",
    ),
    includeError: args.includeError,
    includeCancel: args.includeCancel,
    help: args.help ?? false,
  };

  if (config.help) {
    return config;
  }

  validateConfig(config);
  config.baseUrl = config.baseUrl.replace(/\/+$/, "");
  return config;
}

export function validateConfig(config) {
  if (config.help) {
    return;
  }

  const required = [
    ["TARGET_BASE_URL/baseUrl", config.baseUrl],
    ["TARGET_API_KEY", config.apiKey],
    ["TARGET_CHAT_MODEL/chatModel", config.chatModel],
    ["TARGET_REASONING_MODEL/reasoningModel", config.reasoningModel],
  ];

  const missing = required
    .filter(([, value]) => !value || String(value).startsWith("TARGET_") || String(value).endsWith("_MODEL"))
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`缺少配置: ${missing.join(", ")}`);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(config.baseUrl);
  } catch {
    throw new Error("baseUrl 必须是有效的 HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("baseUrl 只支持 HTTP(S)");
  }
}

export function publicConfig(config) {
  return {
    baseUrl: config.baseUrl,
    chatModel: config.chatModel,
    reasoningModel: config.reasoningModel,
    timeoutMs: config.timeoutMs,
    includeError: config.includeError,
    includeCancel: config.includeCancel,
  };
}

export const HELP_TEXT = `用法: node src/run.mjs [选项]

选项:
  --config PATH       读取 JSON 配置
  --include-error     发送一次无效模型请求以采集错误结构
  --include-cancel    验证流式请求取消
  -h, --help          显示帮助
`;
