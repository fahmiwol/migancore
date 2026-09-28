#!/usr/bin/env python
"""latih_s1.py — GERBANG-S1: fine-tune laya-multilingual (mmBERT-base 322M) untuk SATU keputusan noul.

Resep = notebook RESMI penerbit (github.com/NandhaKishorM/laya, notebooks/laya_finetune_typed_decisions_2xT4_kaggle.ipynb):
  RL gaya GRPO atas proper_reward (w_sph 0,75, w_rps 1,0) + CE target lunak; AdamW (encoder 2,5e-5, head 1e-4, wd 0,01),
  cosine (eta_min 1e-6), clip 1,0, 4 epoch, mikro-batch 8 x akumulasi 4, grup 4, sigma 0,4 -> 0,1;
  suhu dikalibrasi per tipe soal via LBFGS (fit_one_temp) pada butir kalibrasi; bobot disimpan half.
Beda yang DIAKUI: CPU fp32 (notebook: fp16 autocast CUDA) dan satu proses (notebook: DDP 2xT4). Kalibrasi memakai split
DEV pra-daftar (bukan 10 % acak) — untuk noul biner suhu itu monoton, jadi TIDAK mengubah keputusan blokir, hanya ECE.

Mode S : state = {"soal": q, "jawaban": teks}.   Mode Sq: state = {"soal": q}  (kontrol soal-saja, pra-daftar v1.2).
Target noul = [P(salah-arah "false"), P("true")] dengan "true" = jawaban dikarang/salah (label BLOKIR).
Latih = butir KESEPAKATAN kedua pelabel (untukLatih); prediksi dev = SEMUA butir dev, termasuk sengketa (label null) —
supaya ambang beku dihitung atas semua jawaban yang nilai2 sebut BENAR (tinjauan adversarial 28 Sep #7).

  python latih_s1.py --data data-latih-v1.jsonl --keluar model-S --mode S [--max-len 1024] [--benih 20260928]
  python latih_s1.py --data data-latih-v1.jsonl --keluar asap-S --mode S --asap      # 16 butir, 1 epoch: rantai penuh
Keluaran: <keluar>/{model.safetensors, encoder/, tokenizer/, rl_agent_config.json, prediksi-dev.jsonl, latih-log.json}.
Prediksi dev diambil lewat laya.Agent(<keluar>).predict — JALUR SERVING yang sama dengan skor_s1.py, bukan forward mentah.
"""
import argparse
import hashlib
import json
import os
import random
import time

os.environ.setdefault("USE_TF", "0")
import torch  # noqa: E402
from safetensors.torch import load_file, save_file  # noqa: E402
from transformers import AutoTokenizer  # noqa: E402

import laya  # noqa: E402
from laya.agent import _fix_tokenizer_config  # noqa: E402
from laya.common import QTYPES, build_model, build_sequence, proper_reward, render_options  # noqa: E402

INSTRUKSI = "Apakah jawaban memuat fakta yang dikarang atau salah?"
PERTANYAAN = {"karangan": {"type": "noul", "instructions": INSTRUKSI}}
EPOCHS, MICRO_BATCH, GRAD_ACCUM, GROUP_SIZE = 4, 8, 4, 4
LR_ENCODER, LR_HEAD, SIGMA_START, SIGMA_END = 2.5e-5, 1.0e-4, 0.4, 0.1


def direktori_dasar():
    """Checkpoint dasar dari cache LOKAL saja (tanpa jaringan): revisi hulu yang berubah tidak boleh diam-diam menggeser
    base encoder. Nama folder snapshot = hash commit revisi HF → dicatat di latih-log (revisiDasar)."""
    from huggingface_hub import snapshot_download
    snap = snapshot_download("convaiinnovations/laya", allow_patterns=["multilingual/*"], local_files_only=True)
    d = os.path.join(snap, "multilingual")
    _fix_tokenizer_config(d)
    return d, os.path.basename(os.path.normpath(snap))


def state_dari(baris, mode):
    return {"soal": baris["soal"], "jawaban": baris["jawaban"]} if mode == "S" else {"soal": baris["soal"]}


