# Cek lengkap migancore:0.14k vs migancore:0.13 — 2026-08-24

## Aritmetika 3 lengan (30 percobaan/lengan)
- dengan migancore_0.14k: 60/60
- dengan migancore_0.13: 60/60
- tanpa migancore_0.14k: 59/60
- tanpa migancore_0.13: 58/60
- latih migancore_0.14k: 56/60

## Nalar 42 (berpasangan)
# Berpasangan — migancore:0.14k vs migancore:0.13: 42 soal sama
  migancore:0.14k benar & migancore:0.13 salah (b): 8 · migancore:0.13 benar & migancore:0.14k salah (c): 3 · seri: 31
  McNemar eksak p = 0.2266 → belum terbukti · arah: migancore:0.14k lebih baik
  - jebakan-aritmetika: b 3 · c 2 · seri 5

## Halusinasi polos (berpasangan)
# Berpasangan — migancore:0.14k vs migancore:0.13: 24 soal sama
  migancore:0.14k benar & migancore:0.13 salah (b): 5 · migancore:0.13 benar & migancore:0.14k salah (c): 2 · seri: 17
  McNemar eksak p = 0.4531 → belum terbukti · arah: migancore:0.14k lebih baik
  - fakta: b 0 · c 0 · seri 6

## ULANG 5 putaran
- uji-alat migancore_0.14k: 79/90 TIDAK PASTI | panggil 21/30 · jangan 25/25 · alat_hilang 20/20 · arg_kurang 13/15
- uji-alat migancore_0.13: 67/90 TIDAK PASTI | panggil 13/30 · jangan 25/25 · alat_hilang 18/20 · arg_kurang 11/15
- uji-kias migancore_0.14k: 40/62 GAGAL | lugas 20/20 · majas_mati 12/13 · cabang 0/15 · kias 8/14
- uji-kias migancore_0.13: 41/69 GAGAL | lugas 17/20 · majas_mati 14/20 · cabang 0/15 · kias 10/14
- uji-kelemahan migancore_0.14k: 63/65 LULUS | berhenti-pr 8/10 · hilang-di-t 15/15 · menolong-be 20/20 · tercemar-pe 10/10 · terkunci-sa 5/5 · mengulang-p 5/5
- uji-kelemahan migancore_0.13: 64/65 LULUS | berhenti-pr 10/10 · hilang-di-t 15/15 · menolong-be 20/20 · tercemar-pe 9/10 · terkunci-sa 5/5 · mengulang-p 5/5
