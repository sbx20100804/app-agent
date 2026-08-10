import { randomUUID } from "node:crypto";
import { Agent } from "../../../../agent-core/src/agent.mjs";
import { PermissionEngine } from "../../../../agent-core/src/permissions.mjs";
import { ToolRegistry } from "../../../../agent-core/src/tools.mjs";
import { Workspace } from "../../../../agent-core/src/workspace.mjs";
import { validateWorkspacePath } from "../utils/paths.mjs";
import { createModelAdapter } from "../model-adapters/factory.mjs";
import { compactEventPayload, summarizeForModel } from "../utils/context.mjs";

export class RunManager {
  constructor({ eventStore } = {}) {
    this.runs = new Map();
    this.eventStore = eventStore;
  }

  createRun(response) {
    const runId = randomUUID();
    const run = {
      id: runId,
      controller: new AbortController(),
      approvals: new Map(),
      response,
      closed: false,
    };
    this.runs.set(runId, run);
    return run;
  }

  getRun(runId) {
    return this.runs.get(runId);
  }

  listActiveRuns() {
    return [...this.runs.values()].map((run) => ({
      runId: run.id,
      closed: run.closed,
      pendingApprovals: run.approvals.size,
    }));
  }

  deleteRun(runId) {
    this.runs.delete(runId);
  }

  recordRunMetadata(runId, patch) {
    this.eventStore?.upsertRun(runId, patch);
  }

  async execute(run, options) {
    try {
      const safeWorkspacePath = await validateWorkspacePath(options.workspacePath);
      const workspace = await new Workspace(safeWorkspacePath).initialize();
      const permissions = new PermissionEngine({
        mode: options.permissionsMode,
        requestApproval: ({ toolName, input }) => this.requestApproval(run, toolName, input),
      });
      const tools = new ToolRegistry({
        workspace,
        permissions,
        onEvent: (event) => this.sendToolEvent(run, event),
      });
      const modelAdapter = createModelAdapter();
      const client = modelAdapter.createClient();
      const requestedModel = options.model === "auto" ? "" : options.model;
      const selectedModel = modelAdapter.chooseModel?.({ requestedModel, task: options.task }) ?? options.model;
      this.sendEvent(run, "model_selected", {
        provider: modelAdapter.config.provider,
        model: selectedModel,
        capabilities: modelAdapter.getCapabilities(selectedModel),
      });
      const agent = new Agent({
        client,
        model: selectedModel,
        tools,
        maxTurns: 20,
        onEvent: (event) => this.sendAgentEvent(run, event),
      });
      const result = await agent.run(options.task, {
        signal: run.controller.signal,
        systemPrompt: modelAdapter.getSystemPrompt?.(selectedModel),
      });
      this.recordRunMetadata(run.id, { status: result.status ?? "completed", turns: result.turns });
      this.sendEvent(run, "run_complete", {
        status: result.status,
        content: result.content,
        turns: result.turns,
      });
    } catch (error) {
      console.error(`[run ${run.id.slice(0, 8)}] ${error.message}`);
      this.recordRunMetadata(run.id, { status: "failed", error: error.message });
      if (!run.closed) {
        this.sendEvent(run, "run_error", { message: error.message, code: error.code ?? "RUN_ERROR" });
      }
    } finally {
      this.resolveApprovals(run, false);
      if (!run.closed) {
        this.sendEvent(run, "run_close", {});
        run.response.end();
      }
      console.log(`[run ${run.id.slice(0, 8)}] close`);
      this.deleteRun(run.id);
    }
  }

  requestApproval(run, toolName, input) {
    const approvalId = randomUUID();
    this.sendEvent(run, "permission_request", { approvalId, toolName, input });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        run.approvals.delete(approvalId);
        resolve(false);
      }, 120_000);
      run.approvals.set(approvalId, { resolve, timer });
    });
  }

  resolveApprovals(run, value) {
    for (const [approvalId, approval] of run.approvals) {
      clearTimeout(approval.timer);
      approval.resolve(value);
      run.approvals.delete(approvalId);
    }
  }

  sendAgentEvent(run, event) {
    if (event.type === "model_chunk") {
      const delta = event.chunk.choices?.[0]?.delta ?? {};
      this.sendEvent(run, "model_delta", {
        turn: event.turn,
        content: delta.content ?? "",
        reasoning: delta.reasoning_content ?? "",
      });
    } else if (event.type === "model_start") {
      this.sendEvent(run, "model_start", { turn: event.turn });
    } else if (event.type === "model_end") {
      this.sendEvent(run, "model_end", {
        turn: event.turn,
        toolCallCount: event.toolCallCount,
        finishReasons: event.finishReasons,
      });
    }
  }

  sendToolEvent(run, event) {
    if (event.type === "tool_start") {
      this.sendEvent(run, "tool_start", { name: event.name, input: event.input });
    } else if (event.type === "tool_end") {
      this.sendEvent(run, "tool_end", {
        name: event.name,
        ok: event.ok,
        result: summarizeForModel(event.result),
      });
    }
  }

  sendEvent(run, event, payload) {
    this.eventStore?.appendEvent(run.id, event, compactEventPayload(payload));
    if (run.closed || run.response.writableEnded) return;
    run.response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }
}

function summarize(value) {
  const text = JSON.stringify(value);
  return text.length > 6000 ? `${text.slice(0, 6000)}\n...` : value;
}
