import { access, stat, realpath } from "node:fs/promises";
import path from "node:path";

const forbiddenRoots = [
  process.env.SystemRoot,
  process.env.ProgramFiles,
  process.env["ProgramFiles(x86)"],
].filter(Boolean).map((p) => path.resolve(p).toLowerCase());

function configuredWorkspaceRoots() {
  return (process.env.WORKSPACE_ROOTS ?? "")
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item).toLowerCase());
}

export async function validateWorkspacePath(inputPath) {
  if (!inputPath || typeof inputPath !== "string") {
    throw Object.assign(new Error("工作区路径不能为空"), { statusCode: 400 });
  }

  const resolved = path.resolve(inputPath);
  await access(resolved);
  const info = await stat(resolved);
  if (!info.isDirectory()) {
    throw Object.assign(new Error("工作区必须是文件夹"), { statusCode: 400 });
  }

  const real = await realpath(resolved);
  const normalized = real.toLowerCase();
  for (const root of forbiddenRoots) {
    if (normalized === root || normalized.startsWith(`${root}${path.sep}`.toLowerCase())) {
      throw Object.assign(new Error("工作区不能位于系统目录"), { statusCode: 403 });
    }
  }

  const allowRoots = configuredWorkspaceRoots();
  if (allowRoots.length && !allowRoots.some((root) => normalized === root || normalized.startsWith(`${root}${path.sep}`.toLowerCase()))) {
    throw Object.assign(new Error("工作区不在允许范围内"), { statusCode: 403 });
  }

  return real;
}
