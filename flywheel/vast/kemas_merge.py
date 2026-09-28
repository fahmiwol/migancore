#!/usr/bin/env python
"""kemas_merge.py — jalan di instance vast: merge adapter ke base -> GGUF q4_k_m.

Dipakai untuk MEMISAHKAN HIPOTESIS, bukan sekadar mengemas: adapter yang sama
diukur lewat dua jalur artefak (runtime-LoRA vs merged-GGUF). Kalau keduanya
rusak, bobotnya yang gagal; kalau hanya runtime-LoRA yang rusak, artefaknya.

Blok merge+GGUF diangkat dari latih_v12.py yang sudah terbukti (run 6),
llama.cpp DIPAKU b10549. Risiko yang diketahui: unduhan base ~8 GB dari HF
pernah macet 0% (run 10) — pengawal diam di sisi lokal yang menanganinya.
"""
import json
import subprocess
import sys
import time

t0 = time.time()
KERJA = "/workspace"
BASE = "Qwen/Qwen3-4B-Instruct-2507"

print("== [1/5] alat & pustaka ==", flush=True)
subprocess.run("apt-get update -qq && apt-get install -y -qq cmake build-essential git",
               shell=True, check=True)
# Pin PERSIS dari latih_v12.py yang terbukti di image ini — kegagalan #12
# (22 Agu): transformers TERBARU menabrak torch 2.4 (NameError tensor_parallel),
# persis seperti yang docstring latih_v12 peringatkan. Jangan tulis ulang resep
# yang sudah terbukti — salin.
# tanpa-pin: sentencepiece/gguf/protobuf murni-python & tak menyentuh torch;
# llama.cpp b10549 membawa gguf-py sendiri di jalur konversinya.
subprocess.run([sys.executable, "-m", "pip", "install", "-q",
                "transformers==4.51.3", "peft==0.14.0", "accelerate==1.2.1",
                "sentencepiece", "gguf", "protobuf"], check=True)

print("== [2/5] bongkar adapter ==", flush=True)
subprocess.run(f"cd {KERJA} && tar xzf lora.tgz", shell=True, check=True)

print("== [3/5] muat base + merge (di GPU) ==", flush=True)
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

tok = AutoTokenizer.from_pretrained(BASE)
model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.bfloat16, device_map="cuda")
model = PeftModel.from_pretrained(model, f"{KERJA}/lora")
merged = model.merge_and_unload()
merged.save_pretrained(f"{KERJA}/merged", safe_serialization=True)
tok.save_pretrained(f"{KERJA}/merged")
del model, merged
torch.cuda.empty_cache()
print("   merged tersimpan", flush=True)

print("== [4/5] uji cium SEBELUM kemas ==", flush=True)
# Pelajaran hari ini: artefak diuji DULU dengan pertanyaan sepele di jalur
# aslinya (transformers), supaya kalau GGUF nanti rusak kita tahu rusaknya
# di kemasan, bukan di bobot.
from transformers import pipeline
m2 = AutoModelForCausalLM.from_pretrained(f"{KERJA}/merged", torch_dtype=torch.bfloat16, device_map="cuda")
pesan = [{"role": "user", "content": "19 ton itu berapa kg? Jawab singkat."}]
masuk = tok.apply_chat_template(pesan, tokenize=False, add_generation_prompt=True)
ids = tok(masuk, return_tensors="pt").to("cuda")
keluar = m2.generate(**ids, max_new_tokens=60, do_sample=False)
jawab = tok.decode(keluar[0][ids["input_ids"].shape[1]:], skip_special_tokens=True)
print(f"   cium: {jawab[:200]!r}", flush=True)
cium_ok = "19.000" in jawab or "19000" in jawab or "19 000" in jawab
print(f"   cium_ok={cium_ok}", flush=True)
del m2
torch.cuda.empty_cache()

print("== [5/5] GGUF q4_k_m (b10549) ==", flush=True)
gguf_ok = True
try:
    subprocess.run(f"git clone --depth 1 --branch b10549 https://github.com/ggml-org/llama.cpp {KERJA}/llama.cpp",
                   shell=True, check=True)
    subprocess.run(f"{sys.executable} {KERJA}/llama.cpp/convert_hf_to_gguf.py {KERJA}/merged "
                   f"--outfile {KERJA}/migancore-12-f16.gguf --outtype f16", shell=True, check=True)
    subprocess.run(f"cmake -B {KERJA}/llama.cpp/build {KERJA}/llama.cpp -DGGML_CUDA=OFF && "
                   f"cmake --build {KERJA}/llama.cpp/build --target llama-quantize -j 8",
                   shell=True, check=True)
    subprocess.run(f"{KERJA}/llama.cpp/build/bin/llama-quantize {KERJA}/migancore-12-f16.gguf "
                   f"{KERJA}/migancore-12-merged-q4_k_m.gguf q4_k_m", shell=True, check=True)
    import os
    os.remove(f"{KERJA}/migancore-12-f16.gguf")
except Exception as e:
    gguf_ok = False
    print(f"   GGUF GAGAL ({type(e).__name__}) - merged tetap aman di /workspace/merged", flush=True)

menit = round((time.time() - t0) / 60, 1)
json.dump({"menit": menit, "cium_ok": cium_ok, "gguf": gguf_ok,
           "artefak": "migancore-12-merged-q4_k_m.gguf", "pin": "b10549"},
          open(f"{KERJA}/ringkasan-kemas.json", "w"))
print(f"SELESAI dalam {menit} menit", flush=True)
