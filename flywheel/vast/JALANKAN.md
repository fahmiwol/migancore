# Naik ke vast.ai — run 8B serius (SETELAH Kaggle lolos)

Urutan Fahmi: **buktikan di Kaggle → naikkan base → pindah vast.ai.** Jalur ini
BARU dinyalakan setelah resep 4B lolos gerbang eval di Kaggle. Menyalakan GPU
berbayar untuk coba-coba = boros saldo.

Saldo per 20 Agu: **$5,10** (VISA …6262 terpasang — **JANGAN nyalakan auto
top-up**). RTX 3090 24GB ≈ $0,2–0,3/jam → ±20 jam. Cukup untuk 2–3 run 8B.

## Langkah

```bash
export PATH="$PATH:$HOME/AppData/Roaming/Python/Python312/Scripts"

# 1. sewa RTX 3090 termurah (verified, disk >=60GB, image PyTorch)
vastai search offers 'gpu_name=RTX_3090 num_gpus=1 rentable=true verified=true disk_space>=60' -o dph | head
vastai create instance <ID> --image pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime \
  --disk 60 --onstart-cmd "sleep infinity"

# 2. tunggu status running
vastai show instances

# 3. salin skrip + kredensial Kaggle, lalu jalankan
vastai copy ./flywheel/vast/train_8b.py <INSTANCE_ID>:/workspace/
vastai copy ~/.kaggle-migancore/kaggle.json <INSTANCE_ID>:/root/.kaggle/
vastai execute <INSTANCE_ID> "cd /workspace && nohup python train_8b.py > train.log 2>&1 &"

# 4. pantau
vastai execute <INSTANCE_ID> "tail -40 /workspace/train.log"

# 5. ambil hasil
vastai copy <INSTANCE_ID>:/workspace/migancore-08-8b-q4_k_m.gguf ./models/

# 6. WAJIB — matikan begitu selesai (kalau tidak, saldo terus terpotong)
vastai destroy instance <INSTANCE_ID>
```

## Gerbang eval (sama dengan Kaggle)

```bash
ollama create migancore:0.8-8b -f Modelfile   # FROM ./migancore-08-8b-q4_k_m.gguf
node ./eval/uji-halusinasi.mjs migancore:0.8-8b polos
```
Lulus bila: jebakan ≥12/14 **dan** fakta ≥5/6 **dan** domain ≥3/4. Bandingkan
dengan 4B — kalau 8B tidak lebih baik pada nalar, tetap 4B (lebih murah di-serve).

## Kenapa 8B di sini, bukan Kaggle
Riset 2026: bf16 LoRA 8B ~22GB (mepet 2×T4 terpisah), QLoRA 4-bit 8B muat nyaman
di satu 3090 24GB. `train_8b.py` sudah membawa semua pelajaran Kaggle: cabut
torchao, glob dataset, GGUF berpagar.
