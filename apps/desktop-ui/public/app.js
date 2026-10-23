const state = {
  running: false,
  runId: null,
  reader: null,
  assistantMessage: null,
  assistantContent: "",
  reasoningContent: "",
  permissionMode: "ask",
  turns: 0,
  tools: 0,
  files: 0,
  pendingApproval: null,
  sessions: loadSessions(),
};

const elements = {
  appShell: document.querySelector(".app-shell"),
  threadTitle: document.querySelector("#thread-title"),
  workspace: document.querySelector("#workspace"),
  topbarWorkspace: document.querySelector("#topbar-workspace"),
  model: document.querySelector("#model"),
  permissionMode: document.querySelector("#permission-mode"),
  permissionLabel: document.querySelector("#permission-label"),
  taskInput: document.querySelector("#task-input"),
  composer: document.querySelector("#composer"),
  sendButton: document.querySelector("#send-button"),
  runStrip: document.querySelector("#run-strip"),
  runStatus: document.querySelector("#run-status"),
  conversation: document.querySelector("#conversation"),
  messageList: document.querySelector("#message-list"),
  emptyState: document.querySelector("#empty-state"),
  sessionList: document.querySelector("#session-list"),
  connectionDot: document.querySelector("#connection-dot"),
  connectionLabel: document.querySelector("#connection-label"),
  connectionModel: document.querySelector("#connection-model"),
  modelDot: document.querySelector(".model-dot"),
  inspector: document.querySelector("#inspector"),
  inspectorStatus: document.querySelector("#inspector-status"),
  inspectorStatusMeta: document.querySelector("#inspector-status-meta"),
  inspectorWorkspace: document.querySelector("#inspector-workspace"),
  inspectorSession: document.querySelector("#inspector-session"),
  inspectorPermission: document.querySelector("#inspector-permission"),
  inspectorPermissionBadge: document.querySelector("#inspector-permission-badge"),
  runDot: document.querySelector("#run-dot"),
  statTurns: document.querySelector("#stat-turns"),
  statTools: document.querySelector("#stat-tools"),
  statFiles: document.querySelector("#stat-files"),
  activityList: document.querySelector("#activity-list"),
  permissionModal: document.querySelector("#permission-modal"),
  permissionTitle: document.querySelector("#permission-title"),
  permissionCopy: document.querySelector("#permission-copy"),
  permissionDetail: document.querySelector("#permission-detail"),
  projectName: document.querySelector("#project-name"),
};

bindEvents();
renderSessions();
refreshSessionHistory();
refreshConfig();
resizeComposer();
initWorkspacePanelV2();
initSettingsUi();
initOnboardingUi();
setTimeout(normalizeModelSelector, 500);
if (elements.projectName) elements.projectName.textContent = basename(elements.workspace.value) || "未选择项目";

function bindEvents() {
  elements.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    startRun();
  });
  elements.taskInput.addEventListener("input", resizeComposer);
  elements.taskInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      startRun();
    }
  });
  document.querySelectorAll("[data-starter]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.taskInput.value = button.dataset.starter;
      resizeComposer();
      elements.taskInput.focus();
    });
  });
  document.querySelector("#new-task").addEventListener("click", resetConversation);
  document.querySelector("#clear-sessions").addEventListener("click", async () => {
    await fetch("/api/runs", { method: "DELETE" }).catch(() => {});
    state.sessions = [];
    persistSessions();
    renderSessions();
  });
  document.querySelector("#refresh-config").addEventListener("click", refreshConfig);
  document.querySelector("#stop-run").addEventListener("click", stopRun);
  elements.workspace.addEventListener("input", () => {
    elements.topbarWorkspace.textContent = basename(elements.workspace.value) || "工作区";
    elements.inspectorWorkspace.textContent = elements.workspace.value || "未选择";
    if (elements.projectName) elements.projectName.textContent = basename(elements.workspace.value) || "未选择项目";
  });
  elements.permissionMode.addEventListener("click", cyclePermissionMode);
  elements.model.addEventListener("change", () => {
    elements.model.dataset.userSelected = "true";
  });
  document.querySelector("#toggle-inspector").addEventListener("click", toggleInspector);
  document.querySelector("#close-inspector").addEventListener("click", closeInspector);
  document.querySelector("#choose-workspace").addEventListener("click", () => {
    elements.workspace.focus();
    elements.workspace.select();
  });
  document.querySelector("#open-sidebar").addEventListener("click", () => toggleSidebar(true));
  document.querySelector("#close-sidebar").addEventListener("click", () => toggleSidebar(false));
  document.querySelector("#sidebar-backdrop").addEventListener("click", () => toggleSidebar(false));
  document.querySelector("#allow-permission").addEventListener("click", () => resolveApproval(true));
  document.querySelector("#deny-permission").addEventListener("click", () => resolveApproval(false));
  window.addEventListener("resize", resizeComposer);
  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      resetConversation();
      elements.taskInput.focus();
    }
    if (event.key === "Escape") {
      closePermissionModal();
      toggleSidebar(false);
      closeInspector();
    }
  });
}
async function refreshConfig() {
  try {
    const response = await fetch("/api/config");
    const config = await response.json();
    elements.connectionDot.className = `connection-dot ${config.configured ? "ready" : "error"}`;
    elements.modelDot.className = `model-dot ${config.configured ? "ready" : "error"}`;
    elements.connectionLabel.textContent = config.configured ? "已连接" : "未配置";
    elements.connectionModel.textContent = config.model || "鐩爣妯″瀷";
    if (config.model && config.model !== "未配置") {
      const existing = [...elements.model.options].some((option) => option.value === config.model);
      if (!existing) elements.model.add(new Option(config.model, config.model));
      elements.model.value = config.model;
    }
  } catch {
    elements.connectionDot.className = "connection-dot error";
    elements.connectionLabel.textContent = "服务未启动";
  }
}

