import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  readFile as fsReadFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".cache",
]);

export class WorkspaceError extends Error {
  constructor(message, code = "WORKSPACE_ERROR") {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
  }
}

export class Workspace {
  constructor(root, options = {}) {
    this.root = path.resolve(root);
    this.maxReadBytes = options.maxReadBytes ?? 256 * 1024;
    this.maxOutputBytes = options.maxOutputBytes ?? 128 * 1024;
    this.ignoredDirectories = new Set(
      options.ignoredDirectories ?? DEFAULT_IGNORED_DIRECTORIES,
    );
  }

  async initialize() {
    await mkdir(this.root, { recursive: true });
    this.root = await realpath(this.root);
    return this;
  }

  async resolve(relativePath, { allowMissing = false } = {}) {
    if (typeof relativePath !== "string" || !relativePath.trim()) {
      throw new WorkspaceError("路径不能为空", "INVALID_PATH");
    }
    if (path.isAbsolute(relativePath)) {
      throw new WorkspaceError("工具路径必须是工作区相对路径", "OUTSIDE_WORKSPACE");
    }

    const candidate = path.resolve(this.root, relativePath);
    if (!isInside(this.root, candidate)) {
      throw new WorkspaceError("路径超出工作区范围", "OUTSIDE_WORKSPACE");
    }
    return this.#resolveSymlinkSafe(candidate, allowMissing);
  }

  async readFile(relativePath) {
    const filePath = await this.resolveExistingFile(relativePath);
    const fileStats = await stat(filePath);
    if (fileStats.size > this.maxReadBytes) {
      throw new WorkspaceError(
        `文件超过读取上限 (${this.maxReadBytes} bytes)`,
        "FILE_TOO_LARGE",
      );
    }
    const content = await fsReadFile(filePath, "utf8");
    return {
      path: relativePath,
      bytes: fileStats.size,
      content,
    };
  }

  async writeFile(relativePath, content) {
    if (typeof content !== "string") {
      throw new WorkspaceError("文件内容必须是字符串", "INVALID_CONTENT");
    }
    const filePath = await this.resolve(relativePath, { allowMissing: true });
    await this.assertParentInside(filePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
    return { path: relativePath, bytes: Buffer.byteLength(content, "utf8") };
  }

  async listFiles(options = {}) {
    const maxEntries = options.maxEntries ?? 500;
    const results = [];
    await this.#walk(this.root, "", results, maxEntries);
    return {
      files: results,
      truncated: results.length >= maxEntries,
    };
  }

  async searchText(query, options = {}) {
    if (typeof query !== "string" || !query) {
      throw new WorkspaceError("搜索词不能为空", "INVALID_QUERY");
    }
    const maxMatches = options.maxMatches ?? 100;
    const caseSensitive = options.caseSensitive ?? false;
    const fileList = await this.listFiles({ maxEntries: options.maxFiles ?? 1000 });
    const needle = caseSensitive ? query : query.toLocaleLowerCase();
    const matches = [];

    for (const relativePath of fileList.files) {
      if (matches.length >= maxMatches) break;
      const absolutePath = await this.resolve(relativePath);
      const fileStats = await stat(absolutePath);
      if (fileStats.size > this.maxReadBytes) continue;
      const buffer = await fsReadFile(absolutePath);
      if (buffer.includes(0)) continue;
      const content = buffer.toString("utf8");
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const haystack = caseSensitive
          ? lines[index]
          : lines[index].toLocaleLowerCase();
        if (haystack.includes(needle)) {
          matches.push({ path: relativePath, line: index + 1, text: lines[index] });
          if (matches.length >= maxMatches) break;
        }
      }
    }

    return { query, matches, truncated: matches.length >= maxMatches };
  }

