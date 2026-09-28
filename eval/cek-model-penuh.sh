#!/usr/bin/env bash
# cek-model-penuh.sh — TIER-2 LENGKAP untuk SATU model di Ollama, sebanding dengan
# berkas 23 Agu (v13/base/v11): jalankan-semua (7 gerbang: aritmetika 3 ulangan DENGAN
# prompt gerbang, alat, kias, kelemahan, nalar 42, halusinasi polos) + lengan
# aritmetika TANPA prompt & prompt LATIH (C20) + ulang-gerbang 5 putaran
# (alat/kias/kelemahan). Lalu uji berpasangan vs pembanding.
#
# Pakai: bash eval/cek-model-penuh.sh migancore:0.14k [pembanding=migancore:0.13]
# Keluaran: eval/hasil-*-<model>.json (+ hasil-arit-<model>-{dengan,tanpa,latih}.json),
#           eval/ULANG-*-<model>-23agu.json, eval/CEK-<model>.md
set -u
cd "$(dirname "$0")/.." || exit 1
MODEL="${1:?pakai: cek-model-penuh.sh <model> [pembanding]}"
BANDING="${2:-migancore:0.13}"
N=$(echo "$MODEL" | sed 's/[:\/]/_/g'); NB=$(echo "$BANDING" | sed 's/[:\/]/_/g')
export SUFIKS=23agu PYTHONIOENCODING=utf-8
LATIH='Kamu MiganCore, agent AI milik Fahmi Ghani. Kerjakan bertahap dan tunjukkan langkahnya. Periksa hasilmu sendiri sebelum menjawab. Kalau kamu tidak yakin, katakan tidak yakin — jangan menyodorkan angka atau kesimpulan yang belum kamu cek.'
stamp() { date +%H:%M:%S; }

echo "== $(stamp) MULAI cek $MODEL (pembanding $BANDING) =="
node eval/periksa-alat.mjs >/dev/null 2>&1 || { echo "ALAT TIDAK SEHAT"; exit 1; }
curl -s http://127.0.0.1:11434/api/tags | grep -q "\"$MODEL\"" || { echo "model $MODEL tidak ada di Ollama"; exit 1; }

echo "== $(stamp) jalankan-semua (7 gerbang) =="
node eval/jalankan-semua.mjs "$MODEL" 2>&1 | tail -14
[ -f "hasil-$N-polos.json" ] && mv "hasil-$N-polos.json" "eval/hasil-$N-polos.2026-08-23.json"
cp "eval/hasil-aritmetika-$N.json" "eval/hasil-arit-$N-dengan.json" 2>/dev/null

echo "== $(stamp) aritmetika lengan TANPA (3 ulangan) =="
SISTEM_GANTI=kosong node eval/uji-aritmetika.mjs "$MODEL" 3 2>&1 | tail -3
cp "eval/hasil-aritmetika-$N.json" "eval/hasil-arit-$N-tanpa.json"
echo "== $(stamp) aritmetika lengan LATIH (prompt dominan data, 3 ulangan) =="
SISTEM_GANTI="$LATIH" node eval/uji-aritmetika.mjs "$MODEL" 3 2>&1 | tail -3
cp "eval/hasil-aritmetika-$N.json" "eval/hasil-arit-$N-latih.json"
cp "eval/hasil-arit-$N-dengan.json" "eval/hasil-aritmetika-$N.json"   # kanonik = lengan dengan

echo "== $(stamp) uji-tolak + baca-kenari =="
node eval/uji-tolak.mjs "$MODEL" 2>&1 | tail -2
node eval/baca-kenari.mjs "$MODEL" 2>&1 | tail -2

for g in uji-alat.mjs uji-kias.mjs uji-kelemahan.mjs; do
  echo "== $(stamp) ulang-gerbang $g (5 putaran) =="
  node eval/ulang-gerbang.mjs "$g" "$MODEL" 5 2>&1 | tail -6
done

echo "== $(stamp) BERPASANGAN vs $BANDING =="
{
  echo "# Cek lengkap $MODEL vs $BANDING — $(date +%F)"
  echo; echo "## Aritmetika 3 lengan (30 percobaan/lengan)"
  for L in dengan tanpa latih; do
    for m in "$N" "$NB"; do f="eval/hasil-arit-$m-$L.json"; [ -f "$f" ] && node -e "const j=require('./$f');const k=j.rinci.filter(r=>r.ok).length;console.log('- $L $m: '+k+'/'+j.rinci.length)"; done
  done
  echo; echo "## Nalar 42 (berpasangan)"; node eval/banding-berpasangan.mjs "eval/hasil-uji-nalar-$N.json" "eval/hasil-uji-nalar-$NB.json" "$MODEL" "$BANDING" 2>&1 | head -4
  echo; echo "## Halusinasi polos (berpasangan)"; node eval/banding-berpasangan.mjs "eval/hasil-$N-polos.2026-08-23.json" "eval/hasil-$NB-polos.2026-08-23.json" "$MODEL" "$BANDING" 2>&1 | head -4
  echo; echo "## ULANG 5 putaran"
  for g in uji-alat uji-kias uji-kelemahan; do for m in "$N" "$NB"; do f="eval/ULANG-$g-$m-23agu.json"; [ -f "$f" ] && node -e "const j=require('./$f');const k=j.keseluruhan;console.log('- $g $m: '+k.lulus+'/'+k.coba+' '+k.vonis+' | '+j.perKategori.map(c=>c.kategori.slice(0,11)+' '+c.lulus+'/'+c.total).join(' · '))"; done; done
} | tee "eval/CEK-$N.md"
echo "== $(stamp) SELESAI =="
