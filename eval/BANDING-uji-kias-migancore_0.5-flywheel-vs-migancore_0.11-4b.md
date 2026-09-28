# Banding proporsi — uji-kias.mjs

**A = `migancore:0.5-flywheel`**  vs  **B = `migancore:0.11-4b`**  ·  5 putaran masing-masing

Uji: Fisher exact dua-sisi + selang Newcombe 95% untuk selisih (B − A).
Vonis BEDA NYATA hanya bila p<0,05 **dan** selang selisih tidak memuat nol.

| Kategori | A | B | selisih | selang 95% selisih | Fisher p | Vonis |
|---|---|---|---|---|---|---|
| lugas | 20/20 | 18/20 | -10% | -30% … +8% | 0.4872 | belum terbukti beda |
| majas_mati | 17/20 | 8/15 | -32% | -57% … -1% | 0.0619 | belum terbukti beda |
| cabang | 2/15 | 8/15 | +40% | +6% … +64% | 0.0502 | belum terbukti beda |
| kias | 6/17 | 9/18 | +15% | -17% … +42% | 0.4998 | belum terbukti beda |
| **KESELURUHAN** | 45/72 | 43/68 | +1% | -15% … +16% | 1.0000 | belum terbukti beda |

**Ringkas:** 0 kategori naik nyata, 0 turun nyata, 4 belum terbukti berbeda.

## Belum terbukti beda — tapi BUKAN berarti sama

Kategori berikut menunjukkan selisih ≥5 poin yang tidak tertangkap uji.
Itu bisa berarti memang tidak ada beda, **atau** percobaannya terlalu sedikit.
Kolom terakhir: berapa percobaan per model yang dibutuhkan untuk menyelesaikan
pertanyaan ini pada kuasa 80%. Itu perintah kerja, bukan alasan untuk berhenti.

| Kategori | selisih | n sekarang | n dibutuhkan | putaran setara |
|---|---|---|---|---|
| lugas | -10% | 20 | 74 | 19 |
| majas_mati | -32% | 20 | 33 | 9 |
| cabang | +40% | 15 | 21 | 7 |
| kias | +15% | 17 | 177 | 53 |

