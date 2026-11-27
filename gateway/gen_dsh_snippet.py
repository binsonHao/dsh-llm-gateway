# -*- coding: utf-8 -*-
"""生成可直接粘进 cordis.patch.yml 的 provider 片段（模型按聚合度挑选）"""
import json, os

ROOT = os.path.dirname(os.path.abspath(__file__))
doc = json.load(open(os.path.join(ROOT, "channels.json"), encoding="utf-8"))
idx = doc["modelIndex"]

# (模型名, 展示名, 上下文, 是否支持图片)  —— 只放真正值得在 DSH 里选的
CURATED = [
    ("grok-4.7", "Grok 4.7（15通道）", 262144, True),
    ("grok-4.6", "Grok 4.6（5通道）", 262144, True),
    ("glm-5.3-flash", "GLM 5.3 Flash（7通道）", 131072, False),
    ("glm-4.5-flash", "GLM 4.5 Flash（8通道）", 131072, False),
    ("DeepSeek-V4.1-Flash", "DeepSeek V4.1 Flash（4通道）", 131072, False),
    ("step-5-preview", "Step 5 Preview（9通道）", 262144, False),
    ("nemotron-3-ultra-550b-a55b", "Nemotron 3 Ultra 550B", 1048576, False),
    ("nemotron-3.5-lightning-30b-a3b", "Nemotron 3.5 Lightning 30B", 1048576, False),
    ("minimax-m3.1-flash", "MiniMax M3.1 Flash（6通道）", 262144, False),
    ("ernie-5.5-flash-preview", "ERNIE 5.5 Flash（6通道）", 131072, False),
    ("kimi-k3", "Kimi K3（4通道，较慢）", 262144, False),
    ("claude-sonnet-4-6", "Claude Sonnet 4.6", 200000, True),
]

lines = ["  # ==== 本地聚合中转站（一个 provider 覆盖 23 个上游）====",
         "      local-gw:",
         '        displayName: 本地中转站（23合1）',
         "        apiKeyEnv: LOCAL_GW_API_KEY",
         "        api: openai-completions",
         "        baseURL: http://127.0.0.1:4000/v1",
         "        models:"]
kept = []
for mid, name, ctx, vision in CURATED:
    if mid not in idx:
        continue
    kept.append((mid, len(idx[mid])))
    lines.append(f"          - id: {mid}")
    lines.append(f"            name: {name}")
    lines.append(f"            contextWindow: {ctx}")
    lines.append(f"            maxTokens: 32768")
    lines.append("            input:")
    lines.append("              - text")
    if vision:
        lines.append("              - image")

out = os.path.join(ROOT, "dsh-provider-snippet.yml")
open(out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(lines))
print(f"\n{len(kept)} 个模型 -> {out}")
