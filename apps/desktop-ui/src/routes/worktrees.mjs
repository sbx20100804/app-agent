import { mkdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { validateWorkspacePath } from "../utils/paths.mjs";

export async function createWorktree(request, response, { readJsonBody, sendJson }) {
  const body = await readJsonBody(request, 200_000);
  const workspace = await validateWorkspacePath(body.workspace);
  const taskId = safeName(body.name || `task-${randomUUID().slice(0, 8)}`);
  const baseDir = body.baseDir ? path.resolve(body.baseDir) : path.resolve(workspace, "..", ".agent-worktrees");
  await mkdir(baseDir, { recursive: true });
  const worktreePath = path.join(baseDir, taskId);
  const branchName = safeBranch(body.branch || `agent/${taskId}`);

  const isRepo = await runGit(workspace, ["rev-parse", "--is-inside-work-tree"]);
  if (!isRepo.ok) return sendJson(response, 400, { error: "\u5de5\u4f5c\u533a\u4e0d\u662f Git \u4ed3\u5e93", detail: isRepo.stderr });

  const result = await runGit(workspace, ["worktree", "add", "-b", branchName, worktreePath]);
  return sendJson(response, result.ok ? 200 : 500, {
    ok: result.ok,
    taskId,
    branchName,
    worktreePath,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  });
}

export async function listWorktrees(request, response, { sendJson, url }) {
  const workspace = await validateWorkspacePath(url.searchParams.get("workspace"));
  const result = await runGit(workspace, ["worktree", "list", "--porcelain"]);
  return sendJson(response, 200, { ok: result.ok, worktrees: parseWorktrees(result.stdout), stderr: result.stderr });
}

export async function removeWorktree(request, response, { readJsonBody, sendJson }) {
  const body = await readJsonBody(request, 200_000);
  const workspace = await validateWorkspacePath(body.workspace);
  const target = path.resolve(body.worktreePath || "");
  if (!target) return sendJson(response, 400, { error: "worktreePath \u4e0d\u80fd\u4e3a\u7a7a" });
  const result = await runGit(workspace, ["worktree", "remove", target, "--force"]);
  return sendJson(response, result.ok ? 200 : 500, result);
}

function parseWorktrees(stdout) {
  const items = [];
  let current = null;
  for (const line of String(stdout || "").split(/\r?\n/)) {
    if (!line.trim()) {
      if (current) items.push(current);
      current = null;
      continue;
    }
    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ");
    if (key === "worktree") current = { path: value };
    else if (current) current[key] = value || true;
  }
  if (current) items.push(current);
  return items;
}

function runGit(cwd, args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 60_000, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout, stderr: stderr || error?.message || "", exitCode: error?.code ?? 0 });
    });
  });
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 80);
}

function safeBranch(value) {
  return String(value).replace(/[^a-zA-Z0-9_./-]/g, "-").slice(0, 120);
}
