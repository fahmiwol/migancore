#!/usr/bin/env bash
# cek-v13-penuh.sh — pemeriksaan v13 LENGKAP dengan instrumen HARI INI, plus
# pembanding (base 0.4-qwen3, v11 0.11-4b) diukur ulang dengan instrumen yang SAMA.
#
# Kenapa pembanding diukur ulang: uji-alat & uji-halusinasi berubah 21 Agu 16:15
# (satu soal tercemar diganti), uji-kias berubah 21-22 Agu; semua berkas pembanding
# lama lahir SEBELUM itu. Aturan jalankan-semua: instrumen berubah -> baseline diukur ulang.
#
# Urutan = satu Ollama satu pengukuran (kunci C15 dipegang tiap uji-*.mjs).
# Hasil ULANG-* diberi SUFIKS 23agu supaya berkas 21 Agu tidak tertimpa.
# jalankan-semua MENIMPA hasil-*-<model>.json; semuanya ada di git -> dipulihkan
# sesudahnya, salinan baru disimpan bertanggal (lihat bagian akhir).
#
# Pakai: bash eval/cek-v13-penuh.sh > eval/cek-v13-23agu.log 2>&1
set -u
cd "$(dirname "$0")/.." || exit 1
export SUFIKS=23agu
export PYTHONIOENCODING=utf-8
MODELS="migancore:0.13 migancore:0.4-qwen3 migancore:0.11-4b"
stamp() { date +%H:%M:%S; }

echo "== $(stamp) MULAI cek v13 penuh =="
node eval/periksa-alat.mjs >/dev/null 2>&1 || { echo "ALAT TIDAK SEHAT — berhenti"; exit 1; }

for m in $MODELS; do
  for g in uji-alat.mjs uji-kias.mjs uji-kelemahan.mjs; do
    echo "== $(stamp) ulang-gerbang $g $m (5 putaran) =="
    node eval/ulang-gerbang.mjs "$g" "$m" 5 2>&1 | tail -12
  done
done

# 7 gerbang sekali-jalan (aritmetika 3 ulangan, nalar 42, halusinasi polos)
mkdir -p eval/arsip-sebelum-23agu
for m in $MODELS; do
  n=$(echo "$m" | sed 's/[:\/]/_/g')
  for f in eval/hasil-*-"$n".json eval/hasil-*-"$n"-*.json; do
    [ -f "$f" ] && cp -n "$f" eval/arsip-sebelum-23agu/ 2>/dev/null
  done
  echo "== $(stamp) jalankan-semua $m =="
  node eval/jalankan-semua.mjs "$m" 2>&1 | tail -16
  # simpan hasil baru bertanggal, kembalikan berkas kanonik dari git (fakta sanad)
  for f in eval/hasil-aritmetika-"$n".json eval/hasil-uji-alat-"$n".json eval/hasil-uji-kias-"$n".json \
           eval/hasil-uji-kelemahan-"$n".json eval/hasil-uji-nalar-"$n".json eval/hasil-"$n"-polos.json \
           eval/hasil-gerbang-"$n".json; do
    [ -f "$f" ] && cp "$f" "${f%.json}.2026-08-23.json"
  done
  git checkout -- eval/hasil-aritmetika-"$n".json 2>/dev/null || true
done
echo "== $(stamp) SELESAI =="
