#!/usr/bin/env python
"""kemas_v12.py — jalan di instance vast: ubah adapter PEFT -> GGUF-LoRA.

TANPA latihan, TANPA memuat base model (itu titik macet run 10 — unduhan 8 GB
dari HF berhenti di 0%). convert_lora_to_gguf.py hanya butuh config base
(beberapa KB) lewat --base-model-id, plus adapter 126 MB yang kita bawa sendiri.

llama.cpp DIPAKU ke b10549 — tag yang GGUF-nya diterima Ollama 0.32.14.
Master 22 Agu sudah bergerak melewatinya (run 6 ditolak persis karena ini).
"""
import json
import subprocess
import sys
import time

t0 = time.time()
KERJA = "/workspace"

print("== [1/4] pustaka ==", flush=True)
# Pin dari latih_v12.py yang terbukti (lihat kegagalan #12 di kemas_merge.py).
# tanpa-pin: sentencepiece/gguf/protobuf murni-python & tak menyentuh torch;
# llama.cpp b10549 membawa gguf-py sendiri di jalur konversinya.
subprocess.run([sys.executable, "-m", "pip", "install", "-q",
                "transformers==4.51.3", "sentencepiece", "gguf", "protobuf"], check=True)

print("== [2/4] bongkar adapter ==", flush=True)
subprocess.run(f"cd {KERJA} && tar xzf lora.tgz", shell=True, check=True)
subprocess.run(f"ls -la {KERJA}/lora", shell=True, check=True)

print("== [3/4] llama.cpp b10549 ==", flush=True)
subprocess.run(f"git clone --depth 1 --branch b10549 https://github.com/ggml-org/llama.cpp {KERJA}/llama.cpp",
               shell=True, check=True)

print("== [4/4] konversi LoRA -> GGUF ==", flush=True)
# --base-model-id menarik config.json saja dari HF, bukan bobot.
subprocess.run(f"{sys.executable} {KERJA}/llama.cpp/convert_lora_to_gguf.py {KERJA}/lora "
               f"--base-model-id Qwen/Qwen3-4B-Instruct-2507 "
               f"--outfile {KERJA}/migancore-12-lora.gguf --outtype f16",
               shell=True, check=True)
subprocess.run(f"ls -la {KERJA}/migancore-12-lora.gguf", shell=True, check=True)

menit = round((time.time() - t0) / 60, 1)
json.dump({"menit": menit, "artefak": "migancore-12-lora.gguf", "pin": "b10549"},
          open(f"{KERJA}/ringkasan-kemas.json", "w"))
print(f"SELESAI dalam {menit} menit", flush=True)
