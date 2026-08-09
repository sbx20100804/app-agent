import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Agent } from "../src/agent.mjs";
import { PermissionEngine } from "../src/permissions.mjs";
import { ToolRegistry } from "../src/tools.mjs";
import { Workspace } from "../src/workspace.mjs";

const temporaryDirectories = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("代理完成工具调用闭环并保留推理字段", async () => {
  const root = await createWorkspace();
  await writeFile(path.join(root, "note.txt"), "before\n", "utf8");
  const workspace = await new Workspace(root).initialize();
  const events = [];
  const tools = new ToolRegistry({
    workspace,
    permissions: new PermissionEngine({ mode: "auto" }),
    onEvent: (event) => events.push(event),
  });
  let callCount = 0;
  const client = {
    async streamChat(payload, { onChunk }) {
      callCount += 1;
      if (callCount === 1) {
        const chunk = {
          choices: [{ delta: { reasoning_content: "inspect first" } }],
        };
        onChunk?.(chunk);
        return {
          content: "",
          reasoningContent: "inspect first",
          toolCalls: [{
            id: "call-1",
            type: "function",
            function: { name: "read_file", arguments: JSON.stringify({ path: "note.txt" }) },
          }],
          finishReasons: ["tool_calls"],
        };
      }
      onChunk?.({ choices: [{ delta: { content: "done" } }] });
      return {
        content: "done",
        reasoningContent: "",
        toolCalls: [],
        finishReasons: ["stop"],
      };
    },
  };
  const agent = new Agent({ client, model: "test-model", tools, onEvent: (event) => events.push(event) });
  const result = await agent.run("Read note.txt and report completion.");

  assert.equal(result.status, "completed");
  assert.equal(result.content, "done");
  assert.equal(result.turns, 2);
  assert.equal(result.messages[2].reasoning_content, "inspect first");
  assert.match(result.messages[2].tool_calls[0].function.name, /read_file/);
  assert.match(result.messages[3].content, /before/);
  assert(events.some((event) => event.type === "tool_end" && event.ok));
});

test("只读权限模式拒绝补丁", async () => {
  const root = await createWorkspace();
  const workspace = await new Workspace(root).initialize();
  const tools = new ToolRegistry({
    workspace,
    permissions: new PermissionEngine({ mode: "read-only" }),
  });
  const result = await tools.execute("apply_patch", {
    patch: "*** Begin Patch\n*** Add File: blocked.txt\n++blocked\n*** End Patch",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PERMISSION_DENIED");
});

async function createWorkspace() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "app-agent-agent-"));
  temporaryDirectories.push(directory);
  return directory;
}
