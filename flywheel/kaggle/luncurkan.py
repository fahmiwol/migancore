#!/usr/bin/env python
"""
luncurkan.py — satu perintah dari GERBANG sampai BOBOT.

Menyatukan lima langkah yang selama ini dikerjakan tangan dan karena itu
sesekali dilompati:

  1. GERBANG   jalankan flywheel/siap-latih.mjs; kalau merah, berhenti di sini
  2. SEGEL     catat sidik jari data yang PERSIS diunggah
  3. UNGGAH    versi dataset baru ke Kaggle
  4. DORONG    kernel + jalankan
  5. PANTAU    tunggu sampai selesai, unduh keluaran

Langkah 1 bukan hiasan. v11 dilatih di atas data yang memuat soal ujiannya
sendiri karena gerbangnya memang ada tapi dijalankan terpisah — dan yang
terpisah suatu saat pasti terlewat. Di sini ia menyatu: GPU tidak bisa menyala
tanpa melewatinya.

Langkah 2 juga bukan hiasan. Sidik jari dicatat SESUDAH gerbang dan SEBELUM
unggah, lalu dibandingkan dengan yang tertulis di PRA-DAFTAR.json. Kalau
berbeda, artinya data berubah sesudah kesimpulan dikunci — dan hasil apa pun
sesudah itu tidak bisa ditafsirkan.

Kredensial: berkas ini TIDAK PERNAH menyentuh token. Ia memakai kredensial yang
sudah terpasang di ~/.kaggle/ oleh pemiliknya sendiri, dan berhenti dengan
pesan yang jelas kalau belum ada.

Pakai:  python luncurkan.py            (gerbang -> unggah -> latih -> pantau)
        python luncurkan.py --periksa  (hanya gerbang + kesiapan, tidak mengunggah)
"""
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

DIR = Path(__file__).resolve().parent
FLYWHEEL = DIR.parent
DATA = FLYWHEEL / "dataset" / "migancore-curated.jsonl"
UNGGAH = DIR / "dataset-upload" / "migancore-curated.jsonl"
PRA = FLYWHEEL / "PRA-DAFTAR.json"
KERNEL = DIR / "kernel"
HANYA_PERIKSA = "--periksa" in sys.argv

H, M, K, R = "\033[32m", "\033[31m", "\033[33m", "\033[0m"


def mati(pesan, saran=""):
    print(f"\n{M}BERHENTI{R} — {pesan}")
    if saran:
        print(f"  {saran}")
    sys.exit(1)