  async applyPatch(patchText) {
    if (typeof patchText !== "string" || !patchText.trim()) {
      throw new WorkspaceError("补丁不能为空", "INVALID_PATCH");
    }
    const files = parsePatch(patchText);
    const changed = [];
    for (const filePatch of files) {
      if (filePatch.kind === "add") {
        const target = await this.resolve(filePatch.path, { allowMissing: true });
        if (await exists(target)) {
          throw new WorkspaceError(`新增文件已存在: ${filePatch.path}`, "PATCH_CONFLICT");
        }
        await this.writeFile(filePatch.path, filePatch.content);
        changed.push(filePatch.path);
      } else if (filePatch.kind === "delete") {
        const target = await this.resolveExistingFile(filePatch.path);
        const { rm } = await import("node:fs/promises");
        await rm(target);
        changed.push(filePatch.path);
      } else {
        const target = await this.resolveExistingFile(filePatch.path);
        const original = await fsReadFile(target, "utf8");
        const updated = applyHunks(original, filePatch.hunks);
        await writeFile(target, updated, "utf8");
        changed.push(filePatch.path);
      }
    }
    return { changed };
  }

  async execCommand(command, options = {}) {
    if (typeof command !== "string" || !command.trim()) {
      throw new WorkspaceError("命令不能为空", "INVALID_COMMAND");
    }
    const timeout = options.timeoutMs ?? 120_000;
    try {
      const result = await execFileAsync(
        process.platform === "win32" ? "powershell.exe" : "/bin/sh",
        process.platform === "win32"
          ? ["-NoProfile", "-NonInteractive", "-Command", command]
          : ["-lc", command],
        {
          cwd: this.root,
          timeout,
          maxBuffer: this.maxOutputBytes,
          windowsHide: true,
          encoding: "utf8",
        },
      );
      return {
        command,
        exitCode: 0,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: false,
      };
    } catch (error) {
      return {
        command,
        exitCode: typeof error.code === "number" ? error.code : 1,
        stdout: truncate(error.stdout ?? "", this.maxOutputBytes),
        stderr: truncate(error.stderr ?? error.message ?? "", this.maxOutputBytes),
        timedOut: error.killed === true || error.signal === "SIGTERM",
      };
    }
  }

  async git(args) {
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
      throw new WorkspaceError("git 参数格式无效", "INVALID_COMMAND");
    }
    const result = await this.execCommand(`git ${args.map(shellQuote).join(" ")}`);
    return { ...result, args };
  }

  async resolveExistingFile(relativePath) {
    const filePath = await this.resolve(relativePath);
    let realFilePath;
    try {
      realFilePath = await realpath(filePath);
    } catch {
      throw new WorkspaceError(`文件不存在: ${relativePath}`, "NOT_FOUND");
    }
    if (!isInside(this.root, realFilePath)) {
      throw new WorkspaceError("符号链接目标超出工作区范围", "OUTSIDE_WORKSPACE");
    }
    const fileStats = await stat(realFilePath);
    if (!fileStats.isFile()) {
      throw new WorkspaceError(`目标不是文件: ${relativePath}`, "NOT_A_FILE");
    }
    return realFilePath;
  }

  async assertParentInside(filePath) {
    const parent = path.dirname(filePath);
    await mkdir(parent, { recursive: true });
    const realParent = await realpath(parent);
    if (!isInside(this.root, realParent)) {
      throw new WorkspaceError("父目录超出工作区范围", "OUTSIDE_WORKSPACE");
    }
  }

  async #resolveSymlinkSafe(candidate, allowMissing) {
    try {
      const existing = await realpath(candidate);
      if (!isInside(this.root, existing)) {
        throw new WorkspaceError("符号链接目标超出工作区范围", "OUTSIDE_WORKSPACE");
      }
      return existing;
    } catch (error) {
      if (error instanceof WorkspaceError || !allowMissing) throw error;
      const parent = await nearestExistingParent(path.dirname(candidate));
      if (!isInside(this.root, parent)) {
        throw new WorkspaceError("路径父目录超出工作区范围", "OUTSIDE_WORKSPACE");
      }
      return candidate;
    }
  }

  async #walk(directory, relativeDirectory, results, maxEntries) {
    if (results.length >= maxEntries) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (results.length >= maxEntries) return;
      if (entry.isDirectory() && this.ignoredDirectories.has(entry.name)) continue;
      const relativePath = path.join(relativeDirectory, entry.name);
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.#walk(absolutePath, relativePath, results, maxEntries);
      } else if (entry.isFile()) {
        results.push(relativePath.replaceAll(path.sep, "/"));
      }
    }
  }
}

