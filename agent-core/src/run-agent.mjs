import readline from "node:readline/promises";
import process from "node:process";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { ModelApiClient } from "../../protocol-probe/src/client.mjs";
import { Agent } from "./agent.mjs";
import { PermissionEngine } from "./permissions.mjs";
import { ToolRegistry } from "./tools.mjs";
import { Workspace } from "./workspace.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.task) {
  console.log(`用法: node src/run-agent.mjs [选项] "任务"

选项:
  --workspace PATH       工作区，默认当前目录
  --model MODEL          默认 TARGET_CHAT_MODEL
  --permissions MODE     ask、auto 或 read-only，默认 ask
  --max-turns NUMBER     最大工具轮次，默认 20
  -h, --help             显示帮助

运行前设置 TARGET_API_KEY 和 TARGET_BASE_URL。`);
  process.exitCode = args.help ? 0 : 2;
} else {
  await main(args);
}

function parseArgs(argv) {
  const result = {
    workspace: process.cwd(),
    model: process.env.TARGET_AGENT_MODEL ?? process.env.TARGET_CHAT_MODEL,
    permissions: "ask",
    maxTurns: 20,
    task: "",
    help: false,
  };
  const taskParts = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--workspace") {
      result.workspace = argv[++index];
    } else if (argument === "--model") {
      result.model = argv[++index];
    } else if (argument === "--permissions") {
      result.permissions = argv[++index];
    } else if (argument === "--max-turns") {
      result.maxTurns = Number.parseInt(argv[++index], 10);
    } else if (argument === "--help" || argument === "-h") {
      result.help = true;
    } else {
      taskParts.push(argument);
    }
  }
  result.task = taskParts.join(" ").trim();
  return result;
}

async function main(args) {
  if (!process.env.TARGET_API_KEY || !process.env.TARGET_BASE_URL || !args.model) {
    throw new Error("缺少 TARGET_API_KEY、TARGET_BASE_URL 或模型配置");
  }
  if (!["ask", "auto", "read-only"].includes(args.permissions)) {
    throw new Error("--permissions 必须是 ask、auto 或 read-only");
  }
  if (!Number.isSafeInteger(args.maxTurns) || args.maxTurns < 1 || args.maxTurns > 100) {
    throw new Error("--max-turns 必须是 1 到 100 之间的整数");
  }

  const workspace = await new Workspace(path.resolve(args.workspace)).initialize();
  const approval = createApprovalPrompt();
  let streamedContent = false;
  const handleEvent = (event) => {
    if (event.type === "model_chunk" && event.chunk.choices?.[0]?.delta?.content) {
      streamedContent = true;
    }
    printEvent(event);
  };
  const permissions = new PermissionEngine({
    mode: args.permissions,
    requestApproval: approval,
  });
  const tools = new ToolRegistry({ workspace, permissions, onEvent: handleEvent });
  const client = new ModelApiClient({
    baseUrl: process.env.TARGET_BASE_URL,
    apiKey: process.env.TARGET_API_KEY,
    timeoutMs: Number(process.env.TARGET_TIMEOUT_MS) || 120_000,
  });
  const agent = new Agent({
    client,
    model: args.model,
    tools,
    maxTurns: args.maxTurns,
    onEvent: handleEvent,
  });

  console.log(`工作区: ${workspace.root}`);
  console.log(`模型: ${args.model}`);
  console.log(`权限模式: ${args.permissions}`);
  try {
    const result = await agent.run(args.task);
    if (streamedContent) {
      process.stdout.write("\n");
    } else {
      console.log(`\n${result.content}`);
    }
  } finally {
    approval.close?.();
  }
}

function createApprovalPrompt() {
  if (!input.isTTY) return Object.assign(async () => false, { close: () => {} });
  const rl = readline.createInterface({ input, output });
  const approval = async ({ toolName, input: toolInput }) => {
    const answer = await rl.question(`\n批准工具 ${toolName} ${JSON.stringify(toolInput)}? [y/N] `);
    return ["y", "yes", "是"].includes(answer.trim().toLowerCase());
  };
  approval.close = () => rl.close();
  return approval;
}

function printEvent(event) {
  if (event.type === "model_chunk") {
    const delta = event.chunk.choices?.[0]?.delta ?? {};
    if (delta.reasoning_content) process.stderr.write(delta.reasoning_content);
    if (delta.content) process.stdout.write(delta.content);
  } else if (event.type === "tool_start") {
    process.stderr.write(`\n[工具开始] ${event.name}\n`);
  } else if (event.type === "tool_end") {
    process.stderr.write(`[工具结束] ${event.name}: ${event.ok ? "通过" : "失败"}\n`);
  } else if (event.type === "run_end") {
    process.stderr.write(`\n[完成] ${event.turns} 轮\n`);
  }
}
