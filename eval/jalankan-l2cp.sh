#!/usr/bin/env bash
# L2c-P — dua lengan prompt di petak BAYANGAN. Pola & penjaga sama dengan
# jalankan-l2b-bmax.sh; yang berbeda hanya petak dan dial prompt.
set -u
AKAR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$AKAR" || exit 1
HOST="${OLLAMA_HOST:-http://measure-host.local:11434}"
export OLLAMA_HOST="$HOST"
export BATAS="${BATAS:-300}"
export OMIGA_DIR="${OMIGA_DIR:-<memory-dir>-beku-l2b}"
MODEL="migancore:0.4-qwen3"; LOG="eval/l2cp.log"; KODE_MATI=3
cap() { echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "$LOG"; }
tunggu() { local i=0; while [ $i -lt 180 ]; do
    curl -s -m 8 "$HOST/api/tags" 2>/dev/null | grep -q "\"$MODEL\"" && { cap "Bmax siap"; return 0; }
    [ $((i % 10)) -eq 0 ] && cap "menunggu Bmax... ($((i/2)) menit)"; i=$((i+1)); sleep 30; done
  cap "MENYERAH — Bmax tidak kembali"; return 1; }

cap "=== L2C-P MULAI · host $HOST ==="
tunggu || exit 1
jalur="$(node -e 'process.stdout.write(process.env.OLLAMA_HOST||"")')"
[ "$jalur" = "$HOST" ] || { cap "BERHENTI — jalur $jalur != $HOST"; exit 1; }
batas="$(node -e 'import("./eval/ukur-jujur2.mjs").then(m=>process.stdout.write(String(m.BATAS_DETIK)))')"
[ "$batas" = "$BATAS" ] || { cap "BERHENTI — batas $batas != $BATAS"; exit 1; }
cap "terverifikasi: jalur $jalur · batas ${batas}s · korpus $OMIGA_DIR"
node eval/petak-bayangan.mjs --periksa >> "$LOG" 2>&1 || { cap "BERHENTI — petak bayangan tidak lolos penjaganya"; exit 1; }
cap "petak bayangan lolos anti-tabrakan + anti-bocor"

gangguan=0
for P in lama baru; do
  while : ; do
    cap "##### LENGAN prompt=$P"
    node eval/ukur-jujur2-retrieval.mjs "$MODEL" --probe "$MODEL" --sumber bersih \
      --petak bayangan --prompt "$P" --putaran 3 >> "$LOG" 2>&1
    kode=$?
    [ $kode -eq 0 ] && { cap "lengan $P SELESAI"; break; }
    [ $kode -ne $KODE_MATI ] && { cap "lengan $P berhenti kode $kode — L2c-P dihentikan"; cap "=== L2C-P SELESAI (gagal) ==="; exit $kode; }
    gangguan=$((gangguan+1)); cap "server hilang saat $P (gangguan ke-$gangguan/4)"
    [ $gangguan -ge 4 ] && { cap "MENYERAH"; cap "=== L2C-P SELESAI (gagal) ==="; exit 1; }
    tunggu || { cap "=== L2C-P SELESAI (gagal) ==="; exit 1; }
    cap "mengulang lengan $P dari nol (C29)"
  done
done
cap "=== L2C-P SELESAI ==="
