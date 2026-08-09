import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.mjs";

test("帮助模式不要求 API 配置", async () => {
  const config = await loadConfig(["--help"], {});
  assert.equal(config.help, true);
});

test("缺失配置时给出字段列表", async () => {
  await assert.rejects(
    () => loadConfig([], {}),
    /TARGET_BASE_URL\/baseUrl.*TARGET_API_KEY.*TARGET_CHAT_MODEL.*TARGET_REASONING_MODEL/,
  );
});

test("环境变量覆盖配置并规范化基础地址", async () => {
  const config = await loadConfig([], {
    TARGET_BASE_URL: "https://target.invalid/v1/",
    TARGET_API_KEY: "secret",
    TARGET_CHAT_MODEL: "chat",
    TARGET_REASONING_MODEL: "reasoner",
  });
  assert.equal(config.baseUrl, "https://target.invalid/v1");
  assert.equal(config.timeoutMs, 120_000);
});
