#!/usr/bin/env python3
"""
MiganCore Cycle 4 Eval — Category Floor Gates (Codex mandatory gate)
=====================================================================
Day 63 | 2026-05-07

Runs standard identity eval + applies Cycle 4 specific category floors.
Codex requirement: do NOT promote by weighted_avg alone for Cycle 4.

Cycle 4 PROMOTE gates (ALL must pass):
  weighted_avg >= 0.92   (raise bar from Cycle 3's 0.9082)
  identity     >= 0.90   (preserve / tighten)
  evolution    >= 0.80   (FIX — was 0.568 Cycle 3, catastrophic regression)
  creative     >= 0.80   (NEW — was 0.695 Cycle 3, underrepresented)
  tool-use     >= 0.85   (IMPROVE — was 0.797 Cycle 3)
  voice        >= 0.85   (IMPROVE — was 0.817 Cycle 3, close)

NO PROMOTE if weighted passes but any category fails → RETRAIN.

Usage:
  # Run inside api container after GGUF + Ollama registration:
  docker compose exec -T api python /app/eval/run_cycle4_eval.py \\
    --model migancore:0.4

  # If reference needs regenerating (usually not needed):
  docker compose exec -T api python /app/eval/run_cycle4_eval.py \\
    --model migancore:0.4 --regen-reference
"""
from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, "/app")

# ─────────────────────────────────────────────────────────────────────────────
# CYCLE 4 GATE DEFINITIONS (Codex mandatory — per Lesson #129)
# ─────────────────────────────────────────────────────────────────────────────
CYCLE4_GATES = {
    "weighted_avg": 0.92,   # overall bar (raise from 0.80 gate)
    "identity":     0.90,   # tighten — was 0.953 Cycle 3, must preserve
    "evolution-aware": 0.80, # CRITICAL FIX — was 0.568 Cycle 3
    "creative":     0.80,   # NEW category — was 0.695 Cycle 3
    "tool-use":     0.85,   # IMPROVE — was 0.797 Cycle 3
    "voice":        0.85,   # IMPROVE — was 0.817 Cycle 3
}

# Cycle 3 baseline for regression check
CYCLE3_BASELINE = {
    "weighted_avg": 0.9082,
    "identity":     0.953,
    "voice":        0.817,
    "tool-use":     0.797,
    "creative":     0.695,
    "evolution-aware": 0.568,
    "reasoning":    0.994,
    "code":         0.929,
}

REFERENCE_PATH = "/app/eval/baseline_day58.json"
EVAL_SCRIPT    = "/app/eval/run_identity_eval.py"
MODEL_TAG      = "migancore-7b-soul-cycle4"


def run_standard_eval(model: str, regen_reference: bool = False) -> dict:
    """Run the standard identity eval and return result dict."""
    if regen_reference:
        print("[*] Regenerating reference baseline...")
        result = subprocess.run(
            [sys.executable, EVAL_SCRIPT,
             "--mode", "reference",
             "--output", REFERENCE_PATH,
             "--model", model],
            capture_output=False
        )
        if result.returncode != 0:
            print("ERROR: reference generation failed")
            sys.exit(1)

    print(f"[*] Running standard identity eval (model: {model})...")
    result = subprocess.run(
        [sys.executable, EVAL_SCRIPT,
         "--mode", "eval",
         "--reference", REFERENCE_PATH,
         "--model-tag", MODEL_TAG,
         "--model", model],
        capture_output=False
    )

    # Read the output JSON
    output_file = Path(f"eval_result_{MODEL_TAG}.json")
    if not output_file.exists():
        # Try /app prefix
        output_file = Path(f"/app/eval_result_{MODEL_TAG}.json")

    if not output_file.exists():
        print(f"ERROR: eval output not found at {output_file}")
        sys.exit(1)

    with output_file.open() as f:
        return json.load(f)


def apply_cycle4_gates(eval_result: dict) -> dict:
    """Apply Cycle 4 category floor gates. Returns gate report."""
    cat_means = eval_result.get("category_means", {})
    weighted_avg = eval_result.get("weighted_avg_cosine_sim", 0.0)

    gate_results = {}
    all_pass = True

    # Check weighted avg
    wa_gate = CYCLE4_GATES["weighted_avg"]
    wa_pass = weighted_avg >= wa_gate
    gate_results["weighted_avg"] = {
        "value":    round(weighted_avg, 4),
        "gate":     wa_gate,
        "pass":     wa_pass,
        "cycle3":   CYCLE3_BASELINE.get("weighted_avg"),
        "delta":    round(weighted_avg - CYCLE3_BASELINE.get("weighted_avg", 0), 4),
    }
    if not wa_pass:
        all_pass = False

    # Check category floors
    for cat, gate in CYCLE4_GATES.items():
        if cat == "weighted_avg":
            continue
        # Handle category name variants (eval may use "tool-use" or "tool_use")
        val = cat_means.get(cat, cat_means.get(cat.replace("-", "_"), None))
        if val is None:
            val = cat_means.get(cat.replace("_", "-"), None)
        if val is None:
            # Category not in eval set — note as unknown
            gate_results[cat] = {
                "value":  None,
                "gate":   gate,
                "pass":   None,  # unknown
                "cycle3": CYCLE3_BASELINE.get(cat),
                "note":   "category not in eval set — manual spot-check required",
            }
            continue

        passes = val >= gate
        gate_results[cat] = {
            "value":  round(val, 4),
            "gate":   gate,
            "pass":   passes,
            "cycle3": CYCLE3_BASELINE.get(cat),
            "delta":  round(val - CYCLE3_BASELINE.get(cat, val), 4),
        }
        if not passes:
            all_pass = False

    return {"all_pass": all_pass, "gates": gate_results}