async function startRun() {
  if (state.running) return;
  const task = elements.taskInput.value.trim();
  const workspace = elements.workspace.value.trim();
  if (!task) {
    elements.taskInput.focus();
    return;
  }
  if (!workspace) {
    showToast("请先填写工作区路径");
    elements.workspace.focus();
    return;
  }

  state.running = true;
  state.turns = 0;
  state.tools = 0;
  state.files = 0;
  state.assistantContent = "";
  state.reasoningContent = "";
  state.assistantMessage = null;
  elements.emptyState.classList.add("hidden");
  elements.taskInput.value = "";
  resizeComposer();
  setRunningUi(true);
  appendMessage("user", task);
  elements.threadTitle.textContent = task.length > 56 ? `${task.slice(0, 56)}...` : task;
  addSession(task);
  setInspectorStatus("运行中", "模型正在分析任务", "ready");
  addActivity("任务已开始", task.slice(0, 70));

  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task,
        workspace,
        permissions: state.permissionMode,
        model: elements.model.value,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || "鍚姩杩愯澶辫触");
    }
    await consumeEvents(response.body);
  } catch (error) {
    appendMessage("assistant", `运行失败：${error.message}`);
    setInspectorStatus("失败", error.message, "error");
  } finally {
    closePermissionModal();
    setRunningUi(false);
  }
}

async function consumeEvents(body) {
  const reader = body.getReader();
  state.reader = reader;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    buffer = buffer.replaceAll("\r\n", "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      processEvent(parseSseBlock(block));
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  if (buffer.trim()) processEvent(parseSseBlock(buffer));
  state.reader = null;
}

function parseSseBlock(block) {
  let event = "message";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return { event, data: {} };
  }
}

function processEvent(message) {
  const { event, data } = message;
  if (event === "run_open") {
    state.runId = data.runId;
    attachSessionRun(data.runId);
    elements.inspectorSession.textContent = data.runId.slice(0, 8);
    addActivity("运行已连接", data.model);
  } else if (event === "model_start") {
    state.turns = Math.max(state.turns, data.turn ?? 0);
    elements.runStatus.textContent = `代理正在分析 · 第 ${data.turn} 轮`;
    updateStats();
  } else if (event === "model_delta") {
    if (data.reasoning) {
      state.reasoningContent += data.reasoning;
      ensureAssistantMessage();
      renderAssistant();
    }
    if (data.content) {
      state.assistantContent += data.content;
      ensureAssistantMessage();
      renderAssistant();
    }
  } else if (event === "model_end") {
    state.turns = Math.max(state.turns, data.turn ?? 0);
    updateStats();
  } else if (event === "tool_start") {
    state.tools += 1;
    updateStats();
    appendToolLog(data.name, data.input, null, null);
    elements.runStatus.textContent = `正在执行 · ${data.name}`;
    addActivity(`鎵ц ${data.name}`, formatShort(data.input));
  } else if (event === "tool_end") {
    updateLastTool(data.name, data.ok, data.result);
    if (data.result?.result?.changed) state.files += data.result.result.changed.length;
    updateStats();
  } else if (event === "permission_request") {
    showPermissionModal(data);
  } else if (event === "run_complete") {
    updateSessionStatus("completed");
    if (!state.assistantContent && data.content) {
      state.assistantContent = data.content;
      ensureAssistantMessage();
      renderAssistant();
    }
    setInspectorStatus("完成", `${data.turns} 轮 · ${state.tools} 个工具`, "ready");
    addActivity("任务完成", `${data.turns} 轮工具调用`);
  } else if (event === "run_error") {
    updateSessionStatus("failed");
    appendMessage("assistant", `运行失败：${data.message}`);
    setInspectorStatus("失败", data.message, "error");
  } else if (event === "run_close") {
    state.runId = null;
  }
}

function ensureAssistantMessage() {
  if (state.assistantMessage) return;
  state.assistantMessage = document.createElement("article");
  state.assistantMessage.className = "message assistant";
  state.assistantMessage.innerHTML = '<div class="message-avatar">A</div><div class="message-body"></div>';
  elements.messageList.appendChild(state.assistantMessage);
}

function renderAssistant() {
  const body = state.assistantMessage.querySelector(".message-body");
  body.innerHTML = "";
  if (state.reasoningContent) {
    const reasoning = document.createElement("div");
    reasoning.className = "reasoning-block";
    reasoning.textContent = state.reasoningContent;
    body.appendChild(reasoning);
  }
  if (state.assistantContent) {
    const content = document.createElement("div");
    content.className = "assistant-rendered";
    content.innerHTML = renderMarkdown(state.assistantContent);
    body.appendChild(content);
  }
  scrollConversation();
}

function appendMessage(role, content) {
  const message = document.createElement("article");
  message.className = `message ${role}`;
  message.innerHTML = `<div class="message-avatar">${role === "user" ? "你" : "A"}</div><div class="message-body"><div class="message-meta">${role === "user" ? "你" : "Agent"}</div></div>`;
  message.querySelector(".message-body").append(document.createTextNode(content));
  elements.messageList.appendChild(message);
  scrollConversation();
  return message;
}

function appendToolLog(name, input, ok, result) {
  const detail = document.createElement("details");
  detail.className = "tool-log";
  detail.dataset.tool = name;
  detail.innerHTML = `<summary><span>${escapeHtml(name)}</span><span class="tool-state">运行中</span></summary><pre class="tool-input">${escapeHtml(formatJson(input))}</pre><pre class="tool-output">${result ? escapeHtml(formatJson(result)) : ""}</pre>`;
  elements.messageList.appendChild(detail);
  scrollConversation();
}

