#!/usr/bin/env python3
"""10_build_reasoning_probes.py — perbesar HANYA axis `reasoning` di probes_v2.json.

Kenapa terpisah dari `09_build_eval_probes.py` (yang membangun SEMUA axis):
membangun ulang seluruh probes_v2 akan mengganti probe `positive_tool` juga — ruang
templatnya sudah diperluas 122->470 saat memperbaiki F-208 — dan itu **merusak
perbandingan berpasangan** dengan baseline yang sudah ada
(`gate_0.4_baseline_LOKAL_v2.json`, `gate_pilot15.json`, `gate_run16.json`).
McNemar hanya sahih bila probenya SAMA. Jadi di sini axis lain disalin apa adanya,
byte-per-byte, dan hanya `reasoning` yang diganti.

Kenapa perlu (F-216): dengan 8 probe, satu jawaban berbalik menggeser skor 0,125 —
cukup untuk MEMBALIK vonis gate pada dua model yang secara statistik identik
(p=1,0000). Axis pengambil keputusan tidak boleh sekasar itu.

Yang membuatnya mungkin sekarang: `06_gen_programmatic.py` meneruskan `kunci`
(jawaban yang dihitung Python) sampai ke probe, sehingga `_cek_kunci()` di eval_gate
bisa memeriksanya secara deterministik tanpa lambda hardcoded.

Pakai:
    python scripts/10_build_reasoning_probes.py --n 40
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
EVAL = ROOT / "eval"


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(s or "")).lower()).strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=40, help="jumlah probe reasoning (minimum 30)")
    ap.add_argument("--seed", type=int, default=4242, help="WAJIB beda dari seed train (42)")
    ap.add_argument("--data", default="data/pilot15_seimbang/train.jsonl")
    args = ap.parse_args()

    if args.seed == 42:
        print("GAGAL: seed 42 = seed train. Probe harus dibangkitkan dengan seed lain.")
        return 1
    if args.n < 30:
        print("GAGAL: minimum 30 probe (F-216 — 8 probe membuat vonis gate bisa terbalik).")
        return 1

    # 1) kumpulkan teks train untuk uji disjoint
    train_teks = set()
    p_train = ROOT / args.data
    if p_train.exists():
        for line in p_train.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            for m in json.loads(line).get("messages", []):
                if m.get("role") == "user":
                    train_teks.add(norm(m["content"]))
    print("teks train yang dihindari : %d" % len(train_teks))

    # 2) impor generator ASLI (bukan salinan) supaya kunci dihitung dengan kode yang sama
    import importlib.util
    spec = importlib.util.spec_from_file_location("gen", ROOT / "scripts" / "06_gen_programmatic.py")
    gen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gen)

    rng = random.Random(args.seed)
    probes, dipakai, ditolak = [], set(), Counter()
    jenis_ct = Counter()
    for _ in range(args.n * 200):
        if len(probes) >= args.n:
            break
        r = gen.gen_reasoning(rng)
        q, kunci = r["q"], r.get("kunci")
        if not kunci:
            ditolak["tanpa_kunci"] += 1
            continue
        nq = norm(q)
        if nq in dipakai:
            ditolak["duplikat_internal"] += 1
            continue
        if nq in train_teks:
            ditolak["BOCOR_dari_train"] += 1
            continue
        dipakai.add(nq)
        for kw, nm in [("apel", "harga"), ("diskon", "diskon"), ("km/jam", "kecepatan"),
                       ("Hitung:", "urutan_operasi"), ("permen", "bagi_sisa"),
                       ("Urutkan", "urut"), ("Hari ini", "hari"), ("% dari", "persen")]:
            if kw in q:
                jenis_ct[nm] += 1
                break
        probes.append({"prompt": q, "kelas": "reasoning_checkable", "kunci": str(kunci),
                       "jawaban": r["a"]})

    print("probe terkumpul           : %d" % len(probes))
    print("ditolak                   : %s" % (dict(ditolak) or "tidak ada"))
    print("sebaran jenis             : %s" % dict(jenis_ct))

    if len(probes) < 30:
        print("\n⛔ GAGAL: hanya %d probe (<30)." % len(probes))
        return 1
    if len(jenis_ct) < 6:
        print("\n⛔ GAGAL: hanya %d jenis soal — axis harus beragam, bukan satu pola diulang."
              % len(jenis_ct))
        return 1

    # 3) uji ulang disjoint SECARA EKSPLISIT (jangan percaya penyaringan di atas saja)
    bocor = [p["prompt"] for p in probes if norm(p["prompt"]) in train_teks]
    print("uji-ulang disjoint        : %d bocor (harus 0)" % len(bocor))
    if bocor:
        print("⛔ GAGAL:", bocor[:3])
        return 1

    # 4) gabungkan ke probes_v2 — axis LAIN disalin apa adanya demi komparabilitas
    pv2_path = EVAL / "probes_v2.json"
    pv2 = json.loads(pv2_path.read_text(encoding="utf-8"))
    lama = len(pv2["axes"].get("reasoning", []))
    pv2["axes"]["reasoning"] = probes
    pv2.setdefault("_riwayat", []).append({
        "waktu": datetime.now(timezone.utc).isoformat(),
        "perubahan": "axis reasoning %d -> %d probe (F-216: 8 probe membuat vonis gate "
                     "bisa terbalik oleh kebisingan). Axis lain TIDAK disentuh agar "
                     "perbandingan berpasangan dgn baseline lama tetap sahih." % (lama, len(probes)),
        "seed": args.seed,
    })
    pv2_path.write_text(json.dumps(pv2, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\nprobes_v2.json diperbarui : reasoning %d -> %d (axis lain tak disentuh)"
          % (lama, len(probes)))

    # 5) daftarkan sebagai held-out supaya 07 menolaknya masuk training SELAMANYA
    ho_path = EVAL / "cycle15_heldout.json"
    ho = json.loads(ho_path.read_text(encoding="utf-8")) if ho_path.exists() else {}
    kunci_ho = "reasoning_probes_v3"
    ho[kunci_ho] = [p["prompt"] for p in probes]
    ho_path.write_text(json.dumps(ho, ensure_ascii=False, indent=1), encoding="utf-8")
    print("terdaftar held-out        : %s (%d pola)" % (kunci_ho, len(probes)))

    print("\n⚠️  Baseline lama TIDAK punya probe_log untuk probe reasoning baru ini.")
    print("    Jalankan ulang eval untuk model yang mau dibandingkan sebelum memutuskan.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
