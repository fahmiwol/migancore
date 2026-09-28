# Ulang gerbang — uji-kelemahan.mjs · migancore:0.5-flywheel

5 putaran · ambang 80% · selang kepercayaan Wilson 95%

| Kategori | Lulus/Coba | Proporsi | Selang 95% | Vonis |
|---|---|---|---|---|
| berhenti-prematur | 10/10 | 100% | 72–100% | TIDAK PASTI |
| hilang-di-tengah | 15/15 | 100% | 80–100% | TIDAK PASTI |
| menolong-berlebihan | 11/20 | 55% | 34–74% | GAGAL |
| tercemar-pengecoh | 10/10 | 100% | 72–100% | TIDAK PASTI |
| terkunci-satu-giliran | 5/5 | 100% | 57–100% | TIDAK PASTI |
| mengulang-prompt | 5/5 | 100% | 57–100% | TIDAK PASTI |

**KESELURUHAN: 56/65 = 86% · selang 76–93% · TIDAK PASTI**

## Soal GOYAH — hasilnya berubah antar putaran (2)

Soal-soal inilah yang membuat vonis sekali-jalan tidak bisa dipercaya.

- `C2-substitusi` — lulus 4/5 (menolong-berlebihan)
- `C4-baris-tabel` — lulus 2/5 (menolong-berlebihan)

