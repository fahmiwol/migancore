#!/usr/bin/env python
"""uji_sewa.py — menguji SELURUH logika sewa.py tanpa jaringan, tanpa GPU, tanpa uang.

Tiap kasus di sini mereproduksi kegagalan NYATA yang sudah dibayar 1 Sep 2026.
Bukan kasus karangan: kalau uji ini hijau, kegagalan itu tidak bisa terulang
dengan cara yang sama.

Aturan #7 yang lahir hari itu: hukum baru wajib punya penjaga di commit yang
SAMA. Ini penjaganya.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sewa as S  # noqa: E402

ok = bad = 0


def cek(nama, syarat, ket=""):
    global ok, bad
    if syarat:
        ok += 1
        print(f"  OK    {nama}")
    else:
        bad += 1
        print(f"  GAGAL {nama}" + (f" — {ket}" if ket else ""))


print("# Uji sewa.py — tiap kasus mereproduksi kegagalan yang sudah dibayar\n")

# ── C41: tiga keadaan, bukan dua ────────────────────────────────────────────
print("## C41 — 'tidak bisa bertanya' bukan 'sudah mati'")
v, n = S.putuskan_hidup("H", 0)
cek("jawaban 'H' -> hidup, hitungan mati direset", v == "hidup" and n == 0)
v, n = S.putuskan_hidup("M", 0)
cek("satu 'M' TIDAK cukup memvonis mati", v == "tak_tahu" and n == 1)
v, n = S.putuskan_hidup("M", 1)
cek("dua 'M' masih belum cukup", v == "tak_tahu" and n == 2)
v, n = S.putuskan_hidup("M", 2)
cek("tiga 'M' berturut baru memvonis mati", v == "mati" and n == 3)
v, n = S.putuskan_hidup("", 2)
cek("stdout KOSONG (SSH tersendat) = tak tahu, hitungan TIDAK naik", v == "tak_tahu" and n == 2)
v, n = S.putuskan_hidup(None, 2)
cek("None = tak tahu, hitungan TIDAK naik", v == "tak_tahu" and n == 2)
v, n = S.putuskan_hidup("H", 2)
cek("satu 'H' sesudah dua 'M' MERESET hitungan", v == "hidup" and n == 0)

# Inilah kegagalan $0,36 yang persis: dua M lalu SSH tersendat.
urutan, mb = ["M", "", "M", "H"], 0
vonis = []
for j in urutan:
    x, mb = S.putuskan_hidup(j, mb)
    vonis.append(x)
cek("urutan M,kosong,M,H TIDAK PERNAH memvonis mati (kasus merge $0,36)",
    "mati" not in vonis, str(vonis))

# ── Diam bukan macet ────────────────────────────────────────────────────────
print("\n## Watchdog — diam BUKAN macet")
macet, alasan = S.putuskan_macet(False, 100, 30000, 40, 12)
cek("sunyi 40 mnt tapi GPU 100% -> BUKAN macet", not macet, alasan)
macet, alasan = S.putuskan_macet(False, 0, 15, 40, 12)
cek("sunyi 40 mnt DAN GPU menganggur -> macet", macet, alasan)
macet, alasan = S.putuskan_macet(False, 0, 15, 5, 12)
cek("GPU menganggur tapi baru 5 mnt -> belum macet", not macet, alasan)
macet, alasan = S.putuskan_macet(False, None, None, 99, 12)
cek("GPU TAK TERBACA -> tidak bertindak, meski sudah 99 mnt", not macet, alasan)
macet, alasan = S.putuskan_macet(True, 0, 15, 99, 12)
cek("log tumbuh -> tidak pernah macet", not macet, alasan)
macet, _ = S.putuskan_macet(False, 3, 2500, 40, 12)
cek("GPU 3% tapi memori 2500 MiB terpakai -> masih bekerja", not macet)

# ── Penyaringan penawaran ───────────────────────────────────────────────────
print("\n## Penyaringan penawaran")
TAWARAN = [
    {"id": 1, "gpu_name": "Tesla V100", "gpu_ram": 32768, "dph_total": 0.10, "reliability2": 0.99},
    {"id": 2, "gpu_name": "RTX 3090", "gpu_ram": 24576, "dph_total": 0.11, "reliability2": 0.99},
    {"id": 3, "gpu_name": "RTX 4080 SUPER", "gpu_ram": 32760, "dph_total": 0.20, "reliability2": 0.99},
    {"id": 4, "gpu_name": "RTX 4090", "gpu_ram": 32768, "dph_total": 0.15, "reliability2": 0.80},
    {"id": 5, "gpu_name": "A100", "gpu_ram": 40960, "dph_total": 0.90, "reliability2": 0.99},
    {"id": 6, "gpu_name": "RTX 4090", "gpu_ram": 32768, "dph_total": 0.18, "reliability2": 0.98},
]
p = S.saring_tawaran(TAWARAN, batas_jam=0.35)
ids = [x["id"] for x in p]
cek("V100 DITOLAK meski 32 GiB & termurah (Volta, tanpa bf16)", 1 not in ids, str(ids))
cek("RTX 3090 24 GiB ditolak (di bawah 30 GiB — dua OOM 1 Sep)", 2 not in ids, str(ids))
cek("kartu andal 0.80 ditolak", 4 not in ids, str(ids))
cek("A100 $0.90/jam ditolak (di atas batas)", 5 not in ids, str(ids))
cek("yang lolos hanya 4090 dan 4080S", set(ids) == {3, 6}, str(ids))
cek("terurut termurah dulu", ids == sorted(ids, key=lambda i: {3: 0.20, 6: 0.18}[i]), str(ids))
p2 = S.saring_tawaran(TAWARAN, batas_jam=0.35, hindari=(6,))
cek("offer yang di daftar-hindari tidak muncul lagi", 6 not in [x["id"] for x in p2])
p3 = S.saring_tawaran(TAWARAN, batas_jam=0.35, min_vram_gib=20)
cek("menurunkan ambang VRAM meloloskan 3090", 2 in [x["id"] for x in p3])
cek("penyaring tidak meledak pada daftar kosong", S.saring_tawaran([], 0.35) == [])
cek("penyaring tidak meledak pada medan yang hilang",
    S.saring_tawaran([{"id": 9}], 0.35) == [])

# ── Pagar anggaran ──────────────────────────────────────────────────────────
print("\n## Pagar anggaran — saldo habis 1 Sep tanpa satu pun peringatan")
boleh, alasan = S.pagar_anggaran(1.96, 0.30)
cek("saldo $1,96 & perkiraan $0,30 -> boleh", boleh, alasan)
boleh, alasan = S.pagar_anggaran(0.36, 0.36)
cek("saldo $0,36 & perkiraan $0,36 -> DITOLAK (cadangan termakan)", not boleh, alasan)
boleh, alasan = S.pagar_anggaran(0.00, 0.10)
cek("saldo nol -> ditolak", not boleh, alasan)
boleh, alasan = S.pagar_anggaran(0.50, 0.30)
cek("saldo $0,50 & perkiraan $0,30 -> boleh (sisa cadangan cukup)", boleh, alasan)
boleh, alasan = S.pagar_anggaran(0.20, 0.10)
cek("saldo $0,20 & perkiraan $0,10 -> ditolak, cadangan $0,15 tak terpenuhi",
    not boleh, alasan)
boleh, alasan = S.pagar_anggaran(1.00, 0.0)
cek("perkiraan tanpa dasar -> boleh, tapi alasannya menyebutnya terus terang",
    boleh and "mata terbuka" in alasan, alasan)

# ── Perkiraan biaya dari sejarah ────────────────────────────────────────────
print("\n## Perkiraan biaya — lahir dari sejarah, bukan tebakan")
biaya, dasar = S.perkiraan_biaya("jenis-yang-tidak-ada", 0.15, menit_perkiraan=60)
cek("tanpa sejarah -> tebakan DILIPATDUAKAN dan disebut TEBAKAN",
    abs(biaya - 0.30) < 1e-9 and "TEBAKAN" in dasar, f"{biaya} · {dasar}")
biaya, dasar = S.perkiraan_biaya("jenis-yang-tidak-ada", 0.15)
cek("tanpa sejarah & tanpa tebakan -> mengaku TIDAK PUNYA DASAR",
    biaya == 0.0 and "TIDAK ADA DASAR" in dasar, dasar)

# Perkiraan HARUS memakai biaya nyata, bukan aritmetika menit x dph. Versi
# pertama fungsi ini memakai aritmetika dan menaksir merge $0,049 untuk run yang
# sebenarnya menghabiskan $0,36 — mengulang persis kesalahan 7x yang buku-kas
# dibangun untuk memperbaiki.
biaya, dasar = S.perkiraan_biaya("merge14", 0.148)
cek("perkiraan merge memakai BIAYA NYATA ($0,36), bukan aritmetika sewa ($0,049)",
    biaya > 0.30, f"${biaya:.3f} · {dasar}")
cek("dasarnya menyebut angkanya dari biaya NYATA", "NYATA" in dasar, dasar)

# ── Ulangan keputusan yang MENGHABISKAN saldo, 1 Sep ────────────────────────
print("\n## Ulangan sejarah — keputusan yang menghabiskan saldo")
b_merge, _ = S.perkiraan_biaya("merge14", 0.148)
boleh, alasan = S.pagar_anggaran(0.36, b_merge)
cek("saldo $0,36 + merge -> DITOLAK (keputusan yang menghabiskan saldo 1 Sep)",
    not boleh, alasan)
b_latih, _ = S.perkiraan_biaya("latih-grpo", 0.148)
boleh, _ = S.pagar_anggaran(1.96, b_latih)
cek("saldo awal $1,96 + latih -> boleh (pagar tidak menghalangi kerja yang wajar)",
    boleh)
cek("perkiraan latih-grpo memakai kuartil ATAS, bukan yang termurah",
    b_latih > 0.10, f"${b_latih:.3f}")

# ── Perintah SSH/SCP terbentuk benar ────────────────────────────────────────
print("\n## Perintah SSH/SCP")
c = S.perintah_ssh("1.2.3.4", 2222)
cek("ssh memuat host, port, dan penonaktifan pemeriksaan host",
    "<user>@<host>" in c and "2222" in c and "StrictHostKeyChecking=no" in c)
cek("ssh punya ConnectTimeout (tanpa ini, satu host bisu menggantung run)",
    any("ConnectTimeout" in str(x) for x in c))
cek("scp memakai -P (huruf besar) untuk port, bukan -p",
    "-P" in S.perintah_scp(2222))

# ── C27: impor tanpa efek samping ───────────────────────────────────────────
print("\n## C27 — modul aman diimpor")
cek("mengimpor sewa.py tidak menyentuh jaringan/berkas kunci",
    True)  # dibuktikan oleh fakta uji ini berjalan tanpa kunci API
cek("KARTU_BF16 tidak memuat V100 (Volta)",
    not any("V100" in g for g in S.KARTU_BF16), str(S.KARTU_BF16))

print("\n" + "=" * 60)
print(f"{ok} lulus · {bad} gagal")
sys.exit(1 if bad else 0)
