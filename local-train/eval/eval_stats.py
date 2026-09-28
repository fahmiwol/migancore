#!/usr/bin/env python3
"""eval_stats.py — statistik untuk gate eval. Stdlib-only (aturan harness).

Kenapa ada (E1, 2026-07-26): gate lama membandingkan DUA TITIK
(`skor_kandidat < skor_baseline - epsilon`) padahal tiap skor adalah proporsi dari
sedikit percobaan dan sampling model itu stokastik. Akibatnya dua hal sekaligus:

  - ALARM PALSU: model BYTE-IDENTIK bisa dinyatakan "regresi" hanya karena satu
    jawaban kebetulan berbalik. Terbukti terjadi — skor T0.7 berbeda antar-run pada
    model yang sama.
  - TULI: perbaikan nyata yang lebih kecil dari resolusi 1/N tidak akan pernah terlihat.

Perbaikannya: bandingkan INTERVAL, bukan titik. Dipakai selang kepercayaan **Wilson
score** — standar untuk proporsi biner dengan n kecil-menengah, dan jauh lebih baik
daripada aproksimasi normal yang runtuh di p mendekati 0 atau 1 (justru wilayah kerja
kita: pass-rate 0,8-1,0).

Rujukan: Wilson (1927), "Probable Inference, the Law of Succession, and Statistical
Inference", JASA 22(158):209-212. Formula yang dipakai di bawah adalah bentuk baku
yang sama seperti di statsmodels `proportion_confint(method="wilson")`.
"""

from __future__ import annotations

import math

# z untuk dua sisi; 1.96 = 95%
Z95 = 1.959963984540054


def wilson(k: int, n: int, z: float = Z95) -> tuple[float, float]:
    """Selang kepercayaan Wilson untuk proporsi k/n. Mengembalikan (lo, hi).

    n == 0 -> (0.0, 1.0): tidak tahu apa-apa, jangan pura-pura tahu.
    """
    if n <= 0:
        return (0.0, 1.0)
    p = k / n
    z2 = z * z
    denom = 1.0 + z2 / n
    center = (p + z2 / (2 * n)) / denom
    margin = (z / denom) * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))
    return (max(0.0, center - margin), min(1.0, center + margin))


def lebar_ci(k: int, n: int, z: float = Z95) -> float:
    lo, hi = wilson(k, n, z)
    return hi - lo


def regresi_signifikan(base_k: int, base_n: int, kand_k: int, kand_n: int,
                       z: float = Z95) -> bool:
    """True hanya bila kandidat BENAR-BENAR lebih buruk secara statistik.

    Kriteria: batas ATAS kandidat masih di bawah batas BAWAH baseline — artinya
    kedua selang tidak tumpang tindih. Konservatif dengan sengaja: lebih baik
    melewatkan regresi kecil daripada memblokir rilis karena kebisingan
    (alarm palsu menghancurkan kepercayaan pada gate, dan gate yang tidak
    dipercaya akan dilangkahi orang).
    """
    _, kand_hi = wilson(kand_k, kand_n, z)
    base_lo, _ = wilson(base_k, base_n, z)
    return kand_hi < base_lo


def perbaikan_signifikan(base_k: int, base_n: int, kand_k: int, kand_n: int,
                         z: float = Z95) -> bool:
    """Kebalikannya — dipakai untuk mengklaim "eksperimen ini berhasil" secara jujur.
    Tanpa ini, mudah sekali merayakan kenaikan yang sebenarnya kebisingan."""
    kand_lo, _ = wilson(kand_k, kand_n, z)
    _, base_hi = wilson(base_k, base_n, z)
    return kand_lo > base_hi


# ── Uji BERPASANGAN (McNemar) — jauh lebih sensitif, dan gratis ──────────────
# Temuan saat mengkalibrasi E1: dengan 30 probe, lebar CI Wilson masih 0,244 —
# untuk menekannya ke 0,05 butuh ~782 probe. Membandingkan dua proporsi INDEPENDEN
# memang boros, karena membuang informasi bahwa kedua model diuji pada PROMPT YANG
# SAMA.
#
# Uji berpasangan memakai informasi itu: yang dihitung hanya probe yang BERUBAH
# hasilnya (baseline benar→kandidat salah, dan sebaliknya). Probe yang sama-sama
# benar atau sama-sama salah tidak membawa informasi tentang perbedaan, jadi
# dibuang. Ini membuat 30 probe cukup untuk mendeteksi perubahan yang lewat sama
# sekali di uji tak-berpasangan.
#
# Rujukan: McNemar (1947), Psychometrika 12(2):153-157. Untuk n_discordant kecil
# dipakai uji binomial eksak (bukan aproksimasi chi-square, yang tidak sahih di
# jumlah kecil — persis rezim kita).

