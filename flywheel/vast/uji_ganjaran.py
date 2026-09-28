#!/usr/bin/env python
"""uji_ganjaran.py — BUKTI bahwa ganjaran Python memberi angka yang sama persis
dengan ganjaran JS. Gerbang pra-GPU; kalau ini gagal, run TIDAK boleh jalan.

Hukum C24: dua penjaga beda bahasa atas hal yang sama selalu menyimpang. Berkas
ini bukan formalitas — ia satu-satunya alasan kami boleh percaya bahwa yang
DILATIH sama dengan yang DIUJI.

Fixture dihasilkan sisi JS (sumber kebenaran):
    node flywheel/ganjaran.mjs --fixture > flywheel/ganjaran-fixture.json
Berkas ini memutarnya ulang lewat flywheel/vast/ganjaran.py dan menuntut nol beda.

Pakai: python flywheel/vast/uji_ganjaran.py
       python flywheel/vast/uji_ganjaran.py --fixture <jalur>
"""
import io
import json
import subprocess
import sys
from pathlib import Path

DIR = Path(__file__).resolve().parent
FLY = DIR.parent
AKAR = FLY.parent
sys.path.insert(0, str(DIR))
import ganjaran as G  # noqa: E402

FIXTURE = Path(sys.argv[sys.argv.index("--fixture") + 1]) if "--fixture" in sys.argv \
    else FLY / "ganjaran-fixture.json"


def segarkan():
    """Bangun ulang fixture dari sisi JS. Fixture BASI sama bahayanya dengan tidak
    punya fixture: ia akan meluluskan port yang sudah menyimpang dari aturan baru."""
    r = subprocess.run(["node", str(FLY / "ganjaran.mjs"), "--fixture"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    if r.returncode != 0:
        print("GAGAL membangun fixture dari JS:\n" + (r.stderr or "").strip())
        sys.exit(2)
    io.open(FIXTURE, "w", encoding="utf-8").write(r.stdout)
    return json.loads(r.stdout)


if __name__ == "__main__":
    if not FIXTURE.exists() or "--segarkan" in sys.argv:
        data = segarkan()
        print(f"fixture disegarkan dari JS: {FIXTURE.relative_to(AKAR)}")
    else:
        data = json.loads(io.open(FIXTURE, encoding="utf-8").read())

    objektif = data["objektif"]
    if objektif != G.OBJEKTIF:
        print(f"GAGAL — daftar objektif beda:\n  JS     {objektif}\n  Python {G.OBJEKTIF}")
        sys.exit(1)

    sama, beda = 0, []
    for b in data["baris"]:
        py = G.ganjaran(b["soal"], b["jawab"])
        js = b["ganjaran"]
        selisih = {o: (js[o], py[o]) for o in objektif if js[o] != py[o]}
        if selisih:
            beda.append({"k": b["soal"]["k"], "jawab": b["jawab"][:52].replace("\n", " "), "selisih": selisih})
        else:
            sama += 1

    # Vonis (alasan) juga dibandingkan: dua sisi bisa sepakat LULUS lewat cabang
    # yang berbeda, dan itu bom waktu — ia akan berpisah pada masukan berikutnya.
    beda_alasan = []
    for b in data["baris"]:
        if "alasan" not in b:
            continue
        if G.nilai(b["soal"], b["jawab"])[1] != b["alasan"]:
            beda_alasan.append(b["jawab"][:40])

    print(f"\n# Kesepakatan ganjaran JS <-> Python")
    print(f"  {len(data['baris'])} baris fixture · {len(objektif)} objektif")
    print(f"  sepakat penuh: {sama}")
    if beda:
        print(f"\n  BEDA di {len(beda)} baris:")
        for d in beda[:12]:
            rinci = " · ".join(f"{o}: JS {a} vs PY {c}" for o, (a, c) in d["selisih"].items())
            print(f'    [{d["k"]}] "{d["jawab"]}"\n      {rinci}')
        print("\nGAGAL — port menyimpang. JANGAN jalankan GRPO: yang dilatih != yang diuji.\n")
        sys.exit(1)
    if beda_alasan:
        print(f"\n  ALASAN beda di {len(beda_alasan)} baris (nilai sama, cabang beda) — perbaiki juga.")
        sys.exit(1)
    print("\nSEPAKAT PENUH — ganjaran Python identik dengan JS. Aman dipakai melatih.\n")
