# Agent Workspace UI

本地桌面式网页界面，通过 SSE 连接 `agent-core`。API 密钥仅存在于服务端进程环境中，不会下发给浏览器。

## 启动

```powershell
cd E:\app-agent\apps\desktop-ui
$env:TARGET_API_KEY = "YOUR_API_KEY"
$env:TARGET_BASE_URL = "TARGET_API_URL"
$env:TARGET_CHAT_MODEL = "CHAT_MODEL"
npm start
```

默认地址：`http://127.0.0.1:4317`

## 当前功能

- 工作区路径和模型选择
- 流式回答与推理内容
- 工具执行日志
- 写入和命令审批弹窗
- 只读、询问、自动执行三种权限模式
- 运行停止、状态统计和最近活动
- 最近任务本地记录
- 桌面、平板和移动端布局