def butir(tok, cfg, baris, mode):
    """Butir sengketa (label None) tetap dibangun untuk PREDIKSI dev; targetnya tidak dipakai (berlabel=False)."""
    target = [0.0, 1.0] if baris.get("label") == "BLOKIR" else [1.0, 0.0]
    q = {"t": "noul", "ins": INSTRUKSI, "crit": {}}
    seq, markers = build_sequence(tok, state_dari(baris, mode), q, cfg["max_len"], cfg["head_max_len"])
    if len(markers) != len(render_options(q)):
        return None
    return {"ids": seq, "markers": markers, "qtype": QTYPES["noul"], "target": target, "label": target.index(1.0),
            "berlabel": baris.get("label") in ("BLOKIR", "AMAN"), "meta": baris}


def collate(items, pad_id):
    n, L = len(items), max(len(it["ids"]) for it in items)
    kmax = max(len(it["markers"]) for it in items)
    ids = torch.full((n, L), pad_id, dtype=torch.long)
    att = torch.zeros((n, L), dtype=torch.long)
    mpos = torch.zeros((n, kmax), dtype=torch.long)
    mmask = torch.zeros((n, kmax), dtype=torch.bool)
    target = torch.zeros((n, kmax), dtype=torch.float32)
    for i, it in enumerate(items):
        ids[i, : len(it["ids"])] = torch.tensor(it["ids"])
        att[i, : len(it["ids"])] = 1
        k = len(it["markers"])
        mpos[i, :k] = torch.tensor(it["markers"])
        mmask[i, :k] = True
        target[i, : len(it["target"])] = torch.tensor(it["target"], dtype=torch.float32)
    return {"input_ids": ids, "attention_mask": att, "marker_pos": mpos, "marker_mask": mmask, "target": target,
            "qtype": torch.tensor([it["qtype"] for it in items])}


def fit_one_temp(sel):
    if len(sel) < 10:
        return 1.0
    kmax = max(len(z) for z, _ in sel)
    Z = torch.full((len(sel), kmax), -1e4)
    T = torch.zeros((len(sel), kmax))
    for i, (z, t) in enumerate(sel):
        Z[i, : len(z)] = torch.tensor(z)
        T[i, : len(t)] = torch.tensor(t, dtype=torch.float32)
    log_t = torch.zeros(1, requires_grad=True)
    opt = torch.optim.LBFGS([log_t], lr=0.1, max_iter=100)

    def closure():
        opt.zero_grad()
        loss = -(T * torch.log_softmax(Z / log_t.exp(), -1)).sum(-1).mean()
        loss.backward()
        return loss

    opt.step(closure)
    return float(torch.clamp(log_t.exp(), 0.1, 10.0).item())


