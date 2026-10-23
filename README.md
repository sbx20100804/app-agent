# App Agent

[English](README.en.md) | **简体中文**

一个专门为 DeepSeek 优化的本地编程智能体，提供接近 Codex 的任务界面、工具调用、权限审批、Git 集成和可扩展能力。

## 主要功能

- DeepSeek Chat 与 Reasoner 模型适配
- 面向 DeepSeek 的身份提示、模型路由和上下文压缩
- 流式回复、推理内容和工具调用日志
- 文件读取、搜索、修改和受限命令执行
- `read-only`、`ask`、`auto` 三种权限模式
- 文件树、文件预览、Git 状态与 Diff
- 本地终端和任务事件持久化
- Git Worktree 与多任务基础能力
- Skills、MCP 和插件扫描
- 可视化设置中心
- 浅色桌面工作台和响应式布局

## 项目结构

```text
app-agent/
├─ agent-core/          # Agent 循环、工作区工具和权限系统
├─ protocol-probe/      # 模型 API、SSE 和 Tool Call 兼容性验证
└─ apps/desktop-ui/     # 本地网页工作台与服务端
```

## 快速开始

需要 Node.js 20 或更高版本。

```powershell
cd apps/desktop-ui
Copy-Item .env.example .env
```

编辑 `.env`：

```env
TARGET_PROVIDER=deepseek
TARGET_BASE_URL=https://api.deepseek.com
TARGET_API_KEY=<your-deepseek-api-key>
TARGET_CHAT_MODEL=deepseek-chat
TARGET_REASONER_MODEL=deepseek-reasoner
```

启动：

```powershell
npm start
```

浏览器打开：

```text
http://127.0.0.1:4317
```

## 验证

```powershell
cd agent-core
npm test

cd ../protocol-probe
npm test

cd ../apps/desktop-ui
npm run check
```

## 安全说明

- `.env`、API Key、运行历史、截图和本地备份不会提交到 Git。
- 默认监听 `127.0.0.1`。
- 可通过 `WORKSPACE_ROOTS` 限制允许访问的工作区。
- 可通过 `AGENT_UI_TOKEN` 保护本地 API。

## 当前状态

项目处于持续开发阶段。核心 Agent、DeepSeek 接入和桌面工作台已经可运行，MCP 实际连接、流式终端和完整 Worktree 合并流程仍在完善。

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。
