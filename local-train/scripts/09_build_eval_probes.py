#!/usr/bin/env python3
"""09_build_eval_probes.py — bangun probe EVAL yang disjoint dari data train.

Kenapa ada (E2, 2026-07-26): `eval_gate.py` memakai probe hard-coded yang terlalu
sedikit, sehingga resolusinya jauh lebih kasar daripada epsilon regresi yang dipakai
untuk mengambil keputusan:

    axis            probe   resolusi (1/N)
    REASONING          8        0.125
    POSITIVE_TOOL      2        0.500   <-- satu jawaban berbalik = setengah skor
    IRRELEVANCE        4        0.250

Epsilon regresi 0,05. Artinya harness TIDAK BISA membedakan perbaikan nyata dari
kebisingan sampling — dan setiap keputusan training/sampler di atasnya tidak sahih.
Terbukti: skor pada model BYTE-IDENTIK berbeda antar-run.

⚠️ ANTI-BOCOR adalah inti script ini. Generator `06` juga memasok data TRAIN, jadi
memakai keluarannya mentah-mentah untuk eval = train-test leak (angka bagus palsu).
Karena itu: generate dengan seed BERBEDA → buang apa pun yang menyerupai train →
daftarkan hasilnya ke held-out supaya gate di `07_build_growthring.py` menolaknya
masuk training selamanya.

Pakai:
    python scripts/09_build_eval_probes.py --n-per-axis 30
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVAL = ROOT / "eval"
GEN = ROOT / "scripts" / "06_gen_programmatic.py"

# kelas generator -> axis harness
PETA_AXIS = {
    "irrelevance_no_tool": "irrelevance",
    "over_tool_negatif": "over_tool",
    "reasoning_checkable": "reasoning",
    "positive_tool_image": "positive_tool",
    "positive_tool_search": "positive_tool",
}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(s or "")).lower()).strip()


def user_text(rec: dict) -> str:
    for m in rec.get("messages", []):
        if m.get("role") == "user":
            return m.get("content", "")
    return rec.get("prompt", "")


def baca_jsonl(p: Path) -> list:
    if not p.exists():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


def mirip(a: str, kumpulan: set) -> bool:
    """Jaccard > 0.8 dianggap sama — sama seperti gate anti-bocor di 07."""
    ka = set(norm(a).split())
    if len(ka) < 3:
        return norm(a) in kumpulan
    for h in kumpulan:
        kh = set(h.split())
        if kh and len(ka & kh) / max(len(ka | kh), 1) > 0.8:
            return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-per-axis", type=int, default=30,
                    help="probe per axis (>=20 agar resolusi <= 0.05)")
    ap.add_argument("--seed", type=int, default=4242, help="WAJIB beda dari seed train (42)")
    ap.add_argument("--out", default="eval/probes_v2.json")
    args = ap.parse_args()

    if args.seed == 42:
        print("GAGAL: seed 42 = seed train. Pakai seed lain agar tidak identik."); return 1
    if args.n_per_axis < 20:
        print("PERINGATAN: n-per-axis < 20 → resolusi > 0.05, masih lebih kasar dari epsilon regresi")

    # 1) kumpulkan teks TRAIN yang harus dihindari
    train_teks = set()
    for nama in ("data/generated/sft_programatik.jsonl", "data/growth_ring/train.jsonl"):
        for r in baca_jsonl(ROOT / nama):
            u = user_text(r)
            if u:
                train_teks.add(norm(u))
    print("teks train yang dihindari : %d" % len(train_teks))

    # 2) generate kandidat dengan seed berbeda, jumlah berlebih agar cukup setelah disaring
    tmp = ROOT / "data" / "_eval_probe_tmp"
    cmd = [sys.executable, str(GEN), "--out", str(tmp.relative_to(ROOT)),
           "--n-per-class", str(args.n_per_axis * 6), "--seed", str(args.seed)]
    # PYTHONIOENCODING wajib: subprocess di Windows default cp1252 dan generator
    # mencetak karakter non-ASCII (→) → UnicodeEncodeError yang tidak ada hubungannya
    # dengan datanya.
    import os as _os
    _env = dict(_os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    r = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=_env)
    if r.returncode != 0:
        print("GAGAL generate:", (r.stderr or r.stdout)[-400:]); return 1

    kandidat = baca_jsonl(tmp / "sft_programatik.jsonl")
    print("kandidat dihasilkan       : %d" % len(kandidat))

    # 3) saring: buang yang menyerupai train, buang duplikat internal
    per_axis: dict[str, list] = {}
    dipakai: set = set()
    ditolak = Counter()
    for rec in kandidat:
        kelas = rec.get("meta", {}).get("kelas", "")
        axis = PETA_AXIS.get(kelas)
        if not axis:
            ditolak["kelas_tak_dipetakan"] += 1
            continue
        if len(per_axis.get(axis, [])) >= args.n_per_axis:
            continue
        u = user_text(rec)
        if not u:
            ditolak["tanpa_user"] += 1
            continue
        n = norm(u)
        if n in dipakai:
            ditolak["duplikat_internal"] += 1
            continue
        if n in train_teks or mirip(u, train_teks):
            ditolak["BOCOR_dari_train"] += 1
            continue
        dipakai.add(n)
        per_axis.setdefault(axis, []).append({
            "prompt": u,
            "kelas": kelas,
            "jawaban": next((m.get("content") for m in rec.get("messages", [])
                             if m.get("role") == "assistant"), ""),
            # `kunci` = jawaban pasti yang dihitung Python (hanya untuk soal berjawaban-
            # tunggal). Inilah yang membuat axis `reasoning` bisa diperbesar: tanpa kunci,
            # probe hanya berupa teks dan eval_gate terpaksa memakai checker lambda
            # hardcoded, sehingga jumlahnya mentok 8 (F-216: 8 probe membuat vonis gate
            # bisa terbalik oleh kebisingan).
            **({"kunci": rec["meta"]["kunci"]} if rec.get("meta", {}).get("kunci") else {}),
        })

    # 4) laporan + gate
    print("\n%-16s %-8s %s" % ("AXIS", "probe", "resolusi"))
    print("-" * 40)
    kurang = []
    for axis in sorted(set(PETA_AXIS.values())):
        n = len(per_axis.get(axis, []))
        res = (1 / n) if n else 1.0
        tanda = "" if res <= 0.05 else "  <-- masih kasar"
        print("%-16s %-8d %.3f%s" % (axis, n, res, tanda))
        if n < 20:
            kurang.append("%s hanya %d probe" % (axis, n))
    print("\nditolak: %s" % (dict(ditolak) or "tidak ada"))

    if kurang:
        print("\n⛔ GAGAL: %s" % " · ".join(kurang))
        print("   resolusi masih lebih kasar dari epsilon 0.05 → naikkan --n-per-axis")
        return 1

    # 5) tulis probe + daftarkan sebagai held-out (agar 07 menolaknya masuk train)
    out = EVAL / Path(args.out).name
    payload = {
        "_catatan": ("Probe EVAL — DILARANG masuk data training. Dibangun dengan seed %d "
                     "(train seed 42) lalu disaring terhadap seluruh teks train." % args.seed),
        "dibuat": datetime.now(timezone.utc).isoformat(),
        "seed": args.seed,
        "n_per_axis": args.n_per_axis,
        "axes": per_axis,
    }
    tmpf = out.with_suffix(".tmp")
    tmpf.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    json.loads(tmpf.read_text(encoding="utf-8"))       # verifikasi bisa dibaca balik
    tmpf.replace(out)
    print("\nprobe eval  -> %s" % out)

    ho_path = EVAL / "cycle15_heldout.json"
    ho = json.loads(ho_path.read_text(encoding="utf-8")) if ho_path.exists() else {}
    ho["probes_v2_eval"] = [p["prompt"] for lst in per_axis.values() for p in lst]
    tmph = ho_path.with_suffix(".tmp")
    tmph.write_text(json.dumps(ho, ensure_ascii=False, indent=1), encoding="utf-8")
    json.loads(tmph.read_text(encoding="utf-8"))
    tmph.replace(ho_path)
    print("held-out    -> %s (+%d pola dijaga gate 07)"
          % (ho_path, len(ho["probes_v2_eval"])))

    # bersihkan tmp
    for f in tmp.glob("*"):
        f.unlink()
    tmp.rmdir()

    print("\n✅ probe eval siap — resolusi <= %.3f di semua axis" % (1 / args.n_per_axis))
    return 0


if __name__ == "__main__":
    sys.exit(main())
