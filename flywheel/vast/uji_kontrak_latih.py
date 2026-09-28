#!/usr/bin/env python
"""uji_kontrak_latih.py — uji KONTRAK MASUKAN latih_cluster.py di laptop (tanpa torch).

Menyusun tata letak /workspace tiruan di direktori sementara, lalu menjalankan
latih_cluster.py dengan HANYA_KONTRAK=1 (berhenti sebelum pip/torch) dalam
KENDALI DUA ARAH (ARSITEKTUR.md aturan modul #4):
  + resep identik           -> LULUS (kode 0), sidik 7 masukan terisi
  - lr diubah tanpa izin    -> BERHENTI (kode 1)
  + lr diubah dengan izin   -> LULUS, beda tercatat
  - resep tanpa seed        -> BERHENTI
  - soal hilang             -> BERHENTI
  - data cacat bentuk       -> (ditangkap kontrak-latih.mjs sebelum GPU; di sini
                               cukup memastikan inventaris_data menandainya)

Ditulis sebagai berkas (bukan heredoc shell) karena 23 Agu heredoc menelan
backslash path Windows dan membuat kendali negatif diam-diam TIDAK berjalan —
persis temuan mahal #4 di briefing.

Pakai: python flywheel/vast/uji_kontrak_latih.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
AKAR = Path(__file__).resolve().parents[2]
SKRIP = AKAR / "flywheel" / "vast" / "latih_cluster.py"
lulus = gagal = 0


def cek(nama, ok, bukti=""):
    global lulus, gagal
    print(("LULUS " if ok else "GAGAL ") + nama + (f"   [{bukti}]" if bukti and not ok else ""))
    lulus += ok
    gagal += (not ok)


def jalan(w, env_ekstra=None):
    env = dict(os.environ, KERJA=str(w), CLUSTER="hitung", HANYA_KONTRAK="1", PYTHONIOENCODING="utf-8")
    env.update(env_ekstra or {})
    r = subprocess.run([sys.executable, str(SKRIP)], env=env, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=120)
    keluaran = (r.stdout or "") + (r.stderr or "")
    akhir = None
    for b in keluaran.strip().splitlines()[::-1]:
        if b.startswith("{"):
            try:
                akhir = json.loads(b)
                break
            except json.JSONDecodeError:
                pass
    return r.returncode, keluaran, akhir


def siapkan(w):
    salin = [
        (AKAR / "flywheel/dataset/v13/cluster-hitung.jsonl", "cluster.jsonl"),
        (AKAR / "eval/soal-aritmetika-bersih.json", "soal-aritmetika-bersih.json"),
        (AKAR / "flywheel/dataset/kenari.json", "kenari.json"),
        (AKAR / "flywheel/RESEP-V13.json", "resep.json"),
        (AKAR / "eval/prompt-gerbang.json", "prompt-gerbang.json"),
        (AKAR / "flywheel/dataset/migancore-tahan.jsonl", "tahan.jsonl"),
        (AKAR / "flywheel/vast/ukur_latih.py", "ukur_latih.py"),
    ]
    for src, nama in salin:
        shutil.copy(src, w / nama)


def ubah_resep(w, f):
    r = json.loads((w / "resep.json").read_text(encoding="utf-8"))
    f(r)
    (w / "resep.json").write_text(json.dumps(r), encoding="utf-8")


with tempfile.TemporaryDirectory() as tmp:
    w = Path(tmp)
    siapkan(w)

    kode, _, akhir = jalan(w)
    cek("resep identik -> LULUS kode 0", kode == 0 and akhir and akhir.get("kontrakMasukan") == "LULUS")
    cek("7 sidik masukan terisi (5 wajib + prompt + tahan)",
        bool(akhir) and all(akhir["sidik"].get(k) for k in ("data", "soal", "kenari", "resep", "skrip", "promptGerbang", "tahan")))
    cek("sidik data = sidik cluster-hitung sekarang",
        bool(akhir) and akhir["sidik"]["data"] == __import__("hashlib").sha256((AKAR / "flywheel/dataset/v13/cluster-hitung.jsonl").read_bytes()).hexdigest()[:16])
    cek("prompt gerbang dari berkas", bool(akhir) and akhir.get("promptGerbang") == "berkas")

    asli = (w / "resep.json").read_text(encoding="utf-8")

    def set_lr(r): r["latih"]["lr"] = 1e-4
    ubah_resep(w, set_lr)
    kode, keluaran, akhir = jalan(w)
    cek("lr diubah TANPA izin -> BERHENTI kode 1", kode == 1 and "RESEP BERBEDA" in keluaran, keluaran[-200:])
    kode, _, akhir = jalan(w, {"RESEP_IZIN_BEDA": "1"})
    cek("lr diubah DENGAN izin -> LULUS + beda tercatat",
        kode == 0 and akhir and akhir.get("izinBeda") is True and any("latih.lr" in b for b in akhir.get("beda", [])))
    (w / "resep.json").write_text(asli, encoding="utf-8")

    def hapus_seed(r): del r["latih"]["seed"]
    ubah_resep(w, hapus_seed)
    kode, keluaran, _ = jalan(w)
    cek("resep tanpa seed -> BERHENTI", kode == 1 and "RESEP CACAT" in keluaran, keluaran[-200:])
    (w / "resep.json").write_text(asli, encoding="utf-8")

    (w / "soal-aritmetika-bersih.json").rename(w / "x.json")
    kode, keluaran, _ = jalan(w)
    cek("soal hilang -> BERHENTI", kode == 1 and "MASUKAN HILANG" in keluaran, keluaran[-200:])
    (w / "x.json").rename(w / "soal-aritmetika-bersih.json")

    (w / "prompt-gerbang.json").unlink()
    kode, _, akhir = jalan(w)
    cek("tanpa prompt-gerbang.json -> jalan dengan literal cadangan (tercatat)",
        kode == 0 and akhir and akhir.get("promptGerbang") == "literal-cadangan" and akhir["sidik"]["promptGerbang"] is None)

    # data cacat bentuk: dijaga inventaris_data (kontrak-latih.mjs memanggil logika setara sebelum GPU)
    sys.path.insert(0, str(AKAR / "flywheel/vast"))
    import ukur_latih as U
    inv = U.inventaris_data(U.baca_jsonl(AKAR / "flywheel/dataset/v13/cluster-hitung.jsonl"))
    cek("cluster-hitung NYATA lolos inventaris bentuk (0 masalah)", inv["masalah"] == [], str(inv["masalah"][:3]))
    cacat = [{"id": "x", "conversations": [{"from": "gpt", "value": "j"}, {"from": "human", "value": "q"}]}]
    cek("baris gpt-dulu DITANDAI", U.inventaris_data(cacat)["masalah"] != [])

print(f"\n{lulus}/{lulus + gagal} lulus")
sys.exit(1 if gagal else 0)
