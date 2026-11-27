# dsh-llm-gateway

把本地 LLM 聚合中转站托管进 DeepSeek Harness：**插件的开关就是中转站的开关**。

## 它做什么

| 时机 | 行为 |
|---|---|
| 插件启用 | 拉起 `F:\workspace\llm-gateway\gateway.py`（若端口已有人监听则直接接管，不重复绑定） |
| 插件禁用 / DSH 卸载 | 只杀掉自己拉起的进程；`start.bat` 手动起的进程不动 |
| 运行期间 | 注册一个 Agent 工具 `llm_gateway`，可查状态、启停、热加载 |

## 工具 `llm_gateway`

| action | 作用 |
|---|---|
| `status`（默认） | 运行状态、通道数、健康通道数、异常通道及原因 |
| `start` / `stop` / `restart` | 控制本地进程 |
| `reload` | 改完 `channels.json` 后热加载，不重启 |
| `models` | 列出当前可调度的全部模型名 |

## 配置项

在「设置 → 插件」里可以直接改（都带默认值）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 插件挂载时是否自动拉起 |
| `pythonPath` | `python` | Python 解释器 |
| `scriptDir` | `F:/workspace/llm-gateway` | 网关目录（需含 `gateway.py`、`channels.json`、`gateway.json`） |
| `port` | `4000` | 监听端口，需与 `gateway.json` 一致 |
| `startupTimeoutMs` | `30000` | 等待就绪的时间 |

## 和模型选择器的关系

插件负责**进程**，模型来源仍然是 DSH 的一个 provider 条目：

```yaml
- id: llm-pi-ai
  config:
    providers:
      local-gw:
        displayName: 本地中转站（23合1）
        apiKeyEnv: LOCAL_GW_API_KEY
        api: openai-completions
        baseURL: http://127.0.0.1:4000/v1
        models: [...]   # 见 llm-gateway/dsh-provider-snippet.yml
```

之所以不把 provider 也塞进插件：provider 是 `llm-pi-ai` 的配置，插件去改别的插件的配置属于越界，升级时容易被覆盖。进程归插件、模型归配置，边界清楚。

## 安装

```bash
# 在 profile 目录
cd ~/.dsh/profiles/desktop
pnpm add link:F:/workspace/dsh-llm-gateway
```

再把 `"dsh-llm-gateway"` 加进 `package.json` 的 `dsh.profile.bundles`，重载 DSH。

## 自测

```bash
node selftest.mjs
```

用假 ctx 挂载插件、跑一遍工具、再卸载，不依赖 DSH 运行时。
