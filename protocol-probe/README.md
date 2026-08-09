# 模型 API 协议验证器

这个零依赖工具用于验证目标模型 API 是否具备编程代理所需的协议能力。它不会修改被测工作区，也不会把 API 密钥写入报告。

## 验证范围

- 非流式对话
- 流式增量输出和首字节时间
- `reasoning_content` 推理字段
- 工具调用参数拼接
- 工具结果回传后的第二轮回答
- 推理模型的工具调用闭环
- HTTP 错误结构归一化（可选）
- 请求取消（可选）

## 配置

在 PowerShell 中设置环境变量：

```powershell
$env:TARGET_API_KEY = "YOUR_API_KEY"
$env:TARGET_BASE_URL = "TARGET_API_URL"
$env:TARGET_CHAT_MODEL = "CHAT_MODEL"
$env:TARGET_REASONING_MODEL = "REASONING_MODEL"
```

也可以复制 `config.example.json` 为 `config.local.json`，但 API 密钥仍应只通过环境变量提供。

## 运行

```powershell
cd E:\app-agent\protocol-probe
npm test
npm run probe
```

执行额外的错误响应和取消测试：

```powershell
node src/run.mjs --include-error --include-cancel
```

指定配置文件：

```powershell
node src/run.mjs --config E:\path\to\config.local.json
```

结果写入 `reports/compatibility-report.md` 和带时间戳的 JSON 文件。进程退出码为 `0` 表示所有必需探测通过，`1` 表示至少一项失败，`2` 表示配置无效。
