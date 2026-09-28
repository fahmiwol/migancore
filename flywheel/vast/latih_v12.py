#!/usr/bin/env python
"""
latih_v12.py — dijalankan DI DALAM instance vast.ai.

Sama resepnya dengan kernel Kaggle, tiga hal berbeda karena mesinnya berbeda:
  - satu GPU besar (24 GB), jadi tidak perlu device_map="auto" model-parallel
  - jalur berkas lokal, bukan /kaggle/input
  - dependensinya dipasang sendiri, dengan versi DIPAKU

Versi dipaku bukan kehati-hatian berlebihan. Run vast sebelumnya mati karena
transformers terbaru menabrak torch 2.4 di image ini; memakai "yang terbaru"
berarti hasilnya bergantung pada hari apa kita menjalankannya.

PENOPENGAN PROMPT — perubahan terpenting v12. Sampai v11 loss dihitung pada
SELURUH token, jadi 47% kapasitas latihan dipakai mengulang 14 kalimat baku
yang muncul 1.351 kali. Sekarang label prompt diisi -100, dan latihan BERHENTI
SENDIRI kalau penopengannya ternyata tidak bekerja — lebih baik mati di menit
pertama daripada membakar GPU sejam untuk hasil yang salah diam-diam.
"""
import json
import os
import subprocess
import sys
import time

t0 = time.time()
KERJA = "/workspace"
DATA = f"{KERJA}/migancore-curated.jsonl"
BASE = "Qwen/Qwen3-4B-Instruct-2507"
MAKS = 1024

print("== [1/7] pasang pustaka (versi DIPAKU) ==", flush=True)
# cmake TIDAK ada di image pytorch runtime. Run kelima mati di langkah GGUF
# karena ini - sesudah latihan SELESAI dan bobotnya sudah bagus. Dipasang di
# depan supaya kegagalannya jatuh di menit pertama, bukan di menit ke-14.
subprocess.run("apt-get update -qq && apt-get install -y -qq cmake build-essential git",
               shell=True, check=False)
# tanpa-pin: sentencepiece/gguf/protobuf murni-python & tak menyentuh torch;
# llama.cpp b10549 membawa gguf-py sendiri di jalur konversinya.
subprocess.run([sys.executable, "-m", "pip", "install", "-q",
                "transformers==4.51.3", "peft==0.14.0", "datasets==3.2.0",
                "accelerate==1.2.1", "sentencepiece", "gguf"], check=True)

import torch
from datasets import load_dataset
from transformers import (AutoModelForCausalLM, AutoTokenizer, Trainer,
                          TrainingArguments, DataCollatorForSeq2Seq)
from peft import LoraConfig, get_peft_model

print(f"   torch {torch.__version__} · {torch.cuda.get_device_name(0)} "
      f"({torch.cuda.get_device_properties(0).total_memory // 2**30} GB)", flush=True)

print("== [2/7] muat base fp16 ==", flush=True)
tok = AutoTokenizer.from_pretrained(BASE)
model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.float16, device_map={"": 0})
model.config.use_cache = False
model.gradient_checkpointing_enable()
model.enable_input_require_grads()
model = get_peft_model(model, LoraConfig(
    r=16, lora_alpha=32, lora_dropout=0.0, bias="none", task_type="CAUSAL_LM",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
))
model.print_trainable_parameters()

print("== [3/7] siapkan dataset + PENOPENGAN PROMPT ==", flush=True)
if not os.path.exists(DATA):
    raise SystemExit(f"dataset tidak ada: {DATA}")
PETA = {"system": "system", "human": "user", "gpt": "assistant"}


def olah(contoh):
    pesan = [{"role": PETA.get(m["from"], m["from"]), "content": m["value"]}
             for m in contoh["conversations"]]
    teks_penuh = tok.apply_chat_template(pesan, tokenize=False, add_generation_prompt=False)
    teks_prompt = tok.apply_chat_template(pesan[:-1], tokenize=False, add_generation_prompt=True)
    ids = tok(teks_penuh, truncation=True, max_length=MAKS, add_special_tokens=False)
    n_prompt = len(tok(teks_prompt, add_special_tokens=False)["input_ids"])
    label = list(ids["input_ids"])
    for i in range(min(n_prompt, len(label))):
        label[i] = -100                      # -100 = tidak dihitung dalam loss
    return {"input_ids": ids["input_ids"], "attention_mask": ids["attention_mask"], "labels": label}


ds = load_dataset("json", data_files=DATA, split="train").map(
    olah, remove_columns=["conversations", "id", "sumber"])
_tot = sum(len(x) for x in ds["input_ids"])
_latih = sum(sum(1 for t in x if t != -100) for x in ds["labels"])
print(f"   {len(ds)} baris · token rata2 {_tot // len(ds)}", flush=True)
print(f"   token DILATIH: {_latih}/{_tot} = {_latih / _tot * 100:.1f}% (sisanya prompt, ditopengi)", flush=True)
if _latih / _tot > 0.95:
    raise SystemExit("PENOPENGAN GAGAL: hampir semua token dilatih. Berhenti sebelum membakar GPU.")

