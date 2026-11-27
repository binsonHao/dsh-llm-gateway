#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
本地 LLM 中转站 (OpenAI 兼容)
- 23 个上游站点聚合为一个出口 http://127.0.0.1:4000/v1
- 同一个模型名自动在多站点间故障转移（401/403/429/5xx/超时）
- 支持流式透传、/v1/models 汇总、健康统计
"""
import asyncio, json, os, secrets, sys, time
from collections import defaultdict

from aiohttp import ClientSession, ClientTimeout, web

ROOT = os.path.dirname(os.path.abspath(__file__))
CH_FILE = os.path.join(ROOT, "channels.json")
CFG_FILE = os.path.join(ROOT, "gateway.json")
LOG_FILE = os.path.join(ROOT, "logs", "requests.ndjson")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

FAIL_COOLDOWN = {401: 1800, 403: 900, 429: 120, 5: 120, "net": 120}


def load_cfg():
    if os.path.exists(CFG_FILE):
        cfg = json.load(open(CFG_FILE, encoding="utf-8"))
    else:
        cfg = {}
    cfg.setdefault("host", "127.0.0.1")
    cfg.setdefault("port", 4000)
    cfg.setdefault("apiKey", "sk-local-" + secrets.token_urlsafe(24))
    cfg["requestTimeout"] = 60      # 单个上游单次尝试上限（秒）
    cfg.setdefault("totalBudget", 100)   # 一次请求跨通道总预算（秒）
    cfg.setdefault("maxAttempts", 3)
    json.dump(cfg, open(CFG_FILE, "w", encoding="utf-8"), indent=1)
    return cfg


CFG = load_cfg()


def load_channels():
    doc = json.load(open(CH_FILE, encoding="utf-8"))
    chans = doc["channels"]
    for c in chans:
        c.setdefault("priority", 50)
        c.setdefault("models", [])
    return doc, chans


DOC, CHANNELS = load_channels()
BY_ID = {c["id"]: c for c in CHANNELS}


class Health:
    def __init__(self):
        self.fails = defaultdict(int)
        self.lat = defaultdict(float)     # 成功请求的 EMA 延迟（ms）
        self.cooldown_until = {}
        self.stats = defaultdict(lambda: {"ok": 0, "fail": 0, "lastError": "", "lastAt": 0})

    def healthy(self, cid):
        return time.time() >= self.cooldown_until.get(cid, 0)

    def fail(self, cid, status, err):
        self.fails[cid] += 1
        s = self.stats[cid]
        s["fail"] += 1
        s["lastError"] = f"{status} {err}"[:300]
        s["lastAt"] = int(time.time())
        cd = FAIL_COOLDOWN.get(status) or (FAIL_COOLDOWN[5] if isinstance(status, int) and 500 <= status < 600 else 60)
        if self.fails[cid] >= 2 or status in (401, 403):
            self.cooldown_until[cid] = time.time() + cd

    def ok(self, cid, ms=3000):
        self.fails[cid] = 0
        self.cooldown_until.pop(cid, None)
        prev = self.lat.get(cid) or ms
        self.lat[cid] = prev * 0.6 + ms * 0.4
        s = self.stats[cid]
        s["ok"] += 1
        s["lastAt"] = int(time.time())


HEALTH = Health()
HEALTH_FILE = os.path.join(ROOT, "health.json")


def save_health():
    try:
        data = {cid: {"fails": HEALTH.fails.get(cid, 0), "lat": HEALTH.lat.get(cid, 0),
                      "cooldown": HEALTH.cooldown_until.get(cid, 0),
                      **HEALTH.stats.get(cid, {})} for cid in BY_ID}
        json.dump(data, open(HEALTH_FILE, "w", encoding="utf-8"), indent=1)
    except Exception:
        pass


def load_health():
    if not os.path.exists(HEALTH_FILE):
        return
    try:
        data = json.load(open(HEALTH_FILE, encoding="utf-8"))
    except Exception:
        return
    for cid, v in data.items():
        if v.get("fails"):
            HEALTH.fails[cid] = int(v["fails"])
        if v.get("lat"):
            HEALTH.lat[cid] = float(v["lat"])
        if v.get("cooldown", 0) > time.time():
            HEALTH.cooldown_until[cid] = float(v["cooldown"])
        HEALTH.stats[cid].update({k: v[k] for k in ("ok", "fail", "lastError", "lastAt") if k in v})


load_health()
MODEL_INDEX = defaultdict(list)
for _c in CHANNELS:
    for _m in _c["models"]:
        MODEL_INDEX[_m].append(_c["id"])


def candidates(model):
    ids = MODEL_INDEX.get(model)
    if not ids:
        low = model.lower()
        for m, v in MODEL_INDEX.items():
            if m.lower() == low:
                ids = v
                break
    if not ids:
        return []
    ordered = sorted(ids, key=lambda i: (HEALTH.fails[i] > 0, HEALTH.lat.get(i, 2500.0),
                                         -BY_ID[i]["priority"]))
    good = [i for i in ordered if HEALTH.healthy(i)]
    return good + [i for i in ordered if i not in good]


def require_auth(request):
    auth = request.headers.get("Authorization", "")
    tok = auth[7:] if auth.lower().startswith("bearer ") else request.headers.get("x-api-key", "")
    return tok == CFG["apiKey"]


def log(rec):
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    rec["ts"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def upstream_headers(ch):
    return {"Authorization": "Bearer " + ch["key"], "Content-Type": "application/json",
            "User-Agent": UA, "Accept": "application/json, text/event-stream"}


async def proxy_chat(request, body):
    model = (body or {}).get("model", "")
    chans = candidates(model)
    if not chans:
        near = sorted(MODEL_INDEX, key=lambda m: -len(set(m) & set(model)))[:8]
        return web.json_response(
            {"error": {"message": f"gateway 未收录模型 {model!r}。可参考：{near}",
                       "type": "invalid_request_error", "code": "model_not_found"}}, status=404)

    stream = bool(body.get("stream"))
    last = None
    attempts = 0
    deadline = time.time() + CFG["totalBudget"]
    for cid in chans:
        if attempts >= CFG["maxAttempts"] or time.time() >= deadline:
            break
        attempts += 1
        ch = BY_ID[cid]
        url = ch["base"].rstrip("/") + "/v1/chat/completions"
        t0 = time.time()
        budget = max(10, min(CFG["requestTimeout"], deadline - time.time()))
        try:
            async with request.app["sess"].post(url, json=body, headers=upstream_headers(ch),
                                                ssl=False,
                                                timeout=ClientTimeout(total=budget, connect=10, sock_connect=10)) as r:
                if r.status == 200 and stream:
                    resp = web.StreamResponse(status=200, headers={
                        "Content-Type": r.headers.get("Content-Type", "text/event-stream"),
                        "Cache-Control": "no-cache"})
                    await resp.prepare(request)
                    try:
                        async for chunk in r.content.iter_any():
                            await resp.write(chunk)
                        await resp.write_eof()
                    except Exception:
                        pass
                    HEALTH.ok(cid, int((time.time() - t0) * 1000))
                    log({"model": model, "channel": cid, "status": 200, "stream": True,
                         "ms": int((time.time() - t0) * 1000)})
                    return resp
                text = await r.text()
                if r.status == 200:
                    try:
                        payload = json.loads(text)
                    except Exception:
                        payload = None
                    # 有些站点用 HTTP 200 包了个 error 回来，必须当失败并换下一个通道
                    if isinstance(payload, dict) and not payload.get("error") and (
                            "choices" in payload or "data" in payload or "content" in payload):
                        HEALTH.ok(cid, int((time.time() - t0) * 1000))
                        log({"model": model, "channel": cid, "status": 200,
                             "ms": int((time.time() - t0) * 1000)})
                        return web.json_response(payload, status=200)
                    last = (502, text[:600] or "empty 200 body")
                    HEALTH.fail(cid, "net", text[:200])
                    log({"model": model, "channel": cid, "status": 200, "err": "200-but-not-valid",
                         "ms": int((time.time() - t0) * 1000)})
                    continue
                last = (r.status, text)
                HEALTH.fail(cid, r.status, text)
        except asyncio.TimeoutError:
            last = (504, "gateway timeout")
            HEALTH.fail(cid, "net", "timeout")
        except Exception as e:
            last = (502, f"{type(e).__name__}: {e}")
            HEALTH.fail(cid, "net", str(e)[:150])
        log({"model": model, "channel": cid, "status": last[0], "err": last[1][:160],
             "ms": int((time.time() - t0) * 1000)})

    status, text = last if last else (502, "no upstream")
    code = status if isinstance(status, int) and 400 <= status < 600 else 502
    try:
        payload = json.loads(text)
    except Exception:
        payload = {"error": {"message": text[:500], "type": "upstream_error"}}
    payload.setdefault("x-gateway", {})["tried"] = attempts
    return web.json_response(payload, status=code)


async def handle_chat(request):
    if not require_auth(request):
        return web.json_response({"error": {"message": "invalid gateway api key"}}, status=401)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": {"message": "bad json"}}, status=400)
    return await proxy_chat(request, body)


async def handle_models(request):
    if not require_auth(request):
        return web.json_response({"error": {"message": "invalid gateway api key"}}, status=401)
    data = [{"id": m, "object": "model", "created": 0,
             "owned_by": BY_ID[MODEL_INDEX[m][0]]["site"]} for m in sorted(MODEL_INDEX)]
    return web.json_response({"object": "list", "data": data})


async def handle_health(request):
    out = []
    for c in CHANNELS:
        s = HEALTH.stats[c["id"]]
        out.append({"id": c["id"], "site": c["site"], "models": len(c["models"]),
                    "healthy": HEALTH.healthy(c["id"]), "ok": s["ok"], "fail": s["fail"],
                    "lastError": s["lastError"], "cooldown": int(max(0, HEALTH.cooldown_until.get(c["id"], 0) - time.time()))})
    return web.json_response({"channels": out, "models": len(MODEL_INDEX),
                              "apiKey": None})


async def handle_reload(request):
    if not require_auth(request):
        return web.json_response({"error": "unauthorized"}, status=401)
    global DOC, CHANNELS, MODEL_INDEX
    DOC, CHANNELS = load_channels()
    BY_ID.clear(); BY_ID.update({c["id"]: c for c in CHANNELS})
    MODEL_INDEX.clear()
    for c in CHANNELS:
        for m in c["models"]:
            MODEL_INDEX[m].append(c["id"])
    return web.json_response({"ok": True, "channels": len(CHANNELS), "models": len(MODEL_INDEX)})


async def health_flusher(app):
    while True:
        await asyncio.sleep(20)
        save_health()


async def _start_flusher(app):
    # 注意：这里的返回值会被 aiohttp await，必须返回 None，不能直接返回 Task
    asyncio.create_task(health_flusher(app))


async def make_app():
    app = web.Application(client_max_size=64 * 1024 * 1024)
    app["sess"] = ClientSession()
    app.on_startup.append(_start_flusher)
    app.router.add_post("/v1/chat/completions", handle_chat)
    app.router.add_post("/v1/completions", handle_chat)
    app.router.add_get("/v1/models", handle_models)
    app.router.add_get("/health", handle_health)
    app.router.add_post("/admin/reload", handle_reload)
    return app


def main():
    print(f"[gateway] {len(CHANNELS)} channels, {len(MODEL_INDEX)} models")
    print(f"[gateway] listen http://{CFG['host']}:{CFG['port']}/v1")
    print(f"[gateway] api key: {CFG['apiKey']}")
    web.run_app(make_app(), host=CFG["host"], port=CFG["port"], print=None)


if __name__ == "__main__":
    main()
