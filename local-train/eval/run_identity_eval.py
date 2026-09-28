"""
Identity Persistence Eval (Day 33 → updated Day 57)

Tests: 20 fixed prompts → cosine sim of model response embeddings vs reference.
Gate: ≥ 0.80 weighted average cosine similarity to PROMOTE new model.

Day 57 updates (Cycle 2 prep):
  - PASS_THRESHOLD: 0.85 → 0.80 (recalibrated: baseline 0.8438, not 0.85+)
  - Category weights: identity=40%, voice=30%, reasoning=15%, code=10%, anti_pattern=5%
  - Identity hard gate: ALL core identity prompts must individually pass 0.80
  - Root cause: Day 56 ROLLBACK showed identity+voice crashed hardest (-35%);
    weighting these heavier prevents a model that aced reasoning from slipping through

Workflow:
  1. Generate REFERENCE responses with current Qwen2.5-7B baseline (run once, freeze)
  2. After SimPO training, run new model on same prompts
  3. Compute weighted cosine sim per category + hard identity gate
  4. Decision: PROMOTE if weighted avg ≥ 0.80 AND all identity prompts ≥ 0.80

Usage:
  # Generate reference (first time)
  python run_identity_eval.py --mode reference --output references_baseline.json

  # Eval new model (Cycle 2+)
  python run_identity_eval.py --mode eval \\
    --reference eval/baseline_day55.json \\
    --model-tag migancore-7b-soul-cycle2

  # Show category weight config
  python run_identity_eval.py --mode weights
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, "/app")

EVAL_SET_PATH = Path("/app/eval/persona_consistency_v1.jsonl")
PASS_THRESHOLD = 0.92  # Lesson #155 (Day 69): real Codex gate=0.92, not 0.80. False PROMOTE 3x (Cycles 4,5,6). NEVER change without updating ROADMAP_DAY67_MASTER.md gate table.

# Category weights — Cycle 2 (Day 57 update per Kimi + Codex recommendation)
# Root cause Day 56: identity (0.527, 0.582) + voice casual (0.386) crashed hardest.
# Heavier weight on identity/voice = gate catches what matters most.
# reasoning + code = lighter (UltraFeedback didn't hurt these much)
CATEGORY_WEIGHTS: dict[str, float] = {
    "identity":     0.40,
    "voice":        0.30,
    "reasoning":    0.15,
    "code":         0.10,
    "anti_pattern": 0.05,
    # Fallback for any unlisted category → equal weight (normalized at eval time)
}

# Core identity prompts that MUST individually pass (hard gate)
# If ANY of these fail (< 0.80), decision = ROLLBACK regardless of weighted average
IDENTITY_HARD_GATE_IDS = {
    "identity_01", "identity_02", "creator_01",   # "Siapa kamu?" variants + creator
}  # IDs from persona_consistency_v1.jsonl — expand as eval set grows


def load_eval_set():
    items = []
    with EVAL_SET_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(json.loads(line))
    return items


async def generate_response(prompt: str, model: str = None) -> str:
    """Run prompt through MiganCore via Ollama (current default model).

    Lesson #137: ALWAYS retry on Ollama HTTP 500 (CPU steal causes transient 500s).
    Without retry, 3 errors cost -0.099 on weighted_avg → unfair ROLLBACK in Cycle 5.
    Max 3 attempts, 10s sleep between attempts.
    """
    from services.ollama import OllamaClient
    from config import settings
    import httpx as _httpx

    use_model = model or settings.DEFAULT_MODEL
    system = (
        "Kamu adalah Mighan-Core. Voice: direct, technically precise, mildly formal. "
        "Values: Truth Over Comfort, Action Over Advice, Memory Is Sacred, Frugality of Compute. "
        "Tidak berbasa-basi. Akui ketidakpastian dengan 'saya tidak yakin' jika tidak tahu."
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ]
    _eval_timeout = _httpx.Timeout(600.0, connect=10.0, read=600.0)

    max_attempts = 3
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            async with OllamaClient(timeout=_eval_timeout) as client:
                resp = await client.chat(
                    model=use_model,
                    messages=messages,
                    options={"num_predict": 300, "temperature": 0.3, "num_ctx": 4096},
                )
            return resp.get("message", {}).get("content", "").strip()
        except Exception as exc:
            last_exc = exc
            # Day 69 — Lesson #156/Kimi Q1: expand retry to timeout + connect errors
            # Previously only retried on HTTP 500; timeouts caused unfair 0.000 scores
            err_str = str(exc)
            is_retryable = (
                "500" in err_str or "Internal Server Error" in err_str
                or "timeout" in err_str.lower() or "Timeout" in err_str
                or "ConnectError" in err_str or "connect" in err_str.lower()
                or "ReadError" in err_str or "WriteError" in err_str
            )
            if is_retryable and attempt < max_attempts:
                print(f"  [retry {attempt}/{max_attempts-1}] Retryable error on attempt {attempt}: {type(exc).__name__}, sleeping 10s...",
                      file=sys.stderr, flush=True)
                import asyncio
                await asyncio.sleep(10)
            else:
                raise

    raise last_exc  # unreachable but satisfies type checker


async def embed_text(text: str):
    """Get embedding using existing fastembed pipeline."""
    from services.embedding import get_model
    model = await get_model()
    embeddings = list(model.embed([text]))
    return embeddings[0]


def cosine_sim(a, b) -> float:
    import numpy as np
    a = np.array(a)
    b = np.array(b)
    if (na := np.linalg.norm(a)) == 0 or (nb := np.linalg.norm(b)) == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


async def generate_references(output: str, model: str = None) -> dict:
    """Day 33 first run: capture reference responses from current baseline."""
    items = load_eval_set()
    refs = {}
    print(f"Generating references for {len(items)} prompts (model={model or 'default'})...")
    for i, item in enumerate(items, 1):
        try:
            resp = await generate_response(item["prompt"], model)
            embed = await embed_text(resp)
            refs[item["id"]] = {
                "prompt": item["prompt"],
                "response": resp,
                "embedding": [float(x) for x in embed],
                "expects": item["expects"],
                "category": item["category"],
            }
            print(f"  [{i}/{len(items)}] {item['category']:20s} {item['prompt'][:50]}...")
        except Exception as e:
            print(f"  FAIL prompt {item['id']}: {e}", file=sys.stderr)

    Path(output).parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        json.dump({"items": refs, "model": model or "baseline"}, f, ensure_ascii=False, indent=2)
    print(f"References saved to {output}")
    return refs


async def evaluate(reference_path: str, model_tag: str, model: str = None) -> dict:
    """Day 34 eval gate — run new model + score vs reference."""
    items = load_eval_set()
    with open(reference_path, "r", encoding="utf-8") as f:
        ref_data = json.load(f)
    refs = ref_data["items"]

    print(f"Evaluating {model_tag} ({model or 'default'}) against {len(items)} prompts...")
    results = []
    for item in items:
        rid = str(item["id"])
        ref = refs.get(rid) or refs.get(item["id"])
        if not ref:
            print(f"  SKIP {item['id']}: no reference", file=sys.stderr)
            continue

        try:
            resp = await generate_response(item["prompt"], model)
            embed = await embed_text(resp)
            sim = cosine_sim(ref["embedding"], embed)
        except Exception as e:
            print(f"  FAIL {item['id']}: {e}", file=sys.stderr)
            sim = 0.0
            resp = f"[ERROR: {e}]"

        results.append({
            "id": item["id"],
            "category": item["category"],
            "prompt": item["prompt"][:60],
            "ref_response": (ref.get("response") or "")[:80],
            "new_response": resp[:80],
            "cosine_sim": sim,
            "pass": sim >= PASS_THRESHOLD,
        })
        marker = "PASS" if sim >= PASS_THRESHOLD else "FAIL"
        print(f"  [{marker}] {sim:.3f} {item['category']:20s} {item['prompt'][:40]}...")

    # ── Weighted average by category ──────────────────────────────────────
    cat_scores: dict[str, list[float]] = {}
    for r in results:
        cat = r["category"]
        cat_scores.setdefault(cat, []).append(r["cosine_sim"])

    # Compute per-category mean
    cat_means: dict[str, float] = {
        cat: sum(sims) / len(sims) for cat, sims in cat_scores.items()
    }

    # Weighted average: use CATEGORY_WEIGHTS; unknown categories get equal share
    known_weight_sum = sum(CATEGORY_WEIGHTS.get(c, 0.0) for c in cat_means)
    unknown_cats = [c for c in cat_means if c not in CATEGORY_WEIGHTS]
    if unknown_cats:
        leftover = max(0.0, 1.0 - known_weight_sum)
        per_unknown = leftover / len(unknown_cats)
    else:
        per_unknown = 0.0

    weighted_sum = 0.0
    weight_total = 0.0
    for cat, mean in cat_means.items():
        w = CATEGORY_WEIGHTS.get(cat, per_unknown)
        weighted_sum += mean * w
        weight_total += w

    weighted_avg = weighted_sum / max(weight_total, 1e-6)

    # ── Hard identity gate ─────────────────────────────────────────────────
    identity_gate_failures = [
        r for r in results
        if str(r["id"]) in IDENTITY_HARD_GATE_IDS and r["cosine_sim"] < PASS_THRESHOLD
    ]
    hard_gate_pass = len(identity_gate_failures) == 0

    # ── Final decision ─────────────────────────────────────────────────────
    simple_avg = sum(r["cosine_sim"] for r in results) / max(1, len(results))
    pass_count = sum(1 for r in results if r["pass"])

    decision = "PROMOTE" if (weighted_avg >= PASS_THRESHOLD and hard_gate_pass) else "ROLLBACK"
    if not hard_gate_pass:
        decision_reason = f"IDENTITY HARD GATE FAILED: {[r['id'] for r in identity_gate_failures]}"
    elif weighted_avg < PASS_THRESHOLD:
        decision_reason = f"Weighted avg {weighted_avg:.4f} < threshold {PASS_THRESHOLD}"
    else:
        decision_reason = "All gates passed"

    summary = {
        "model_tag": model_tag,
        "model": model or "default",
        "total_prompts": len(results),
        "passed": pass_count,
        "failed": len(results) - pass_count,
        "simple_avg_cosine_sim": round(simple_avg, 4),
        "weighted_avg_cosine_sim": round(weighted_avg, 4),
        "category_means": {k: round(v, 4) for k, v in cat_means.items()},
        "category_weights_used": CATEGORY_WEIGHTS,
        "identity_hard_gate": "PASS" if hard_gate_pass else "FAIL",
        "pass_threshold": PASS_THRESHOLD,
        "decision": decision,
        "decision_reason": decision_reason,
        "results": results,
    }

    print()
    print("=" * 60)
    print(f"VERDICT: {summary['decision']}")
    print(f"  Weighted avg: {weighted_avg:.4f} (threshold {PASS_THRESHOLD})")
    print(f"  Simple avg:   {simple_avg:.4f}")
    print(f"  Pass rate: {pass_count}/{len(results)}")
    print(f"  Identity gate: {summary['identity_hard_gate']}")
    print(f"  Reason: {decision_reason}")
    print()
    print("  Category breakdown (mean cosine sim):")
    for cat in sorted(cat_means, key=lambda c: -CATEGORY_WEIGHTS.get(c, 0)):
        w = CATEGORY_WEIGHTS.get(cat, per_unknown)
        mean = cat_means[cat]
        marker = "✅" if mean >= PASS_THRESHOLD else "❌"
        print(f"    {marker} {cat:20s}  {mean:.3f}  (weight {w:.0%})")
    print("=" * 60)

    out = f"eval_result_{model_tag}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"Detailed result: {out}")

    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["reference", "eval", "weights"], required=True,
                        help="reference=generate baseline; eval=evaluate model; weights=show category config")
    parser.add_argument("--output", default="references_baseline.json")
    parser.add_argument("--reference", default="eval/baseline_day55.json")
    parser.add_argument("--model-tag", default="migancore-7b-soul-cycle2")
    parser.add_argument("--model", help="Ollama model name override")
    args = parser.parse_args()

    if args.mode == "weights":
        print("=" * 50)
        print("Eval Category Weights (Day 57 Cycle 2)")
        print("=" * 50)
        print(f"  Pass threshold: {PASS_THRESHOLD}")
        print(f"  Category weights:")
        for cat, w in sorted(CATEGORY_WEIGHTS.items(), key=lambda x: -x[1]):
            print(f"    {cat:20s} {w:.0%}")
        print(f"  Identity hard gate IDs: {IDENTITY_HARD_GATE_IDS}")
        print("=" * 50)
    elif args.mode == "reference":
        asyncio.run(generate_references(args.output, args.model))
    else:
        result = asyncio.run(evaluate(args.reference, args.model_tag, args.model))
        sys.exit(0 if result["decision"] == "PROMOTE" else 1)


if __name__ == "__main__":
    main()