print("== [4/7] latih ==", flush=True)
trainer = Trainer(
    model=model, train_dataset=ds,
    data_collator=DataCollatorForSeq2Seq(tok, label_pad_token_id=-100, padding=True),
    args=TrainingArguments(
        output_dir=f"{KERJA}/ckpt",
        per_device_train_batch_size=4, gradient_accumulation_steps=2,
        num_train_epochs=2, learning_rate=2e-4, warmup_steps=10,
        logging_steps=20, save_strategy="no", seed=42, fp16=True,
        optim="adamw_torch", lr_scheduler_type="cosine",
        report_to="none", gradient_checkpointing=True,
    ),
)
stat = trainer.train()
print(f"   loss akhir: {stat.training_loss:.4f}", flush=True)

print("== [5/7] SIMPAN ADAPTER DULU ==", flush=True)
# Pelajaran v14: latihan sukses lalu uji cium crash SEBELUM save -> bobot hangus.
model.save_pretrained(f"{KERJA}/lora")
tok.save_pretrained(f"{KERJA}/lora")
print("   adapter aman", flush=True)

print("== [6/7] merge (di GPU, bukan CPU) ==", flush=True)
# Run kedelapan TERSANGKUT 77 menit di sini. Versi lama membuang model dari GPU
# lalu memuat ulang base fp16 di CPU untuk di-merge. Di host dengan RAM sistem
# pas-pasan, itu bertukar ke disk dan merangkak — prosesnya HIDUP tapi tidak
# maju, jadi pemantau pun tidak melihatnya sebagai kegagalan.
#
# Modelnya sudah ada di GPU dengan bobot LoRA terpasang. Menggabungkannya di
# tempat jauh lebih cepat dan tidak menyentuh RAM sistem sama sekali. Langkah
# yang paling aman adalah langkah yang tidak perlu dikerjakan.
del trainer
torch.cuda.empty_cache()
merged = model.merge_and_unload()
merged.save_pretrained(f"{KERJA}/merged", safe_serialization=True)
tok.save_pretrained(f"{KERJA}/merged")
del model, merged
torch.cuda.empty_cache()
print("   merged tersimpan", flush=True)

print("== [7/7] GGUF q4_k_m ==", flush=True)
# Bobot yang sudah dilatih dan di-merge SUDAH berharga. Kalau konversi GGUF
# gagal, itu soal kemasan - bukan alasan membuang hasil latihan. Run kelima
# kehilangan bobot bagus karena kegagalan di langkah ini menghentikan seluruh
# skrip sebelum ringkasan ditulis.
gguf_ok = True
try:
    # llama.cpp DIPAKU ke rilis, bukan master. Run keenam menghasilkan GGUF yang
    # DITOLAK Ollama 0.32.14 ("failed to validate GGUF with llama-quantize")
    # karena master 22 Agu sudah bergerak melewati apa yang Ollama terima.
    # v11 dibuat 21 Agu dan diterima; b10549 rilis terakhir hari itu.
    # Menarik master berarti hasilnya bergantung pada tanggal menjalankannya —
    # persis alasan yang sama kenapa versi pustaka lain sudah dipaku.
    subprocess.run(f"git clone --depth 1 --branch b10549 https://github.com/ggml-org/llama.cpp {KERJA}/llama.cpp",
                   shell=True, check=True)
    subprocess.run(f"{sys.executable} {KERJA}/llama.cpp/convert_hf_to_gguf.py {KERJA}/merged "
                   f"--outfile {KERJA}/migancore-12-f16.gguf --outtype f16", shell=True, check=True)
    subprocess.run(f"cmake -B {KERJA}/llama.cpp/build {KERJA}/llama.cpp -DGGML_CUDA=OFF && "
                   f"cmake --build {KERJA}/llama.cpp/build --target llama-quantize -j 8",
                   shell=True, check=True)
    subprocess.run(f"{KERJA}/llama.cpp/build/bin/llama-quantize {KERJA}/migancore-12-f16.gguf "
                   f"{KERJA}/migancore-12-q4_k_m.gguf q4_k_m", shell=True, check=True)
    os.remove(f"{KERJA}/migancore-12-f16.gguf")
except Exception as e:
    gguf_ok = False
    print(f"   GGUF GAGAL ({type(e).__name__}) - bobot tetap aman di /workspace/lora dan /workspace/merged", flush=True)

menit = round((time.time() - t0) / 60, 1)
json.dump({"loss": stat.training_loss, "baris": len(ds), "menit": menit,
           "tokenDilatihPersen": round(_latih / _tot * 100, 1), "gguf": gguf_ok},
          open(f"{KERJA}/ringkasan.json", "w"))
print(f"SELESAI dalam {menit} menit · GGUF: {'siap' if gguf_ok else 'GAGAL, pakai adapter'}", flush=True)
