import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export class EventStore {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.runsDir = path.join(rootDir, "runs");
    this.indexPath = path.join(rootDir, "runs-index.json");
    mkdirSync(this.runsDir, { recursive: true });
    if (!existsSync(this.indexPath)) writeFileSync(this.indexPath, "[]\n", "utf8");
  }

  upsertRun(runId, patch) {
    const runs = this.listRuns(500);
    const existingIndex = runs.findIndex((item) => item.runId === runId);
    const now = new Date().toISOString();
    const next = {
      runId,
      createdAt: now,
      updatedAt: now,
      status: "running",
      ...patch,
    };
    if (existingIndex >= 0) {
      runs[existingIndex] = { ...runs[existingIndex], ...patch, updatedAt: now };
    } else {
      runs.unshift(next);
    }
    writeFileSync(this.indexPath, `${JSON.stringify(runs.slice(0, 500), null, 2)}\n`, "utf8");
  }

  appendEvent(runId, type, payload = {}) {
    const event = {
      id: crypto.randomUUID(),
      runId,
      type,
      timestamp: new Date().toISOString(),
      payload,
    };
    appendFileSync(this.runEventsPath(runId), `${JSON.stringify(event)}\n`, "utf8");
    return event;
  }

  listRuns(limit = 50) {
    try {
      const runs = JSON.parse(readFileSync(this.indexPath, "utf8"));
      return Array.isArray(runs) ? runs.slice(0, limit) : [];
    } catch {
      return [];
    }
  }

  readRun(runId) {
    const meta = this.listRuns(500).find((item) => item.runId === runId) ?? null;
    const events = this.readEvents(runId);
    return { meta, events };
  }

  deleteRun(runId) {
    const runs = this.listRuns(500).filter((item) => item.runId !== runId);
    writeFileSync(this.indexPath, `${JSON.stringify(runs, null, 2)}\n`, "utf8");
    try {
      const filePath = this.runEventsPath(runId);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      // The index is already removed; stale event files are harmless.
    }
  }

  clearRuns() {
    const runs = this.listRuns(500);
    writeFileSync(this.indexPath, "[]\n", "utf8");
    for (const run of runs) {
      try {
        const filePath = this.runEventsPath(run.runId);
        if (existsSync(filePath)) unlinkSync(filePath);
      } catch {
        // Continue clearing the remaining index entries.
      }
    }
  }

  readEvents(runId) {
    const filePath = this.runEventsPath(runId);
    if (!existsSync(filePath)) return [];
    return readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  }

  runEventsPath(runId) {
    const safeRunId = String(runId).replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.runsDir, `${safeRunId}.jsonl`);
  }
}
