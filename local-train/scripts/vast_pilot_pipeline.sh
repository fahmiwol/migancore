#!/bin/bash
# vast_pilot_pipeline.sh — pilot irrelevance #14, SATU JALAN di instance sewaan.
#
# Kenapa satu skrip, bukan 7 langkah manual: instance dibayar per jam dan bisa
# dihentikan sewaktu-waktu. Tiap jeda menunggu manusia membaca log = uang, dan tiap
# tahap yang "diperiksa dengan mata" adalah tahap yang cepat atau lambat terlewat.
# Semua ambang di sini DIPERIKSA MESIN dan menggagalkan run bila meleset.
#
# Urutan: preflight -> deps -> smoke(berambang) -> train -> AMANKAN ADAPTER -> merge
#         -> gguf f16 -> q4_k_m -> checksum. Adapter diarsipkan SEBELUM merge, supaya
#         kegagalan merge tidak pernah memakan hasil training.
#
# Pakai:  bash vast_pilot_pipeline.sh 2>&1 | tee -a /workspace/pipeline_console.log
# Baca :  tail -f /workspace/local-train/PIPELINE_STATUS.txt
set -uo pipefail

ROOT=/workspace/local-train
CFG=$ROOT/configs/vast_gpu_besar.json
# Path adapter DIBACA DARI CONFIG, tidak di-hardcode. Hardcoding di dua tempat adalah
# persis cacat yang hampir menghilangkan hasil training pilot #14 (F-210): config bilang
# satu path, runbook men-tar path lain, dan tak ada yang menyadarinya sampai adapter dicari.
ADAPTER=$ROOT/$(python3 -c "import json;print(json.load(open('$CFG'))['output_dir'])" 2>/dev/null || echo "adapters/pilot15_seimbang")
MERGED=$ROOT/merged_fp16
GGUF_F16=$ROOT/migancore-pilot-f16.gguf
GGUF_Q4=$ROOT/migancore-pilot.q4_k_m.gguf
LLAMA=/workspace/llama.cpp
STATUS=$ROOT/PIPELINE_STATUS.txt
LOG=$ROOT/pipeline.log

mkdir -p "$ROOT"
say(){ echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "$STATUS"; }
die(){ say "FATAL: $*"; say "===== PIPELINE BERHENTI ====="; exit 1; }

say "===== PILOT IRRELEVANCE #14 — MULAI ====="

# ─────────────── 1. preflight: gagal MURAH, sebelum unduh 8 GB ───────────────
say "[1/8] preflight GPU + disk..."
python3 - <<'PY' > /tmp/preflight.txt 2>&1 || true
import torch, shutil
ok = torch.cuda.is_available()
print("CUDA", ok)
if ok:
    p = torch.cuda.get_device_properties(0)
    print("GPU", p.name)
    print("VRAM_GB %.1f" % (p.total_memory/1e9))
    free, total = torch.cuda.mem_get_info()
    print("VRAM_FREE_GB %.1f" % (free/1e9))
print("DISK_FREE_GB %.1f" % (shutil.disk_usage("/workspace").free/1e9))
PY
cat /tmp/preflight.txt | tee -a "$STATUS"
grep -q "CUDA True" /tmp/preflight.txt || die "CUDA tidak tersedia di instance ini."
VF=$(awk '/VRAM_FREE_GB/{print $2}' /tmp/preflight.txt)
DF=$(awk '/DISK_FREE_GB/{print $2}' /tmp/preflight.txt)
awk -v v="$VF" 'BEGIN{exit !(v>=22)}' || die "VRAM bebas ${VF} GB < 22 GB. Instance salah — hentikan, jangan lanjut."
awk -v d="$DF" 'BEGIN{exit !(d>=45)}' || die "Disk bebas ${DF} GB < 45 GB. Butuh base 8 + merged 8 + gguf 8 + q4 2,5."
say "[1/8] preflight LULUS — VRAM bebas ${VF} GB, disk ${DF} GB"

# ─────────────── 2. dependensi ───────────────
say "[2/8] pasang dependensi..."
# transformers DIPIN ke 4.57.6 = versi persis saat recipe divalidasi di laptop.
# "transformers>=4.45" menarik 5.14.1, dan di 5.x apply_chat_template(tokenize=True)
# mengembalikan BatchEncoding alih-alih list token -> SELURUH 2.667 contoh kehilangan
# label (diukur 2026-07-27, smoke mati di detik ke-9). Kode kini tahan dua-duanya, tapi
# pin dipertahankan supaya run ini identik dengan lingkungan tempat smoke 58,1% lolos:
# pilot ini mengukur efek DATA, jadi jangan sekalian mengganti versi pustaka.
pip install -q "transformers==4.57.6" "peft==0.19.1" bitsandbytes accelerate datasets >>"$LOG" 2>&1 \
  || die "pip install gagal — lihat $LOG"
