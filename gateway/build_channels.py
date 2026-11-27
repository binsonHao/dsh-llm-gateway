# -*- coding: utf-8 -*-
"""扫描可用令牌 -> 生成 channels.json（每个站点一条通道，带模型清单）"""
import csv, json, os, threading, time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

import requests, urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

OUT = r"F:\workspace\llm-gateway"
SRC = r"F:\workspace\quake-体检-2026-11-27\quake_可直接使用_令牌清单.csv"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

_sems, _guard = {}, threading.Lock()
def sem(h, n=3):
    with _guard:
        return _sems.setdefault(h, threading.Semaphore(n))


def fetch_models(rec):
    base, key = rec["base"], rec["key"]
    with sem(urlparse(base).netloc):
        try:
            r = requests.get(base + "/v1/models", timeout=25, verify=False,
                             headers={"Authorization": "Bearer " + key, "User-Agent": UA})
            if r.status_code != 200:
                return []
            data = r.json().get("data") or []
            return [str(m.get("id")) for m in data if isinstance(m, dict) and m.get("id")]
        except Exception:
            return []


def main():
    rows = list(csv.DictReader(open(SRC, encoding="utf-8-sig")))
    seen, recs = set(), []
    for r in rows:
        base = r["API Base (OpenAI 兼容)"].rstrip("/").replace("/v1", "")
        key = r["API Key"]
        if (base, key) in seen:
            continue
        seen.add((base, key))
        recs.append({"base": base, "key": key, "site": r["站点"], "tested": r["模型名(实测成功)"], "idx": r["#"]})

    with ThreadPoolExecutor(max_workers=8) as ex:
        models = list(ex.map(fetch_models, recs))

    channels = []
    for i, (rec, ml) in enumerate(zip(recs, models)):
        if rec["tested"] and rec["tested"] not in ml:
            ml = [rec["tested"]] + ml
        channels.append({
            "id": f"ch{i+1}-{urlparse(rec['base']).netloc}".replace(".", "-")[:40],
            "site": rec["site"],
            "base": rec["base"],
            "key": rec["key"],
            "tested": rec["tested"],
            "priority": 100 - int(rec["idx"]),
            "models": ml,
        })

    # 模型 -> 通道 索引
    index = {}
    for c in channels:
        for m in c["models"]:
            index.setdefault(m, []).append(c["id"])

    doc = {"version": 1, "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
           "channels": channels, "modelIndex": index}
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, "channels.json")
    json.dump(doc, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"channels: {len(channels)}   distinct models: {len(index)}")
    for c in channels:
        print(f"  {c['id']:<30} {len(c['models']):>3} models  tested={c['tested']}")
    multi = {m: v for m, v in index.items() if len(v) > 1}
    print(f"\n多通道可服务的模型 ({len(multi)}):")
    for m, v in sorted(multi.items(), key=lambda x: -len(x[1]))[:25]:
        print(f"  {m:<44} x{len(v)}  {v[:3]}")
    print("\nwrote", p)


if __name__ == "__main__":
    main()
