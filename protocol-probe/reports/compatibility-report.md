# API 兼容性报告

- 开始时间：2026-08-08T12:38:52.814Z
- 完成时间：2026-08-08T12:38:57.148Z
- 基础地址：`https://api.deepseek.com`
- 对话模型：`deepseek-chat`
- 推理模型：`deepseek-reasoner`
- 总体结论：**必需能力全部通过**

## 探测结果

| 能力 | 必需 | 状态 | 耗时 | 说明 |
| --- | --- | --- | ---: | --- |
| `chat.non_stream` | 是 | 通过 | 455 ms | model=deepseek-v4-flash, contentPresent=true, finishReason=stop, usageFields=prompt_tokens/completion_tokens/total_tokens/prompt_tokens_details/prompt_cache_hit_tokens/prompt_cache_miss_tokens |
| `chat.stream` | 是 | 通过 | 475 ms | model=deepseek-v4-flash, chunkCount=5, firstByteMs=102, durationMs=475 |
| `reasoning.stream` | 是 | 通过 | 776 ms | model=deepseek-v4-flash, chunkCount=23, firstByteMs=88, durationMs=776 |
| `chat.tool_roundtrip` | 是 | 通过 | 1197 ms | model=deepseek-v4-flash, toolName=get_runtime_info, argumentsValidJson=true, reasoningContentPresent=false |
| `reasoning.tool_roundtrip` | 是 | 通过 | 1272 ms | model=deepseek-v4-flash, toolName=get_runtime_info, argumentsValidJson=true, reasoningContentPresent=true |
| `transport.error_shape` | 否 | 通过 | 72 ms | status=400, messagePresent=true, requestIdPresent=false, bodyType=object |
| `transport.cancel` | 否 | 通过 | 83 ms | model=deepseek-v4-flash, chunkCount=1, firstByteMs=81, durationMs=83 |

## Agent 适配结论

- 流式回答：可直接接入
- 推理字段分离：可直接接入
- 普通模型工具闭环：可直接接入
- 推理模型工具闭环：可直接接入

报告不包含 API 密钥、完整提示词或完整模型输出。
