import { ModelApiClient } from "../../../../protocol-probe/src/client.mjs";
import { BaseModelAdapter } from "./base.mjs";

export const DEEPSEEK_MODELS = Object.freeze({
  "deepseek-chat": {
    reasoning: false,
    tools: true,
    maxContext: 64_000,
    role: "general-chat-and-coding",
  },
  "deepseek-reasoner": {
    reasoning: true,
    tools: true,
    maxContext: 64_000,
    role: "complex-reasoning-and-debugging",
  },
});

export class DeepSeekAdapter extends BaseModelAdapter {
  createClient() {
    return new ModelApiClient({
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
      timeoutMs: this.config.timeoutMs,
    });
  }

  getDefaultModel() {
    return this.config.model || "deepseek-chat";
  }

  getReasonerModel() {
    return this.config.reasonerModel || "deepseek-reasoner";
  }

  getSystemPrompt(model = this.getDefaultModel()) {
    const reasoningMode = model.includes("reasoner")
      ? "Use private reasoning to plan carefully, but keep the visible answer concise."
      : "Solve the task directly and keep the visible answer concise.";
    return `You are DeepSeek, running as the local coding agent for this workspace.
Never claim to be Claude, Anthropic, OpenAI, ChatGPT, or another model.
You are not a general chat assistant: inspect the workspace and use the supplied tools for repository tasks.
Work only inside the supplied workspace. Inspect before editing. Use apply_patch for changes.
After changes, run the smallest relevant validation command.
When a tool fails, inspect the error, correct it, or report the exact blocker.
Return a short Chinese summary when the user writes Chinese; preserve code, paths, commands, and error messages exactly.
${reasoningMode}`;
  }

  chooseModel({ requestedModel, task = "" } = {}) {
    if (requestedModel) return requestedModel;
    if ((process.env.DEEPSEEK_AUTO_REASONER ?? "true").toLowerCase() === "false") return this.getDefaultModel();
    const text = task.toLowerCase();
    const complexSignals = [
      "debug",
      "refactor",
      "architecture",
      "multi-file",
      "复杂",
      "调试",
      "重构",
      "架构",
      "多文件",
    ];
    return complexSignals.some((signal) => text.includes(signal))
      ? this.getReasonerModel()
      : this.getDefaultModel();
  }

  getCapabilities(model = this.getDefaultModel()) {
    return {
      provider: "deepseek",
      model,
      ...(DEEPSEEK_MODELS[model] ?? {
        reasoning: model.includes("reasoner"),
        tools: true,
        maxContext: 64_000,
        role: "custom-deepseek-compatible-model",
      }),
    };
  }
}
