#!/usr/bin/env python3
"""
01_prepare_data.py — normalisasi + dedup + split dataset identitas MiganCore.

Kenapa ada: dataset sumber datang dalam 3 format berbeda dan SALING TUMPANG TINDIH
(identity_sft_270 memuat ulang identity_sft_200_ORGANIC; identity_unified_sft tampak
gabungan dari beberapa file). Melatih di atas duplikat = model menghafal, dan eval
jadi bohong karena contoh yang sama muncul di train DAN eval.

Yang dilakukan:
  1. Deteksi format tiap file otomatis  → alpaca | chat | dpo
  2. Normalisasi ke satu bentuk kanonik → {"messages": [...], "meta": {...}}
  3. Dedup lintas-file berdasar isi (bukan nama file)
  4. Validasi: assistant kosong, terlalu pendek, terlalu panjang → dibuang + dilaporkan
  5. Split train/eval stratified per-source
  6. GATE ANTI-BOCOR: assert 0 irisan hash antara train dan eval — kalau gagal, exit != 0

Hanya pakai stdlib supaya bisa jalan sebelum venv training terpasang.

Contoh:
    python scripts/01_prepare_data.py --raw data/raw --out data/prepared --eval-ratio 0.08
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

# Batas kewajaran satu contoh. Dipakai untuk membuang sampah, bukan untuk memotong.
MIN_ASSISTANT_CHARS = 8
MAX_TOTAL_CHARS = 8000
# Perkiraan token dari karakter. Qwen2.5 pada campuran Indonesia/Inggris ~3.3 char/token.
# Hanya untuk laporan + saran max_seq_len; angka pastinya dihitung ulang saat training.
CHARS_PER_TOKEN = 3.3


def norm_text(s: str) -> str:
    """Normalisasi untuk PEMBANDINGAN saja (dedup) — bukan untuk teks yang dilatih."""
    s = unicodedata.normalize("NFKC", str(s or ""))
    s = s.replace("—", "-").replace("–", "-")
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def content_hash(messages: list) -> str:
    """Hash isi percakapan tanpa system prompt.

    System prompt sengaja DIABAIKAN: contoh yang sama sering muncul sekali dengan
    system prompt dan sekali tanpa — itu tetap duplikat dari sisi apa yang dipelajari.
    """
    parts = []
    for m in messages:
        if m.get("role") == "system":
            continue
        parts.append(m.get("role", "") + ":" + norm_text(m.get("content", "")))
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def detect_format(obj: dict) -> str:
    if "messages" in obj and isinstance(obj["messages"], list):
        return "chat"
    if "chosen" in obj and "rejected" in obj:
        return "dpo"
    if "output" in obj and ("instruction" in obj or "input" in obj):
        return "alpaca"
    return "unknown"


def to_canonical(obj: dict, fmt: str, source: str):
    """Kembalikan (record | None, alasan_ditolak | None)."""
    meta = dict(obj.get("metadata") or {})
    meta["source_file"] = source
    if obj.get("source"):
        meta.setdefault("source", obj["source"])

    if fmt == "chat":
        msgs = []
        for m in obj["messages"]:
            role = m.get("role")
            content = (m.get("content") or "").strip()
            if role not in ("system", "user", "assistant"):
                return None, "role_asing:%s" % role
            if not content:
                return None, "isi_kosong"
            msgs.append({"role": role, "content": content})
        if not any(m["role"] == "assistant" for m in msgs):
            return None, "tanpa_assistant"
        return {"messages": msgs, "meta": meta}, None

    if fmt == "alpaca":
        instr = (obj.get("instruction") or "").strip()
        inp = (obj.get("input") or "").strip()
        out = (obj.get("output") or "").strip()
        if not out:
            return None, "output_kosong"
        user = (instr + "\n" + inp).strip() if inp else instr
        if not user:
            return None, "prompt_kosong"
        return {"messages": [{"role": "user", "content": user},
                             {"role": "assistant", "content": out}], "meta": meta}, None

    if fmt == "dpo":
        # DPO bukan SFT — disisihkan ke file sendiri untuk tahap berikutnya.
        return {"_dpo": True, "prompt": obj.get("prompt", ""), "chosen": obj.get("chosen", ""),
                "rejected": obj.get("rejected", ""), "meta": meta}, None

    return None, "format_tak_dikenal"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="data/raw")
    ap.add_argument("--out", default="data/prepared")
    ap.add_argument("--eval-ratio", type=float, default=0.08)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--min-eval", type=int, default=24, help="minimum contoh eval agar angka tidak berisik")
    args = ap.parse_args()

    raw_dir, out_dir = Path(args.raw), Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(raw_dir.glob("*.jsonl"))
    if not files:
        print("FATAL: tak ada .jsonl di %s" % raw_dir)
        return 2

    kept, dpo = [], []
    seen: dict[str, str] = {}          # hash -> file pertama yang memuatnya
    stats = defaultdict(Counter)
    dropped = Counter()
    dup_pairs = Counter()              # (file_duplikat, file_asal) -> jumlah

    for fp in files:
        with open(fp, "r", encoding="utf-8") as fh:
            for ln, line in enumerate(fh, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError as e:
                    dropped["json_rusak"] += 1
                    stats[fp.name]["json_rusak"] += 1
                    print("  ! %s:%d JSON rusak: %s" % (fp.name, ln, e))
                    continue

                fmt = detect_format(obj)
                stats[fp.name]["total"] += 1
                rec, why = to_canonical(obj, fmt, fp.name)
                if rec is None:
                    dropped[why] += 1
                    stats[fp.name]["ditolak"] += 1
                    continue
                if rec.get("_dpo"):
                    dpo.append(rec)
                    stats[fp.name]["dpo"] += 1
                    continue

                # validasi kewajaran
                asst = " ".join(m["content"] for m in rec["messages"] if m["role"] == "assistant")
                total_chars = sum(len(m["content"]) for m in rec["messages"])
                if len(asst.strip()) < MIN_ASSISTANT_CHARS:
                    dropped["assistant_terlalu_pendek"] += 1
                    stats[fp.name]["ditolak"] += 1
                    continue
                if total_chars > MAX_TOTAL_CHARS:
                    dropped["terlalu_panjang"] += 1
                    stats[fp.name]["ditolak"] += 1
                    continue

                h = content_hash(rec["messages"])
                if h in seen:
                    dropped["duplikat"] += 1
                    stats[fp.name]["duplikat"] += 1
                    dup_pairs[(fp.name, seen[h])] += 1
                    continue
                seen[h] = fp.name

                rec["_hash"] = h
                rec["_chars"] = total_chars
                rec["meta"]["has_system"] = any(m["role"] == "system" for m in rec["messages"])
                kept.append(rec)
                stats[fp.name]["diterima"] += 1

    if not kept:
        print("FATAL: 0 contoh lolos validasi")
        return 2

    # ── split stratified per source_file, deterministik ──
    rng = random.Random(args.seed)
    by_src = defaultdict(list)
    for r in kept:
        by_src[r["meta"]["source_file"]].append(r)

    train, evals = [], []
    for src, items in sorted(by_src.items()):
        rng.shuffle(items)
        n_eval = int(round(len(items) * args.eval_ratio))
        evals.extend(items[:n_eval])
        train.extend(items[n_eval:])

    # jaga eval tidak terlalu kecil untuk jadi sinyal
    if len(evals) < args.min_eval and len(kept) > args.min_eval * 3:
        rng.shuffle(train)
        need = args.min_eval - len(evals)
        evals.extend(train[:need])
        train = train[need:]

    rng.shuffle(train)

    # ── GATE ANTI-BOCOR ──
    th = {r["_hash"] for r in train}
    eh = {r["_hash"] for r in evals}
    overlap = th & eh
    if overlap:
        print("FATAL: %d contoh bocor antara train dan eval." % len(overlap))
        return 3

    def write(path: Path, rows: list, strip_internal: bool = True) -> None:
        with open(path, "w", encoding="utf-8") as fh:
            for r in rows:
                r = {k: v for k, v in r.items() if not (strip_internal and k.startswith("_"))}
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    write(out_dir / "train.jsonl", train)
    write(out_dir / "eval.jsonl", evals)
    if dpo:
        write(out_dir / "dpo.jsonl", dpo)

    chars = sorted(r["_chars"] for r in kept)
    p = lambda q: chars[min(len(chars) - 1, int(len(chars) * q))]
    report = {
        "dibuat": datetime.now(timezone.utc).isoformat(),
        "seed": args.seed,
        "file_sumber": [f.name for f in files],
        "masuk": sum(s["total"] for s in stats.values()),
        "diterima": len(kept),
        "train": len(train),
        "eval": len(evals),
        "dpo": len(dpo),
        "dibuang": dict(dropped),
        "per_file": {k: dict(v) for k, v in stats.items()},
        "duplikat_lintas_file": {"%s <= %s" % k: v for k, v in dup_pairs.most_common(12)},
        "panjang_char": {"p50": p(0.50), "p90": p(0.90), "p99": p(0.99), "max": chars[-1]},
        "perkiraan_token": {"p50": int(p(0.50) / CHARS_PER_TOKEN), "p90": int(p(0.90) / CHARS_PER_TOKEN),
                            "p99": int(p(0.99) / CHARS_PER_TOKEN), "max": int(chars[-1] / CHARS_PER_TOKEN)},
        "saran_max_seq_len": min(2048, max(256, 1 << (int(p(0.99) / CHARS_PER_TOKEN) - 1).bit_length())),
        "kebocoran_train_eval": len(overlap),
    }
    (out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n" + "=" * 62)
    print("DATA SIAP")
    print("=" * 62)
    print("  masuk       : %d contoh dari %d file" % (report["masuk"], len(files)))
    print("  diterima    : %d" % len(kept))
    print("  dibuang     : %s" % (dict(dropped) or "tidak ada"))
    print("  train/eval  : %d / %d   (bocor: %d)" % (len(train), len(evals), len(overlap)))
    if dpo:
        print("  dpo         : %d (disimpan untuk tahap DPO, bukan SFT)" % len(dpo))
    print("  token p50/p90/p99/max : %(p50)d / %(p90)d / %(p99)d / %(max)d" % report["perkiraan_token"])
    print("  saran max_seq_len     : %d" % report["saran_max_seq_len"])
    if dup_pairs:
        print("  duplikat terbanyak:")
        for (a, b), n in dup_pairs.most_common(5):
            print("     %-34s %4d contoh sudah ada di %s" % (a, n, b))
    print("  → %s" % out_dir.resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
