export async function startRun(request, response, { manager, readJsonBody, sendJson }) {
  if (!process.env.TARGET_API_KEY || !process.env.TARGET_BASE_URL) {
    return sendJson(response, 503, { error: "请先配置 TARGET_API_KEY 和 TARGET_BASE_URL" });
  }
  const body = await readJsonBody(request);
  const task = typeof body.task === "string" ? body.task.trim() : "";
  const workspacePath = typeof body.workspace === "string" ? body.workspace.trim() : "";
  const permissionsMode = body.permissions ?? "ask";
  const model = body.model || process.env.TARGET_AGENT_MODEL || process.env.TARGET_CHAT_MODEL;
  if (!task || !workspacePath || !model) {
    return sendJson(response, 400, { error: "任务、工作区和模型都是必填项" });
  }
  if (!["ask", "auto", "read-only"].includes(permissionsMode)) {
    return sendJson(response, 400, { error: "权限模式无效" });
  }

  const run = manager.createRun(response);
  manager.recordRunMetadata(run.id, {
    status: "running",
    task,
    workspace: workspacePath,
    permissions: permissionsMode,
    model,
  });
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.flushHeaders();
  console.log(`[run ${run.id.slice(0, 8)}] start ${permissionsMode} ${workspacePath}`);
  manager.sendEvent(run, "run_open", { runId: run.id, model, workspace: workspacePath, permissions: permissionsMode });

  response.on("close", () => {
    if (!response.writableEnded) {
      run.closed = true;
      run.controller.abort("client-disconnected");
      manager.resolveApprovals(run, false);
      manager.deleteRun(run.id);
    }
  });

  void manager.execute(run, { task, workspacePath, permissionsMode, model });
}

export async function approveRun(request, response, { manager, readJsonBody, sendJson }) {
  const body = await readJsonBody(request);
  const run = manager.getRun(body.runId);
  const approval = run?.approvals.get(body.approvalId);
  if (!approval) return sendJson(response, 404, { error: "审批请求已过期" });
  run.approvals.delete(body.approvalId);
  clearTimeout(approval.timer);
  approval.resolve(body.approved === true);
  sendJson(response, 200, { ok: true });
}

export async function stopRun(request, response, { manager, readJsonBody, sendJson }) {
  const body = await readJsonBody(request);
  const run = manager.getRun(body.runId);
  if (!run) return sendJson(response, 404, { error: "运行不存在" });
  run.controller.abort("stopped-by-user");
  manager.resolveApprovals(run, false);
  sendJson(response, 200, { ok: true });
}


export function listRuns(_request, response, { eventStore, sendJson }) {
  return sendJson(response, 200, { runs: eventStore.listRuns(50) });
}

export function readRun(request, response, { eventStore, sendJson, url }) {
  const runId = url.pathname.split("/").pop();
  return sendJson(response, 200, eventStore.readRun(runId));
}

export function listActiveRuns(_request, response, { manager, sendJson }) {
  return sendJson(response, 200, { runs: manager.listActiveRuns() });
}