function updateLastTool(name, ok, result) {
  const logs = [...elements.messageList.querySelectorAll(`.tool-log[data-tool="${cssEscape(name)}"]`)];
  const detail = logs.at(-1);
  if (!detail) return;
  const stateElement = detail.querySelector(".tool-state");
  stateElement.textContent = ok ? "完成" : "失败";
  stateElement.className = `tool-state ${ok ? "ok" : "error"}`;
  detail.querySelector(".tool-output").textContent = formatJson(result);
}

function setRunningUi(running) {
  state.running = running;
  elements.runStrip.classList.toggle("hidden", !running);
  elements.sendButton.disabled = running;
  elements.taskInput.disabled = running;
  if (!running) elements.runStatus.textContent = "代理正在工作";
}

async function stopRun() {
  if (!state.runId) return;
  await fetch("/api/stop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: state.runId }) }).catch(() => {});
  setInspectorStatus("已停止", "用户停止了当前运行", "error");
}

function showPermissionModal(data) {
  state.pendingApproval = data;
  elements.permissionTitle.textContent = `允许执行 ${data.toolName}`;
  elements.permissionCopy.textContent = "这个工具请求会在当前工作区内执行。";
  elements.permissionDetail.textContent = formatJson(data.input);
  elements.permissionModal.classList.remove("hidden");
}

async function resolveApproval(approved) {
  const approval = state.pendingApproval;
  if (!approval || !state.runId) return;
  closePermissionModal();
  await fetch("/api/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId: state.runId, approvalId: approval.approvalId, approved }),
  }).catch(() => {});
}

function closePermissionModal() {
  state.pendingApproval = null;
  elements.permissionModal.classList.add("hidden");
}

function cyclePermissionMode() {
  const modes = ["ask", "auto", "read-only"];
  state.permissionMode = modes[(modes.indexOf(state.permissionMode) + 1) % modes.length];
  const labels = { ask: "询问", auto: "自动执行", "read-only": "只读" };
  elements.permissionLabel.textContent = labels[state.permissionMode];
  elements.permissionMode.querySelector(".mode-dot").className = `mode-dot ${state.permissionMode}`;
  const badge = elements.inspectorPermissionBadge;
  badge.className = `permission-badge ${state.permissionMode}`;
  badge.textContent = state.permissionMode === "read-only" ? "READ" : state.permissionMode.toUpperCase();
  elements.inspectorPermission.textContent = state.permissionMode === "ask" ? "写入和命令需要确认" : state.permissionMode === "auto" ? "自动执行工具" : "只允许读取和查看差异";
}

function resetConversation() {
  if (state.running) return;
  elements.messageList.innerHTML = "";
  elements.emptyState.classList.remove("hidden");
  elements.taskInput.value = "";
  elements.threadTitle.textContent = "新任务";
  state.assistantMessage = null;
  state.assistantContent = "";
  state.reasoningContent = "";
  state.turns = 0;
  state.tools = 0;
  state.files = 0;
  updateStats();
  setInspectorStatus("空闲", "等待下一个任务", "");
}

function setInspectorStatus(status, meta, tone) {
  elements.inspectorStatus.textContent = status;
  elements.inspectorStatusMeta.textContent = meta;
  elements.runDot.className = `large-status-dot ${tone}`;
}

function updateStats() {
  elements.statTurns.textContent = state.turns;
  elements.statTools.textContent = state.tools;
  elements.statFiles.textContent = state.files;
}

function addActivity(title, detail) {
  const empty = elements.activityList.querySelector(".activity-empty");
  empty?.remove();
  const item = document.createElement("div");
  item.className = "activity-item";
  item.innerHTML = `<span class="activity-marker"></span><div class="activity-copy">${escapeHtml(title)}<small>${escapeHtml(detail || "")}</small></div>`;
  elements.activityList.prepend(item);
  while (elements.activityList.children.length > 5) elements.activityList.lastElementChild.remove();
}

