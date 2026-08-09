import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, ModelApiClient } from "../src/client.mjs";

test("拼接文本、推理字段和分段工具参数", async () => {
  const chunks = [
    {
      id: "probe-1",
      model: "test-model",
      choices: [{ delta: { reasoning_content: "think " } }],
    },
    {
      choices: [{
        delta: {
          reasoning_content: "done",
          tool_calls: [{
            index: 0,
            id: "call_",
            type: "function",
            function: { name: "get_", arguments: '{\"field\":' },
          }],
        },
      }],
    },
    {
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: "1",
            function: { name: "runtime_info", arguments: '\"platform\"}' },
          }],
        },
        finish_reason: "tool_calls",
      }],
    },
  ];
  const fetchImpl = async () => new Response(toSse(chunks), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
  const client = new ModelApiClient({
    baseUrl: "https://target.invalid",
    apiKey: "secret",
    fetchImpl,
  });

  const result = await client.streamChat({ model: "test-model", messages: [] });

  assert.equal(result.reasoningContent, "think done");
  assert.equal(result.toolCalls[0].id, "call_1");
  assert.equal(result.toolCalls[0].function.name, "get_runtime_info");
  assert.deepEqual(JSON.parse(result.toolCalls[0].function.arguments), {
    field: "platform",
  });
  assert.deepEqual(result.finishReasons, ["tool_calls"]);
  assert.equal(result.sawDone, true);
});

test("将 HTTP 错误归一化且不丢失请求 ID", async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ error: { message: "bad request" } }),
    { status: 400, headers: { "x-request-id": "req-123" } },
  );
  const client = new ModelApiClient({
    baseUrl: "https://target.invalid",
    apiKey: "secret",
    fetchImpl,
  });

  await assert.rejects(
    () => client.chat({ model: "test-model", messages: [] }),
    (error) => {
      assert(error instanceof ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.requestId, "req-123");
      assert.equal(error.message, "bad request");
      return true;
    },
  );
});

function toSse(chunks) {
  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
}
