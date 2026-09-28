# local-train — pipeline training MiganCore di GPU laptop

Training lokal di **RTX 3060 Laptop 6 GB**, dibuat setelah VPS KVM8 tidak diperpanjang
(RunPod/Vast tidak lagi jadi satu-satunya jalan, dan biayanya $0).

## ⚠️ Baca ini dulu — jangan langsung train

Metode + gate + larangan ada di **[`docs/jarvis/73_LOCAL_TRAINING_METHOD.md`](../docs/jarvis/73_LOCAL_TRAINING_METHOD.md)**.
Doktrin yang mengikat (urutan baca):

1. `docs/jarvis/HANDOFF.md` — checkpoint + ANCHOR permanen
2. `docs/jarvis/MIGANCORE_MODEL_CHANGELOG.md` — **SSOT lineage** (base kanonik + versi produksi)
3. `docs/jarvis/32_TRAINING_DOCTRINE.md` — doktrin penuh (guardrail §2.3, eval-gate §6.1)
4. `docs/jarvis/67_TRAINING_RECIPE_ALIGNMENT.md` — daftar WAJIB / JANGAN
5. `docs/jarvis/52_CYCLE15_TRAINING_RECIPE.md` — rambu keras
6. `docs/logs/IDENTITY_COLLAPSE_INCIDENT_2026-05-12.md` — kenapa semua aturan itu ada

**JANGAN pakai `TRAINING_README.md` di root repo** — arsip Mei-2026, bertentangan dengan
doktrin sekarang (Qwen2.5-7B, α=128, rollback ke 0.7c).

Fakta yang paling sering salah diingat:

| | |
|---|---|
| Base kanonik | **Qwen3-4B-Instruct-2507** |
| Produksi | **`migancore:0.4-qwen3`** (`DEFAULT_MODEL` di env produksi) |
| Recipe | **LOCKED**: `r=64 α=64 lr=2e-4 3ep`, base frozen, LoRA-only |
| `0.7c` / `0.8` | generasi Qwen2.5-7B Mei-2026, **arsip**, purged dari produksi — bukan lineage sekarang |
| Identity data | **JENUH** (~301 pair) — jangan ditambah |

## Isi

| Berkas | Peran |
|---|---|
| `scripts/00_setup_env.ps1` | Bikin venv Python 3.12 + torch CUDA + pustaka. Idempoten. |
| `scripts/lib/check_env.py` | Laporan lingkungan (GPU/VRAM/versi/disk). Exit 1 kalau belum siap. |
| `scripts/01_prepare_data.py` | Normalisasi 3 format → chat kanonik, dedup lintas-file, split, **gate anti-bocor**. |
| `scripts/02_train_lora.py` | Trainer QLoRA: masking multi-turn, dynamic padding, preflight VRAM, ledger run. |
| `scripts/03_eval_identity.py` | Gate identitas: identity / immunity / coherence, termasuk probe **tanpa system prompt**. |
| `configs/qwen1_5b_identity.json` | ⚠️ **HARNESS BENCHMARK saja** — bukan lineage, bukan kandidat produksi. |
| `LESSONS.md` | Catatan kegagalan + akar masalah, ditulis saat terjadi. |
| `runs/ledger.jsonl` | Riwayat tiap run: config, GPU, loss, peak VRAM, durasi. |

## Cara pakai

```powershell
# 1. sekali saja — bikin lingkungan
powershell -ExecutionPolicy Bypass -File scripts\00_setup_env.ps1

# 2. cek lingkungan kapan pun
.venv\Scripts\python.exe scripts\lib\check_env.py

# 3. siapkan data (stdlib saja, tak butuh venv)
.venv\Scripts\python.exe scripts\01_prepare_data.py --raw data\raw --out data\prepared

# 4. smoke test dulu — 10 step, ukur VRAM, JANGAN langsung full run
.venv\Scripts\python.exe scripts\02_train_lora.py --config configs\<config>.json --smoke

# 5. eval SELALU dibandingkan dengan baseline
.venv\Scripts\python.exe scripts\03_eval_identity.py --config configs\<config>.json --adapter runs\<run>\adapter
```

Sebelum training: matikan `sd-server.exe` (memakan ~1,8 GB VRAM). Cek pemakai VRAM:

```bash
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv
```
