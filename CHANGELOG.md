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
