# App Agent

项目位于非系统盘，包含三个可独立测试和运行的模块：

- `protocol-probe`：目标模型 API 协议验证器
- `agent-core`：工作区工具、权限系统和代理循环
- `apps/desktop-ui`：本地桌面式 UI 和 SSE 服务

## 启动 UI

```powershell
cd E:\app-agent\apps\desktop-ui
$env:TARGET_API_KEY = "YOUR_API_KEY"
$env:TARGET_BASE_URL = "TARGET_API_URL"
$env:TARGET_CHAT_MODEL = "CHAT_MODEL"
npm start
```

打开 `http://127.0.0.1:4317`，填写工作区路径并提交任务。

## 验证

```powershell
cd E:\app-agent\protocol-probe
npm test

cd E:\app-agent\agent-core
npm test

cd E:\app-agent\apps\desktop-ui
npm run check
```
