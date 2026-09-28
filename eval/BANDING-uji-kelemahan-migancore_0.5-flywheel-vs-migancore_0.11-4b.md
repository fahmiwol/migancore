# Banding proporsi — uji-kelemahan.mjs

**A = `migancore:0.5-flywheel`**  vs  **B = `migancore:0.11-4b`**  ·  5 putaran masing-masing

Uji: Fisher exact dua-sisi + selang Newcombe 95% untuk selisih (B − A).
Vonis BEDA NYATA hanya bila p<0,05 **dan** selang selisih tidak memuat nol.

| Kategori | A | B | selisih | selang 95% selisih | Fisher p | Vonis |
|---|---|---|---|---|---|---|
| berhenti-prematur | 10/10 | 8/10 | -20% | -51% … +11% | 0.4737 | belum terbukti beda |
| hilang-di-tengah | 15/15 | 15/15 | +0% | -20% … +20% | 1.0000 | belum terbukti beda |
| menolong-berlebihan | 11/20 | 20/20 | +45% | +20% … +66% | 0.0012 | **B LEBIH BAIK** |
| tercemar-pengecoh | 10/10 | 9/10 | -10% | -40% … +19% | 1.0000 | belum terbukti beda |
| terkunci-satu-giliran | 5/5 | 5/5 | +0% | -43% … +43% | 1.0000 | belum terbukti beda |
| mengulang-prompt | 5/5 | 5/5 | +0% | -43% … +43% | 1.0000 | belum terbukti beda |
| **KESELURUHAN** | 56/65 | 62/65 | +9% | -1% … +20% | 0.1271 | belum terbukti beda |

**Ringkas:** 1 kategori naik nyata, 0 turun nyata, 5 belum terbukti berbeda.

## Belum terbukti beda — tapi BUKAN berarti sama

Kategori berikut menunjukkan selisih ≥5 poin yang tidak tertangkap uji.
Itu bisa berarti memang tidak ada beda, **atau** percobaannya terlalu sedikit.
Kolom terakhir: berapa percobaan per model yang dibutuhkan untuk menyelesaikan
pertanyaan ini pada kuasa 80%. Itu perintah kerja, bukan alasan untuk berhenti.

| Kategori | selisih | n sekarang | n dibutuhkan | putaran setara |
|---|---|---|---|---|
| berhenti-prematur | -20% | 10 | 35 | 18 |
| tercemar-pengecoh | -10% | 10 | 74 | 37 |