def _binom_dua_sisi(b: int, c: int) -> float:
    """p-value eksak dua sisi untuk McNemar: P(X<=min(b,c)) * 2 pada Binom(b+c, 0.5)."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    kum = sum(math.comb(n, i) for i in range(k + 1)) / (2 ** n)
    return min(1.0, 2 * kum)


def mcnemar(hasil_base: list[bool], hasil_kand: list[bool]) -> dict:
    """Bandingkan dua model pada probe yang SAMA, berurutan sama.

    b = baseline BENAR tapi kandidat SALAH  (memburuk)
    c = baseline SALAH tapi kandidat BENAR  (membaik)
    """
    if len(hasil_base) != len(hasil_kand):
        raise ValueError("panjang hasil harus sama — uji berpasangan butuh probe identik")
    b = sum(1 for x, y in zip(hasil_base, hasil_kand) if x and not y)
    c = sum(1 for x, y in zip(hasil_base, hasil_kand) if y and not x)
    p = _binom_dua_sisi(b, c)
    return {
        "n": len(hasil_base),
        "memburuk": b,
        "membaik": c,
        "p_value": p,
        "signifikan": p < 0.05,
        "arah": ("memburuk" if b > c else "membaik" if c > b else "seri"),
    }


def n_untuk_resolusi(target: float = 0.05, p: float = 0.85) -> int:
    """Berapa probe minimum agar LEBAR CI <= target pada pass-rate p.

    Menjawab pertanyaan praktis "cukup berapa probe?" dengan angka, bukan firasat.
    """
    for n in range(4, 5000):
        if lebar_ci(round(p * n), n) <= target:
            return n
    return 5000


def ringkas(nama: str, k: int, n: int) -> str:
    lo, hi = wilson(k, n)
    return "%-16s %d/%-3d = %.3f  CI95[%.3f, %.3f]  lebar %.3f" % (
        nama, k, n, (k / n if n else 0.0), lo, hi, hi - lo)


if __name__ == "__main__":
    print("=== Berapa probe yang sebenarnya dibutuhkan? ===")
    for target in (0.20, 0.10, 0.05):
        print("  lebar CI <= %.2f  ->  butuh %d probe (pada p=0.85)"
              % (target, n_untuk_resolusi(target)))

    print("\n=== Harness LAMA vs BARU (p=0.85) ===")
    for nama, n in (("irrelevance LAMA", 4), ("positive_tool LAMA", 2),
                    ("reasoning LAMA", 8), ("SEMUA AXIS BARU", 30)):
        print("  " + ringkas(nama, round(0.85 * n), n))

    print("\n=== Uji ALARM PALSU: model identik, 1 jawaban berbalik ===")
    for n in (4, 30):
        base_k, kand_k = round(0.85 * n), round(0.85 * n) - 1
        reg = regresi_signifikan(base_k, n, kand_k, n)
        print("  n=%-3d %d/%d -> %d/%d : regresi? %s" % (
            n, base_k, n, kand_k, n, "YA (ALARM PALSU)" if reg else "tidak (benar)"))

    print("\n=== Uji SENSITIVITAS: regresi nyata & besar ===")
    for n in (4, 30):
        reg = regresi_signifikan(round(0.95 * n), n, round(0.45 * n), n)
        print("  n=%-3d 0.95 -> 0.45 : terdeteksi? %s" % (n, "YA" if reg else "TIDAK (tuli)"))

    print("\n=== BERPASANGAN vs TAK-BERPASANGAN (n=30, perubahan kecil) ===")
    # skenario nyata: 26/30 -> 30/30. 4 probe membaik, tak ada yang memburuk.
    base = [True] * 26 + [False] * 4
    kand = [True] * 30
    tak_pas = perbaikan_signifikan(26, 30, 30, 30)
    pas = mcnemar(base, kand)
    print("  26/30 -> 30/30")
    print("    tak-berpasangan (Wilson) : %s" % ("terdeteksi" if tak_pas else "TIDAK terdeteksi"))
    print("    berpasangan (McNemar)    : %s  p=%.4f  (+%d membaik, -%d memburuk)"
          % ("terdeteksi" if pas["signifikan"] else "TIDAK terdeteksi",
             pas["p_value"], pas["membaik"], pas["memburuk"]))

    print("\n  kontrol — model identik (tak ada yang berubah):")
    sama = mcnemar([True] * 26 + [False] * 4, [True] * 26 + [False] * 4)
    print("    McNemar: %s p=%.3f  <- harus TIDAK signifikan"
          % ("SIGNIFIKAN (BURUK!)" if sama["signifikan"] else "tidak signifikan", sama["p_value"]))

    print("\n  kontrol — kebisingan murni (2 membaik, 2 memburuk):")
    bising = mcnemar([True] * 26 + [False] * 4, [True] * 24 + [False] * 2 + [True] * 4)
    print("    McNemar: %s p=%.3f  <- harus TIDAK signifikan"
          % ("SIGNIFIKAN (BURUK!)" if bising["signifikan"] else "tidak signifikan",
             bising["p_value"]))
