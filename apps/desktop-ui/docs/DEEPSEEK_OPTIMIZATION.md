# DeepSeek Optimization

## 配置
使用 OpenAI-compatible 接口形态，但在项目内部单独建立 DeepSeek adapter。

```env
TARGET_PROVIDER=deepseek
TARGET_BASE_URL=https://api.deepseek.com
TARGET_CHAT_MODEL=deepseek-chat
TARGET_REASONER_MODEL=deepseek-reasoner
```

## 模型路由
- 简单代码解释、摘要、标题：deepseek-chat
- 多文件修改、调试、架构：deepseek-reasoner
- 工具结果压缩：deepseek-chat

## 上下文策略
- 工具输出默认摘要化。
- 大文件按片段读取。
- 历史事件本地持久化，只把摘要发给模型。
- Git diff 单独压缩。
- 每 5-8 轮生成运行摘要。

## 工具调用策略
- 所有工具必须有 JSON schema。
- 统一 normalize tool calls。
- 失败工具调用要返回结构化错误，交给 Agent 重试。
