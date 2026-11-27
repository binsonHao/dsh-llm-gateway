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

## 0.4.0

- **改走同源 HTTP 路由**：宿主用 `ctx.webServer.register` 暴露 `/llm-gateway/api/*`，设置页直接 `fetch`。
  原先的 Typert Remote 方案在 `link:` 安装下会被 "Receiver must be an instance of class LlmGatewayService" 拒绝。
- 移除 `remote.js` 与 `@deepseek-ai/dsh-typert-protocol` 依赖；Host 半区回到 `export function apply` 形态，`Config` 表单随之恢复。

## 0.4.1

- **修复空工具集导致的 400**：客户端在模型不支持工具时会发 `tools: []` + `tool_choice: "auto"`，
  部分公益站对这个组合直接回 `upstream_400`。转发前把空工具集整组去掉，并清掉显式 `null` 字段。
- 日志增加 `tools` / `msgs` 计数；请求最终失败时把请求体写入 `logs/last-failure-request.json`，便于定位上游拒收原因。
