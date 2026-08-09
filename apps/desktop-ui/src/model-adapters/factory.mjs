import { DeepSeekAdapter } from "./deepseek.mjs";

export function createModelAdapter(env = process.env) {
  const provider = (env.TARGET_PROVIDER ?? "deepseek").toLowerCase();
  const config = {
    provider,
    baseUrl: env.TARGET_BASE_URL,
    apiKey: env.TARGET_API_KEY,
    model: env.TARGET_AGENT_MODEL ?? env.TARGET_CHAT_MODEL,
    reasonerModel: env.TARGET_REASONER_MODEL,
    timeoutMs: Number(env.TARGET_TIMEOUT_MS) || 120_000,
  };

  if (provider === "deepseek" || provider === "openai-compatible") {
    return new DeepSeekAdapter(config);
  }

  throw Object.assign(new Error(`不支持的模型提供商：${provider}`), { statusCode: 400 });
}

export function createModelClient(env = process.env) {
  return createModelAdapter(env).createClient();
}
