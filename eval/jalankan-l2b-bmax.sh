#!/usr/bin/env bash
# jalankan-l2b-bmax.sh — menjalankan L2b di Bmax, dan SABAR terhadap Bmax yang hilang.
#
# Kenapa berkas ini ada. L2b sudah dua kali gagal karena server jawabannya hilang
# di tengah, dua sebab berbeda:
#   9 Sep 16:39Z  Ollama di laptop berhenti      -> 8 dari 9 putaran hangus
#   9 Sep 17:00Z  Bmax RESTART (Windows Update)  -> pra-lintasan probe mati di tengah
#
# Yang kedua paling menjengkelkan karena tidak bisa dicegah: mesin lain boleh
# restart kapan saja, dan pelari yang jujur memang akan gagal saat itu. Maka
# jawabannya bukan mencegah, melainkan MENUNGGU lalu MENGULANG lengan yang gagal.
#
# Yang TIDAK dilakukan: menambal angka. Lengan yang terputus diulang dari nol,
# bukan disambung — berkas hasil separuh jalan tidak pernah ikut dirata-ratakan
# (pra-daftar: < 2 putaran sah = TIDAK DIVONIS).
set -u

AKAR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$AKAR" || exit 1

HOST="${OLLAMA_HOST:-http://measure-host.local:11434}"
# WAJIB di-export, bukan sekadar variabel skrip. Percobaan pertama 17:08Z gagal
# dalam 6 detik karena tidak: curl kesehatan menembak Bmax, sementara node membaca
# `process.env.OLLAMA_HOST` yang KOSONG dan jatuh ke 127.0.0.1 — tempat Ollama
# memang tidak jalan. Pemeriksaan dan pekerjaannya memakai jalur berbeda, cacat
# yang sama dengan pemetik Codex 7 Sep (divalidasi lewat `2>&1`, produksi stdout).
export OLLAMA_HOST="$HOST"

# BATAS (detik per jawaban) — dinaikkan dari 120 ke 300 pada 9 Sep 17:59Z, SESUDAH
# putaran pertama di Bmax berbunyi TIDAK SAH dengan 7/36 soal `lewat 120s` (19,4 %,
# ambang 10 %). Ketujuhnya murni kehabisan waktu, bukan koneksi putus.
#
# Kenapa ini BUKAN menggeser ambang sesudah melihat angka:
#   - Batas waktu bukan salah satu ambang perbandingan yang dikunci pra-daftar
#     (selisih MENGARANG/fakta/over-refusal). Pra-daftar justru mendaftarkannya
#     sebagai artefak instrumen: "batas waktu per jawaban (produksi tidak punya;
#     pengukur wajib — C33)".
#   - Acuan 15,5 % diukur di LAPTOP, tempat 120 s tidak pernah menggigit sama
#     sekali. Di Bmax (CPU, num_ctx 8192, prompt ±4 rb token) rata-rata 82 dtk/soal
#     dan ekornya melewati 120. Instrumen yang sama berperilaku BEDA di dua mesin;
#     menaikkan batas mengembalikan kesetaraan, bukan merusaknya.
#   - Yang dibuang batas ketat itu BUKAN acak: 3 dari 5 soal `maksud-kurang` ikut
#     hilang — persis kelas yang jawabannya panjang. Membiarkannya = mengukur
#     petak yang timpang.
# `batasDetik` ditulis ke tiap berkas hasil, jadi kondisi ini selalu bisa diaudit.
export BATAS="${BATAS:-300}"

# KORPUS DIBEKUKAN. `<memory-dir>\corpus` dibangun ulang tiap sesi Claude berakhir —
# selama L2b saja ia sudah berubah TIGA kali: 26.209 -> 26.264 -> 26.300 potongan.
# Itu C54 bekerja di depan mata: transkrip sesi yang sedang menulis pengukuran ini
# ikut terindeks. Tiga lengan yang membaca indeks berbeda tidak sebanding (C29),
# dan `vonis-l2b.mjs` akan menandainya — tapi menandai sesudah 7 jam jauh lebih
# mahal daripada mencegah sekarang.
#
# Salinan beku dibuat 9 Sep 18:15Z dari generasi 17:36:04Z, dan diverifikasi
# membaca identik lewat jalur produksi (26.300 potongan, 100 seksi kanon,
# cariCatatan 8 sumber / 8.192 huruf). `corpus.js` ikut disalin karena ia
# menghitung ROOT dari lokasinya sendiri (__dirname/../..).
export OMIGA_DIR="${OMIGA_DIR:-<memory-dir>-beku-l2b}"

MODEL="migancore:0.4-qwen3"
LOG="eval/l2b-bmax.log"
TUNGGU_MAKS=90        # menit menunggu Bmax kembali, per kejadian
GANGGUAN_MAKS=4       # berapa kali boleh hilang sebelum menyerah
KODE_SERVER_MATI=3

