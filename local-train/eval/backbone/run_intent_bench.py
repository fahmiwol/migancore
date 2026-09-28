#!/usr/bin/env python3
"""BB-0 intent benchmark runner (EXP-110). Reusable comparison harness for the
Intent Engine (BB-3). Reports accuracy of 3 approaches on intent_seed.json:

  knn        — embedding centroids (deterministic, ~ms)          [the winner: 100%]
  zeroshot   — 4B constrained-decode, no examples                [25%]
  fewshot    — 4B constrained-decode, with few-shot examples      [50%]

Run INSIDE the api container (needs the mpnet embedder + ollama):
  docker exec -i ado-api-1 python /app/eval/backbone/run_intent_bench.py [knn|zeroshot|fewshot|all]

Every backbone change that touches intent should re-run this and record the
before/after in docs/jarvis/66_BACKBONE_BENCHMARK_COMPARISON.md.
"""
import asyncio
import json
import os
import sys
import urllib.request

_HERE = os.path.dirname(os.path.abspath(__file__))
# make `services` importable when run directly from this subdir (app root = /app = _HERE/../..)
_APP_ROOT = os.path.dirname(os.path.dirname(_HERE))
if _APP_ROOT not in sys.path:
    sys.path.insert(0, _APP_ROOT)
SEED = json.load(open(os.path.join(_HERE, "intent_seed.json"), encoding="utf-8"))
ANCHORS = json.load(open(os.path.join(_HERE, "intent_anchors.json"), encoding="utf-8"))["anchors"]
INTENTS = SEED["taxonomy"]
CASES = [(c["msg"], c["intent"]) for c in SEED["cases"]]
MODEL = os.getenv("BENCH_MODEL", "migancore:0.4-qwen3")
OLLAMA = os.getenv("OLLAMA_URL", "htt<local-dir>:11434")

_FEWSHOT = (
    "Contoh (pesan -> intent):\n"
    "- makasih banyak ya -> chat\n- riset harga kompetitor sabun cair -> research\n"
    "- debug error plugin wordpress -> coding\n- analisa untung rugi biochar per bulan -> business_analysis\n"
    "- buatin surat penawaran ke klien -> document_creation\n- ingatkan aku meeting jam 3 -> tool_action\n"
    "- kasih arahan desain kemasan premium -> design_direction\n- boleh nggak aku palsukan dokumen ini -> high_risk_question\n"
)
_SCHEMA = {"type": "object", "properties": {"intent": {"type": "string", "enum": INTENTS}}, "required": ["intent"]}


async def _knn():
    import numpy as np
    from services.embedding import embed_text
    cent = {}
    for it, ph in ANCHORS.items():
        cent[it] = np.mean([np.array(await embed_text(p)) for p in ph], axis=0)
    def cos(a, b):
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
    preds = []
    for msg, _ in CASES:
        v = np.array(await embed_text(msg))
        preds.append(max(cent, key=lambda k: cos(v, cent[k])))
    return preds


def _llm(fewshot: bool):
    preds = []
    for msg, _ in CASES:
        p = "Klasifikasikan pesan user ke SATU intent.\n" + (_FEWSHOT + "\n" if fewshot else "") + "PESAN: " + msg + "\nintent:"
        body = json.dumps({"model": MODEL, "stream": False, "keep_alive": 300, "format": _SCHEMA,
                           "options": {"temperature": 0, "num_predict": 30},
                           "messages": [{"role": "user", "content": p}]}).encode()
        req = urllib.request.Request(OLLAMA + "/api/chat", data=body, headers={"Content-Type": "application/json"})
        try:
            preds.append(json.loads(json.loads(urllib.request.urlopen(req, timeout=60).read())["message"]["content"]).get("intent", ""))
        except Exception:
            preds.append("ERR")
    return preds


def _score(name, preds):
    ok = sum(1 for (m, g), p in zip(CASES, preds) if p == g)
    print(f"=== {name}: {ok}/{len(CASES)} = {round(100 * ok / len(CASES))}% ===")
    for (m, g), p in zip(CASES, preds):
        if p != g:
            print(f"  MISS: {g} != {p}  ({m[:34]})")
    return ok


async def main():
    which = (sys.argv[1] if len(sys.argv) > 1 else "all").lower()
    if which in ("knn", "all"):
        _score("KNN (embedding centroids)", await _knn())
    if which in ("zeroshot", "all"):
        _score("ZERO-SHOT (4B constrained)", _llm(False))
    if which in ("fewshot", "all"):
        _score("FEW-SHOT (4B constrained)", _llm(True))


if __name__ == "__main__":
    asyncio.run(main())
