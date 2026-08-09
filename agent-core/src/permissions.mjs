export class PermissionDeniedError extends Error {
  constructor(toolName, reason) {
    super(`工具 ${toolName} 未获批准: ${reason}`);
    this.name = "PermissionDeniedError";
    this.code = "PERMISSION_DENIED";
    this.toolName = toolName;
    this.reason = reason;
  }
}

export class PermissionEngine {
  constructor(options = {}) {
    this.mode = options.mode ?? "ask";
    this.requestApproval = options.requestApproval ?? (async () => false);
  }

  async check(toolName, input) {
    if (this.mode === "auto") return { allowed: true, mode: "auto" };
    if (this.mode === "read-only" && !READ_ONLY_TOOLS.has(toolName)) {
      return { allowed: false, reason: "当前是只读模式" };
    }
    if (READ_ONLY_TOOLS.has(toolName)) return { allowed: true, mode: "read-only" };
    const approved = await this.requestApproval({ toolName, input });
    return approved
      ? { allowed: true, mode: "approved" }
      : { allowed: false, reason: "用户未批准" };
  }

  async require(toolName, input) {
    const decision = await this.check(toolName, input);
    if (!decision.allowed) {
      throw new PermissionDeniedError(toolName, decision.reason);
    }
    return decision;
  }
}

export const READ_ONLY_TOOLS = new Set([
  "list_files",
  "read_file",
  "search_text",
  "git_status",
  "git_diff",
]);
