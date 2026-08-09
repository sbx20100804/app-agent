import { exec } from "node:child_process";
import { validateWorkspacePath } from "../utils/paths.mjs";

export async function runTerminalCommand(request, response, { readJsonBody, sendJson }) {
  const body = await readJsonBody(request, 200_000);
  const workspace = await validateWorkspacePath(body.workspace);
  const command = typeof body.command === "string" ? body.command.trim() : "";
  if (!command) return sendJson(response, 400, { error: "\u547d\u4ee4\u4e0d\u80fd\u4e3a\u7a7a" });
  const timeoutMs = Math.min(Number(body.timeoutMs) || 30_000, 120_000);
  const result = await runCommand(workspace, command, timeoutMs);
  return sendJson(response, 200, result);
}

function runCommand(cwd, command, timeoutMs) {
  return new Promise((resolve) => {
    exec(command, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        command,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr || error?.message || ""),
        exitCode: error?.code ?? 0,
        timedOut: error?.killed === true,
      });
    });
  });
}

function trimOutput(value, max = 60_000) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}\n...<truncated>` : text;
}
