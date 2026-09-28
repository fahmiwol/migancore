# Ulang gerbang — uji-kelemahan.mjs · migancore:0.11-4b

5 putaran · ambang 80% · selang kepercayaan Wilson 95%

| Kategori | Lulus/Coba | Proporsi | Selang 95% | Vonis |
|---|---|---|---|---|
| berhenti-prematur | 8/10 | 80% | 49–94% | TIDAK PASTI |
| hilang-di-tengah | 15/15 | 100% | 80–100% | TIDAK PASTI |
| menolong-berlebihan | 20/20 | 100% | 84–100% | LULUS |
| tercemar-pengecoh | 9/10 | 90% | 60–98% | TIDAK PASTI |
| terkunci-satu-giliran | 5/5 | 100% | 57–100% | TIDAK PASTI |
| mengulang-prompt | 5/5 | 100% | 57–100% | TIDAK PASTI |

**KESELURUHAN: 62/65 = 95% · selang 87–98% · LULUS**

## Soal GOYAH — hasilnya berubah antar putaran (2)

Soal-soal inilah yang membuat vonis sekali-jalan tidak bisa dipercaya.

- `A2-prematur` — lulus 3/5 (berhenti-prematur)
- `D2-pengecoh` — lulus 4/5 (tercemar-pengecoh)

