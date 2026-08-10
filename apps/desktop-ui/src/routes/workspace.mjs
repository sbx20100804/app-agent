import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { validateWorkspacePath } from "../utils/paths.mjs";

export async function listWorkspaceTree(request, response, { sendJson, url }) {
  const workspace = url.searchParams.get("workspace");
  const maxDepth = Number(url.searchParams.get("depth") ?? 2);
  const root = await validateWorkspacePath(workspace);
  const tree = await readTree(root, { root, maxDepth: Math.min(Math.max(maxDepth, 1), 5) });
  return sendJson(response, 200, { root, tree });
}

export async function readWorkspaceFile(request, response, { sendJson, url }) {
  const workspace = await validateWorkspacePath(url.searchParams.get("workspace"));
  const relativePath = url.searchParams.get("path") || "";
  const filePath = path.resolve(workspace, relativePath);
  const workspacePrefix = `${workspace}${path.sep}`.toLowerCase();
  if (filePath.toLowerCase() !== workspace.toLowerCase() && !filePath.toLowerCase().startsWith(workspacePrefix)) {
    return sendJson(response, 403, { error: "\u6587\u4ef6\u8def\u5f84\u8d85\u51fa\u5de5\u4f5c\u533a" });
  }
  let realFilePath;
  try {
    realFilePath = await realpath(filePath);
  } catch {
    return sendJson(response, 404, { error: "\u6587\u4ef6\u4e0d\u5b58\u5728" });
  }
  const realWorkspacePrefix = `${workspace}${path.sep}`.toLowerCase();
  if (realFilePath.toLowerCase() !== workspace.toLowerCase() && !realFilePath.toLowerCase().startsWith(realWorkspacePrefix)) {
    return sendJson(response, 403, { error: "\u6587\u4ef6\u8def\u5f84\u8d85\u51fa\u5de5\u4f5c\u533a" });
  }
  const info = await stat(realFilePath);
  if (!info.isFile()) return sendJson(response, 400, { error: "\u76ee\u6807\u4e0d\u662f\u6587\u4ef6" });
  if (info.size > 1_000_000) return sendJson(response, 413, { error: "\u6587\u4ef6\u8fc7\u5927，\u6682\u4e0d\u652f\u6301\u76f4\u63a5\u9884\u89c8" });
  const content = await readFile(realFilePath, "utf8");
  return sendJson(response, 200, { path: relativePath, size: info.size, content });
}

async function readTree(currentPath, options, depth = 0) {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const visible = entries
    .filter((entry) => !shouldSkip(entry.name))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  const result = [];
  for (const entry of visible.slice(0, 200)) {
    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(options.root, fullPath) || ".";
    const node = {
      name: entry.name,
      path: relativePath,
      type: entry.isDirectory() ? "directory" : "file",
    };
    if (entry.isFile()) {
      const info = await stat(fullPath);
      node.size = info.size;
    }
    if (entry.isDirectory() && depth + 1 < options.maxDepth) {
      node.children = await readTree(fullPath, options, depth + 1);
    }
    result.push(node);
  }
  return result;
}

function shouldSkip(name) {
  if ([".env", ".git", "node_modules", "dist", "build", ".backup", "data"].includes(name)) return true;
  if (name.startsWith(".backup-")) return true;
  if (/^screen.*\.png$/i.test(name) || name === "step1-verify.png") return true;
  if (name.endsWith("-smoke.json") || name === "smoke-run.json") return true;
  return false;
}

export async function gitStatus(request, response, { sendJson, url }) {
  const workspace = await validateWorkspacePath(url.searchParams.get("workspace"));
  const result = await runGit(workspace, ["status", "--short", "--branch"]);
  return sendJson(response, 200, result);
}

export async function gitDiff(request, response, { sendJson, url }) {
  const workspace = await validateWorkspacePath(url.searchParams.get("workspace"));
  const result = await runGit(workspace, ["diff", "--", "."]);
  return sendJson(response, 200, result);
}

function runGit(cwd, args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 30_000, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        command: `git ${args.join(" ")}`,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr || error?.message || ""),
        exitCode: error?.code ?? 0,
      });
    });
  });
}

function trimOutput(value, max = 60_000) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}\n...<truncated>` : text;
}
