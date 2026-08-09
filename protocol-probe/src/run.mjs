import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ModelApiClient } from "./client.mjs";
import { HELP_TEXT, loadConfig, publicConfig } from "./config.mjs";
import { createProbes } from "./probes.mjs";
import { writeReports } from "./report.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  let config;
  try {
    config = await loadConfig();
  } catch (error) {
    console.error(`配置错误: ${error.message}`);
    console.error("运行 node src/run.mjs --help 查看配置方式。");
    process.exitCode = 2;
    return;
  }

  if (config.help) {
    console.log(HELP_TEXT);
    return;
  }

  const client = new ModelApiClient(config);
  const startedAt = new Date().toISOString();
  const results = [];

  for (const probe of createProbes(config)) {
    process.stdout.write(`[运行] ${probe.id} ... `);
    const started = performance.now();
    try {
      const detail = await probe.run(client);
      const result = {
        id: probe.id,
        required: probe.required,
        status: "passed",
        durationMs: Math.round(performance.now() - started),
        detail,
      };
      results.push(result);
      console.log("通过");
    } catch (error) {
      const result = {
        id: probe.id,
        required: probe.required,
        status: "failed",
        durationMs: Math.round(performance.now() - started),
        error: serializeError(error),
      };
      results.push(result);
      console.log(`失败: ${error.message}`);
    }
  }

  const report = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    config: publicConfig(config),
    environment: {
      runtime: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    results,
  };
  const paths = await writeReports(report, path.join(projectRoot, "reports"));
  console.log(`Markdown 报告: ${paths.markdownPath}`);
  console.log(`JSON 报告: ${paths.jsonPath}`);

  if (results.some((result) => result.required && result.status !== "passed")) {
    process.exitCode = 1;
  }
}

function serializeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    status: error?.status ?? null,
    requestId: error?.requestId ?? null,
  };
}

await main();
