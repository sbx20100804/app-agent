import { serializeToolResult, TOOL_DEFINITIONS } from "./tools.mjs";

const SYSTEM_PROMPT = `You are a local software engineering agent.
Work only inside the supplied workspace. Inspect before editing. Use apply_patch for changes.
After changes, run the smallest relevant validation command. Keep responses concise and report what changed.
If a tool fails, inspect the error and either correct it or explain the blocker.`;

export class AgentRunError extends Error {
  constructor(message, code = "AGENT_ERROR") {
    super(message);
    this.name = "AgentRunError";
    this.code = code;
  }
}

export class Agent {
  constructor({ client, model, tools, maxTurns = 20, onEvent = () => {} }) {
    this.client = client;
    this.model = model;
    this.tools = tools;
    this.maxTurns = maxTurns;
    this.onEvent = onEvent;
  }

  async run(task, options = {}) {
    if (typeof task !== "string" || !task.trim()) {
      throw new AgentRunError("任务不能为空", "INVALID_TASK");
    }
    const messages = [
      { role: "system", content: options.systemPrompt ?? SYSTEM_PROMPT },
      { role: "user", content: task },
    ];
    const startedAt = new Date().toISOString();
    this.onEvent({ type: "run_start", task, model: this.model });

    for (let turn = 1; turn <= this.maxTurns; turn += 1) {
      this.onEvent({ type: "model_start", turn });
      const stream = await this.client.streamChat(
        {
          model: this.model,
          messages,
          tools: TOOL_DEFINITIONS,
          tool_choice: "auto",
          stream_options: { include_usage: true },
        },
        {
          signal: options.signal,
          onChunk: (chunk) => this.onEvent({ type: "model_chunk", turn, chunk }),
        },
      );

      const assistantMessage = {
        role: "assistant",
        content: stream.content || null,
      };
      if (stream.reasoningContent) {
        assistantMessage.reasoning_content = stream.reasoningContent;
      }
      if (stream.toolCalls.length > 0) {
        assistantMessage.tool_calls = stream.toolCalls;
      }
      messages.push(assistantMessage);
      this.onEvent({
        type: "model_end",
        turn,
        content: stream.content,
        reasoningContent: stream.reasoningContent,
        toolCallCount: stream.toolCalls.length,
        finishReasons: stream.finishReasons,
      });

      if (stream.toolCalls.length === 0) {
        const result = {
          status: "completed",
          content: stream.content,
          reasoningContent: stream.reasoningContent,
          turns: turn,
          messages,
          startedAt,
          finishedAt: new Date().toISOString(),
        };
        this.onEvent({ type: "run_end", ...result });
        return result;
      }

      for (const call of stream.toolCalls) {
        const input = parseToolArguments(call.function?.arguments);
        const toolResult = input.error
          ? { ok: false, error: input.error }
          : await this.tools.execute(call.function.name, input.value);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: serializeToolResult(toolResult),
        });
      }
    }

    throw new AgentRunError(`超过最大工具轮次 (${this.maxTurns})`, "MAX_TURNS");
  }
}

function parseToolArguments(argumentsText) {
  try {
    return { value: JSON.parse(argumentsText || "{}") };
  } catch (error) {
    return {
      error: {
        code: "INVALID_TOOL_ARGUMENTS",
        message: `工具参数不是有效 JSON: ${error.message}`,
      },
    };
  }
}

export { SYSTEM_PROMPT };
