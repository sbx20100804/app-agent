import { performance } from "node:perf_hooks";
import { parseServerSentEvents } from "./sse.mjs";

export class ApiError extends Error {
  constructor(message, { status, statusText, body, requestId }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.requestId = requestId;
  }
}

export class ModelApiClient {
  constructor({ baseUrl, apiKey, timeoutMs = 120_000, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async chat(payload, { signal } = {}) {
    const response = await this.#request(payload, signal);
    const text = await response.text();
    const body = parseJson(text);
    if (!response.ok) {
      throw toApiError(response, body ?? text);
    }
    if (!body || typeof body !== "object") {
      throw new Error("非流式响应不是 JSON 对象");
    }
    return body;
  }

  async streamChat(payload, { signal, abortAfterFirstChunk = false, onChunk } = {}) {
    const startedAt = performance.now();
    const localController = new AbortController();
    const combinedSignal = signal
      ? AbortSignal.any([signal, localController.signal])
      : localController.signal;
    const response = await this.#request(
      { ...payload, stream: true },
      combinedSignal,
    );

    if (!response.ok) {
      const text = await response.text();
      throw toApiError(response, parseJson(text) ?? text);
    }

    const result = createStreamResult();
    try {
      for await (const event of parseServerSentEvents(response.body)) {
        if (event.data === "[DONE]") {
          result.sawDone = true;
          break;
        }

        const chunk = parseJson(event.data);
        if (!chunk) {
          throw new Error(`SSE data 不是有效 JSON: ${event.data.slice(0, 160)}`);
        }
        if (result.firstByteMs === null) {
          result.firstByteMs = Math.round(performance.now() - startedAt);
        }
        result.chunkCount += 1;
        onChunk?.(chunk);
        mergeChunk(result, chunk);

        if (abortAfterFirstChunk) {
          result.cancelledLocally = true;
          localController.abort("probe-cancelled-after-first-chunk");
          break;
        }
      }
    } catch (error) {
      if (!result.cancelledLocally || error?.name !== "AbortError") {
        throw error;
      }
    }

    result.durationMs = Math.round(performance.now() - startedAt);
    result.toolCalls = [...result.toolCallsByIndex.values()]
      .sort((left, right) => left.index - right.index)
      .map(({ index: _index, ...toolCall }) => toolCall);
    delete result.toolCallsByIndex;
    return result;
  }

  async #request(payload, externalSignal) {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const signal = externalSignal
      ? AbortSignal.any([externalSignal, timeoutSignal])
      : timeoutSignal;

    return this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        accept: payload.stream ? "text/event-stream" : "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toApiError(response, body) {
  const message =
    body?.error?.message ??
    body?.message ??
    `${response.status} ${response.statusText}`;
  return new ApiError(message, {
    status: response.status,
    statusText: response.statusText,
    body,
    requestId:
      response.headers.get("x-request-id") ??
      response.headers.get("request-id") ??
      null,
  });
}

function createStreamResult() {
  return {
    id: null,
    model: null,
    content: "",
    reasoningContent: "",
    finishReasons: [],
    usage: null,
    chunkCount: 0,
    firstByteMs: null,
    durationMs: null,
    sawDone: false,
    cancelledLocally: false,
    toolCallsByIndex: new Map(),
  };
}

function mergeChunk(result, chunk) {
  result.id ??= chunk.id ?? null;
  result.model ??= chunk.model ?? null;
  result.usage = chunk.usage ?? result.usage;

  for (const choice of chunk.choices ?? []) {
    const delta = choice.delta ?? {};
    result.content += delta.content ?? "";
    result.reasoningContent += delta.reasoning_content ?? "";
    if (choice.finish_reason) {
      result.finishReasons.push(choice.finish_reason);
    }

    for (const fragment of delta.tool_calls ?? []) {
      const index = fragment.index ?? 0;
      const current = result.toolCallsByIndex.get(index) ?? {
        index,
        id: "",
        type: "function",
        function: { name: "", arguments: "" },
      };
      current.id += fragment.id ?? "";
      current.type = fragment.type ?? current.type;
      current.function.name += fragment.function?.name ?? "";
      current.function.arguments += fragment.function?.arguments ?? "";
      result.toolCallsByIndex.set(index, current);
    }
  }
}
