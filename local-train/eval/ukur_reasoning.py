#!/usr/bin/env python3
"""ukur_reasoning.py — ukur HANYA axis reasoning (probe v3, 40 probe berkunci).

Kenapa terpisah: menjalankan `eval_gate.py` penuh butuh ~1 jam per model, padahal
yang berubah cuma satu axis. Lima axis lain probenya IDENTIK dengan baseline lama,
jadi hasilnya masih sahih dan tidak perlu diukur ulang.

Keluaran: JSON ber-`probe_log` dengan kunci yang formatnya sama dengan eval_gate
(`reasoning|t{temp}|{prompt}`), sehingga bisa langsung diuji berpasangan McNemar
antar-model.

Pakai:
    python eval/ukur_reasoning.py --model migancore:0.4-qwen3 --out eval/reason_v3_0.4.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from eval_3axis import chat            # noqa: E402
import eval_gate as EG                 # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--temps", default="0.2,0.7")
    ap.add_argument("--n", type=int, default=3, help="ulangan per probe; lulus = mayoritas")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    temps = [float(x) for x in args.temps.split(",")]
    probes = EG.REASONING
    if len(probes) < 30:
        print("GAGAL: hanya %d probe reasoning termuat — jalankan "
              "scripts/10_build_reasoning_probes.py dulu." % len(probes))
        return 1

    print("=" * 66)
    print("REASONING v3 — %s | %d probe x %d temp x N=%d" % (args.model, len(probes), len(temps), args.n))
    print("=" * 66)

    probe_log, per_temp = {}, {}
    for temp in temps:
        lulus = 0
        for prompt, check in probes:
            hits = 0
            for _ in range(args.n):
                t, _tc = chat(args.model, prompt, temp=temp)
                if check(t):
                    hits += 1
            ok = hits > args.n // 2 if args.n > 1 else hits == 1
            probe_log["reasoning|t%s|%s" % (temp, prompt)] = ok
            lulus += 1 if ok else 0
            print("  [t%s] %s (%d/%d) | %s" % (temp, "PASS" if ok else "FAIL", hits, args.n, prompt[:52]))
        per_temp[temp] = lulus / len(probes)
        print("  -> temp %s: %d/%d = %.3f" % (temp, lulus, len(probes), per_temp[temp]))

    worst = min(per_temp.values())
    print("\nreasoning_worst = %.3f  (gate keras >= 0.80)" % worst)
    hasil = {
        "model": args.model, "waktu": datetime.now(timezone.utc).isoformat(),
        "n_probe": len(probes), "temps": temps, "n_ulang": args.n,
        "per_temp": {str(k): v for k, v in per_temp.items()},
        "reasoning_worst": worst, "probe_log": probe_log,
    }
    out = args.out if os.path.isabs(args.out) else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), args.out)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(hasil, f, ensure_ascii=False, indent=1)
    print("tersimpan -> %s" % out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
