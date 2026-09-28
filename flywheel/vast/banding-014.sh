#!/usr/bin/env bash
# Ukur migancore:0.14 (yang BERLAKU) di instrumen tier-2 yang SAMA dengan kandidat.
# Alasan: ambang pra-daftar itu ABSOLUT, jadi kandidat sudah lulus tanpa angka ini.
# Angka ini dibutuhkan untuk pertanyaan yang BERBEDA: promosi menukar model yang
# dilayankan, jadi kita harus tahu kandidat lebih baik, sama, atau lebih buruk --
# bukan cuma "di atas ambang". Lokal, nol biaya GPU.
set -u
cd /c/migancore
M=migancore:0.14
echo "##### PEMBANDING $M — $(date '+%Y-%m-%d %H:%M') #####"
echo "--- aritmetika (3 ulangan, instrumen sama)"
node eval/uji-aritmetika.mjs "$M" 3 2>&1 | tail -4
echo "--- batas peran"
node eval/uji-tolak.mjs "$M" 2>&1 | tail -3
echo "--- kenari"
node eval/baca-kenari.mjs "$M" 2>&1 | tail -3
echo "##### PEMBANDING SELESAI #####"