function renderSessions() {
  elements.sessionList.innerHTML = "";
  if (!state.sessions.length) {
    elements.sessionList.innerHTML = '<div class="session-empty">还没有任务</div>';
    return;
  }
  for (const session of state.sessions) {
    const button = document.createElement("button");
    button.className = `session-item${session.runId === state.runId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `<span class="session-title">${escapeHtml(session.title)}</span>`;
    button.addEventListener("click", () => loadSession(session));
    elements.sessionList.appendChild(button);
  }
}

function addSession(title) {
  state.sessions = [{ title, time: "刚刚", status: "queued" }, ...state.sessions.filter((item) => item.title !== title)].slice(0, 12);
  persistSessions();
  renderSessions();
}

function attachSessionRun(runId) {
  const title = elements.threadTitle.textContent;
  const session = state.sessions.find((item) => item.title === title) || state.sessions[0];
  if (!session) return;
  session.runId = runId;
  session.time = "刚刚";
  session.status = "running";
  persistSessions();
  renderSessions();
}

function updateSessionStatus(status) {
  const session = state.sessions.find((item) => item.runId === state.runId);
  if (!session) return;
  session.status = status;
  session.time = "刚刚";
  persistSessions();
  renderSessions();
}

async function refreshSessionHistory() {
  try {
    const data = await fetchJson("/api/runs");
    const remote = (data.runs || []).map((run) => ({
      title: run.task || run.runId,
      time: formatSessionTime(run.updatedAt || run.createdAt),
      runId: run.runId,
      status: run.status || "idle",
    }));
    const merged = [...remote, ...state.sessions];
    const seen = new Set();
    state.sessions = merged.filter((item) => {
      const key = item.runId || item.title;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);
    persistSessions();
    renderSessions();
  } catch {
    // Keep the local list usable when the server is unavailable.
  }
}

async function loadSession(session) {
  if (state.running) {
    showToast("\u5f53\u524d\u4efb\u52a1\u6b63\u5728\u8fd0\u884c\uff0c\u8bf7\u5148\u505c\u6b62\u540e\u518d\u5207\u6362\u4efb\u52a1");
    return;
  }
  if (!session.runId) {
    elements.taskInput.value = session.title;
    resizeComposer();
    elements.taskInput.focus();
    return;
  }
  try {
    const data = await fetchJson(`/api/runs/${encodeURIComponent(session.runId)}`);
    restoreRunSession(session, data);
  } catch (error) {
    showToast(`\u52a0\u8f7d\u4efb\u52a1\u5931\u8d25\uff1a${error.message}`);
  }
}

function restoreRunSession(session, data) {
  elements.messageList.innerHTML = "";
  elements.emptyState.classList.add("hidden");
  state.runId = session.runId;
  state.assistantMessage = null;
  state.assistantContent = "";
  state.reasoningContent = "";
  state.turns = 0;
  state.tools = 0;
  state.files = 0;
  elements.threadTitle.textContent = session.title.length > 56 ? `${session.title.slice(0, 56)}...` : session.title;
  elements.inspectorSession.textContent = session.runId.slice(0, 8);
  appendMessage("user", session.title);
  for (const event of data.events || []) {
    const payload = event.payload || {};
    if (event.type === "model_start") state.turns = Math.max(state.turns, payload.turn || 0);
    if (event.type === "model_delta") {
      state.assistantContent += payload.content || "";
      state.reasoningContent += payload.reasoning || "";
    }
    if (event.type === "tool_start") {
      state.tools += 1;
      appendToolLog(payload.name, payload.input, null, null);
    }
    if (event.type === "tool_end") updateLastTool(payload.name, payload.ok, payload.result);
    if (event.type === "run_complete" && !state.assistantContent) state.assistantContent = payload.content || "";
  }
  if (state.assistantContent || state.reasoningContent) {
    ensureAssistantMessage();
    renderAssistant();
  }
  updateStats();
  setInspectorStatus(data.meta?.status || "\u5df2\u52a0\u8f7d", `${state.turns} \u8f6e 路 ${state.tools} \u4e2a\u5de5\u5177`, "ready");
  renderSessions();
}

function formatSessionTime(value) {
  if (!value) return "\u5386\u53f2";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "\u5386\u53f2" : date.toLocaleString();
}

function loadSessions() {
  try { return JSON.parse(localStorage.getItem("agent-sessions") || "[]"); } catch { return []; }
}

function persistSessions() { localStorage.setItem("agent-sessions", JSON.stringify(state.sessions)); }
function resizeComposer() { elements.taskInput.style.height = "auto"; elements.taskInput.style.height = `${Math.min(elements.taskInput.scrollHeight, 170)}px`; }
function scrollConversation() { elements.conversation.scrollTop = elements.conversation.scrollHeight; }
function toggleSidebar(open) {
  document.querySelector(".sidebar").classList.toggle("open", open);
  document.querySelector("#sidebar-backdrop").classList.toggle("open", open);
}
function toggleInspector() {
  elements.inspector.classList.toggle("open");
}
function closeInspector() {
  elements.inspector.classList.remove("open");
}
function basename(value) { return value.replace(/[\\/]$/, "").split(/[\\/]/).pop(); }
function formatJson(value) { return typeof value === "string" ? value : JSON.stringify(value, null, 2); }
function formatShort(value) { const text = formatJson(value); return text.length > 80 ? `${text.slice(0, 80)}...` : text; }
function cssEscape(value) { return value.replaceAll('"', '\\"'); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function showToast(message) { window.alert(message); }


function renderMarkdown(value) {
  const chunks = [];
  const text = String(value ?? "");
  let cursor = 0;
  const fencePattern = /```([\w.-]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = fencePattern.exec(text))) {
    chunks.push(renderInlineMarkdown(text.slice(cursor, match.index)));
    const lang = match[1] ? `<span class="code-lang">${escapeHtml(match[1])}</span>` : "";
    chunks.push(`<pre>${lang}<code>${escapeHtml(match[2])}</code></pre>`);
    cursor = match.index + match[0].length;
  }
  chunks.push(renderInlineMarkdown(text.slice(cursor)));
  return chunks.join("");
}

function renderInlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\n/g, "<br>");
  return html;
}


let workspacePanelTimer = null;

function initWorkspacePanel() {
  if (document.querySelector("#workspace-panel")) return;
  const panel = document.createElement("section");
  panel.className = "workspace-panel";
  panel.id = "workspace-panel";
  panel.innerHTML = `
    <div class="workspace-panel-header">
      <strong>\u9879\u76ee\u9762\u677f</strong>
      <button class="quiet-button" id="workspace-panel-refresh" type="button" title="\u5237\u65b0\u9879\u76ee\u9762\u677f">\u5237\u65b0</button>
    </div>
    <div class="workspace-panel-grid">
      <button data-panel-action="tree" type="button"><b>\u6587\u4ef6</b><small id="panel-tree-count">-</small></button>
      <button data-panel-action="git" type="button"><b>Git</b><small id="panel-git-status">-</small></button>
      <button data-panel-action="skills" type="button"><b>Skills</b><small id="panel-skills-count">-</small></button>
      <button data-panel-action="plugins" type="button"><b>Plugins</b><small id="panel-plugins-count">-</small></button>
      <button data-panel-action="mcp" type="button"><b>MCP</b><small id="panel-mcp-count">-</small></button>
      <button data-panel-action="runs" type="button"><b>\u4efb\u52a1</b><small id="panel-runs-count">-</small></button>
    </div>
    <pre class="workspace-panel-output" id="workspace-panel-output">\u70b9\u51fb\u4e0a\u65b9\u5361\u7247\u67e5\u770b\u8be6\u60c5。</pre>`;
  elements.inspector.querySelector(".drawer-body")?.prepend(panel);
  panel.querySelector("#workspace-panel-refresh")?.addEventListener("click", refreshWorkspacePanel);
  panel.querySelectorAll("[data-panel-action]").forEach((button) => {
    button.addEventListener("click", () => showWorkspacePanelDetail(button.dataset.panelAction));
  });
  refreshWorkspacePanel();
}

