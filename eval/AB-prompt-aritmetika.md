# Percobaan A/B — prompt-aritmetika

**Apakah system prompt gerbang sendiri yang merusak konversi satuan?**

## Pra-daftar
- hipotesis: v11 gagal 12/12 pada ton-harga DENGAN system prompt gerbang, tapi benar TANPA-nya. Kalau benar, sebagian "kerusakan konversi" dipicu prompt gerbang, bukan data latih.
- ambang: selisih ton-harga antara dua lengan harus BEDA NYATA (Fisher p<0,05) untuk mendukung hipotesis
- kalau gagal: Kalau tidak beda nyata, prompt BUKAN sebabnya; kembali ke penjelasan data latih dan jangan mengubah prompt gerbang — mengubahnya berarti mengganti alat ukur tanpa alasan.

## Rancangan
- 240 percobaan · selang-seling · soal blok sama

## migancore:0.11-4b

| Jenis | dengan | tanpa | selisih | selang 95% | Fisher p | Vonis |
|---|---|---|---|---|---|---|
| ton-harga | 0/12 | 12/12 | +100% | +66% … +100% | <0,0001 | **tanpa LEBIH BAIK** |
| diskon-berantai | 12/12 | 12/12 | +0% | -24% … +24% | 1.0000 | belum terbukti beda |
| rata-berbobot | 12/12 | 12/12 | +0% | -24% … +24% | 1.0000 | belum terbukti beda |
| dp-persen | 12/12 | 12/12 | +0% | -24% … +24% | 1.0000 | belum terbukti beda |
| selisih-kali | 11/12 | 6/12 | -42% | -67% … -5% | 0.0686 | belum terbukti beda |
| | | | | _butuh 18/lengan untuk memutus_ | | |
| **SEMUA** | 47/60 | 54/60 | +12% | -2% … +25% | 0.1321 | belum terbukti beda |
| | | | | _butuh 153/lengan untuk memutus_ | | |

## migancore:0.4-qwen3

| Jenis | dengan | tanpa | selisih | selang 95% | Fisher p | Vonis |
|---|---|---|---|---|---|---|
| ton-harga | 11/12 | 11/12 | +0% | -28% … +28% | 1.0000 | belum terbukti beda |
| diskon-berantai | 12/12 | 12/12 | +0% | -24% … +24% | 1.0000 | belum terbukti beda |
| rata-berbobot | 12/12 | 11/12 | -8% | -35% … +17% | 1.0000 | belum terbukti beda |
| dp-persen | 12/12 | 12/12 | +0% | -24% … +24% | 1.0000 | belum terbukti beda |
| selisih-kali | 11/12 | 9/12 | -17% | -46% … +15% | 0.5901 | belum terbukti beda |
| | | | | _butuh 78/lengan untuk memutus_ | | |
| **SEMUA** | 58/60 | 55/60 | -5% | -15% … +4% | 0.4390 | belum terbukti beda |

## PUTUSAN

HIPOTESIS DIDUKUNG di setidaknya satu jenis — periksa jenis mana, dan apakah polanya sama di kedua model.

