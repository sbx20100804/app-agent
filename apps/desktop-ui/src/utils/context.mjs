const DEFAULT_MAX_TOOL_RESULT_CHARS = 6_000;
const DEFAULT_MAX_EVENT_PAYLOAD_CHARS = 20_000;

export function summarizeForModel(value, options = {}) {
  const maxChars = options.maxChars ?? (Number(process.env.TOOL_RESULT_MAX_CHARS) || DEFAULT_MAX_TOOL_RESULT_CHARS);
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (text.length <= maxChars) return value;
  return {
    truncated: true,
    originalChars: text.length,
    keptChars: maxChars,
    summary: `${text.slice(0, maxChars)}\n...<truncated ${text.length - maxChars} chars>`,
  };
}

export function compactEventPayload(payload, options = {}) {
  const maxChars = options.maxChars ?? (Number(process.env.EVENT_PAYLOAD_MAX_CHARS) || DEFAULT_MAX_EVENT_PAYLOAD_CHARS);
  const text = JSON.stringify(payload);
  if (text.length <= maxChars) return payload;
  return {
    truncated: true,
    originalChars: text.length,
    keptChars: maxChars,
    preview: text.slice(0, maxChars),
  };
}

export function buildRunSummary(events) {
  const summary = {
    turns: 0,
    tools: 0,
    files: 0,
    errors: [],
    lastModelText: "",
  };
  for (const event of events) {
    if (event.type === "model_start") summary.turns = Math.max(summary.turns, event.payload?.turn ?? 0);
    if (event.type === "tool_start") summary.tools += 1;
    if (event.type === "tool_end" && event.payload?.result?.result?.changed) {
      summary.files += event.payload.result.result.changed.length;
    }
    if (event.type === "run_error") summary.errors.push(event.payload?.message ?? "unknown error");
    if (event.type === "model_delta" && event.payload?.content) {
      summary.lastModelText = `${summary.lastModelText}${event.payload.content}`.slice(-4_000);
    }
  }
  return summary;
}
