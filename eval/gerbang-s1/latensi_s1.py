#!/usr/bin/env python
"""latensi_s1.py — GERBANG-S1: diagnostik latensi keputusan encoder di CPU, SEBELUM kunci (riset referensi 27 Sep,
riset/2026-09-27-referensi-fahmi: angka 0,12 dtk kita dari masukan pendek; satu-satunya angka CPU independen untuk Laya
adalah p95 2,20 dtk). Memakai checkpoint DASAR laya-multilingual — arsitektur dan panjang masukan sama dengan hasil
fine-tune, jadi latensinya sama. Pasangan (soal, jawaban) SUNGGUHAN dari jawaban latih; tiap max_len diukur terpisah.

  python latensi_s1.py --masukan pasangan.jsonl --keluar latensi.json [--max-len 512,1024,2048] [--n 150] [--catatan "..."]
Keluaran: p50/p95/maks per max_len, per ember panjang token, jumlah terpotong, jumlah thread, dan catatan kondisi mesin
(mis. "BERSAMAAN dengan run jawab → batas ATAS"). DIAGNOSTIK: bukan pengukuran syarat (5) — itu diukur saat skor uji.
"""
import argparse
import inspect
import json
import os
import time

os.environ.setdefault("USE_TF", "0")
import torch  # noqa: E402
from transformers import AutoTokenizer  # noqa: E402

import laya  # noqa: E402

PERTANYAAN = {"karangan": {"type": "noul", "instructions": "Apakah jawaban memuat fakta yang dikarang atau salah?"}}


def persentil(a, p):
    s = sorted(a)
    if not s:
        return None
    i = (len(s) - 1) * p
    lo, hi = int(i), min(int(i) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (i - lo)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--masukan", required=True)
    ap.add_argument("--keluar", required=True)
    ap.add_argument("--max-len", default="512,1024,2048")
    ap.add_argument("--n", type=int, default=150)
    ap.add_argument("--catatan", default="")
    ap.add_argument("--int8", action="store_true", help="kuantisasi dinamis int8 atas lapisan Linear (opsi optimasi pra-kunci)")
    ap.add_argument("--threads", type=int, default=None)
    a = ap.parse_args()
    torch.set_num_threads(a.threads or os.cpu_count() or 4)
    # Cache LOKAL saja (tanpa jaringan): run pertama 28 Sep memakai laya.load() yang memeriksa ulang Hub — diperbaiki.
    from huggingface_hub import snapshot_download
    snap = snapshot_download("convaiinnovations/laya", allow_patterns=["multilingual/*"], local_files_only=True)
    d = os.path.join(snap, "multilingual")
    agen = laya.Agent(d, device="cpu")
    kuantisasi = "tidak"
    if a.int8:
        from kuantisasi_s1 import kuantisasi as _kuantisasi
        kuantisasi = _kuantisasi(agen)
    sig = inspect.signature(agen.predict)
    dukung_max_len = "max_len" in sig.parameters or any(p.kind == p.VAR_KEYWORD for p in sig.parameters.values())
    tok = AutoTokenizer.from_pretrained(os.path.join(d, "tokenizer"))
    baris = [json.loads(x) for x in open(a.masukan, encoding="utf-8") if x.strip()]
    langkah = max(1, len(baris) // a.n)
    baris = baris[::langkah][: a.n]
    for b in baris:
        b["_token"] = len(tok(b["soal"] + "\n" + b["jawaban"])["input_ids"])
    hasil = {"catatan": a.catatan, "kuantisasi": kuantisasi, "revisiDasar": os.path.basename(os.path.normpath(snap)), "threads": torch.get_num_threads(), "cpu": os.cpu_count(), "laya": getattr(laya, "__version__", "?"),
             "torch": torch.__version__, "tandaTanganPredict": str(sig), "maxLenDidukung": dukung_max_len, "n": len(baris),
             "tokenP50": persentil([b["_token"] for b in baris], 0.5), "tokenP95": persentil([b["_token"] for b in baris], 0.95), "perMaxLen": {}}
    for L in [int(x) for x in a.max_len.split(",")]:
        kw = {"max_len": L} if dukung_max_len else {}
        agen.predict({"soal": baris[0]["soal"], "jawaban": baris[0]["jawaban"]}, PERTANYAAN, **kw)  # pemanasan
        ms, ember = [], {}
        for b in baris:
            t0 = time.perf_counter()
            agen.predict({"soal": b["soal"], "jawaban": b["jawaban"]}, PERTANYAAN, **kw)
            m = (time.perf_counter() - t0) * 1000
            ms.append(m)
            e = "≤256" if b["_token"] <= 256 else "257–512" if b["_token"] <= 512 else "513–1024" if b["_token"] <= 1024 else ">1024"
            ember.setdefault(e, []).append(m)
        hasil["perMaxLen"][str(L)] = {"p50": persentil(ms, 0.5), "p95": persentil(ms, 0.95), "maks": max(ms),
                                      "terpotong": sum(1 for b in baris if b["_token"] > L),
                                      "perEmber": {k: {"n": len(v), "p50": persentil(v, 0.5), "p95": persentil(v, 0.95)} for k, v in ember.items()}}
        print(json.dumps({"max_len": L, **{k: (round(v, 1) if isinstance(v, float) else v) for k, v in hasil["perMaxLen"][str(L)].items() if k != "perEmber"}}), flush=True)
    json.dump(hasil, open(a.keluar, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
