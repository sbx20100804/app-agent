# App Agent

**English** | [简体中文](README.md)

A local coding agent optimized for DeepSeek, offering a Codex-like task interface, tool calling, permission approvals, Git integration, and extensibility.

## Features

- DeepSeek Chat and Reasoner model support
- DeepSeek-specific identity prompts, model routing, and context compression
- Streaming replies, reasoning traces, and tool-call logs
- File read, search, edit, and restricted command execution
- Three permission modes: `read-only`, `ask`, and `auto`
- File tree, file preview, Git status, and diffs
- Local terminal and persisted task events
- Git Worktree and multi-task foundations
- Skills, MCP, and plugin scanning
- Visual settings center
- Light desktop workbench with responsive layout

## Project Structure

```text
app-agent/
├─ agent-core/          # Agent loop, workspace tools, and permission system
├─ protocol-probe/      # Model API, SSE, and tool-call compatibility probes
└─ apps/desktop-ui/     # Local web workbench and server
```

## Quick Start

Requires Node.js 20 or later.

```powershell
cd apps/desktop-ui
Copy-Item .env.example .env
```

Edit `.env`:

```env
TARGET_PROVIDER=deepseek
TARGET_BASE_URL=https://api.deepseek.com
TARGET_API_KEY=<your-deepseek-api-key>
TARGET_CHAT_MODEL=deepseek-chat
TARGET_REASONER_MODEL=deepseek-reasoner
```

Start:

```powershell
npm start
```

Open in your browser:

```text
http://127.0.0.1:4317
```

## Verification

```powershell
cd agent-core
npm test

cd ../protocol-probe
npm test

cd ../apps/desktop-ui
npm run check
```

## Security Notes

- `.env` files, API keys, run history, screenshots, and local backups are never committed to Git.
- Listens on `127.0.0.1` by default.
- Restrict accessible workspaces with `WORKSPACE_ROOTS`.
- Protect the local API with `AGENT_UI_TOKEN`.

## Status

Under active development. The core agent, DeepSeek integration, and desktop workbench are working; live MCP connections, the streaming terminal, and the full Worktree merge flow are still being refined.

## License

[MIT](LICENSE)
