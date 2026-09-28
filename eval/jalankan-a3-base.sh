#!/usr/bin/env bash
# A3 (doc 93) — JANGKAR TIDAK SIRKULAR: ukur base mentah qwen3:4b polos di
# petak-jujur2, supaya ambang bibit tidak diturunkan dari CI95 dirinya sendiri.
#
# Kenapa belum pernah berhasil: base mentah bernalar panjang dan 22-25 % soal
# melewati batas 120 dtk -> 5/5 putaran TIDAK SAH (2 Sep). Dua tuas yang sudah
# terbukti di L2b dipakai di sini: BATAS=300 dan mesin Bmax.
#
# PIKIR sengaja TIDAK dimatikan. `/no_think` mengubah pembungkus, dan jangkar
# harus diukur dengan pembungkus yang SAMA dengan model yang dibandingkan
# terhadapnya (C29). Kalau 300 dtk masih kurang, yang dinaikkan batasnya, bukan
# pembungkusnya.
set -u
AKAR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$AKAR" || exit 1
# Alamat Bmax BUKAN tetapan — DHCP menggesernya .78 -> .17 pada 10 Sep dan mesin
# yang sehat terbaca "mati" di setiap pemeriksaan. Bawaan ini cuma titik mulai;
# yang menentukan sah-tidaknya adalah SIDIK MESIN di gerbang 5, bukan alamatnya.
HOST="${OLLAMA_HOST:-http://measure-host.local:11434}"; export OLLAMA_HOST="$HOST"
# ALIRAN=1 wajib. Tanpa aliran, `fetch` bawaan Node memutus di 300 dtk apa pun
# BATAS-nya (headersTimeout undici) — itu yang membuat 11 dari 11 pengukuran
# base sebelumnya TIDAK SAH. Kesetaraan angkutan sudah diukur dengan seed
# dikunci: `node eval/uji-batas-fetch.mjs --setara migancore:0.14` → 3/3 identik.
export ALIRAN="${ALIRAN:-1}"
export BATAS="${BATAS:-900}"
# 15 Sep: pelari selalu menjalankan 5 putaran BARU, padahal A3 menghitung putaran
# SAH lintas berkas. Dengan 3 sudah sah, 5 putaran lagi = ±14 jam CPU untuk 2 yang
# dibutuhkan. Jumlahnya tidak menyentuh kondisi ukur (tiap putaran berdiri sendiri).
PUTARAN="${PUTARAN:-5}"
MODEL="qwen3:4b"; LOG="eval/a3-base.log"
cap() { echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "$LOG"; }

cap "=== A3 jangkar base MULAI · host $HOST · batas ${BATAS}s ==="
curl -s -m 10 "$HOST/api/tags" | grep -q "\"$MODEL\"" || { cap "BERHENTI — $MODEL tidak ada di $HOST"; exit 1; }
batas="$(node -e 'import("./eval/ukur-jujur2.mjs").then(m=>process.stdout.write(String(m.BATAS_DETIK)))')"
[ "$batas" = "$BATAS" ] || { cap "BERHENTI — batas $batas != $BATAS"; exit 1; }

# Gerbang 5 (10 Sep): setelan yang belum pernah lulus pratinjau tidak boleh
# berangkat. BATAS=300 sempat ditulis di doc 93 sebagai "kemungkinan besar bisa"
# — dugaan, dan dugaannya salah (2 dari 5 soal terkeras tetap mentok). Gerbang
# ini membuat "sudah diuji" jadi fakta yang diperiksa mesin, bukan ingatan.
vonis="$(node --input-type=module -e '
import fs from "node:fs";
const m = await import("./eval/pratinjau-a3.mjs");
const [model,host,batas]=process.argv.slice(1);
let v; try{v=JSON.parse(fs.readFileSync("eval/PRATINJAU-A3.json","utf8"));}
catch{process.stdout.write(`TIDAK ADA — jalankan dulu: BATAS=${batas} node eval/pratinjau-a3.mjs`);process.exit(0);}
const beda=[];
if(v.model!==model)beda.push(`model ${v.model} != ${model}`);
// Batas TIDAK dituntut sama persis — hubungannya diperiksa cukupUntukBatas()
// di bawah, yang tahu kapan vonis lama masih sah untuk batas baru dan kapan
// tidak. Menuntut sama persis akan memaksa mengulang pratinjau 45 menit setiap
// kali batasnya naik, padahal waktu yang terukur tidak berubah karenanya.
// Yang dijaga MESINNYA, bukan alamatnya. 10 Sep: Bmax dinyalakan ulang dan DHCP
// menggesernya .78 -> .17; mesin yang sehat terbaca "mati" di setiap
// pemeriksaan karena semua tetapan menyebut alamat lama. Alamat IP adalah fakta
// yang berubah sendiri. Sidik mesin = daftar model + versi Ollama; empat model
// migancore:* di sana bangunan kami sendiri dan tidak ada di mesin lain.
const kini = await m.sidikMesin(host).catch(e => ({ cap: `TAK-TERJANGKAU (${e})` }));
if(v.mesin && v.mesin.cap !== kini.cap) beda.push(`mesin BERBEDA: pratinjau ${v.mesin.cap} != sekarang ${kini.cap}`);
if(!v.mesin && v.host && host && v.host !== host)
  beda.push(`host ${v.host} != ${host}, dan pratinjau belum punya sidik mesin untuk membantahnya`);
