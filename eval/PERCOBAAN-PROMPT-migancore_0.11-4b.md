# Langkah 0 — percobaan satu kalimat prompt

Model **`migancore:0.11-4b`** · kias 5 putaran · aritmetika 3 ulangan × 2 suhu

**Kalimat yang diuji, persis:**

> Frasa majemuk yang maknanya sudah beku dalam bahasa Indonesia — misalnya "buah tangan" atau "kaki tangan" — hanya punya satu makna. Untuk frasa seperti itu jawab tunggal dan tegas; jangan menawarkan tafsir lain.

Kalimat ini sengaja tidak menyebut satu pun frasa yang dipakai di soal —
kalau disebut, yang terukur cuma kemampuan menyalin contoh dari prompt.

| Ukuran | tanpa kalimat | dengan kalimat | selisih | selang 95% | Fisher p | Vonis |
|---|---|---|---|---|---|---|
| kias · lugas | 18/20 | 14/20 | -20% | -43% … +5% | 0.2351 | belum terbukti beda |
| kias · majas_mati | 8/17 | 7/13 | +7% | -26% … +38% | 1.0000 | belum terbukti beda |
| kias · cabang | 2/15 | 7/15 | +33% | +0% … +58% | 0.1086 | belum terbukti beda |
| kias · kias | 9/16 | 8/16 | -6% | -36% … +26% | 1.0000 | belum terbukti beda |
| kias · KESELURUHAN | 37/68 | 36/64 | +2% | -15% … +18% | 0.8624 | belum terbukti beda |
| **ARITMETIKA (pemeriksa kebocoran)** | 27/36 | 22/36 | -14% | -34% … +7% | 0.3121 | belum terbukti beda |

## PUTUSAN: R2 — kemampuan benar-benar TERGERUS

Prompt tidak menolong, jadi ini kerusakan bobot. P2 harus jadi paket PEMULIHAN sungguhan: pasangan beku-vs-hidup dalam jumlah memadai di data latih.

| Aturan (ditulis SEBELUM mengukur) | Terpenuhi? |
|---|---|
| R1 majas_mati naik nyata | tidak |
| R3 ada yang turun nyata (kebocoran) | tidak |
| R4 aritmetika turun nyata | tidak |

Aritmetika per suhu — kendali: {"suhu-0":{"benar":12,"total":18,"persen":67},"suhu-0.3":{"benar":15,"total":18,"persen":83}} · uji: {"suhu-0":{"benar":9,"total":18,"persen":50},"suhu-0.3":{"benar":13,"total":18,"persen":72}}