def sha_teks(p):
    """SAMA dengan inti-s1.mjs shaTeks: sha256 isi dengan CRLF dinormalkan ke LF (repo core.autocrlf=true)."""
    with open(p, "rb") as f:
        return hashlib.sha256(f.read().replace(bytes([13, 10]), bytes([10]))).hexdigest()


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for blok in iter(lambda: f.read(1 << 20), b""):
            h.update(blok)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--keluar", required=True)
    ap.add_argument("--mode", choices=["S", "Sq"], required=True)
    ap.add_argument("--max-len", type=int, default=None)
    ap.add_argument("--benih", type=int, default=20260928)
    ap.add_argument("--asap", action="store_true")
    ap.add_argument("--int8", action="store_true", help="prediksi dev lewat jalur serving TERKUANTISASI (kuantisasi_s1.py)")
    a = ap.parse_args()
    if os.path.exists(a.keluar):
        raise SystemExit(f"BERHENTI: {a.keluar} sudah ada — tidak ditimpa")
    random.seed(a.benih)
    torch.manual_seed(a.benih)
    torch.set_num_threads(os.cpu_count() or 4)
    t_mulai = time.time()

    d, revisi_dasar = direktori_dasar()
    tok = AutoTokenizer.from_pretrained(os.path.join(d, "tokenizer"))
    cfg = json.load(open(os.path.join(d, "rl_agent_config.json")))
    if a.max_len:
        cfg["max_len"] = a.max_len
    model = build_model(cfg, encoder_dir=os.path.join(d, "encoder"))
    model.load_state_dict(load_file(os.path.join(d, "model.safetensors")), strict=True)
    model = model.float()

    baris = [json.loads(x) for x in open(a.data, encoding="utf-8") if x.strip()]
    # Tinjauan adversarial 28 Sep #7: LATIH hanya butir kesepakatan kedua pelabel (untukLatih); DEV diprediksi SEMUANYA,
    # termasuk sengketa, supaya beku.mjs menghitung batas (a)/(b) atas semua jawaban yang nilai2 sebut BENAR — persis yang
    # dialami S di uji. Medan untukLatih WAJIB ada (berkas format lama gagal di sini, tidak diam-diam melatih sengketa).
    latih = [butir(tok, cfg, b, a.mode) for b in baris if b["bagian"] == "latih" and b["untukLatih"]]
    dev = [butir(tok, cfg, b, a.mode) for b in baris if b["bagian"] == "dev"]
    latih_gagal = sum(1 for x in latih if x is None)
    if any(x is None for x in dev):
        raise SystemExit(f"BERHENTI: {sum(1 for x in dev if x is None)} butir DEV gagal dibangun (penanda opsi hilang) — dev wajib lengkap")
    latih = [x for x in latih if x]
    epochs, micro, accum = EPOCHS, MICRO_BATCH, GRAD_ACCUM
    if a.asap:
        latih, dev = latih[:8], dev[:8]
        epochs, micro, accum = 1, 4, 1
    terpotong = sum(1 for x in latih + dev if len(x["ids"]) >= cfg["max_len"])
    print(f"mode {a.mode} · latih {len(latih)} (BLOKIR {sum(x['label'] for x in latih)}, gagal dibangun {latih_gagal}) · dev {len(dev)} "
          f"(berlabel {sum(1 for x in dev if x['berlabel'])}) · max_len {cfg['max_len']} · terpotong {terpotong}", flush=True)

    enc_params = [p for n, p in model.named_parameters() if "encoder." in n]
    head_params = [p for n, p in model.named_parameters() if "encoder." not in n]
    opt = torch.optim.AdamW([{"params": enc_params, "lr": LR_ENCODER}, {"params": head_params, "lr": LR_HEAD}], weight_decay=0.01)
    total = max(1, (len(latih) // (micro * accum)) * epochs)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=total, eta_min=1e-6)
    log = {"epoch": []}
    model.train()
    for epoch in range(epochs):
        random.seed(42 + epoch)
        random.shuffle(latih)
        sigma = SIGMA_START + (SIGMA_END - SIGMA_START) * (epoch / max(1, epochs - 1))
        opt.zero_grad(set_to_none=True)
        jumlah, nb, langkah, t0 = 0.0, 0, 0, time.time()
        for b0 in range(0, len(latih), micro):
            chunk = latih[b0: b0 + micro]
            bt = collate(chunk, tok.pad_token_id)
            logits, act = model(bt["input_ids"], bt["attention_mask"], bt["marker_pos"], bt["marker_mask"], bt["qtype"])
            logits = logits.float()
            mask = bt["marker_mask"]
            k = mask.sum(-1, keepdim=True).float()
            target = bt["target"]
            eps = torch.randn((GROUP_SIZE,) + logits.shape) * sigma * mask
            eps = (eps - eps.sum(-1, keepdim=True) / k) * mask
            z = logits.detach().unsqueeze(0) + eps
            q = torch.softmax(z.masked_fill(~mask, -1e4), -1)
            with torch.no_grad():
                r = proper_reward(q, target.unsqueeze(0), bt["qtype"], mask, w_sph=0.75, w_rps=1.0)
                adv = r - r.mean(0, keepdim=True)
                adv = adv / (adv.std() + 1e-6)
            logp = -(((z - logits.unsqueeze(0)) ** 2) * mask).sum(-1) / (2 * sigma ** 2)
            loss_rl = -(adv * logp).mean()
            loss_ce = -(target * torch.log_softmax(logits.masked_fill(~mask, -1e4), -1)).sum(-1).mean()
            loss = (loss_rl + 1.0 * loss_ce) / accum + 0.0 * act.sum()
            loss.backward()
            langkah += 1
            if langkah % accum == 0 or (b0 + micro) >= len(latih):
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                opt.step()
                sched.step()
                opt.zero_grad(set_to_none=True)
            jumlah += loss.item() * accum
            nb += 1
        e = {"epoch": epoch + 1, "loss": round(jumlah / max(1, nb), 4), "sigma": round(sigma, 3), "detik": round(time.time() - t0, 1)}
        log["epoch"].append(e)
        print(json.dumps(e), flush=True)

    # Kalibrasi suhu noul di dev BERLABEL (monoton → keputusan blokir tidak berubah; hanya ECE). Logit mentah disimpan untuk
    # SEMUA butir dev dan dipasangkan lewat butirnya sendiri (bukan zip dengan daftar baris terpisah — tinjauan 28 Sep #7).
    model.eval()
    mentah = []
    with torch.no_grad():
        for c0 in range(0, len(dev), 16):
            ch = dev[c0: c0 + 16]
            cb = collate(ch, tok.pad_token_id)
            l_sub, _ = model(cb["input_ids"], cb["attention_mask"], cb["marker_pos"], cb["marker_mask"], cb["qtype"])
            for i, it in enumerate(ch):
                mentah.append((l_sub[i, : len(it["markers"])].float().tolist(), it))
    temps = list(cfg.get("temperature", [1.2, 1.2, 1.2])) if isinstance(cfg.get("temperature"), list) else [1.2, 1.2, 1.2]
    temps[QTYPES["noul"]] = fit_one_temp([(z, it["target"]) for z, it in mentah if it["berlabel"]])

    os.makedirs(a.keluar)
    save_file({k: v.half().contiguous().cpu() for k, v in model.state_dict().items()}, os.path.join(a.keluar, "model.safetensors"))
    model.encoder.config.save_pretrained(os.path.join(a.keluar, "encoder"))
    tok.save_pretrained(os.path.join(a.keluar, "tokenizer"))
    cfg["fine_tuned"] = True
    cfg["model_name"] = f"gerbang-s1-{a.mode}"
    cfg["temperature"] = temps
    cfg.pop("temperature_by_options", None)
    json.dump(cfg, open(os.path.join(a.keluar, "rl_agent_config.json"), "w"), indent=2)

    # Prediksi dev lewat JALUR SERVING (laya.Agent), + pemeriksaan kesetaraan dengan forward mentah.
    agen = laya.Agent(a.keluar, device="cpu")
    kuant = "tidak"
    if a.int8:
        from kuantisasi_s1 import kuantisasi
        kuant = kuantisasi(agen)
    beda_maks = 0.0
    with open(os.path.join(a.keluar, "prediksi-dev.jsonl"), "w", encoding="utf-8") as f:
        for z, it in mentah:
            b = it["meta"]
            hasil = agen.predict(state_dari(b, a.mode), PERTANYAAN, max_len=cfg["max_len"])
            p = float(hasil["answers"]["karangan"]["noul"])
            zt = torch.tensor(z) / temps[QTYPES["noul"]]
            p_mentah = float(torch.softmax(zt, -1)[1])
            beda_maks = max(beda_maks, abs(p - p_mentah))
            f.write(json.dumps({"id": b["id"], "sampel": b["sampel"], "jenis": b["jenis"], "label": b.get("label"), "untukLatih": b["untukLatih"],
                                "hasilNilai2": b["hasilNilai2"], "p_blokir": p, "panjang": len(b.get("jawaban") or "")}, ensure_ascii=False) + "\n")
    log.update({"mode": a.mode, "kuantisasi": kuant, "revisiDasar": revisi_dasar, "latih": len(latih), "latihGagalDibangun": latih_gagal, "dev": len(dev),
                "devBerlabel": sum(1 for x in dev if x["berlabel"]), "terpotong": terpotong, "max_len": cfg["max_len"],
                "suhuNoul": temps[QTYPES["noul"]], "bedaMaksServingVsMentah": beda_maks, "detikTotal": round(time.time() - t_mulai, 1),
                "sha256Bobot": sha(os.path.join(a.keluar, "model.safetensors")), "sha256Skrip": sha_teks(os.path.abspath(__file__)), "sha256KodeKuantisasi": sha_teks(os.path.join(os.path.dirname(os.path.abspath(__file__)), "kuantisasi_s1.py")),
                "laya": getattr(laya, "__version__", "?"), "torch": torch.__version__, "asap": a.asap,
                # Tinjauan putaran 3 (#6): data & benih yang BENAR-BENAR dipakai — beku menolak model dari data/benih lain.
                "sha256Data": sha_teks(os.path.abspath(a.data)), "benih": a.benih})
    json.dump(log, open(os.path.join(a.keluar, "latih-log.json"), "w"), indent=2)
    print(f"selesai · suhu noul {temps[QTYPES['noul']]:.3f} · beda serving-vs-mentah maks {beda_maks:.2e} · {log['detikTotal']} dtk", flush=True)


if __name__ == "__main__":
    main()
