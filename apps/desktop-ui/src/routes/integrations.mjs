import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function listMcpServers(_request, response, { sendJson }) {
  const files = mcpConfigFiles();
  const servers = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    try {
      const config = JSON.parse(readFileSync(file, "utf8"));
      for (const [name, value] of Object.entries(config.mcpServers ?? {})) {
        servers.push({ name, source: file, transport: value.url ? "http" : "stdio", configured: true });
      }
    } catch (error) {
      servers.push({ source: file, error: error.message });
    }
  }
  return sendJson(response, 200, { files, servers });
}

export function listPlugins(_request, response, { sendJson }) {
  const roots = pluginRoots();
  const plugins = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    collectPluginManifests(root, plugins);
  }
  return sendJson(response, 200, { roots, plugins });
}

function mcpConfigFiles() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return [
    process.env.MCP_CONFIG_PATH,
    path.join(process.cwd(), ".mcp.json"),
    path.join(home, ".codex", "mcp.json"),
    path.join(home, ".config", "codex", "mcp.json"),
  ].filter(Boolean);
}

function pluginRoots() {
  const custom = (process.env.PLUGIN_ROOTS ?? "").split(/[;|]/).map((item) => item.trim()).filter(Boolean);
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return [
    ...custom,
    path.join(home, ".codex", "plugins"),
    path.join(home, ".codex", "plugins", "cache"),
  ].filter(Boolean);
}

function collectPluginManifests(root, plugins) {
  for (const entry of safeReadDir(root)) {
    const fullPath = path.join(root, entry.name);
    if (!entry.isDirectory()) continue;
    const manifest = path.join(fullPath, ".codex-plugin", "plugin.json");
    if (existsSync(manifest)) {
      plugins.push(readPlugin(manifest));
    } else {
      collectPluginManifests(fullPath, plugins);
    }
  }
}

function readPlugin(manifestPath) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    return {
      name: manifest.name || path.basename(path.dirname(path.dirname(manifestPath))),
      version: manifest.version || "",
      description: manifest.description || "",
      path: manifestPath,
    };
  } catch (error) {
    return { path: manifestPath, error: error.message };
  }
}

function safeReadDir(dir) {
  try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}
