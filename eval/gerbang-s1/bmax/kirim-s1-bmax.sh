#!/usr/bin/env bash
# Kirim penjawab Gerbang-S1 ke Bmax dari HEAD (soal-latih-v1.jsonl sudah dikomit): arsip LF → scp → SHA-256 dicocokkan →
# pasang (uji di Bmax) → mulai lepas lewat WMI. Mesin eksklusif diperiksa di bmax-mulai-s1.ps1.
set -euo pipefail
SC="~/AppData/Local/Temp/claude/C--migancore/cd391d1d-4a1b-4d70-a0c2-b23c314c77dc/scratchpad"
cd /c/migancore
git ls-files --error-unmatch eval/gerbang-s1/soal-latih-v1.jsonl >/dev/null || { echo "BERHENTI: soal-latih-v1.jsonl belum dikomit"; exit 1; }
K=$(git rev-parse --short HEAD)
Z="$SC/pelari-s1-$K.zip"
git -c core.autocrlf=false -c core.eol=lf archive --format=zip -o "$Z" HEAD eval flywheel sistem
SHA=$(sha256sum "$Z" | cut -d' ' -f1)
echo "arsip $(basename "$Z") $(stat -c %s "$Z") B sha256 $SHA"
O="-i $HOME/.ssh/bmax_key -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o BatchMode=yes"
scp $O "$Z" "<user>@<host>:.-pelari/$(basename "$Z")"
scp $O eval/gerbang-s1/soal-latih-v1.jsonl "<user>@<host>:.-pelari/soal-latih-v1.jsonl"
echo "== pasang"
node flywheel/bmax.mjs --berkas "$SC/bmax-pasang-s1.ps1" 2>&1 | grep -vE "CLIXML|<Objs|progress" | tee "$SC/log-pasang-s1-laptop.txt"
grep -q "arsip: $(basename "$Z") sha256: $SHA" "$SC/log-pasang-s1-laptop.txt" || { echo "BERHENTI: sha256 arsip di Bmax ≠ laptop"; exit 1; }
grep -q "jawab: semua uji lulus" "$SC/log-pasang-s1-laptop.txt" || { echo "BERHENTI: uji jawab.mjs di Bmax tidak lulus"; exit 1; }
echo "== mulai"
node flywheel/bmax.mjs --berkas "$SC/bmax-mulai-s1.ps1" 2>&1 | grep -vE "CLIXML|<Objs|progress"