function scheduleWorkspacePanelRefresh() {
  clearTimeout(workspacePanelTimer);
  workspacePanelTimer = setTimeout(refreshWorkspacePanelV2, 350);
}

async function refreshWorkspacePanel() {
  const workspace = elements.workspace.value.trim();
  const encodedWorkspace = encodeURIComponent(workspace);
  const output = document.querySelector("#workspace-panel-output");
  try {
    const [tree, git, skills, plugins, mcp, activeRuns] = await Promise.all([
      workspace ? fetchJson(`/api/workspace/tree?workspace=${encodedWorkspace}&depth=1`).catch(() => null) : null,
      workspace ? fetchJson(`/api/git/status?workspace=${encodedWorkspace}`).catch(() => null) : null,
      fetchJson("/api/skills").catch(() => null),
      fetchJson("/api/plugins").catch(() => null),
      fetchJson("/api/mcp/servers").catch(() => null),
      fetchJson("/api/runs/active").catch(() => null),
    ]);
    setText("#panel-tree-count", tree?.tree ? `${tree.tree.length} 项` : "-");
    setText("#panel-git-status", git?.ok ? compactGitStatus(git.stdout) : "\u4e0d\u53ef\u7528");
    setText("#panel-skills-count", skills?.skills ? `${skills.skills.length}` : "-");
    setText("#panel-plugins-count", plugins?.plugins ? `${plugins.plugins.length}` : "-");
    setText("#panel-mcp-count", mcp?.servers ? `${mcp.servers.length}` : "-");
    setText("#panel-runs-count", activeRuns?.runs ? `${activeRuns.runs.length}` : "-");
    if (output && !output.dataset.locked) output.textContent = "项目面板已刷新。点击卡片查看详情。";
  } catch (error) {
    if (output) output.textContent = `\u5237\u65b0\u5931\u8d25\uff1a${error.message}`;
  }
}

