import { ApiError } from "./client.mjs";

const RUNTIME_TOOL = {
  type: "function",
  function: {
    name: "get_runtime_info",
    description: "Return deterministic runtime information for a protocol test.",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          enum: ["platform"],
          description: "The runtime field to retrieve.",
        },
      },
      required: ["field"],
      additionalProperties: false,
    },
  },
};

export function createProbes(config) {
  const probes = [
    {
      id: "chat.non_stream",
      required: true,
      run: (client) => probeNonStreaming(client, config.chatModel),
    },
    {
      id: "chat.stream",
      required: true,
      run: (client) => probeStreaming(client, config.chatModel),
    },
    {
      id: "reasoning.stream",
      required: true,
      run: (client) => probeReasoning(client, config.reasoningModel),
    },
    {
      id: "chat.tool_roundtrip",
      required: true,
      run: (client) => probeToolRoundtrip(client, config.chatModel),
    },
    {
      id: "reasoning.tool_roundtrip",
      required: true,
      run: (client) => probeToolRoundtrip(client, config.reasoningModel),
    },
  ];

  if (config.includeError) {
    probes.push({
      id: "transport.error_shape",
      required: false,
      run: (client) => probeErrorShape(client),
    });
  }
  if (config.includeCancel) {
    probes.push({
      id: "transport.cancel",
      required: false,
      run: (client) => probeCancellation(client, config.chatModel),
    });
  }
  return probes;
}

async function probeNonStreaming(client, model) {
  const response = await client.chat({
    model,
    messages: [{ role: "user", content: "Reply with exactly: PROBE_OK" }],
    temperature: 0,
    max_tokens: 32,
  });
  const message = response.choices?.[0]?.message;
  assert(message && typeof message.content === "string", "缺少 assistant content");
  return {
    model: response.model ?? model,
    contentPresent: message.content.length > 0,
    finishReason: response.choices?.[0]?.finish_reason ?? null,
    usageFields: Object.keys(response.usage ?? {}),
  };
}

async function probeStreaming(client, model) {
  const result = await client.streamChat({
    model,
    messages: [{ role: "user", content: "Reply with exactly: STREAM_OK" }],
    temperature: 0,
    max_tokens: 32,
    stream_options: { include_usage: true },
  });
  assert(result.chunkCount > 0, "没有收到 SSE 数据块");
  assert(result.content.length > 0, "流中没有文本内容");
  return streamSummary(result);
}

async function probeReasoning(client, model) {
  const result = await client.streamChat({
    model,
    messages: [
      {
        role: "user",
        content: "Compute 17 * 23. Give only the final integer in the answer.",
      },
    ],
    max_tokens: 512,
    stream_options: { include_usage: true },
  });
  assert(result.chunkCount > 0, "推理请求没有收到 SSE 数据块");
  assert(result.content.length > 0, "推理请求缺少最终内容");
  assert(result.reasoningContent.length > 0, "缺少 reasoning_content");
  return streamSummary(result);
}

async function probeToolRoundtrip(client, model) {
  const messages = [
    {
      role: "user",
      content:
        "Call get_runtime_info with field=platform. Do not guess the result.",
    },
  ];
  const first = await client.streamChat({
    model,
    messages,
    tools: [RUNTIME_TOOL],
    tool_choice: "auto",
    temperature: 0,
    max_tokens: 512,
  });
  assert(first.toolCalls.length > 0, "模型没有发出工具调用");

  const call = first.toolCalls[0];
  assert(call.id, "工具调用缺少 id");
  assert(call.function?.name === "get_runtime_info", "工具名称不匹配");
  const args = JSON.parse(call.function.arguments);
  assert(args.field === "platform", "工具参数不匹配");

  const assistantMessage = {
    role: "assistant",
    content: first.content || null,
    tool_calls: first.toolCalls,
  };
  if (first.reasoningContent) {
    assistantMessage.reasoning_content = first.reasoningContent;
  }

  messages.push(assistantMessage, {
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify({ platform: "PROBE_PLATFORM" }),
  });

  const second = await client.streamChat({
    model,
    messages,
    tools: [RUNTIME_TOOL],
    tool_choice: "auto",
    temperature: 0,
    max_tokens: 512,
  });
  assert(second.content.length > 0, "工具结果回传后没有最终回答");

  return {
    model: first.model ?? model,
    toolName: call.function.name,
    argumentsValidJson: true,
    reasoningContentPresent: first.reasoningContent.length > 0,
    secondRoundContentPresent: second.content.length > 0,
    firstFinishReasons: first.finishReasons,
    secondFinishReasons: second.finishReasons,
  };
}

async function probeErrorShape(client) {
  try {
    await client.chat({
      model: `PROBE_INVALID_MODEL_${Date.now()}`,
      messages: [{ role: "user", content: "test" }],
      max_tokens: 1,
    });
  } catch (error) {
    assert(error instanceof ApiError, "错误没有归一化为 ApiError");
    return {
      status: error.status,
      messagePresent: Boolean(error.message),
      requestIdPresent: Boolean(error.requestId),
      bodyType: typeof error.body,
    };
  }
  throw new Error("无效模型请求意外成功");
}

async function probeCancellation(client, model) {
  const result = await client.streamChat(
    {
      model,
      messages: [
        { role: "user", content: "Write a numbered list with 100 short items." },
      ],
      max_tokens: 1024,
    },
    { abortAfterFirstChunk: true },
  );
  assert(result.cancelledLocally, "请求没有在首个数据块后取消");
  return streamSummary(result);
}

function streamSummary(result) {
  return {
    model: result.model,
    chunkCount: result.chunkCount,
    firstByteMs: result.firstByteMs,
    durationMs: result.durationMs,
    contentLength: result.content.length,
    reasoningLength: result.reasoningContent.length,
    toolCallCount: result.toolCalls.length,
    finishReasons: result.finishReasons,
    usageFields: Object.keys(result.usage ?? {}),
    sawDone: result.sawDone,
    cancelledLocally: result.cancelledLocally,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
