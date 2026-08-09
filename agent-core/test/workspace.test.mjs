import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Workspace, WorkspaceError } from "../src/workspace.mjs";

const temporaryDirectories = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("工作区支持读取、搜索、补丁和受限命令", async () => {
  const root = await createWorkspace();
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "sample.txt"), "hello\nworld\n", "utf8");

  const workspace = await new Workspace(root).initialize();
  assert.equal((await workspace.readFile("src/sample.txt")).content, "hello\nworld\n");
  assert.equal((await workspace.searchText("WORLD")).matches[0].line, 2);

  const patch = `*** Begin Patch
*** Update File: src/sample.txt
@@ -1,2 +1,2 @@
 hello
-world
+agent
*** End Patch`;
  assert.deepEqual(await workspace.applyPatch(patch), { changed: ["src/sample.txt"] });
  assert.equal((await workspace.readFile("src/sample.txt")).content, "hello\nagent\n");

  const command = await workspace.execCommand("Write-Output runtime-ok");
  assert.equal(command.exitCode, 0);
  assert.match(command.stdout, /runtime-ok/);
});

test("阻止工作区外路径", async () => {
  const root = await createWorkspace();
  const workspace = await new Workspace(root).initialize();
  await assert.rejects(() => workspace.readFile("../outside.txt"), (error) => {
    assert(error instanceof WorkspaceError);
    assert.equal(error.code, "OUTSIDE_WORKSPACE");
    return true;
  });
});

test("新增文件补丁不会覆盖已有文件", async () => {
  const root = await createWorkspace();
  const workspace = await new Workspace(root).initialize();
  const patch = `*** Begin Patch
*** Add File: created.txt
+created
*** End Patch`;
  await workspace.applyPatch(patch);
  assert.equal(await readFile(path.join(root, "created.txt"), "utf8"), "created\n");
  await assert.rejects(() => workspace.applyPatch(patch), /新增文件已存在/);
});

async function createWorkspace() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "app-agent-workspace-"));
  temporaryDirectories.push(directory);
  return directory;
}
