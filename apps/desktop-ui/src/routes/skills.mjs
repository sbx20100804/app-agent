import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function listSkills(_request, response, { sendJson }) {
  const roots = skillRoots();
  const skills = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    collectSkills(root, skills);
  }
  return sendJson(response, 200, { roots, skills });
}

function skillRoots() {
  const custom = (process.env.SKILL_ROOTS ?? "").split(/[;|]/).map((item) => item.trim()).filter(Boolean);
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return [
    ...custom,
    path.join(home, ".codex", "skills"),
    path.join(home, ".agents", "skills"),
  ].filter(Boolean);
}

function collectSkills(root, skills) {
  for (const entry of safeReadDir(root)) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const skillPath = path.join(fullPath, "SKILL.md");
      if (existsSync(skillPath)) {
        skills.push(readSkill(skillPath, root));
      } else {
        collectSkills(fullPath, skills);
      }
    }
  }
}

function readSkill(skillPath, root) {
  const text = readFileSync(skillPath, "utf8");
  const meta = parseFrontmatter(text);
  const fallbackName = path.basename(path.dirname(skillPath));
  return {
    name: meta.name || fallbackName,
    description: meta.description || firstParagraph(text),
    path: skillPath,
    root,
  };
}

function parseFrontmatter(text) {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end < 0) return {};
  const body = text.slice(3, end).trim();
  const meta = {};
  for (const line of body.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index > 0) meta[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return meta;
}

function firstParagraph(text) {
  return text.replace(/^---[\s\S]*?---/, "").split(/\r?\n\r?\n/).map((item) => item.trim()).find(Boolean)?.slice(0, 240) || "";
}

function safeReadDir(dir) {
  try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}
