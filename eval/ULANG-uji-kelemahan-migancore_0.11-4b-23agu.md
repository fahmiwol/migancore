# Ulang gerbang — uji-kelemahan.mjs · migancore:0.11-4b

5 putaran · ambang 80% · selang kepercayaan Wilson 95%

| Kategori | Lulus/Coba | Proporsi | Selang 95% | Vonis |
|---|---|---|---|---|
| berhenti-prematur | 7/10 | 70% | 40–89% | TIDAK PASTI |
| hilang-di-tengah | 15/15 | 100% | 80–100% | TIDAK PASTI |
| menolong-berlebihan | 20/20 | 100% | 84–100% | LULUS |
| tercemar-pengecoh | 9/10 | 90% | 60–98% | TIDAK PASTI |
| terkunci-satu-giliran | 4/5 | 80% | 38–96% | TIDAK PASTI |
| mengulang-prompt | 5/5 | 100% | 57–100% | TIDAK PASTI |

**KESELURUHAN: 60/65 = 92% · selang 83–97% · LULUS**

## Soal GOYAH — hasilnya berubah antar putaran (3)

Soal-soal inilah yang membuat vonis sekali-jalan tidak bisa dipercaya.

- `A2-prematur` — lulus 2/5 (berhenti-prematur)
- `D2-pengecoh` — lulus 4/5 (tercemar-pengecoh)
- `E1-dua-langkah` — lulus 4/5 (terkunci-satu-giliran)