python3 -c "import transformers,peft,bitsandbytes;print('tf',transformers.__version__,'peft',peft.__version__)" \
  2>&1 | tee -a "$STATUS" || die "impor dependensi gagal"

# ─────────────── 3. smoke — ambang diperiksa MESIN ───────────────
# Empat cacat sesi lalu semuanya ketahuan di sini dalam hitungan menit.
if [ ! -f "$ROOT/.smoke_ok" ]; then
  say "[3/8] smoke test (10 langkah)..."
  cd "$ROOT" || die "cd $ROOT"
  PYTHONIOENCODING=utf-8 python3 -u scripts/02_train_lora.py --config "$CFG" --smoke \
    > "$ROOT/smoke.log" 2>&1
  rc=$?
  tail -25 "$ROOT/smoke.log" | tee -a "$STATUS"
  [ $rc -eq 0 ] || die "smoke exit $rc — lihat $ROOT/smoke.log"

  # LoRA benar-benar terpasang di 7 modul (bukan diam-diam attention saja)
  grep -q "132,120,576" "$ROOT/smoke.log" \
    || die "parameter dilatih BUKAN 132.120.576 — target_modules tidak sesuai recipe LOCKED."
  # label masking hidup: prompt di-mask, model tidak dilatih meniru pertanyaan pengguna
  TOK=$(grep -o "token dilatih: [0-9]* / [0-9]* ([0-9.]*%" "$ROOT/smoke.log" | grep -o "([0-9.]*" | tr -d '(' | tail -1)
  [ -n "$TOK" ] || die "baris 'token dilatih' tidak ditemukan di smoke.log"
  awk -v t="$TOK" 'BEGIN{exit !(t>30 && t<90)}' \
    || die "token dilatih ${TOK}% di luar 30-90% — masking rusak. JANGAN lanjut training."
  say "[3/8] smoke LULUS — 132.120.576 param, token dilatih ${TOK}%"
  touch "$ROOT/.smoke_ok"
else
  say "[3/8] smoke sudah lulus sebelumnya (.smoke_ok) — dilewati"
fi

# ─────────────── 4. training penuh ───────────────
if [ ! -s "$ADAPTER/adapter_model.safetensors" ]; then
  say "[4/8] training penuh — 501 langkah (167/epoch x 3). Ini tahap terpanjang."
  cd "$ROOT" || die "cd $ROOT"
  PYTHONIOENCODING=utf-8 nohup python3 -u scripts/02_train_lora.py --config "$CFG" \
    > "$ROOT/train.log" 2>&1
  rc=$?
  tail -20 "$ROOT/train.log" | tee -a "$STATUS"
  [ $rc -eq 0 ] || die "training exit $rc — lihat $ROOT/train.log"
else
  say "[4/8] adapter sudah ada — training dilewati"
fi
[ -s "$ADAPTER/adapter_model.safetensors" ] || die "adapter tidak terbentuk di $ADAPTER"
say "[4/8] adapter: $(ls -lh "$ADAPTER/adapter_model.safetensors" | awk '{print $5}')"

# ─────────────── 5. AMANKAN ADAPTER SEKARANG ───────────────
# Sebelum tahap apa pun yang bisa gagal. Adapter = hasil training yang tak tergantikan;
# GGUF selalu bisa dibuat ulang darinya, tapi tidak sebaliknya.
say "[5/8] arsipkan adapter (asuransi — SEBELUM merge)..."
cd "$ROOT" || die "cd"
tar -czf /workspace/adapter.tgz adapters/ runs/ 2>/dev/null
[ -s /workspace/adapter.tgz ] || die "gagal membuat adapter.tgz"
sha256sum /workspace/adapter.tgz | tee -a "$STATUS"
say "[5/8] /workspace/adapter.tgz siap ($(ls -lh /workspace/adapter.tgz | awk '{print $5}')) — UNDUH INI DULU"

# ─────────────── 6. merge fp16 ───────────────
if [ ! -s "$MERGED/config.json" ]; then
  say "[6/8] merge adapter ke base fp16 (CPU/GPU, ~5 menit)..."
  python3 - >>"$LOG" 2>&1 <<PY
import torch, json
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
cfg = json.load(open("$CFG"))
base = cfg["base_model"]
print("muat base fp16", flush=True)
m = AutoModelForCausalLM.from_pretrained(base, dtype=torch.float16, low_cpu_mem_usage=True)
print("terapkan adapter", flush=True)
m = PeftModel.from_pretrained(m, "$ADAPTER")
print("merge_and_unload", flush=True)
m = m.merge_and_unload()
m.save_pretrained("$MERGED", safe_serialization=True)
AutoTokenizer.from_pretrained(base).save_pretrained("$MERGED")
print("MERGE DONE", flush=True)
PY
  grep -q "MERGE DONE" "$LOG" || { tail -20 "$LOG" | tee -a "$STATUS"; die "merge gagal"; }