function parsePatch(patchText) {
  const lines = patchText.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] === "*** Begin Patch") lines.shift();
  if (lines.at(-1) === "*** End Patch") lines.pop();
  const files = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    let kind;
    let filePath;
    if (line.startsWith("*** Update File: ")) {
      kind = "update";
      filePath = line.slice("*** Update File: ".length).trim();
    } else if (line.startsWith("*** Add File: ")) {
      kind = "add";
      filePath = line.slice("*** Add File: ".length).trim();
    } else if (line.startsWith("*** Delete File: ")) {
      kind = "delete";
      filePath = line.slice("*** Delete File: ".length).trim();
    } else {
      index += 1;
      continue;
    }
    if (!filePath || filePath.includes("..")) {
      throw new WorkspaceError("补丁包含无效路径", "INVALID_PATCH");
    }
    index += 1;
    const body = [];
    while (index < lines.length && !lines[index].startsWith("*** ")) {
      body.push(lines[index]);
      index += 1;
    }
    if (kind === "add") {
      const content = body.filter((item) => item.startsWith("+")).map((item) => item.slice(1)).join("\n");
      files.push({ kind, path: filePath, content: content.endsWith("\n") ? content : `${content}\n` });
    } else {
      files.push({ kind, path: filePath, hunks: parseHunks(body) });
    }
  }
  if (!files.length) throw new WorkspaceError("补丁没有文件变更", "INVALID_PATCH");
  return files;
}

function parseHunks(lines) {
  const hunks = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (!match) throw new WorkspaceError(`无法解析补丁块: ${line}`, "INVALID_PATCH");
      current = { newStart: Number(match[1]), lines: [] };
      hunks.push(current);
    } else if (current && /^[ +\\-]/.test(line)) {
      if (line !== "\\ No newline at end of file") current.lines.push(line);
    }
  }
  if (!hunks.length) throw new WorkspaceError("更新补丁缺少 @@ 块", "INVALID_PATCH");
  return hunks;
}

function applyHunks(original, hunks) {
  let lines = original.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  let offset = 0;
  for (const hunk of hunks) {
    const oldLines = hunk.lines.filter((line) => line.startsWith(" ") || line.startsWith("-"));
    const expected = oldLines.map((line) => line.slice(1));
    const requestedIndex = Math.max(0, hunk.newStart - 1 + offset);
    let position = findSequence(lines, expected, requestedIndex);
    if (position < 0) position = findSequence(lines, expected, 0);
    if (position < 0) throw new WorkspaceError("补丁上下文不匹配", "PATCH_CONFLICT");
    const replacement = hunk.lines.filter((line) => line.startsWith(" ") || line.startsWith("+" )).map((line) => line.slice(1));
    lines.splice(position, expected.length, ...replacement);
    offset += replacement.length - expected.length;
  }
  return `${lines.join("\n")}\n`;
}

function findSequence(lines, expected, from) {
  if (expected.length === 0) return Math.min(from, lines.length);
  for (let index = from; index <= lines.length - expected.length; index += 1) {
    if (expected.every((line, offset) => lines[index + offset] === line)) return index;
  }
  return -1;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function exists(filePath) {
  return access(filePath, constants.F_OK).then(() => true).catch(() => false);
}

async function nearestExistingParent(candidate) {
  let current = candidate;
  while (true) {
    try {
      return await realpath(current);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        throw new WorkspaceError("找不到有效父目录", "INVALID_PATH");
      }
      current = parent;
    }
  }
}

function truncate(value, limit) {
  const text = String(value);
  return text.length > limit ? `${text.slice(0, limit)}\n[output truncated]` : text;
}

function shellQuote(value) {
  if (process.platform === "win32") return `'${value.replaceAll("'", "''")}'`;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
