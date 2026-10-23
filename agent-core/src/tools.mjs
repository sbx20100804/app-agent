export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files in the current workspace. Results are relative paths.",
      parameters: {
        type: "object",
        properties: { max_entries: { type: "integer", minimum: 1, maximum: 2000 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file from the current workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_text",
      description: "Search text in workspace files and return matching lines.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          case_sensitive: { type: "boolean" },
          max_matches: { type: "integer", minimum: 1, maximum: 500 },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_patch",
      description: "Apply an exact patch to workspace files. Prefer this over rewriting files.",
      parameters: {
        type: "object",
        properties: { patch: { type: "string" } },
        required: ["patch"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "exec_command",
      description: "Execute a shell command in the workspace.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          timeout_ms: { type: "integer", minimum: 100, maximum: 300000 },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_status",
      description: "Show version-control status for the workspace.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "git_diff",
      description: "Show the current version-control diff.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

export class ToolRegistry {
  constructor({ workspace, permissions, onEvent = () => {} }) {
    this.workspace = workspace;
    this.permissions = permissions;
    this.onEvent = onEvent;
  }

  async execute(name, input = {}, options = {}) {
    const definition = TOOL_DEFINITIONS.find((tool) => tool.function.name === name);
    if (!definition) {
      return toolError(`未知工具: ${name}`, "UNKNOWN_TOOL");
    }

    this.onEvent({ type: "tool_start", name, input });
    try {
      await this.permissions.require(name, input);
      const result = await this.#dispatch(name, input, options);
      this.onEvent({ type: "tool_end", name, ok: true, result });
      return { ok: true, result };
    } catch (error) {
      const result = toolError(error.message, error.code ?? "TOOL_ERROR");
      this.onEvent({ type: "tool_end", name, ok: false, result });
      return result;
    }
  }

  async #dispatch(name, input, options = {}) {
    switch (name) {
      case "list_files":
        return this.workspace.listFiles({ maxEntries: input.max_entries });
      case "read_file":
        return this.workspace.readFile(input.path);
      case "search_text":
        return this.workspace.searchText(input.query, {
          caseSensitive: input.case_sensitive,
          maxMatches: input.max_matches,
        });
      case "apply_patch":
        return this.workspace.applyPatch(input.patch);
      case "exec_command":
        return this.workspace.execCommand(input.command, {
          timeoutMs: input.timeout_ms,
          signal: options.signal,
        });
      case "git_status":
        return this.workspace.git(["status", "--short"]);
      case "git_diff":
        return this.workspace.git(["diff", "--"]);
      default:
        throw new Error(`未实现工具: ${name}`);
    }
  }
}

export function serializeToolResult(result, maxCharacters = 20_000) {
  const serialized = JSON.stringify(result);
  if (serialized.length <= maxCharacters) return serialized;
  return JSON.stringify({
    truncated: true,
    originalCharacters: serialized.length,
    preview: serialized.slice(0, Math.max(0, maxCharacters - 128)),
  });
}

function toolError(message, code) {
  return {
    ok: false,
    error: { code, message },
  };
}
