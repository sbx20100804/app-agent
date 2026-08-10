import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendJson, readJsonBody } from "./utils/json.mjs";
import { requireAuthorized } from "./utils/auth.mjs";
import { handleConfig } from "./routes/config.mjs";
import { serveStatic } from "./routes/static.mjs";
import { startRun, approveRun, stopRun, listRuns, readRun, listActiveRuns, deleteRun, clearRuns } from "./routes/runs.mjs";
import { listWorkspaceTree, readWorkspaceFile, gitStatus, gitDiff } from "./routes/workspace.mjs";
import { createWorktree, listWorktrees, removeWorktree } from "./routes/worktrees.mjs";
import { listSkills } from "./routes/skills.mjs";
import { listMcpServers, listPlugins } from "./routes/integrations.mjs";
import { getSettings, saveSettings } from "./routes/settings.mjs";
import { runTerminalCommand } from "./routes/terminal.mjs";
import { RunManager } from "./runtime/run-manager.mjs";
import { EventStore } from "./storage/event-store.mjs";
import { loadEnvFile } from "./utils/env.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publicRoot = path.join(root, "public");
loadEnvFile(root);
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4317);
const eventStore = new EventStore(path.join(root, "data"));
const manager = new RunManager({ eventStore });

const deps = { manager, eventStore, readJsonBody, sendJson, root };

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);

    if (url.pathname.startsWith("/api/") && !requireAuthorized(request, response)) return;

    if (request.method === "GET" && url.pathname === "/api/config") {
      return handleConfig(request, response, { sendJson });
    }
    if (request.method === "GET" && url.pathname === "/api/settings") {
      return getSettings(request, response, deps);
    }
    if (request.method === "POST" && url.pathname === "/api/settings") {
      return await saveSettings(request, response, deps);
    }
    if (request.method === "GET" && url.pathname === "/api/workspace/tree") {
      return await listWorkspaceTree(request, response, { ...deps, url });
    }
    if (request.method === "GET" && url.pathname === "/api/workspace/file") {
      return await readWorkspaceFile(request, response, { ...deps, url });
    }
    if (request.method === "GET" && url.pathname === "/api/runs/active") {
      return listActiveRuns(request, response, deps);
    }
    if (request.method === "GET" && url.pathname === "/api/worktrees") {
      return await listWorktrees(request, response, { ...deps, url });
    }
    if (request.method === "POST" && url.pathname === "/api/worktrees/create") {
      return await createWorktree(request, response, deps);
    }
    if (request.method === "POST" && url.pathname === "/api/worktrees/remove") {
      return await removeWorktree(request, response, deps);
    }
    if (request.method === "GET" && url.pathname === "/api/skills") {
      return listSkills(request, response, deps);
    }
    if (request.method === "GET" && url.pathname === "/api/mcp/servers") {
      return listMcpServers(request, response, deps);
    }
    if (request.method === "GET" && url.pathname === "/api/plugins") {
      return listPlugins(request, response, deps);
    }
    if (request.method === "GET" && url.pathname === "/api/git/status") {
      return await gitStatus(request, response, { ...deps, url });
    }
    if (request.method === "GET" && url.pathname === "/api/git/diff") {
      return await gitDiff(request, response, { ...deps, url });
    }
    if (request.method === "POST" && url.pathname === "/api/terminal/run") {
      return await runTerminalCommand(request, response, deps);
    }
    if (request.method === "GET" && url.pathname === "/api/runs") {
      return listRuns(request, response, deps);
    }
    if (request.method === "DELETE" && url.pathname === "/api/runs") {
      return clearRuns(request, response, deps);
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/api/runs/")) {
      return deleteRun(request, response, { ...deps, url });
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/runs/")) {
      return readRun(request, response, { ...deps, url });
    }
    if (request.method === "POST" && url.pathname === "/api/run") {
      return await startRun(request, response, deps);
    }
    if (request.method === "POST" && url.pathname === "/api/approve") {
      return await approveRun(request, response, deps);
    }
    if (request.method === "POST" && url.pathname === "/api/stop") {
      return await stopRun(request, response, deps);
    }
    if (request.method === "GET") {
      return await serveStatic(url.pathname, response, publicRoot);
    }
    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const status = error.statusCode ?? 500;
    if (!response.headersSent) {
      sendJson(response, status, { error: error.message });
    } else if (!response.writableEnded) {
      response.end();
    }
  }
});

server.listen(port, host, () => {
  console.log(`Agent UI: http://${host}:${port}`);
});
