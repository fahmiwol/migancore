#!/bin/bash
# vast_tahap6_8_venv.sh — merge -> GGUF f16 -> Q4_K_M -> checksum, memakai VENV TERISOLASI.
#
# Kenapa terpisah dari vast_pilot_pipeline.sh: pada run 2026-07-27 lingkungan Python bersama
# rusak di tengah jalan (pip install requirements llama.cpp menimpa torch cu124 dengan
# torch 2.11 cpu -> peft mati). Menambal skrip pipeline yang SEDANG berjalan berbahaya —
# bash membaca berkas bertahap dari offset — jadi tahap 6-8 dijalankan dari berkas BARU
# dengan interpreter yang sehat. Adapter sudah aman diarsipkan di tahap 5 sebelum ini.
#
# Pakai: bash vast_tahap6_8_venv.sh
set -uo pipefail

ROOT=/workspace/local-train
CFG=$ROOT/configs/vast_gpu_besar.json
ADAPTER=$ROOT/$(python3 -c "import json;print(json.load(open('$CFG'))['output_dir'])" 2>/dev/null || echo "adapters/pilot15_seimbang")
MERGED=$ROOT/merged_fp16
GGUF_F16=$ROOT/migancore-pilot-f16.gguf
GGUF_Q4=$ROOT/migancore-pilot.q4_k_m.gguf
LLAMA=/workspace/llama.cpp
PY=/workspace/mergevenv/bin/python
STATUS=$ROOT/PIPELINE_STATUS.txt
LOG=$ROOT/tahap6_8.log

say(){ echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "$STATUS"; }
die(){ say "FATAL: $*"; exit 1; }

say "===== TAHAP 6-8 (venv terisolasi) ====="
[ -x "$PY" ] || die "venv tidak ada di $PY"
"$PY" -c "import torch,transformers,peft;print('venv:','torch',torch.__version__,'tf',transformers.__version__,'peft',peft.__version__)" \
  2>&1 | tee -a "$STATUS" || die "venv tidak sehat"
[ -s "$ADAPTER/adapter_model.safetensors" ] || die "adapter tidak ada di $ADAPTER"
say "adapter: $(ls -lh "$ADAPTER/adapter_model.safetensors" | awk '{print $5}')"

# ─────────────── 6. merge fp16 ───────────────
if [ ! -s "$MERGED/config.json" ]; then
  say "[6/8] merge adapter ke base fp16 (CPU, RAM lega)..."
  "$PY" - >>"$LOG" 2>&1 <<PY
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
  grep -q "MERGE DONE" "$LOG" || { tail -25 "$LOG" | tee -a "$STATUS"; die "merge gagal"; }
fi
say "[6/8] merged fp16 siap: $(du -sh "$MERGED" | cut -f1)"

# ─────────────── 7. GGUF f16 -> Q4_K_M ───────────────
# Q4_K_M WAJIB — baseline migancore:0.4-qwen3 juga Q4_K_M. Quant berbeda akan mencampur
# 'efek training' dengan 'efek kuantisasi' dan membuat McNemar tak bermakna.
if [ ! -s "$GGUF_Q4" ]; then
  say "[7/8] konversi HF -> gguf f16..."
  "$PY" "$LLAMA/convert_hf_to_gguf.py" "$MERGED" --outfile "$GGUF_F16" --outtype f16 >>"$LOG" 2>&1
  [ -s "$GGUF_F16" ] || { tail -25 "$LOG" | tee -a "$STATUS"; die "konversi gguf gagal"; }
  say "[7/8] f16: $(ls -lh "$GGUF_F16" | awk '{print $5}') — bebaskan merged sebelum kuantisasi"
  rm -rf "$MERGED"
  [ -x "$LLAMA/build/bin/llama-quantize" ] || die "llama-quantize belum dibangun"
  say "[7/8] kuantisasi -> Q4_K_M..."
  "$LLAMA/build/bin/llama-quantize" "$GGUF_F16" "$GGUF_Q4" q4_k_m >>"$LOG" 2>&1
  [ -s "$GGUF_Q4" ] || { tail -25 "$LOG" | tee -a "$STATUS"; die "kuantisasi gagal"; }
  rm -f "$GGUF_F16"
fi
say "[7/8] GGUF Q4_K_M: $(ls -lh "$GGUF_Q4" | awk '{print $5}')"

# ─────────────── 8. checksum + siapkan unduhan ───────────────
cp -f "$GGUF_Q4" /workspace/ 2>/dev/null
say "[8/8] checksum (F-091: unduhan besar pernah rusak diam-diam)"
sha256sum /workspace/$(basename "$GGUF_Q4") /workspace/adapter.tgz 2>/dev/null | tee -a "$STATUS"
say "===== TAHAP 6-8 SELESAI — Lalu VERIFIKASI sha256 sebelum menghapus instance ====="
