#!/usr/bin/env bash
# Pengawas GERBANG-S1 di Bmax: cek tiap 30 menit; keluar saat jawaban LATIH selesai, semua selesai, atau pelari MATI.
SC="~/AppData/Local/Temp/claude/C--migancore/cd391d1d-4a1b-4d70-a0c2-b23c314c77dc/scratchpad"
cd /c/migancore
for i in $(seq 1 40); do
  s=$(node flywheel/bmax.mjs --berkas "$SC/bmax-status-s1.ps1" 2>&1 | grep -E "^(HIDUP|SELESAI|MATI)" | tail -1)
  echo "$(date -u +%FT%TZ) $s"
  case "$s" in
    SELESAI*|MATI*) exit 0 ;;
    *LATIH-SELESAI*) exit 0 ;;
    "") echo "status kosong (Bmax tak terjangkau?)" ;;
  esac
  sleep 1800
done
echo "pengawas berhenti sesudah 40 cek"
