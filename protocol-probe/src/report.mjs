import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeReports(report, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  const stamp = report.startedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDirectory, `compatibility-report-${stamp}.json`);
  const markdownPath = path.join(outputDirectory, "compatibility-report.md");

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function renderMarkdown(report) {
  const requiredFailures = report.results.filter(
    (result) => result.required && result.status !== "passed",
  );
  const lines = [
    "# API 兼容性报告",
    "",
    `- 开始时间：${report.startedAt}`,
    `- 完成时间：${report.finishedAt}`,
    `- 基础地址：\`${report.config.baseUrl}\``,
    `- 对话模型：\`${report.config.chatModel}\``,
    `- 推理模型：\`${report.config.reasoningModel}\``,
    `- 总体结论：**${requiredFailures.length === 0 ? "必需能力全部通过" : "存在必需能力缺口"}**`,
    "",
    "## 探测结果",
    "",
    "| 能力 | 必需 | 状态 | 耗时 | 说明 |",
    "| --- | --- | --- | ---: | --- |",
  ];

  for (const result of report.results) {
    const detail = result.status === "passed"
      ? summarizeDetail(result.detail)
      : escapeCell(result.error?.message ?? "未知错误");
    lines.push(
      `| \`${result.id}\` | ${result.required ? "是" : "否"} | ${statusLabel(result.status)} | ${result.durationMs} ms | ${detail} |`,
    );
  }

  lines.push(
    "",
    "## Agent 适配结论",
    "",
    capabilityLine(report, "chat.stream", "流式回答"),
    capabilityLine(report, "reasoning.stream", "推理字段分离"),
    capabilityLine(report, "chat.tool_roundtrip", "普通模型工具闭环"),
    capabilityLine(report, "reasoning.tool_roundtrip", "推理模型工具闭环"),
    "",
    "报告不包含 API 密钥、完整提示词或完整模型输出。",
    "",
  );
  return lines.join("\n");
}

function capabilityLine(report, id, label) {
  const result = report.results.find((item) => item.id === id);
  return `- ${label}：${result?.status === "passed" ? "可直接接入" : "需要兼容或降级处理"}`;
}

function summarizeDetail(detail) {
  const pairs = Object.entries(detail ?? {})
    .filter(([, value]) => value !== null && value !== undefined)
    .slice(0, 4)
    .map(([key, value]) => `${key}=${formatValue(value)}`);
  return escapeCell(pairs.join(", ") || "通过");
}

function formatValue(value) {
  if (Array.isArray(value)) {
    return value.join("/") || "[]";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function statusLabel(status) {
  return status === "passed" ? "通过" : status === "skipped" ? "跳过" : "失败";
}