cap() { echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "$LOG"; }

# Menunggu Ollama Bmax menjawab DAN model yang dipakai benar-benar ada di sana.
# Dua-duanya diperiksa: sesudah restart, port bisa hidup sebelum daftar model siap.
tunggu_bmax() {
  local batas=$(( TUNGGU_MAKS * 60 / 30 ))
  local i=0
  while [ $i -lt $batas ]; do
    local tags
    tags="$(curl -s -m 8 "$HOST/api/tags" 2>/dev/null)"
    if echo "$tags" | grep -q "\"$MODEL\""; then
      cap "Bmax siap — $MODEL tersedia"
      return 0
    fi
    if [ $((i % 10)) -eq 0 ]; then
      cap "menunggu Bmax... ($((i * 30 / 60)) menit; $( [ -n "$tags" ] && echo 'port hidup, model belum terdaftar' || echo 'port belum menjawab' ))"
    fi
    i=$((i + 1))
    sleep 30
  done
  cap "MENYERAH — Bmax tidak kembali dalam $TUNGGU_MAKS menit"
  return 1
}

cap "=== L2B DI BMAX MULAI · host $HOST ==="
tunggu_bmax || exit 1

# Penjaga jalur: pelari harus benar-benar menembak host yang barusan diperiksa.
# Tanpa ini, `OLLAMA_HOST` yang lupa di-export membuat pemeriksaan kesehatan dan
# pekerjaan memakai server BERBEDA — dan gejalanya terbaca seperti "Bmax mati".
jalur="$(node -e 'process.stdout.write((process.env.OLLAMA_HOST||"http://127.0.0.1:11434"))')"
if [ "$jalur" != "$HOST" ]; then
  cap "BERHENTI — pelari akan menembak '$jalur', bukan '$HOST' yang diperiksa. OLLAMA_HOST tidak sampai ke node."
  exit 1
fi
cap "jalur terverifikasi: pelari menembak $jalur"

# Penjaga yang sama untuk BATAS. Sebabnya identik: env yang lupa di-export terbaca
# seperti "modelnya lambat", bukan seperti "setelan saya tidak sampai".
batas_efektif="$(node -e 'import("./eval/ukur-jujur2.mjs").then(m=>process.stdout.write(String(m.BATAS_DETIK)))')"
if [ "$batas_efektif" != "$BATAS" ]; then
  cap "BERHENTI — pelari memakai batas ${batas_efektif}s, bukan ${BATAS}s yang disetel."
  exit 1
fi
cap "batas terverifikasi: ${batas_efektif}s per jawaban"

# Penjaga ketiga, pola yang sama: korpus yang dipakai harus yang BEKU, dan harus terbaca.
gen_korpus="$(node -e 'const p=require("path");const D=process.env.OMIGA_DIR;const C=require(p.join(D,"mcp","omiga-brain","corpus.js"));const m=typeof C.meta==="function"?C.meta():C.meta;process.stdout.write(String(m.N)+"@"+String(m.built_at))' 2>/dev/null)"
if [ -z "$gen_korpus" ]; then
  cap "BERHENTI — korpus di OMIGA_DIR=$OMIGA_DIR tidak terbaca."
  exit 1
fi
cap "korpus terverifikasi: $OMIGA_DIR ($gen_korpus)"

gangguan=0
for L in bersih plasebo penuh; do
  while : ; do
    cap "##### LENGAN $L"
    node eval/ukur-jujur2-retrieval.mjs "$MODEL" --probe "$MODEL" --sumber "$L" --putaran 3 >> "$LOG" 2>&1
    kode=$?
    if [ $kode -eq 0 ]; then
      cap "lengan $L SELESAI"
      break
    fi
    if [ $kode -ne $KODE_SERVER_MATI ]; then
      cap "lengan $L berhenti dengan kode $kode (bukan server mati) — L2b dihentikan"
      cap "=== L2B SELESAI (gagal) ==="
      exit $kode
    fi
    gangguan=$((gangguan + 1))
    cap "server hilang saat lengan $L (gangguan ke-$gangguan dari $GANGGUAN_MAKS)"
    if [ $gangguan -ge $GANGGUAN_MAKS ]; then
      cap "MENYERAH — terlalu sering terputus. Berkas yang sudah sah tetap tersimpan."
      cap "=== L2B SELESAI (gagal) ==="
      exit 1
    fi
    tunggu_bmax || { cap "=== L2B SELESAI (gagal) ==="; exit 1; }
    cap "mengulang lengan $L dari nol (bukan menyambung — C29)"
  done
done

cap "=== L2B SELESAI ==="
cap "baca vonisnya: node eval/vonis-l2b.mjs"
