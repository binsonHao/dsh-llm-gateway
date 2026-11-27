# Changelog

## 0.1.0

- Host-managed lifecycle for the local aggregation gateway (`gateway.py` ships inside the package and is released into `<DSH home>/llm-gateway` on first enable).
- `llm_gateway` tool: `status`, `start`, `stop`, `restart`, `reload`, `models`.
- Adopts an already-running gateway instead of double-binding the port; only a process this plugin spawned is ever killed.
