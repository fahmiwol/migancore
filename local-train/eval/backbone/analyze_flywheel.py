#!/usr/bin/env python3
"""analyze_flywheel.py — calibration report over the T0 shadow flywheel (F-160).

Stdlib-only. Reads the JSONL the backbone shadow facilities persist
(intent/confidence/validator) and reports the base rates you need BEFORE flipping
any facility `on`: intent distribution, confidence level/reason mix, validator
flag rate. Runs anywhere — no app imports, no container, no model calls.

Usage (on the VPS host, against the mounted volume):
  python3 analyze_flywheel.py <server-root>/ado/data/training/shadow
  python3 analyze_flywheel.py <server-root>/ado/data/training/shadow 2026-07-07   # one day
"""
import collections
import glob
import json
import os
import sys


def load(path_dir: str, day: str | None):
    pattern = os.path.join(path_dir, (day or "*") + ".jsonl")
    rows = []
    for fp in sorted(glob.glob(pattern)):
        with open(fp, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    try:
                        rows.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    return rows


def pct(n, d):
    return f"{round(100 * n / d)}%" if d else "-"


def main():
    path_dir = sys.argv[1] if len(sys.argv) > 1 else "<server-root>/ado/data/training/shadow"
    day = sys.argv[2] if len(sys.argv) > 2 else None
    rows = load(path_dir, day)
    if not rows:
        print(f"no flywheel rows in {path_dir} ({day or 'all days'})")
        return

    by_fac = collections.Counter(r.get("facility") for r in rows)
    convs = {r.get("conversation_id") for r in rows if r.get("conversation_id")}
    print(f"=== flywheel {path_dir} ({day or 'all'}) ===")
    print(f"rows={len(rows)}  conversations={len(convs)}  facilities={dict(by_fac)}\n")

    intents = collections.Counter(r["intent"] for r in rows if r.get("facility") == "intent" and r.get("intent"))
    if intents:
        print("INTENT distribution:")
        for k, n in intents.most_common():
            print(f"  {k:20s} {n:4d}  {pct(n, sum(intents.values()))}")
        print()

    conf = [r for r in rows if r.get("facility") == "confidence"]
    if conf:
        lvl = collections.Counter(r.get("level") for r in conf)
        rsn = collections.Counter(r.get("reason") for r in conf)
        print(f"CONFIDENCE ({len(conf)} rows):")
        print("  level:  " + ", ".join(f"{k}={n} ({pct(n, len(conf))})" for k, n in lvl.most_common()))
        print("  reason: " + ", ".join(f"{k}={n}" for k, n in rsn.most_common()))
        print()

    val = [r for r in rows if r.get("facility") == "validator"]
    if val:
        flagged = [r for r in val if r.get("n_flags")]
        checks = collections.Counter(f.get("check") for r in flagged for f in (r.get("flags") or []))
        print(f"VALIDATOR ({len(val)} rows): flagged={len(flagged)} ({pct(len(flagged), len(val))})")
        if checks:
            print("  flag types: " + ", ".join(f"{k}={n}" for k, n in checks.most_common()))


if __name__ == "__main__":
    main()
