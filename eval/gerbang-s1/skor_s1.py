#!/usr/bin/env python
"""skor_s1.py — GERBANG-S1: nilai jawaban dengan encoder BEKU lewat jalur serving (laya.Agent.predict), satu per satu,
dan catat latensi per keputusan (syarat (5) pra-daftar: p95 <= 0,5 dtk dan <= p50 probe G / 20).

Masukan JSONL: satu baris per jawaban {kunci..., "soal": q, "jawaban": teks}. Kunci lain (id, sampel, lengan, putaran)
disalin apa adanya. Keluaran JSONL: kunci yang sama + p_blokir + ms. Panggilan pertama = pemanasan (ditandai, tidak
dihitung di persentil oleh vonis-s1). Encoder yang dipakai dibuktikan lewat sha256 bobotnya di baris kepala.

  python skor_s1.py --model model-S --mode S --masukan jawaban.jsonl --keluar skor.jsonl
"""
import argparse
import hashlib
import json
import os
import time

os.environ.setdefault("USE_TF", "0")
import torch  # noqa: E402

import laya  # noqa: E402

DI_SINI = os.path.dirname(os.path.abspath(__file__))
INSTRUKSI = "Apakah jawaban memuat fakta yang dikarang atau salah?"
PERTANYAAN = {"karangan": {"type": "noul", "instructions": INSTRUKSI}}


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for blok in iter(lambda: f.read(1 << 20), b""):
            h.update(blok)
    return h.hexdigest()


def sha_teks(p):
    """SAMA dengan inti-s1.mjs shaTeks: sha256 isi dengan CRLF dinormalkan ke LF (repo core.autocrlf=true)."""
    with open(p, "rb") as f:
        return hashlib.sha256(f.read().replace(bytes([13, 10]), bytes([10]))).hexdigest()


def sha_folder(d):
    """SAMA dengan inti-s1.mjs shaFolder: sha256 atas gabungan baris 'jalur-posix TAB sha256 NEWLINE', urut jalur."""
    tab, nl = chr(9), chr(10)
    baris = []
    for akar, _, berkas in os.walk(d):
        for b in berkas:
            f = os.path.join(akar, b)
            baris.append((os.path.relpath(f, d).replace(os.sep, "/"), sha(f)))
    baris.sort(key=lambda x: x[0])
    return hashlib.sha256("".join(r + tab + h + nl for r, h in baris).encode()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--mode", choices=["S", "Sq"], required=True)
    ap.add_argument("--masukan", required=True)
    ap.add_argument("--keluar", required=True)
    ap.add_argument("--int8", action="store_true")
    ap.add_argument("--max-len", type=int, required=True)
    a = ap.parse_args()
    if os.path.exists(a.keluar):
        raise SystemExit(f"BERHENTI: {a.keluar} sudah ada — tidak ditimpa")
    torch.set_num_threads(os.cpu_count() or 4)
    # Tinjauan putaran 2: sidik folder diambil SEBELUM laya memuat model (pemuat bisa menulis config tokenizer), lalu
    # sesudahnya; yang dibandingkan dengan manifes beku adalah yang SEBELUM. Beda keduanya dicatat, bukan disembunyikan.
    folder_sebelum = sha_folder(a.model)
    agen = laya.Agent(a.model, device="cpu")
    folder_sesudah = sha_folder(a.model)
    kuant = "tidak"
    if a.int8:
        from kuantisasi_s1 import kuantisasi
        kuant = kuantisasi(agen)
    kepala = {"_kepala": True, "model": os.path.abspath(a.model), "mode": a.mode, "sha256Bobot": sha(os.path.join(a.model, "model.safetensors")), "sha256Folder": folder_sebelum, "sha256FolderSesudahMuat": folder_sesudah,
              "sha256Kode": {f"eval/gerbang-s1/{n}": sha_teks(os.path.join(DI_SINI, n)) for n in ("skor_s1.py", "kuantisasi_s1.py")},
              "kuantisasi": kuant, "maxLen": a.max_len, "laya": getattr(laya, "__version__", "?"), "torch": torch.__version__, "threads": torch.get_num_threads(), "t": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    baris = [json.loads(x) for x in open(a.masukan, encoding="utf-8") if x.strip()]
    with open(a.keluar, "w", encoding="utf-8") as f:
        f.write(json.dumps(kepala) + "\n")
        for i, b in enumerate(baris):
            state = {"soal": b["soal"], "jawaban": b["jawaban"]} if a.mode == "S" else {"soal": b["soal"]}
            t0 = time.perf_counter()
            hasil = agen.predict(state, PERTANYAAN, max_len=a.max_len)
            ms = (time.perf_counter() - t0) * 1000
            keluar = {k: v for k, v in b.items() if k not in ("soal", "jawaban")}
            keluar.update({"p_blokir": float(hasil["answers"]["karangan"]["noul"]), "ms": round(ms, 2), "pemanasan": i == 0})
            f.write(json.dumps(keluar, ensure_ascii=False) + "\n")
    print(f"{len(baris)} jawaban dinilai · sha bobot {kepala['sha256Bobot'][:16]} · {a.keluar}")


if __name__ == "__main__":
    main()