// Pratinjau yang cuma menguji SEBAGIAN soal keras tidak boleh membuka gerbang:
// uji langit-langit dijalankan dengan --soal, dan hasilnya menimpa berkas yang
// sama. Tanpa cek ini, pratinjau 1 soal bisa meloloskan putaran 36 soal.
const kurang=(m.SOAL_KERAS||[]).filter(id=>!(v.soal||[]).includes(id));
if(kurang.length)beda.push(`pratinjau tidak mencakup ${kurang.join(",")}`);
// Angkutan harus SAMA dengan yang dipakai pelari. Pratinjau ber-aliran tidak
// boleh membuka gerbang untuk putaran non-aliran: yang satu punya langit-langit
// 300 dtk, yang lain tidak.
if(String(!!v.aliran)!==String(process.env.ALIRAN==="1"))
  beda.push(`aliran pratinjau ${!!v.aliran} != ALIRAN pelari ${process.env.ALIRAN==="1"}`);
// Vonis pratinjau boleh dipakai untuk BATAS yang LEBIH LONGGAR, asal tidak ada
// soal yang gagal — batas hanya bisa MENYENSOR waktu, tidak memanjangkannya.
// Alasannya dikodekan di cukupUntukBatas(), bukan diputuskan di sini.
const c=m.cukupUntukBatas(v, Number(batas));
if(!c.boleh)beda.push(`pratinjau TIDAK CUKUP untuk BATAS=${batas}: ${c.sebab}`);
process.stdout.write(beda.length?beda.join(" · "):"OK");
' "$MODEL" "$HOST" "$BATAS")"
[ "$vonis" = "OK" ] || { cap "BERHENTI — pratinjau: $vonis"; exit 1; }
cap "terverifikasi: $MODEL ada · batas ${batas}s · pratinjau LULUS untuk setelan ini"

# 15 Sep: run kedua mati SENYAP di putaran 3 — log berhenti di "tersimpan p2" tanpa
# satu baris pun. Sebabnya baru ketahuan 4 hari kemudian dari log kejadian Windows:
# laptop di-restart lewat Start menu (04:46 WIB 11 Sep). Pelari tidak menulis apa
# pun di antara dua akhir putaran (±2,7 jam), jadi kematiannya tidak punya jam.
# Detak ini menimpa satu baris tiap 10 menit selama pembungkus hidup.
DETAK="eval/a3-detak.txt"
( while kill -0 $$ 2>/dev/null; do
    echo "$(date -u +%FT%TZ) hidup · putaran-diminta $PUTARAN · berkas-p* $(ls eval/hasil-jujur2-qwen3_4b-p*.json 2>/dev/null | wc -l)" > "$DETAK"
    sleep 600
  done ) &
node eval/ukur-jujur2.mjs "$MODEL" --putaran "$PUTARAN" >> "$LOG" 2>&1
kode=$?
cap "pelari keluar kode $kode"
sah=$(node -e '
const fs=require("fs");let n=0;
for(const f of fs.readdirSync("eval").filter(x=>x.startsWith("hasil-jujur2-qwen3_4b-p")&&x.endsWith(".json"))){
  try{const j=JSON.parse(fs.readFileSync("eval/"+f,"utf8"));if(j.rangkuman&&j.rangkuman.sah&&j.petak===36&&!j.gerbang&&!j.retrieval)n++;}catch{}}
process.stdout.write(String(n));')
cap "putaran polos SAH qwen3:4b sekarang: $sah (syarat A3: >= 5)"
[ "$sah" -ge 5 ] && cap "A3 LULUS — jalankan: node eval/ambang-bibit.mjs" || cap "A3 BELUM — naikkan BATAS, JANGAN ubah pembungkus"
cap "=== A3 SELESAI ==="
