#!/usr/bin/env bash
# Rantai jalur kritis halaman label (28 Sep): tunggu sampel-1 lengkap (347 jawaban) di Bmax → salin balik → ambil baris
# sampel 1 → label DeepSeek → sampel validasi buta. Kolam validasi = sampel-1 (keputusan prosedur, dicatat di pra-daftar).
set -uo pipefail
SC="~/AppData/Local/Temp/claude/C--migancore/cd391d1d-4a1b-4d70-a0c2-b23c314c77dc/scratchpad"
cd /c/migancore
O="-i $HOME/.ssh/bmax_key -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o BatchMode=yes"
for i in $(seq 1 120); do
  s=$(node flywheel/bmax.mjs --berkas "$SC/bmax-status-s1.ps1" 2>&1 | grep -E "^(HIDUP|SELESAI|MATI)" | tail -1)
  n=$(echo "$s" | sed -n 's/.*latih \([0-9]*\).*/\1/p')
  echo "$(date -u +%T) $s"
  if [ -n "$n" ] && [ "$n" -ge 348 ]; then break; fi
  case "$s" in MATI*) echo "BERHENTI: pelari mati"; exit 1;; esac
  sleep 60
done
scp $O "<user>@<host>:.-pelari/repo-s1/eval/gerbang-s1/jawaban-latih-v1.jsonl" "$SC/jawaban-latih-salinan.jsonl" || exit 1
node -e "
const fs=require('fs');const L=fs.readFileSync('$SC/jawaban-latih-salinan.jsonl','utf8').split('\n').filter(Boolean);const ok=[];for(const l of L){try{ok.push(JSON.parse(l))}catch{}}
const s1=ok.filter(r=>r.sampel===1);fs.writeFileSync('$SC/jawaban-latih-sampel1.jsonl',s1.map(r=>JSON.stringify(r)).join('\n')+'\n');
console.log('sampel-1:',s1.length,'baris · id unik',new Set(s1.map(r=>r.id)).size,'· GALAT',s1.filter(r=>r.hasil==='GALAT').length);
if(new Set(s1.map(r=>r.id)).size<347){console.error('BELUM LENGKAP');process.exit(1)}" || exit 1
echo "== label DeepSeek sampel-1"
node eval/gerbang-s1/label-deepseek.mjs eval/gerbang-s1/soal-latih-v1.jsonl "$SC/jawaban-latih-sampel1.jsonl" eval/gerbang-s1/label-ds-latih-v1.jsonl || exit 1
echo "== sampel validasi buta"
node eval/gerbang-s1/validasi.mjs --sampel eval/gerbang-s1/soal-latih-v1.jsonl "$SC/jawaban-latih-sampel1.jsonl" eval/gerbang-s1/label-ds-latih-v1.jsonl eval/gerbang-s1/validasi-sampel-v1.json "$SC/validasi-kunci-v1.json" || exit 1
sha256sum "$SC/validasi-kunci-v1.json" eval/gerbang-s1/validasi-sampel-v1.json
echo "RANTAI-SELESAI"
