# 本地 LLM 中转站

把多个 OpenAI 兼容上游（公益站、中转站、自建网关）合并成**一个本地出口**，让 Harness 里只出现一个 provider，而不是一堆站点。

## 为什么需要它

手上有一堆第三方令牌时，每个站点的模型名、可用性、限流策略都不一样。直接配到 Harness 里会有两个后果：设置页越来越长；某个站挂了，只能人工发现再切。

这个插件做三件事：

1. **进程托管** —— 启用插件即启动本地网关，禁用即停止（只停自己拉起的进程）。
2. **自动故障转移** —— 同一个模型名在多条通道间依次重试，401/403/429/5xx/超时/HTTP 200 包错误 都会换下一条；失败通道进入冷却。
3. **一个工具** —— `llm_gateway` 查看通道健康度、启停、热加载。

## 工作方式

```
Harness  ──►  http://127.0.0.1:4000/v1  ──►  ch1 ─┐
                                          ├─►  ch2 ─┼─► 上游站点
                                          └─►  chN ─┘
```

网关本体是随包分发的 `gateway/gateway.py`，首次启用时释放到 `<用户主目录>/.dsh/llm-gateway/`。**你只需要提供 `channels.json`**（自己的站点与令牌），插件不内置任何凭据。

## 前提条件

- 本机有 Python 3.9+（`python` 在 PATH 里，或用 `pythonPath` 指定）。
- `channels.json` 里至少一条可用通道。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 插件挂载时是否自动拉起 |
| `pythonPath` | `python` | Python 解释器 |
| `scriptDir` | 空 | 网关工作目录；空表示 `<用户主目录>/.dsh/llm-gateway` |
| `port` | `4000` | 监听端口 |
| `startupTimeoutMs` | `30000` | 等待就绪时间 |

## 安全边界

- 网关只监听 `127.0.0.1`，入口另有 Bearer key（首次启动自动生成，写在 `gateway.json`）。
- 插件只杀自己 spawn 的进程；用 `start.bat` 手动起的实例会被"接管"而不是重启。
- 不读取、不上传你的 `channels.json`。

## 已知限制

- 仅 Windows/Linux/macOS 通用，但依赖本机 Python。
- 只代理 `/v1/chat/completions` 与 `/v1/models`，不转发 embeddings / images / Anthropic 原生 `/v1/messages`。
- 上游是第三方站点，可用性不由本插件保证。