def sidik(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


print("# Luncurkan latihan — gerbang dahulu, GPU belakangan\n")

# ── 1. GERBANG ───────────────────────────────────────────────────────────────
print("## 1. Gerbang pra-GPU")
hasil = subprocess.run(["node", str(FLYWHEEL / "siap-latih.mjs")],
                       capture_output=True, text=True, cwd=str(FLYWHEEL))
baris_vonis = [b for b in hasil.stdout.splitlines() if "VONIS:" in b]
print(f"   {baris_vonis[-1].strip() if baris_vonis else '(vonis tak terbaca)'}")
if hasil.returncode != 0:
    for b in hasil.stdout.splitlines():
        if "Yang menahan" in b or b.strip().startswith("["):
            print(f"   {b.strip()}")
    mati("pipa pra-GPU belum hijau.",
         "Perbaiki yang menahan, lalu ulangi. GPU tidak dinyalakan di atas data yang belum lolos.")
print(f"   {H}LULUS{R}")

# ── 2. SEGEL ─────────────────────────────────────────────────────────────────
print("\n## 2. Segel data")
if not DATA.exists():
    mati(f"dataset tidak ada: {DATA}")
s = sidik(DATA)
baris = sum(1 for x in DATA.read_text(encoding="utf-8").splitlines() if x.strip())
print(f"   {baris} baris · sidik {s}")

if not PRA.exists():
    mati("PRA-DAFTAR.json tidak ada.",
         "Kesimpulan harus dikunci sebelum diukur; tanpa itu hasil apa pun bisa dibaca sebagai keberhasilan.")
pra = json.loads(PRA.read_text(encoding="utf-8"))
if pra.get("sidikData") != s:
    mati(f"pra-daftar KEDALUWARSA — dikunci untuk {pra.get('sidikData')}, data sekarang {s}.",
         "Data berubah sesudah kesimpulan dikunci. Segarkan pra-daftar, atau kembalikan datanya.")
print(f"   {H}pra-daftar cocok{R} — \"{pra.get('perubahanTunggal','')[:88]}…\"")
print(f"   memutus lewat: {pra.get('ukuranPemutus','?')}")
print(f"   ambang       : {pra.get('ambang','?')}")

UNGGAH.parent.mkdir(parents=True, exist_ok=True)
UNGGAH.write_bytes(DATA.read_bytes())
print(f"   disalin ke dataset-upload/ ({sidik(UNGGAH)})")

if HANYA_PERIKSA:
    print(f"\n{H}SIAP{R} — semua pemeriksaan lolos. Jalankan tanpa --periksa untuk mengunggah & melatih.")
    sys.exit(0)

# ── 3. KREDENSIAL (tidak pernah disentuh berkas ini) ─────────────────────────
print("\n## 3. Kredensial Kaggle")
punya = (Path.home() / ".kaggle" / "kaggle.json").exists() or \
        (Path.home() / ".kaggle" / "access_token").exists() or \
        os.environ.get("KAGGLE_API_TOKEN") or os.environ.get("KAGGLE_KEY")
if not punya:
    mati("kredensial Kaggle tidak ditemukan.",
         "Pasang sendiri (jangan lewat chat): Kaggle > Settings > API > Create New Token,\n"
         "  lalu simpan ke ~/.kaggle/. Berkas ini sengaja tidak pernah menulis token.")
try:
    from kaggle.api.kaggle_api_extended import KaggleApi
    api = KaggleApi()
    api.authenticate()
except Exception as e:
    mati(f"autentikasi gagal: {type(e).__name__}: {e}",
         "Token mungkin kedaluwarsa atau sudah dicabut. Buat yang baru lalu ulangi.")
print(f"   {H}terautentikasi{R}")

# ── 4. UNGGAH & DORONG ───────────────────────────────────────────────────────
print("\n## 4. Unggah dataset")
catatan = f"{pra.get('model','?')} · {baris} baris · sidik {s} · {pra.get('perubahanTunggal','')[:120]}"
try:
    api.dataset_create_version(str(UNGGAH.parent), version_notes=catatan, dir_mode="skip")
except Exception as e:
    mati(f"unggah gagal: {type(e).__name__}: {e}",
         "Kalau 401: tokennya ditolak — buat token baru. Kalau 403: periksa kepemilikan dataset.")
print(f"   {H}terunggah{R}")

print("\n## 5. Dorong kernel")
try:
    api.kernels_push(str(KERNEL))
except Exception as e:
    mati(f"dorong kernel gagal: {type(e).__name__}: {e}")
meta = json.loads((KERNEL / "kernel-metadata.json").read_text(encoding="utf-8"))
slug = meta["id"]
print(f"   {H}terdorong{R} — {slug}")

# ── 6. PANTAU ────────────────────────────────────────────────────────────────
print("\n## 6. Pantau")
mulai = time.time()
lalu = None
while True:
    try:
        st = api.kernels_status(slug)
        keadaan = str(st.get("status", st))
    except Exception as e:
        keadaan = f"(status tak terbaca: {type(e).__name__})"
    if keadaan != lalu:
        print(f"   [{int(time.time()-mulai)//60:>3} mnt] {keadaan}")
        lalu = keadaan
    if any(k in keadaan.lower() for k in ("complete", "error", "cancel")):
        break
    time.sleep(60)

menit = int(time.time() - mulai) // 60
if "complete" in keadaan.lower():
    keluar = DIR / f"keluaran-{pra.get('model','v').replace(':','_')}"
    keluar.mkdir(exist_ok=True)
    try:
        api.kernels_output(slug, path=str(keluar))
        print(f"\n{H}SELESAI{R} dalam {menit} menit · keluaran di {keluar.name}/")
    except Exception as e:
        print(f"\n{K}Selesai tapi unduhan gagal{R}: {e}")
    print("\n  Langkah berikutnya — ukur dengan gerbang yang SAMA seperti yang diperiksa tadi:")
    print("    node eval/ulang-gerbang.mjs uji-alat.mjs <model> 5 0.8")
    print("    node eval/banding-jenis.mjs <pembanding> <model>      <- PER JENIS, bukan agregat")
    print("    (lalu baca kenari dan bandingkan petak tahan)")
else:
    print(f"\n{M}GAGAL{R} sesudah {menit} menit — keadaan: {keadaan}")
    sys.exit(1)
