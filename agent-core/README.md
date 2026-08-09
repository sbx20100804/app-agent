# Agent Runtime

这是本地编程代理的核心执行层，当前版本包含：

- 工作区边界和符号链接检查
- 文件列表、读取、文本搜索
- 精确补丁应用
- PowerShell / shell 命令执行和超时
- 版本控制状态与差异
- `ask`、`auto`、`read-only` 三种权限模式
- 模型工具调用循环和 `reasoning_content` 保留
- CLI 单任务入口

## 本地测试

```powershell
cd E:\app-agent\agent-core
npm test
npm run check
```

## 运行一次任务

```powershell
$env:TARGET_API_KEY = "YOUR_API_KEY"
$env:TARGET_BASE_URL = "TARGET_API_URL"
$env:TARGET_CHAT_MODEL = "CHAT_MODEL"
node src/run-agent.mjs --workspace E:\path\to\project --permissions ask "检查项目并运行测试"
```

权限模式：

- `ask`：写文件和命令执行前询问
- `auto`：自动执行，适合隔离工作区
- `read-only`：只允许读取、搜索和查看差异
