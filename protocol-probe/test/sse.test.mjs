import test from "node:test";
import assert from "node:assert/strict";
import { parseServerSentEvents } from "../src/sse.mjs";

test("解析跨数据块的 SSE 和多行 data", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": keep-alive\r\ndata: {\"a\":"));
      controller.enqueue(encoder.encode("1}\r\n\r\nevent: done\ndata: [DONE]\n\n"));
      controller.close();
    },
  });

  const events = [];
  for await (const event of parseServerSentEvents(body)) {
    events.push(event);
  }

  assert.deepEqual(events, [
    { event: "message", data: '{"a":1}' },
    { event: "done", data: "[DONE]" },
  ]);
});

test("忽略没有 data 字段的 SSE 块", async () => {
  const body = new Response("id: 1\n\n").body;
  const events = [];
  for await (const event of parseServerSentEvents(body)) {
    events.push(event);
  }
  assert.deepEqual(events, []);
});
