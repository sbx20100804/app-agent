# Codex Parity Plan

目标：把当前 desktop-ui 从单页本地 Agent UI，升级为接近 Codex 的本地任务平台。

## 必备能力
1. 本地项目读取、编辑、命令执行。
2. 权限模式：read-only / ask / auto。
3. SSE 实时事件流。
4. 多任务与任务持久化。
5. Git diff、status、worktree。
6. Skills：发现、加载、执行。
7. MCP：stdio/http/sse 连接。
8. 终端、文件树、Diff 审查面板。
9. 自动化任务。
10. 桌面端封装。

## 当前差距
- 当前 UI 是原型，服务端集中在单个 `server.mjs`。
- 没有持久化任务事件。
- 没有 worktree 隔离。
- 没有 Skills/MCP/plugin runtime。
- 没有文件树、Diff、终端真实面板。

## 开发策略
先稳定本地 Agent 基座，再逐步补 Codex-like 体验；不要先做复杂 UI 动画。