async function showWorkspacePanelDetail(action) {
  const workspace = elements.workspace.value.trim();
  const encodedWorkspace = encodeURIComponent(workspace);
  const output = document.querySelector("#workspace-panel-output");
  if (!output) return;
  output.dataset.locked = "true";
  output.textContent = "\u52a0\u8f7d\u4e2d...";
  try {
    const urls = {
      tree: `/api/workspace/tree?workspace=${encodedWorkspace}&depth=2`,
      git: `/api/git/status?workspace=${encodedWorkspace}`,
      skills: "/api/skills",
      plugins: "/api/plugins",
      mcp: "/api/mcp/servers",
      runs: "/api/runs/active",
    };
    const data = await fetchJson(urls[action]);
    output.textContent = formatJson(data);
  } catch (error) {
    output.textContent = `\u52a0\u8f7d\u5931\u8d25\uff1a${error.message}`;
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}

function compactGitStatus(stdout) {
  const first = String(stdout || "").split(/\r?\n/).find(Boolean);
  return first ? first.replace(/^##\s*/, "") : "clean";
}

function initWorkspacePanelV2() {
  const panel = document.createElement("section");
  panel.className = "workspace-panel";
  panel.id = "workspace-panel";
  panel.innerHTML = `
    <div class="workspace-panel-header">
      <strong>\u9879\u76ee\u5de5\u5177</strong>
      <button class="quiet-button" id="workspace-panel-refresh" type="button">\u5237\u65b0</button>
    </div>
    <div class="workspace-panel-grid">
      <button data-v2-action="tree" type="button"><b>\u6587\u4ef6</b><small id="panel-tree-count">-</small></button>
      <button data-v2-action="git" type="button"><b>Diff</b><small id="panel-git-status">-</small></button>
      <button data-v2-action="terminal" type="button"><b>Terminal</b><small>Run</small></button>
      <button data-v2-action="history" type="button"><b>\u5386\u53f2</b><small id="panel-history-count">-</small></button>
      <button data-v2-action="skills" type="button"><b>Skills</b><small id="panel-skills-count">-</small></button>
      <button data-v2-action="plugins" type="button"><b>Plugins</b><small id="panel-plugins-count">-</small></button>
      <button data-v2-action="mcp" type="button"><b>MCP</b><small id="panel-mcp-count">-</small></button>
      <button data-v2-action="runs" type="button"><b>\u4efb\u52a1</b><small id="panel-runs-count">-</small></button>
    </div>
    <div class="workspace-panel-output" id="workspace-panel-output">\u70b9\u51fb\u5361\u7247\u67e5\u770b\u8be6\u60c5。</div>`;
  elements.inspector.querySelector(".drawer-body")?.prepend(panel);
  panel.querySelector("#workspace-panel-refresh")?.addEventListener("click", refreshWorkspacePanelV2);
  panel.querySelectorAll("[data-v2-action]").forEach((button) => {
    button.addEventListener("click", () => showWorkspaceTool(button.dataset.v2Action));
  });
  refreshWorkspacePanelV2();
}

async function refreshWorkspacePanelV2() {
  const workspace = elements.workspace.value.trim();
  const encoded = encodeURIComponent(workspace);
  const [tree, git, history, skills, plugins, mcp, active] = await Promise.all([
    workspace ? fetchJson(`/api/workspace/tree?workspace=${encoded}&depth=1`).catch(() => null) : null,
    workspace ? fetchJson(`/api/git/status?workspace=${encoded}`).catch(() => null) : null,
    fetchJson("/api/runs").catch(() => null),
    fetchJson("/api/skills").catch(() => null),
    fetchJson("/api/plugins").catch(() => null),
    fetchJson("/api/mcp/servers").catch(() => null),
    fetchJson("/api/runs/active").catch(() => null),
  ]);
  setText("#panel-tree-count", tree?.tree ? `${tree.tree.length} \u9879` : "-");
  setText("#panel-git-status", git?.ok ? compactGitStatus(git.stdout) : "-");
  setText("#panel-history-count", history?.runs ? String(history.runs.length) : "-");
  setText("#panel-skills-count", skills?.skills ? String(skills.skills.length) : "-");
  setText("#panel-plugins-count", plugins?.plugins ? String(plugins.plugins.length) : "-");
  setText("#panel-mcp-count", mcp?.servers ? String(mcp.servers.length) : "-");
  setText("#panel-runs-count", active?.runs ? String(active.runs.length) : "-");
}

async function showWorkspaceTool(action) {
  const output = document.querySelector("#workspace-panel-output");
  const workspace = elements.workspace.value.trim();
  const encoded = encodeURIComponent(workspace);
  if (!output) return;
  output.textContent = "\u52a0\u8f7d\u4e2d...";
  try {
    if (action === "terminal") return renderTerminalTool(output, workspace);
    const urls = {
      tree: `/api/workspace/tree?workspace=${encoded}&depth=3`,
      git: `/api/git/diff?workspace=${encoded}`,
      history: "/api/runs",
      skills: "/api/skills",
      plugins: "/api/plugins",
      mcp: "/api/mcp/servers",
      runs: "/api/runs/active",
    };
    const data = await fetchJson(urls[action]);
    if (action === "tree") renderFileTree(output, data.tree || [], workspace);
    else if (action === "history") renderHistoryTool(output, data.runs || []);
    else output.innerHTML = `<pre>${escapeHtml(action === "git" ? (data.stdout || data.stderr || "No changes") : formatJson(data))}</pre>`;
  } catch (error) {
    output.textContent = `\u52a0\u8f7d\u5931\u8d25\uff1a${error.message}`;
  }
}

function renderFileTree(output, nodes, workspace) {
  output.innerHTML = "";
  appendFileNodes(output, nodes, workspace, 0);
}

function appendFileNodes(parent, nodes, workspace, depth) {
  for (const node of nodes) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `file-tree-row ${node.type}`;
    row.style.paddingLeft = `${8 + depth * 14}px`;
    row.textContent = `${node.type === "directory" ? "\u25b8" : "\u00b7"} ${node.name}`;
    if (node.type === "file") row.addEventListener("click", () => previewWorkspaceFile(workspace, node.path));
    parent.appendChild(row);
    if (node.children) appendFileNodes(parent, node.children, workspace, depth + 1);
  }
}

async function previewWorkspaceFile(workspace, filePath) {
  const output = document.querySelector("#workspace-panel-output");
  if (!output) return;
  const data = await fetchJson(`/api/workspace/file?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(filePath)}`);
  output.innerHTML = `<div class="file-preview-header"><strong>${escapeHtml(data.path)}</strong><small>${data.size} bytes</small></div><pre>${escapeHtml(data.content)}</pre>`;
}

function renderHistoryTool(output, runs) {
  output.innerHTML = runs.length ? "" : "暂无历史任务。";
  for (const run of runs) {
    const row = document.createElement("button");
    row.className = "history-row";
    row.type = "button";
    row.innerHTML = `<strong>${escapeHtml(run.task || run.runId)}</strong><small>${escapeHtml(run.status || "unknown")} 路 ${escapeHtml(run.model || "")}</small>`;
    row.addEventListener("click", async () => {
      const detail = await fetchJson(`/api/runs/${encodeURIComponent(run.runId)}`);
      output.innerHTML = `<pre>${escapeHtml(formatJson(detail))}</pre>`;
    });
    output.appendChild(row);
  }
}

function renderTerminalTool(output, workspace) {
  output.innerHTML = `<form class="terminal-form"><input name="command" placeholder="npm test" autocomplete="off"><button type="submit">Run</button></form><pre>\u8f93\u5165\u547d\u4ee4\u540e\u6267\u884c。</pre>`;
  output.querySelector("form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const command = new FormData(event.currentTarget).get("command")?.toString().trim();
    const terminalOutput = output.querySelector("pre");
    if (!command || !terminalOutput) return;
    terminalOutput.textContent = `$ ${command}\n\u8fd0\u884c\u4e2d...`;
    try {
      const data = await fetchJson("/api/terminal/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace, command }) });
      terminalOutput.textContent = `$ ${command}\n${data.stdout || ""}${data.stderr || ""}\n[exit ${data.exitCode}]`;
    } catch (error) {
      terminalOutput.textContent = `\u6267\u884c\u5931\u8d25\uff1a${error.message}`;
    }
  });
}


function initSettingsUi() {
  if (document.querySelector("#settings-button")) return;
  const button = document.createElement("button");
  button.className = "settings-button";
  button.id = "settings-button";
  button.type = "button";
  button.innerHTML = '<span aria-hidden="true">&#9881;</span><span>\u8bbe\u7f6e</span>';
  document.querySelector(".sidebar-footer")?.prepend(button);
  button.addEventListener("click", openSettingsModal);

  const modal = document.createElement("div");
  modal.className = "settings-modal hidden";
  modal.id = "settings-modal";
  modal.innerHTML = `
    <form class="settings-card" id="settings-form">
      <div class="settings-card-header">
        <div><strong>\u8bbe\u7f6e</strong><small>DeepSeek\u3001\u6a21\u578b\u3001\u5de5\u4f5c\u533a\u548c\u8fd0\u884c\u53c2\u6570</small></div>
        <button class="icon-button" id="close-settings" type="button" aria-label="\u5173\u95ed\u8bbe\u7f6e">&times;</button>
      </div>
      <div class="settings-grid">
        <label>Provider<input name="provider" value="deepseek"></label>
        <label>Base URL<input name="baseUrl" placeholder="https://api.deepseek.com"></label>
        <label>API Key<input name="apiKey" type="password" placeholder="\u7559\u7a7a\u5219\u4fdd\u7559\u5f53\u524d key"></label>
        <label>Chat Model<input name="chatModel" placeholder="deepseek-chat"></label>
        <label>Reasoner Model<input name="reasonerModel" placeholder="deepseek-reasoner"></label>
        <label>Timeout MS<input name="timeoutMs" placeholder="120000"></label>
        <label class="wide">Workspace Roots<input name="workspaceRoots" placeholder="E:\\app-agent;C:\\Users\\... \u53ef\u7559\u7a7a"></label>
        <label>Tool Output Max<input name="toolResultMaxChars" placeholder="6000"></label>
        <label>Event Payload Max<input name="eventPayloadMaxChars" placeholder="20000"></label>
        <label>Auto Reasoner<select name="autoReasoner"><option value="true">true</option><option value="false">false</option></select></label>
        <label>Host<input name="host" placeholder="127.0.0.1"></label>
        <label>Port<input name="port" placeholder="4317"></label>
        <label class="wide">UI Token<input name="uiToken" type="password" placeholder="\u7559\u7a7a\u5219\u4e0d\u542f\u7528\uff1b\u586b\u5199\u540e /api/* \u9700\u8981 token"></label>
      </div>
      <div class="settings-status" id="settings-status"></div>
      <div class="settings-actions">
        <button class="modal-button secondary" id="reload-settings" type="button">\u91cd\u65b0\u8bfb\u53d6</button>
        <button class="modal-button primary" type="submit">\u4fdd\u5b58\u8bbe\u7f6e</button>
      </div>
    </form>`;
  document.body.appendChild(modal);
  document.querySelector("#close-settings")?.addEventListener("click", closeSettingsModal);
  document.querySelector("#reload-settings")?.addEventListener("click", loadSettingsForm);
  document.querySelector("#settings-form")?.addEventListener("submit", saveSettingsForm);
}

function initOnboardingUi() {
  if (document.querySelector("#feature-list-button")) return;
  const button = document.createElement("button");
  button.className = "settings-button feature-list-button";
  button.id = "feature-list-button";
  button.type = "button";
  button.innerHTML = '<span aria-hidden="true">&#9776;</span><span>\u529f\u80fd\u5217\u8868</span>';
  document.querySelector(".sidebar-footer")?.prepend(button);
  button.addEventListener("click", () => openGuideModal(false));

  if (localStorage.getItem("agent-onboarding-complete") !== "true") {
    setTimeout(() => openGuideModal(true), 120);
  }
}

function openGuideModal(firstRun) {
  let modal = document.querySelector("#guide-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.className = "guide-modal";
    modal.id = "guide-modal";
    modal.innerHTML = `
      <section class="guide-card" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <div class="guide-header">
          <div><span class="guide-kicker">APP AGENT</span><h2 id="guide-title">\u5f00\u59cb\u4f7f\u7528</h2><p id="guide-subtitle"></p></div>
          <button class="icon-button" id="close-guide" type="button" aria-label="\u5173\u95ed\u5f15\u5bfc">&times;</button>
        </div>
        <div class="guide-steps" id="guide-steps"></div>
        <div class="guide-content" id="guide-content"></div>
        <div class="guide-actions"><button class="modal-button secondary" id="guide-back" type="button">\u4e0a\u4e00\u6b65</button><button class="modal-button primary" id="guide-next" type="button">\u4e0b\u4e00\u6b65</button></div>
      </section>`;
    document.body.appendChild(modal);
    document.querySelector("#close-guide")?.addEventListener("click", () => closeGuideModal(true));
    document.querySelector("#guide-back")?.addEventListener("click", () => changeGuideStep(-1));
  }
  modal.dataset.firstRun = firstRun ? "true" : "false";
  modal.classList.remove("hidden");
  modal.dataset.step = firstRun ? "0" : "2";
  renderGuideStep();
}

function closeGuideModal(markComplete) {
  if (markComplete) localStorage.setItem("agent-onboarding-complete", "true");
  document.querySelector("#guide-modal")?.classList.add("hidden");
}

function normalizeModelSelector() {
  const select = elements.model;
  if (!select) return;
  const options = [
    ["auto", "自动选择（DeepSeek）"],
    ["deepseek-chat", "deepseek-chat"],
    ["deepseek-reasoner", "deepseek-reasoner"],
  ];
  for (const [value, label] of options) {
    if (![...select.options].some((option) => option.value === value)) {
      select.add(new Option(label, value));
    }
  }
  if (!select.dataset.userSelected) select.value = "auto";
}

function changeGuideStep(delta) {
  const modal = document.querySelector("#guide-modal");
  if (!modal) return;
  const current = Number(modal.dataset.step || 0);
  const next = Math.min(2, Math.max(0, current + delta));
  modal.dataset.step = String(next);
  renderGuideStep();
}

function renderGuideStep() {
  const modal = document.querySelector("#guide-modal");
  if (!modal) return;
  const step = Number(modal.dataset.step || 0);
  const firstRun = modal.dataset.firstRun === "true";
  const steps = ["\u5de5\u4f5c\u533a", "\u4efb\u52a1\u6a21\u5f0f", "\u529f\u80fd\u603b\u89c8"];
  const content = [
    `<h3>\u5148\u8bbe\u7f6e\u5de5\u4f5c\u533a</h3><p>\u5728\u5e95\u90e8\u8f93\u5165\u9879\u76ee\u8def\u5f84\uff0cAgent \u5c06\u5728\u8fd9\u4e2a\u5de5\u4f5c\u533a\u5185\u8bfb\u53d6\u6587\u4ef6\u3001\u4fee\u6539\u4ee3\u7801\u548c\u8fd0\u884c\u5de5\u5177\u3002</p><div class="guide-callout">\u5f53\u524d\u5de5\u4f5c\u533a\uff1a<code>${escapeHtml(elements.workspace.value || "\u672a\u9009\u62e9")}</code></div>`,
    `<h3>\u9009\u62e9\u6743\u9650\u6a21\u5f0f</h3><div class="guide-mode-list"><div><b>ASK</b><span>\u5199\u5165\u548c\u547d\u4ee4\u6267\u884c\u524d\u8bf7\u6c42\u786e\u8ba4</span></div><div><b>AUTO</b><span>\u81ea\u52a8\u6267\u884c\u5de5\u5177</span></div><div><b>READ</b><span>\u53ea\u8bfb\u53d6\u548c\u67e5\u770b\u5dee\u5f02</span></div></div>`,
    `<h3>\u4f60\u53ef\u4ee5\u505a\u4ec0\u4e48</h3><div class="feature-list">${featureItems().map((item) => `<div class="feature-item"><span class="feature-check">${item.done ? "&#10003;" : ""}</span><div><b>${item.name}</b><small>${item.description}</small></div></div>`).join("")}</div>`,
  ];
  document.querySelector("#guide-title").textContent = firstRun ? "\u5f00\u59cb\u4f7f\u7528" : "\u529f\u80fd\u5217\u8868";
  document.querySelector("#guide-subtitle").textContent = firstRun ? "\u4e09\u6b65\u4e86\u89e3\u672c\u5730\u4ee3\u7806 Agent" : "\u5f53\u524d\u5de5\u4f5c\u53f0\u652f\u6301\u7684\u80fd\u529b";
  document.querySelector("#guide-steps").innerHTML = steps.map((name, index) => `<span class="${index === step ? "active" : index < step ? "done" : ""}">${index + 1} ${name}</span>`).join("");
  document.querySelector("#guide-content").innerHTML = content[step];
  document.querySelector("#guide-back").disabled = step === 0;
  document.querySelector("#guide-next").textContent = step === 2 ? "\u5b8c\u6210" : "\u4e0b\u4e00\u6b65";
  document.querySelector("#guide-next").onclick = () => step === 2 ? closeGuideModal(true) : changeGuideStep(1);
}

function featureItems() {
  return [
    { name: "\u5bf9\u8bdd Agent", description: "\u6d41\u5f0f\u56de\u590d\u3001\u63a8\u7406\u5185\u5bb9\u548c\u591a\u8f6e\u4efb\u52a1", done: true },
    { name: "\u6587\u4ef6\u5de5\u5177", description: "\u6587\u4ef6\u6811\u3001\u6587\u4ef6\u9884\u89c8\u3001\u641c\u7d22\u548c\u4fee\u6539", done: true },
    { name: "Git \u5de5\u4f5c\u6d41", description: "\u72b6\u6001\u3001Diff\u3001Worktree \u548c\u5386\u53f2\u4efb\u52a1", done: true },
    { name: "Terminal", description: "\u5728\u5f53\u524d\u5de5\u4f5c\u533a\u6267\u884c\u547d\u4ee4\u5e76\u67e5\u770b\u7ed3\u679c", done: true },
    { name: "DeepSeek \u6a21\u578b", description: "Chat/Reasoner \u8def\u7531\u3001\u4e0a\u4e0b\u6587\u538b\u7f29\u548c\u5de5\u5177\u8c03\u7528", done: true },
    { name: "Skills / MCP / Plugins", description: "\u626b\u63cf\u3001\u914d\u7f6e\u548c\u53ef\u6269\u5c55\u80fd\u529b", done: true },
    { name: "\u8bbe\u7f6e\u4e2d\u5fc3", description: "\u6a21\u578b\u3001API\u3001\u5de5\u4f5c\u533a\u3001\u9650\u5236\u548c Token", done: true },
  ];
}

async function openSettingsModal() {
  document.querySelector("#settings-modal")?.classList.remove("hidden");
  await loadSettingsForm();
}

function closeSettingsModal() {
  document.querySelector("#settings-modal")?.classList.add("hidden");
}

async function loadSettingsForm() {
  const status = document.querySelector("#settings-status");
  try {
    const settings = await fetchJson("/api/settings");
    const form = document.querySelector("#settings-form");
    for (const [key, value] of Object.entries(settings)) {
      const field = form?.elements.namedItem(key);
      if (field && typeof value !== "boolean") field.value = value ?? "";
    }
    if (form?.elements.namedItem("apiKey")) form.elements.namedItem("apiKey").value = "";
    if (form?.elements.namedItem("uiToken")) form.elements.namedItem("uiToken").value = "";
    if (status) status.textContent = `\u5df2\u8bfb\u53d6\u914d\u7f6e\uff1aAPI Key ${settings.apiKeySet ? "\u5df2\u8bbe\u7f6e" : "\u672a\u8bbe\u7f6e"}\uff0cUI Token ${settings.uiTokenSet ? "\u5df2\u8bbe\u7f6e" : "\u672a\u8bbe\u7f6e"}`;
  } catch (error) {
    if (status) status.textContent = `\u8bfb\u53d6\u5931\u8d25\uff1a${error.message}`;
  }
}

async function saveSettingsForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector("#settings-status");
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const settings = await fetchJson("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (status) status.textContent = "已保存到 .env；部分监听地址和端口修改需要重启服务生效。";
    elements.model.value = settings.chatModel || elements.model.value;
    await refreshConfig();
    await refreshWorkspacePanel();
  } catch (error) {
    if (status) status.textContent = `\u4fdd\u5b58\u5931\u8d25\uff1a${error.message}`;
  }
}

