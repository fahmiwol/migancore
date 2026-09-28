#!/usr/bin/env python3
"""
02_train_lora.py — LoRA SFT MiganCore di GPU lokal (RTX 3060 6 GB).

Turunan dari scripts/cpu_train_lora_v2.py (versi CPU di VPS lama), dengan perbaikan:
  * label masking multi-turn yang benar (versi lama hanya benar untuk 1 giliran)
  * dynamic padding per-batch (versi lama pad ke max_length → boros 3-6x komputasi)
  * preflight VRAM: berhenti lebih awal dengan pesan jelas, bukan OOM di tengah jalan
  * catat peak VRAM + hasil ke runs/ledger.jsonl supaya eksperimen bisa dibandingkan
  * seed penuh + config JSON → run bisa diulang persis

Pakai:
    .venv\\Scripts\\python.exe scripts\\02_train_lora.py --config configs\\qwen1_5b_identity.json
    .venv\\Scripts\\python.exe scripts\\02_train_lora.py --config ... --smoke   # 10 step, cek VRAM
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset

ROOT = Path(__file__).resolve().parent.parent


# ────────────────────────────── util ──────────────────────────────

def log(msg: str, logfile: Path | None = None) -> None:
    """Cetak + simpan log. TAHAN encoding console Windows.

    2026-07-27: smoke test mati di detik ke-30 karena `print()` melempar
    UnicodeEncodeError pada karakter '→' — stdout Windows default cp1252, dan
    itu MEMBUNUH proses training di tengah jalan. Sebuah panah dekoratif tidak
    boleh menjatuhkan run berjam-jam. Berkas log tetap UTF-8 penuh; hanya
    tampilan console yang diturunkan bila terminalnya tidak sanggup.
    """
    line = "[%s] %s" % (datetime.now().strftime("%H:%M:%S"), msg)
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        enc = (getattr(sys.stdout, "encoding", None) or "ascii")
        print(line.encode(enc, "replace").decode(enc, "replace"), flush=True)
    if logfile:
        with open(logfile, "a", encoding="utf-8") as f:
            f.write(line + "\n")


def set_seed_all(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def gpu_state() -> dict:
    if not torch.cuda.is_available():
        return {"tersedia": False}
    free, total = torch.cuda.mem_get_info()
    return {
        "tersedia": True,
        "nama": torch.cuda.get_device_name(0),
        "total_gb": round(total / 1024**3, 2),
        "bebas_gb": round(free / 1024**3, 2),
        "terpakai_proses_lain_gb": round((total - free) / 1024**3, 2),
        "compute_capability": ".".join(map(str, torch.cuda.get_device_capability(0))),
    }


# ─────────────────────── dataset + label masking ───────────────────────

def _ids_dari_template(out):
    """Normalkan hasil apply_chat_template jadi list[int].

    2026-07-27 (Vast): `pip install "transformers>=4.45"` menarik **5.14.1**, dan di
    transformers 5.x `apply_chat_template(tokenize=True)` mengembalikan `BatchEncoding`
    (dict), bukan list token seperti di 4.x. Akibatnya `len(ids)` menghitung JUMLAH KUNCI
    (= 2), seluruh label jadi kosong, dan **2.667 dari 2.667 contoh dibuang** — tanpa satu
    pun pesan yang menyebut-nyebut versi pustaka.

    Kegagalannya kebetulan berisik (penjaga "0 contoh train" menangkapnya di detik ke-9),
    tapi bentuk lain dari bug yang sama bisa membuang SEBAGIAN data secara diam-diam —
    karena itu ada pula penjaga rasio di bawah.
    """
    if hasattr(out, "input_ids"):
        out = out.input_ids
    elif isinstance(out, dict):
        out = out["input_ids"]
    if len(out) and isinstance(out[0], (list, tuple)):
        out = out[0]          # batch berukuran 1
    return list(out)


class ChatSFTDataset(Dataset):
    """Tokenisasi chat template Qwen dengan loss HANYA pada token jawaban assistant.

    Kenapa penting: kalau prompt ikut dihitung loss, model belajar meniru pertanyaan
    pengguna, bukan menjawabnya — dan pada dataset identitas efeknya parah karena
    pertanyaannya berulang ("Siapa kamu?").

    Cara masking: untuk setiap giliran assistant ke-i, panjang token dari
    apply_chat_template(messages[:i], add_generation_prompt=True) menandai batas
    awal jawaban. Semua sebelum batas itu diberi label -100. Ini benar juga untuk
    percakapan multi-giliran, bukan hanya satu giliran.
    """

    def __init__(self, path: Path, tokenizer, max_len: int, default_system: str | None):
        self.tok = tokenizer
        self.max_len = max_len
        self.rows: list[dict] = []
        n_trunc = 0
        n_no_label = 0

        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                msgs = json.loads(line)["messages"]
                # Sisipkan system default HANYA bila contoh ini memang tak punya.
                # Campuran "ada system" + "tanpa system" disengaja: model harus tetap
                # mengaku MiganCore walau system prompt-nya dihapus lawan bicara.
                if default_system and not any(m["role"] == "system" for m in msgs):
                    msgs = [{"role": "system", "content": default_system}] + msgs

                ids = _ids_dari_template(
                    self.tok.apply_chat_template(msgs, tokenize=True, add_generation_prompt=False))
                labels = [-100] * len(ids)

                for i, m in enumerate(msgs):
                    if m["role"] != "assistant":
                        continue
                    prefix = _ids_dari_template(
                        self.tok.apply_chat_template(msgs[:i], tokenize=True, add_generation_prompt=True))
                    full = _ids_dari_template(
                        self.tok.apply_chat_template(msgs[: i + 1], tokenize=True, add_generation_prompt=False))
                    start, end = len(prefix), min(len(full), len(ids))
                    for j in range(start, end):
                        labels[j] = ids[j]

                if len(ids) > max_len:
                    ids, labels = ids[:max_len], labels[:max_len]
                    n_trunc += 1
                if all(l == -100 for l in labels):
                    n_no_label += 1
                    continue
                self.rows.append({"input_ids": ids, "labels": labels})

        self.stats = {"jumlah": len(self.rows), "terpotong": n_trunc, "dibuang_tanpa_label": n_no_label}

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        return self.rows[i]


class PadCollator:
    """Pad ke panjang terpanjang DALAM BATCH (bukan ke max_len global)."""

    def __init__(self, pad_id: int):
        self.pad_id = pad_id

    def __call__(self, batch):
        n = max(len(b["input_ids"]) for b in batch)
        ids, labels, mask = [], [], []
        for b in batch:
            k = n - len(b["input_ids"])
            ids.append(b["input_ids"] + [self.pad_id] * k)
            labels.append(b["labels"] + [-100] * k)
            mask.append([1] * len(b["input_ids"]) + [0] * k)
        return {
            "input_ids": torch.tensor(ids, dtype=torch.long),
            "labels": torch.tensor(labels, dtype=torch.long),
            "attention_mask": torch.tensor(mask, dtype=torch.long),
        }


# ────────────────────────────── training ──────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--smoke", action="store_true", help="10 step saja — untuk mengukur VRAM & memastikan pipa jalan")
    ap.add_argument("--resume", default=None, help="path checkpoint untuk melanjutkan")
    args = ap.parse_args()

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    run_name = cfg["run_name"] + ("_smoke" if args.smoke else "")
    out_dir = ROOT / "runs" / run_name
    out_dir.mkdir(parents=True, exist_ok=True)
    logfile = out_dir / "train.log"

    set_seed_all(cfg.get("seed", 42))

    log("=" * 64, logfile)
    log("MiganCore LoRA — %s" % run_name, logfile)
    log("=" * 64, logfile)

    g = gpu_state()
    log("GPU: %s" % json.dumps(g, ensure_ascii=False), logfile)
    if not g["tersedia"]:
        log("FATAL: CUDA tidak tersedia. Jalankan scripts/00_setup_env.ps1 dan pakai .venv.", logfile)
        return 2

    butuh = cfg.get("min_free_vram_gb", 4.0)
    if g["bebas_gb"] < butuh:
        log("FATAL: VRAM bebas %.2f GB < %.2f GB yang dibutuhkan." % (g["bebas_gb"], butuh), logfile)
        log("       Proses lain memakai %.2f GB. Tutup dulu (mis. sd-server.exe / browser GPU-berat)," % g["terpakai_proses_lain_gb"], logfile)
        log("       cek dengan: nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv", logfile)
        return 2

    from transformers import (AutoModelForCausalLM, AutoTokenizer, Trainer,
                              TrainingArguments, set_seed)
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

    set_seed(cfg.get("seed", 42))
    base = cfg["base_model"]

    log("memuat tokenizer: %s" % base, logfile)
    tok = AutoTokenizer.from_pretrained(base, trust_remote_code=True)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    system_prompt = cfg.get("system_prompt") or None
    data_dir = ROOT / cfg.get("data_dir", "data/prepared")
    train_ds = ChatSFTDataset(data_dir / "train.jsonl", tok, cfg["max_seq_len"], system_prompt)
    eval_ds = ChatSFTDataset(data_dir / "eval.jsonl", tok, cfg["max_seq_len"], system_prompt)
    log("data train: %s" % train_ds.stats, logfile)
    log("data eval : %s" % eval_ds.stats, logfile)
    if train_ds.stats["jumlah"] == 0:
        log("FATAL: 0 contoh train yang punya label.", logfile)
        log("       Periksa versi transformers: 5.x mengubah kembalian apply_chat_template", logfile)
        log("       jadi BatchEncoding. Lingkungan tervalidasi = transformers 4.57.6.", logfile)
        return 2
    # Penjaga kehilangan data SENYAP: bentuk lain dari bug template bisa membuang
    # sebagian contoh saja, dan training tetap "berhasil" di atas data yang menyusut.
    _buang = train_ds.stats["dibuang_tanpa_label"]
    _total = _buang + train_ds.stats["jumlah"]
    if _total and _buang / _total > 0.05:
        log("FATAL: %d/%d contoh (%.1f%%) dibuang karena tanpa label — di atas ambang 5%%."
            % (_buang, _total, 100.0 * _buang / _total), logfile)
        log("       Ini kehilangan data senyap; jangan latih di atas dataset yang menyusut.", logfile)
        return 2

    # sanity: berapa persen token yang benar-benar dilatih
    tot = sum(len(r["input_ids"]) for r in train_ds.rows)
    sup = sum(sum(1 for l in r["labels"] if l != -100) for r in train_ds.rows)
    log("token dilatih: %d / %d (%.1f%%) — sisanya prompt yang di-mask" % (sup, tot, 100.0 * sup / tot), logfile)
    if sup / tot > 0.9:
        log("PERINGATAN: >90%% token dilatih — masking mungkin tidak bekerja. Periksa chat template.", logfile)

    load_4bit = bool(cfg.get("load_in_4bit", False))
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    log("memuat model (%s, 4bit=%s)" % (str(dtype).replace("torch.", ""), load_4bit), logfile)

    kw = {"dtype": dtype, "trust_remote_code": True, "device_map": {"": 0}}
    if load_4bit:
        from transformers import BitsAndBytesConfig
        kw["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=dtype, bnb_4bit_use_double_quant=True)

    t0 = time.time()
    model = AutoModelForCausalLM.from_pretrained(base, **kw)
    log("model dimuat dalam %.1f detik" % (time.time() - t0), logfile)

    model.config.use_cache = False
    if load_4bit:
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=cfg.get("gradient_checkpointing", True))
    if cfg.get("gradient_checkpointing", True):
        model.gradient_checkpointing_enable()
        model.enable_input_require_grads()

    lora = LoraConfig(
        r=cfg["lora_r"], lora_alpha=cfg["lora_alpha"], lora_dropout=cfg.get("lora_dropout", 0.05),
        bias="none", task_type="CAUSAL_LM", target_modules=cfg["target_modules"])
    model = get_peft_model(model, lora)
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    log("LoRA r=%d alpha=%d → parameter dilatih %s (%.3f%% dari %s)"
        % (cfg["lora_r"], cfg["lora_alpha"], f"{trainable:,}", 100 * trainable / total, f"{total:,}"), logfile)

    steps_per_epoch = max(1, math.ceil(len(train_ds) / (cfg["batch_size"] * cfg["grad_accum"])))
    targs = TrainingArguments(
        output_dir=str(out_dir),
        num_train_epochs=(1 if args.smoke else cfg["epochs"]),
        max_steps=(10 if args.smoke else -1),
        per_device_train_batch_size=cfg["batch_size"],
        per_device_eval_batch_size=cfg["batch_size"],
        gradient_accumulation_steps=cfg["grad_accum"],
        learning_rate=cfg["learning_rate"],
        lr_scheduler_type=cfg.get("lr_scheduler", "cosine"),
        warmup_ratio=cfg.get("warmup_ratio", 0.06),
        weight_decay=cfg.get("weight_decay", 0.0),
        max_grad_norm=cfg.get("max_grad_norm", 1.0),
        logging_steps=cfg.get("logging_steps", 5),
        eval_strategy=("no" if args.smoke else "epoch"),
        save_strategy=("no" if args.smoke else "epoch"),
        save_total_limit=2,
        bf16=(dtype == torch.bfloat16),
        fp16=(dtype == torch.float16),
        optim=cfg.get("optim", "adamw_torch"),
        gradient_checkpointing=cfg.get("gradient_checkpointing", True),
        report_to=[],
        seed=cfg.get("seed", 42),
        dataloader_num_workers=0,   # Windows: worker>0 sering bikin masalah spawn
    )

    trainer = Trainer(model=model, args=targs, train_dataset=train_ds,
                      eval_dataset=(None if args.smoke else eval_ds),
                      data_collator=PadCollator(tok.pad_token_id))

    torch.cuda.reset_peak_memory_stats()
    log("mulai training — %d step/epoch, batch efektif %d"
        % (steps_per_epoch, cfg["batch_size"] * cfg["grad_accum"]), logfile)
    t_start = time.time()
    result = trainer.train(resume_from_checkpoint=args.resume)
    durasi = time.time() - t_start
    peak = torch.cuda.max_memory_allocated() / 1024**3
    reserved = torch.cuda.max_memory_reserved() / 1024**3

    metrics = dict(result.metrics)
    eval_metrics = {}
    if not args.smoke:
        eval_metrics = trainer.evaluate()
        log("eval: %s" % json.dumps({k: round(v, 4) for k, v in eval_metrics.items() if isinstance(v, (int, float))}), logfile)

    if not args.smoke:
        # 2026-07-27: config punya field "output_dir" yang SEBELUMNYA TIDAK PERNAH DIBACA —
        # adapter selalu mendarat di runs/<run_name>/adapter sementara runbook menyuruh
        # mengambilnya dari adapters/. Di instance sewaan itu berarti tar kosong lalu
        # instance dihapus = hasil training hilang. Field config yang diabaikan diam-diam
        # adalah kelas bug F-034; dihormati sekarang, dengan default perilaku lama.
        adapter_dir = Path(cfg["output_dir"]) if cfg.get("output_dir") else (out_dir / "adapter")
        if not adapter_dir.is_absolute():
            adapter_dir = ROOT / adapter_dir
        adapter_dir.mkdir(parents=True, exist_ok=True)
        model.save_pretrained(str(adapter_dir))
        tok.save_pretrained(str(adapter_dir))
        log("adapter tersimpan -> %s" % adapter_dir, logfile)
        bukti = adapter_dir / "adapter_model.safetensors"
        if not (bukti.exists() and bukti.stat().st_size > 0):
            log("FATAL: %s tidak terbentuk — JANGAN hapus instance sebelum ini ada." % bukti, logfile)
            return 3

    log("selesai dalam %.1f menit | peak VRAM %.2f GB (reserved %.2f GB)" % (durasi / 60, peak, reserved), logfile)

    entry = {
        "waktu": datetime.now(timezone.utc).isoformat(),
        "run": run_name,
        "smoke": args.smoke,
        "config": cfg,
        "gpu": g,
        "host": platform.node(),
        "data": {"train": train_ds.stats, "eval": eval_ds.stats, "rasio_token_dilatih": round(sup / tot, 4)},
        "hasil": {
            "train_loss": round(metrics.get("train_loss", float("nan")), 4),
            "eval_loss": round(eval_metrics.get("eval_loss", float("nan")), 4) if eval_metrics else None,
            "menit": round(durasi / 60, 2),
            "peak_vram_gb": round(peak, 2),
            "reserved_vram_gb": round(reserved, 2),
            "parameter_dilatih": trainable,
        },
    }
    ledger = ROOT / "runs" / "ledger.jsonl"
    with open(ledger, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    log("tercatat di %s" % ledger, logfile)
    return 0


if __name__ == "__main__":
    sys.exit(main())