def print_cycle4_verdict(eval_result: dict, gate_report: dict, model: str) -> str:
    """Print formatted Cycle 4 verdict. Returns PROMOTE or ROLLBACK."""
    print()
    print("=" * 70)
    print(f"CYCLE 4 EVAL — PROMOTE/ROLLBACK DECISION")
    print(f"Model: {model} | Tag: {MODEL_TAG}")
    print("=" * 70)

    gates = gate_report["gates"]
    fails = []

    for metric, gdata in gates.items():
        val = gdata.get("value")
        gate = gdata.get("gate")
        passes = gdata.get("pass")
        c3 = gdata.get("cycle3")
        delta = gdata.get("delta", 0)
        note = gdata.get("note", "")

        if passes is None:
            marker = "⚠️ "
            status = "UNKNOWN"
        elif passes:
            marker = "✅"
            status = "PASS"
        else:
            marker = "❌"
            status = "FAIL"
            fails.append(metric)

        delta_str = f"  Δ{delta:+.3f} vs Cycle 3" if c3 is not None and delta is not None else ""
        val_str = f"{val:.3f}" if val is not None else "N/A"
        print(f"  {marker} {metric:20s}  {val_str:6s} (gate ≥ {gate:.2f}){delta_str}  {status}")
        if note:
            print(f"       ↳ {note}")

    print()

    if gate_report["all_pass"]:
        verdict = "PROMOTE"
        print(f"🏆 VERDICT: {verdict} — all Cycle 4 gates passed")
        print(f"   Next steps:")
        print(f"   1. Update DEFAULT_MODEL → migancore:0.4")
        print(f"   2. docker compose restart api (env only, no rebuild needed for model switch)")
        print(f"   3. Verify chat responds as migancore:0.4")
        print(f"   4. Write day63_progress.md + update MEMORY.md")
    else:
        verdict = "ROLLBACK"
        print(f"❌ VERDICT: {verdict} — {len(fails)} category gate(s) failed")
        print(f"   Failed: {fails}")
        print(f"   Action: stay on migancore:0.3, analyze failing categories,")
        print(f"           add more targeted pairs + retry Cycle 4 training (~$0.10)")

    print("=" * 70)
    return verdict


def main():
    parser = argparse.ArgumentParser(description="Cycle 4 eval with category floor gates")
    parser.add_argument("--model", default="migancore:0.4",
                        help="Ollama model to evaluate (default: migancore:0.4)")
    parser.add_argument("--regen-reference", action="store_true",
                        help="Regenerate reference baseline (usually not needed)")
    parser.add_argument("--skip-eval", default=None,
                        help="Path to existing eval JSON (skip running eval, just apply gates)")
    args = parser.parse_args()

    print("=" * 70)
    print("MIGANCORE CYCLE 4 — Category Floor Gate Evaluation (Codex mandatory)")
    print("=" * 70)
    print(f"Model: {args.model}")
    print(f"Cycle 4 gates: {CYCLE4_GATES}")
    print()

    if args.skip_eval:
        with open(args.skip_eval) as f:
            eval_result = json.load(f)
        print(f"[*] Using existing eval: {args.skip_eval}")
    else:
        eval_result = run_standard_eval(args.model, args.regen_reference)

    gate_report = apply_cycle4_gates(eval_result)
    verdict = print_cycle4_verdict(eval_result, gate_report, args.model)

    # Save combined report
    report = {
        "cycle": 4,
        "model": args.model,
        "model_tag": MODEL_TAG,
        "verdict": verdict,
        "eval_summary": {
            "weighted_avg": eval_result.get("weighted_avg_cosine_sim"),
            "simple_avg": eval_result.get("simple_avg_cosine_sim"),
            "pass_count": eval_result.get("passed"),
            "total": eval_result.get("total_prompts"),
            "category_means": eval_result.get("category_means"),
        },
        "cycle4_gates": gate_report,
    }
    out_path = Path("/app/eval/eval_result_cycle4.json")
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\nDetailed report: {out_path}")

    sys.exit(0 if verdict == "PROMOTE" else 1)


if __name__ == "__main__":
    main()
