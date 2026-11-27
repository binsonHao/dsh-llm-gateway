# Changelog

## 0.2.0

- **网关改为纯 Node 实现**，跑在宿主进程内：不再需要 Python、不再 spawn 子进程，零运行时依赖。
- 抽出 `lib/gateway.mjs` 作为可独立使用的库，`bin/gateway.mjs` 提供 CLI（`npx dsh-llm-gateway`）。
- 故障转移判定细化：`2xx` 但 body 是错误信封判失败；`4xx`（非 401/402/403/429）直接返回不重试。
- 通道排序改为「未失败 → 低延迟（EMA）→ 高 priority」。
- 健康度、冷却、延迟持久化到 `health.json`，重启不丢。
- 配置项简化为 `enabled` / `host` / `port` / `dir`。

## 0.1.0

- 首版：插件托管外部 Python 网关进程，注册 `llm_gateway` 工具。

## 0.3.0

- **新增设置页**：设置 → 本地中转站。展示运行状态、通道健康表（状态/失败次数/冷却/延迟/最近错误）、可调度模型清单，并提供启动、停止、重启、热加载、刷新。
- Host↔Client 走 Typert Remote（`registerLlmGatewayRemote`），与 `dsh-workspace-links` 同一套做法。
- Host 半区改为默认导出的服务类 `LlmGatewayService`；配置从 `cordis.patch.yml` 读取（`enabled` / `host` / `port` / `dir`）。
- locale 增加 `meta.detail`，插件详情页指向 `docs/DETAIL.md`。
