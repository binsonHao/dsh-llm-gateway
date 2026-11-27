# dsh-llm-gateway

把多个 OpenAI 兼容上游（公益站、中转站、自建网关）合并成**一个本地出口**，让 Harness 里只出现一个 provider。

**零运行时依赖**：网关是纯 Node 实现的 HTTP 服务，跑在 DSH 宿主进程内。不需要 Python、不需要 Docker、不需要另起进程。

## 它解决什么

手上有一堆第三方令牌时，每个站点的模型名、可用性、限流都不一样。直接配进 Harness 有两个后果：设置页越来越长；某个站挂了只能人工发现再切。

这个插件做三件事：

1. **进程托管** —— 启用插件即在宿主进程内启动网关，禁用即停止。
2. **自动故障转移** —— 同一个模型名在多条通道间依次重试；401/403/429/5xx/超时/HTTP 200 包错误 都会换下一条，失败通道进入冷却。
3. **一个工具** —— `llm_gateway` 查看通道健康度、启停、热加载。

```
DSH  ──►  http://127.0.0.1:4000/v1  ──►  ch1 ─┐
                                    ├─►  ch2 ─┼─► 上游站点
                                    └─►  chN ─┘
```

## 安装

```bash
# DSH 原生安装（推荐）
dsh plugin --profile web add github:binsonHao/dsh-llm-gateway

# 或用预构建包
dsh plugin --profile web add -w https://github.com/binsonHao/dsh-llm-gateway/releases/download/v0.2.0/dsh-llm-gateway-0.2.0.tgz
```

装完在「设置 → 插件」里启用，它会自己在 `<用户主目录>/.dsh/llm-gateway/` 建好工作目录。

## 配置你的上游

插件不内置任何凭据，你需要写一份 `channels.json`（首次启用时会放一个 `channels.example.json` 做参考）：

```json
{
  "version": 1,
  "channels": [
    {
      "id": "ch1",
      "site": "站点 A",
      "base": "https://api-a.example.com",
      "key": "sk-你的令牌",
      "priority": 90,
      "models": ["gpt-4o-mini", "deepseek-chat"]
    },
    {
      "id": "ch2",
      "site": "站点 B（同名模型自动做备份）",
      "base": "https://api-b.example.com",
      "key": "sk-另一个令牌",
      "priority": 80,
      "models": ["gpt-4o-mini"]
    }
  ]
}
```

规则很简单：**同一模型名出现在几条通道里，就有几个备份**。

## 插件配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 插件挂载时是否自动启动 |
| `host` | `127.0.0.1` | 监听地址 |
| `port` | `4000` | 监听端口 |
| `dir` | 空 | 工作目录；空表示 `<用户主目录>/.dsh/llm-gateway` |

## 工具 `llm_gateway`

| action | 作用 |
|---|---|
| `status`（默认） | 运行状态、通道健康度、异常原因 |
| `start` / `stop` / `restart` | 控制服务 |
| `reload` | 改完 `channels.json` 后热加载，不重启 |
| `models` | 列出可调度的全部模型名 |

## 命令行独立运行

不装 DSH 也能跑：

```bash
npx dsh-llm-gateway --dir ./gw --port 4000
# 或
node bin/gateway.mjs --dir <工作目录> --port 4000
```

启动后打印入口地址与自动生成的 key，然后：

```bash
curl http://127.0.0.1:4000/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
```

## 接到 Harness 的模型选择器

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      local-gw:
        displayName: 本地中转站
        apiKeyEnv: LOCAL_GW_API_KEY     # 就是 gateway.json 里的 apiKey
        api: openai-completions
        baseURL: http://127.0.0.1:4000/v1
        models:
          - id: gpt-4o-mini
            name: GPT-4o mini
            contextWindow: 131072
```

## 端点

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| `POST` | `/v1/chat/completions` | 需要 | OpenAI 协议，支持 `stream` |
| `GET` | `/v1/models` | 需要 | 所有通道的模型并集 |
| `GET` | `/health` | 不需要 | 通道健康度与冷却状态 |
| `POST` | `/admin/reload` | 需要 | 热加载 `channels.json` |

## 故障转移怎么判定

| 上游返回 | 行为 |
|---|---|
| `2xx` 且 body 有 `choices`/`data`/`content` | 成功，记录延迟（EMA），通道健康 |
| `2xx` 但 body 是错误信封 | **判失败**并换通道（很多站会用 200 包错误） |
| `401` / `403` | 换通道，冷却 30 / 15 分钟 |
| `429` / `5xx` / 超时 | 换通道，冷却 2 分钟 |
| 其它 `4xx` | 直接返回，不再重试（是请求本身的问题） |

排序按「没失败过的优先 → 最近延迟低的优先 → priority 高的优先」。

## 安全边界

- 默认只监听 `127.0.0.1`，入口另有 Bearer key（首次启动自动生成，写入 `gateway.json`）。
- 插件不读取、不上传你的 `channels.json`；日志只落在本地 `logs/requests.ndjson`。

## 已知限制

- 只代理 `/v1/chat/completions` 和 `/v1/models`，不转发 embeddings / images / Anthropic 原生 `/v1/messages`。
- 上游是第三方站点，可用性不保证；本插件只负责"挂了自动换下一个"。