fi
say "[6/8] merged fp16 siap"

# ─────────────── 7. GGUF f16 -> Q4_K_M ───────────────
# Q4_K_M WAJIB — baseline migancore:0.4-qwen3 juga Q4_K_M. Quant berbeda akan
# mencampur 'efek training' dengan 'efek kuantisasi' dan membuat McNemar tak bermakna.
if [ ! -s "$GGUF_Q4" ]; then
  # Image PyTorch sering tidak membawa toolchain build — pasang bila hilang.
  #
  # ⚠️ 2026-07-27 run#15: versi sebelumnya memeriksa `cmake` dan `git` saja sebagai WAKIL
  # dari "alat build lengkap". Image conda MEMBAWA cmake (/opt/conda/bin/cmake) tetapi
  # TANPA kompiler → penjaga lolos, lalu cmake gagal di tahap configure:
  #   "CMAKE_C_COMPILER not set" / "unable to find a build program"
  # Itu terjadi SETELAH training 45 menit + konversi f16 selesai. Memeriksa wakil alih-alih
  # syarat sesungguhnya adalah kelas kesalahan yang sama dengan F-209/F-210.
  # Kini yang diperiksa adalah kompilernya sendiri: gcc, g++, make.
  for b in git cmake gcc g++ make; do
    command -v "$b" >/dev/null 2>&1 || {
      say "[7/8] $b tidak ada — memasang toolchain..."
      (DEBIAN_FRONTEND=noninteractive apt-get update -qq \
        && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq build-essential cmake git) >>"$LOG" 2>&1 \
        || die "gagal memasang toolchain build ($b)"
      break
    }
  done
  for b in gcc g++ make cmake; do
    command -v "$b" >/dev/null 2>&1 || die "toolchain masih kurang: $b tidak ada setelah instalasi"
  done
  if [ ! -d "$LLAMA" ]; then
    say "[7/8] clone llama.cpp..."
    git clone --depth=1 https://github.com/ggml-org/llama.cpp "$LLAMA" >>"$LOG" 2>&1 \
      || die "git clone llama.cpp gagal"
    pip install -q -r "$LLAMA/requirements/requirements-convert_hf_to_gguf.txt" >>"$LOG" 2>&1 \
      || die "pip requirements konversi gagal"
  fi
  say "[7/8] konversi HF -> gguf f16..."
  python3 "$LLAMA/convert_hf_to_gguf.py" "$MERGED" --outfile "$GGUF_F16" --outtype f16 >>"$LOG" 2>&1
  [ -s "$GGUF_F16" ] || { tail -20 "$LOG" | tee -a "$STATUS"; die "konversi gguf gagal"; }
  rm -rf "$MERGED"          # bebaskan 8 GB sebelum kuantisasi
  say "[7/8] build llama-quantize..."
  if [ ! -x "$LLAMA/build/bin/llama-quantize" ]; then
    cmake -B "$LLAMA/build" -S "$LLAMA" -DGGML_CUDA=OFF -DLLAMA_CURL=OFF >>"$LOG" 2>&1 \
      || die "cmake configure gagal"
    cmake --build "$LLAMA/build" --config Release -j --target llama-quantize >>"$LOG" 2>&1 \
      || die "build llama-quantize gagal"
  fi
  say "[7/8] kuantisasi -> Q4_K_M..."
  "$LLAMA/build/bin/llama-quantize" "$GGUF_F16" "$GGUF_Q4" q4_k_m >>"$LOG" 2>&1
  [ -s "$GGUF_Q4" ] || { tail -20 "$LOG" | tee -a "$STATUS"; die "kuantisasi gagal"; }
  rm -f "$GGUF_F16"
fi
say "[7/8] GGUF Q4_K_M: $(ls -lh "$GGUF_Q4" | awk '{print $5}')"

# ─────────────── 8. checksum + instruksi unduh ───────────────
say "[8/8] checksum (verifikasi keutuhan setelah unduh — F-091: unduhan besar pernah rusak diam-diam)"
sha256sum "$GGUF_Q4" /workspace/adapter.tgz | tee -a "$STATUS"
cp "$GGUF_Q4" /workspace/ 2>/dev/null
say ""
say "===== SELESAI. Unduh dari laptop (urut — adapter dulu, itu yang tak tergantikan): ====="
say "  scp -P <PORT> root@<HOST>:/workspace/adapter.tgz ."
say "  scp -P <PORT> root@<HOST>:/workspace/$(basename "$GGUF_Q4") ."
say "  scp -P <PORT> root@<HOST>:$STATUS ."
say "Lalu VERIFIKASI sha256 cocok SEBELUM menghapus instance."
