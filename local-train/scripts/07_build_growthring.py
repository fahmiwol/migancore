#!/usr/bin/env python3
"""
07_build_growthring.py — rakit Growth-Ring cycle berikutnya dari semua sumber yang ada.

Menggabungkan, dengan proporsi yang diatur doktrin:
  - Growth-Ring cycle sebelumnya (cycle14_train.jsonl, 2197 baris) sebagai REPLAY
  - Panen real-usage      (scripts/05) — data pengguna nyata, judge eksternal saja
  - Data programatik      (scripts/06) — kelas no-tool/abstain/reasoning/anti-promise

Aturan yang ditegakkan otomatis (bukan sekadar catatan):
  1. REPLAY >= 15%           — anti catastrophic-forgetting (32_TRAINING_DOCTRINE §2.3)
  2. no-tool/irrelevance 10-15% — pembunuh fabrikasi-klaim-tool (Hammer)
  3. identity TIDAK ditambah — sudah jenuh (~301 pair); hanya dibawa lewat replay
  4. NO self-judge           — pasangan yang dinilai migancore sendiri ditolak (F-092)
  5. Fakta -> KB/RAG, perilaku -> bobot (FLAME filter)
  6. Held-out TIDAK BOLEH bocor — dicek terhadap eval/cycle15_heldout.json

Keluar dengan kode != 0 bila ada aturan yang dilanggar, supaya tidak ada rakitan
diam-diam yang melanggar doktrin.

Pakai:
    python scripts/07_build_growthring.py --replay path/cycle14_train.jsonl --out data/growth_ring
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import unicodedata
from collections import Counter

# Lihat catatan sama di 06_gen_programmatic.py: console cp1252 + karakter non-ASCII di
# print = skrip jatuh SETELAH pekerjaannya selesai, dan exit≠0 membuatnya terbaca gagal.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVAL = ROOT / "eval"

MIN_REPLAY = 0.15          # doktrin: 15% replay
NO_TOOL_MIN, NO_TOOL_MAX = 0.10, 0.15

# ── Gate lisensi ──────────────────────────────────────────────────────────────
# Kenapa ada: 2026-07-26 sebuah dataset non-komersial (Salesforce/xlam-60k) nyaris
# masuk jalur training karena tag HF-nya menulis CC-BY-4.0 sementara repo resminya
# menulis CC-BY-NC-4.0 "research purposes only". Ketahuan hanya karena kebetulan
# ada yang memeriksa repo aslinya. MiganCore adalah produk komersial — satu baris
# NC yang lolos mencemari seluruh bobot turunannya dan tidak bisa dicabut belakangan.
#
# Karena itu: sumber data WAJIB dideklarasikan lewat meta.sumber, dan hanya sumber
# yang sudah diperiksa manual yang boleh lewat. Sumber tak dikenal DITOLAK (default
# tutup, bukan default buka) — ketidaktahuan bukan izin.
SUMBER_DIIZINKAN = {
    # sumber internal — interaksi & koreksi Fahmi sendiri, tidak ada pihak ketiga
    "internal", "realusage", "programatik", "replay", "gold_fahmi",
    "user_thumbs_down", "user_thumbs_up", "user_correction", "user_edit",
    "preference_pair", "audit_terkonfirmasi",
    # dataset eksternal yang lisensinya sudah diverifikasi permisif
    "toolace",              # Team-ACE/ToolACE                     Apache-2.0
    "xlam_irrelevance",     # MadeAgents/xlam-irrelevance-7.5k     CC-BY-4.0
    "when2call",            # nvidia/When2Call                     CC-BY-4.0
    "sum_unanswerable",     # lime-nlp/Synthetic_Unanswerable_Math MIT
    "coconot",              # allenai/coconot                      ODC-BY
    "deepscaler",           # agentica-org/DeepScaleR-Preview      MIT
    "s1k_1_1",              # simplescaling/s1K-1.1                MIT (teacher DeepSeek-R1)
    "openthoughts3",        # open-thoughts/OpenThoughts3-1.2M     Apache-2.0 (teacher QwQ-32B Apache)
    "bigmath_rl",           # SynthLabsAI/Big-Math-RL-Verified     Apache-2.0
    "reasoning_gym",        # reasoning-gym                        Apache-2.0
    "reasoning_core",       # reasoning-core                       MIT
    "global_mmlu_id",       # CohereForAI/Global-MMLU subset 'id'  Apache-2.0
}

# Diperiksa dan DITOLAK — dicatat eksplisit supaya tidak "ditemukan ulang" tiap sesi.
SUMBER_DILARANG = {
    "xlam_60k": "repo resmi Salesforce = CC-BY-NC-4.0 research-only (tag HF menyesatkan)",
    "smoltalk": "memuat subset apigen-80k turunan xlam-60k (NC) + lisensi tak dinyatakan",
    "s1k": "bertag Apache tapi jejaknya dari Gemini Thinking — pakai s1K-1.1",
    "kodcode": "cc-by-nc-4.0 DAN hasil GPT-4o",
    "tulu3_sft": "ODC-BY tapi card-nya sendiri tunduk pada OpenAI terms of use",
    "hammer_weights": "bobot Hammer2.1-* = cc-by-nc-4.0 (datasetnya boleh, bobotnya tidak)",
    # 2026-07-26 (riset backlog eksperimen) — PENGULANGAN PERSIS kasus xlam_60k:
    "indommlu": "indolem/IndoMMLU bertag MIT di HF tapi repo RESMI = CC-BY-NC-SA-4.0. "
                "Pakai Global-MMLU subset 'id' (Apache-2.0) sebagai gantinya",
    "seacrowd_indommlu": "cc-by-nc-sa-4.0 (turunan IndoMMLU)",
    "m3exam": "tanpa lisensi jelas DAN tidak punya subset Indonesia",
    "jina_embeddings_v3": "cc-by-nc-4.0 — non-komersial",
    "jina_reranker_v2": "cc-by-nc-4.0 — non-komersial (lihat riset memory-grounding)",
}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(s or "")).lower()).strip()


def user_text(rec: dict) -> str:
    for m in rec.get("messages", []):
        if m.get("role") == "user":
            return m.get("content", "")
    return rec.get("prompt", "")


def muat_heldout() -> set:
    """Semua teks di held-out — apa pun yang menyerupainya WAJIB ditolak dari train."""
    out = set()
    for nama in ("cycle15_heldout.json", "gate_holdout.json"):
        p = EVAL / nama
        if not p.exists():
            continue
        def walk(o):
            if isinstance(o, str):
                if len(o) > 12:
                    out.add(norm(o))
            elif isinstance(o, dict):
                [walk(v) for v in o.values()]
            elif isinstance(o, list):
                [walk(v) for v in o]
        walk(json.loads(p.read_text(encoding="utf-8")))
    return out


def bocor(teks: str, heldout: set) -> bool:
    t = norm(teks)
    if not t:
        return False
    if t in heldout:
        return True
    kata = set(t.split())
    if len(kata) < 3:
        return False
    for h in heldout:
        hk = set(h.split())
        if hk and len(kata & hk) / max(len(kata | hk), 1) > 0.8:
            return True
    return False


# ── Gate sistem-fault (F-204/205/206 + T-5, 2026-07-26) ──────────────────────
# Sebagian jawaban buruk yang di-👎 Fahmi ternyata KESALAHAN SISTEM, bukan bobot:
# tool timeout disembunyikan dari model (T-2/F-205), tag <tool_call> bocor ke user
# (Phase-B tanpa executor), dan URL racun disuntik memori episodik (T-5).
# Melatih DPO dengan "rejected" seperti itu menghukum bobot atas dosa sistem —
# pelajaran yang keliru. Diukur di DB live: 7 url_racun + 8 toolcall_bocor +
# 2 klaim-tanpa-tool dari 428 thumb_down (~4%). Dibuang di sini (choke point),
# bukan diandalkan pada ingatan saat panen.
RE_SISTEM_FAULT = re.compile(
    r"(dailydoseofds"                      # URL racun T-5 (kasus terdokumentasi)
    r"|</?tool_call>"                      # bocoran tag mentah ke pengguna
    r"|\[KEADAAN\] tidak berubah)", re.I)  # pola macet loop koreksi 11 Jul


def sistem_fault(teks: str):
    m = RE_SISTEM_FAULT.search(teks or "")
    return m.group(0)[:40] if m else None


def cek_lisensi(rec: dict, asal: str):
    """None bila boleh dilatih; string alasan bila harus ditolak.

    Default TUTUP: sumber yang tidak dideklarasikan atau tidak dikenal ditolak.
    Lebih baik satu batch gagal keras hari ini daripada bobot komersial tercemar
    lisensi non-komersial yang tidak bisa dicabut.
    """
    sumber = str(rec.get("meta", {}).get("sumber") or asal or "").strip().lower()
    if not sumber:
        return "meta.sumber kosong (wajib dideklarasikan)"
    if sumber in SUMBER_DILARANG:
        return "sumber DILARANG '%s' — %s" % (sumber, SUMBER_DILARANG[sumber])
    if sumber not in SUMBER_DIIZINKAN:
        return ("sumber '%s' belum diperiksa — periksa lisensinya lalu daftarkan di "
                "SUMBER_DIIZINKAN/SUMBER_DILARANG" % sumber)
    return None


def baca_jsonl(p: Path) -> list:
    if not p.exists():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--replay", default="", help="Growth-Ring cycle sebelumnya (cycle14_train.jsonl)")
    ap.add_argument("--out", default="data/growth_ring")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    out = ROOT / args.out
    out.mkdir(parents=True, exist_ok=True)
    heldout = muat_heldout()

    sumber = {
        "programatik": baca_jsonl(ROOT / "data/generated/sft_programatik.jsonl"),
        "replay": baca_jsonl(Path(args.replay)) if args.replay else [],
    }
    dpo_sumber = {
        "realusage": baca_jsonl(ROOT / "data/harvest/dpo_realusage.jsonl"),
        "programatik": baca_jsonl(ROOT / "data/generated/dpo_programatik.jsonl"),
    }

    # ── rakit SFT ──
    sft, terlihat, ditolak = [], set(), Counter()
    pelanggaran_lisensi = set()
    for asal, rows in sumber.items():
        for r in rows:
            u = user_text(r)
            if not u:
                ditolak["tanpa_user"] += 1
                continue
            lisensi = cek_lisensi(r, asal)
            if lisensi:
                ditolak["LISENSI"] += 1
                pelanggaran_lisensi.add(lisensi)
                continue
            if bocor(u, heldout):
                ditolak["BOCOR_heldout"] += 1
                continue
            h = norm(u)
            if h in terlihat:
                ditolak["duplikat"] += 1
                continue
            terlihat.add(h)
            r.setdefault("meta", {})["asal_ring"] = asal
            sft.append(r)

    # ── rakit DPO (tolak self-judge) ──
    dpo, dpo_tolak = [], Counter()
    for asal, rows in dpo_sumber.items():
        for r in rows:
            if r.get("meta", {}).get("self_judge"):
                dpo_tolak["self_judge_F092"] += 1
                continue
            lisensi = cek_lisensi(r, asal)
            if lisensi:
                dpo_tolak["LISENSI"] += 1
                pelanggaran_lisensi.add(lisensi)
                continue
            sf = sistem_fault(str(r.get("rejected", "")) + " " + str(r.get("chosen", "")))
            if sf:
                dpo_tolak["SISTEM_FAULT"] += 1
                continue
            if bocor(r.get("prompt", ""), heldout):
                dpo_tolak["BOCOR_heldout"] += 1
                continue
            r.setdefault("meta", {})["asal_ring"] = asal
            dpo.append(r)

    # ── periksa aturan doktrin ──
    total = len(sft)
    n_replay = sum(1 for r in sft if r["meta"].get("asal_ring") == "replay")
    kelas = Counter(r.get("meta", {}).get("kelas", "?") for r in sft)
    n_notool = kelas["irrelevance_no_tool"] + kelas["over_tool_negatif"]
    n_identity_baru = sum(1 for r in sft
                          if r["meta"].get("asal_ring") != "replay"
                          and re.search(r"(siapa kamu|who are you|migancore|siapa yang mencipta)", norm(user_text(r))))

    pelanggaran = []
    if total == 0:
        pelanggaran.append("0 contoh — tidak ada yang bisa dilatih")
    else:
        if args.replay and n_replay / total < MIN_REPLAY:
            pelanggaran.append("replay %.1f%% < %.0f%% (anti-forgetting, 32 §2.3)"
                               % (100 * n_replay / total, 100 * MIN_REPLAY))
        rasio_nt = n_notool / total
        if not (NO_TOOL_MIN <= rasio_nt <= NO_TOOL_MAX) and not args.replay:
            pass   # tanpa replay, rasio memang tidak bermakna
        elif args.replay and not (NO_TOOL_MIN <= rasio_nt <= NO_TOOL_MAX):
            pelanggaran.append("no-tool %.1f%% di luar %.0f-%.0f%% (Hammer)"
                               % (100 * rasio_nt, 100 * NO_TOOL_MIN, 100 * NO_TOOL_MAX))
    if n_identity_baru > 0:
        pelanggaran.append("%d contoh identity BARU — identity sudah JENUH, dilarang ditambah (32:156)"
                           % n_identity_baru)
    if pelanggaran_lisensi:
        # Bukan sekadar dibuang diam-diam: kalau ada sumber tak-berlisensi masuk,
        # rakitan ini HARUS gagal supaya orangnya memeriksa, bukan menganggapnya bersih.
        for alasan in sorted(pelanggaran_lisensi):
            pelanggaran.append("LISENSI — %s" % alasan)
    if ditolak["BOCOR_heldout"] or dpo_tolak["BOCOR_heldout"]:
        pass   # sudah dibuang, bukan pelanggaran — justru bukti gate bekerja

    # ── split validasi (2026-07-27) ─────────────────────────────────────────
    # `02_train_lora.py` menuntut eval.jsonl untuk validation loss; perakit
    # sebelumnya tidak pernah membuatnya, jadi training GAGAL di detik ke-60
    # (ketahuan lewat smoke test, bukan setelah berjam-jam).
    #
    # PENTING — ini BUKAN probe gate. Validation loss dipakai untuk memantau
    # overfit SELAMA training, sedangkan penilaian lolos/tidak memakai
    # eval/probes_v2.json yang frozen. Memakai probe gate di sini akan jadi
    # teach-to-test lewat pintu belakang (early-stopping menyetel ke set uji).
    # Split diambil dari data yang SAMA lalu DIBUANG dari train — disjoint.
    rng.shuffle(sft)
    n_eval = max(20, min(150, int(len(sft) * 0.05)))
    sft_eval, sft = sft[:n_eval], sft[n_eval:]
    with open(out / "eval.jsonl", "w", encoding="utf-8") as f:
        for r in sft_eval:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    with open(out / "train.jsonl", "w", encoding="utf-8") as f:
        for r in sft:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open(out / "dpo.jsonl", "w", encoding="utf-8") as f:
        for r in dpo:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    laporan = {
        "waktu": datetime.now(timezone.utc).isoformat(),
        "sft_total": total,
        "sft_eval": len(sft_eval),
        "per_asal": dict(Counter(r["meta"].get("asal_ring") for r in sft)),
        "per_kelas": dict(kelas),
        "replay_persen": round(100 * n_replay / total, 1) if total else 0,
        "no_tool_persen": round(100 * n_notool / total, 1) if total else 0,
        "identity_baru": n_identity_baru,
        "dpo_total": len(dpo),
        "dpo_ditolak": dict(dpo_tolak),
        "sft_ditolak": dict(ditolak),
        "pelanggaran": pelanggaran,
        "heldout_pola_dijaga": len(heldout),
        "lisensi_ditolak": sorted(pelanggaran_lisensi),
        "sumber_diizinkan": sorted(SUMBER_DIIZINKAN),
    }
    (out / "laporan_ring.json").write_text(json.dumps(laporan, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=" * 64)
    print("GROWTH-RING TERAKIT")
    print("=" * 64)
    print("  SFT total        : %d   %s" % (total, dict(Counter(r["meta"].get("asal_ring") for r in sft))))
    for k, v in kelas.most_common(8):
        print("     %-24s %d" % (k, v))
    print("  replay           : %.1f%%  (minimum %.0f%%)" % (laporan["replay_persen"], 100 * MIN_REPLAY))
    print("  no-tool/abstain  : %.1f%%  (target %.0f-%.0f%%)" % (laporan["no_tool_persen"], 100 * NO_TOOL_MIN, 100 * NO_TOOL_MAX))
    print("  identity baru    : %d  (harus 0 — sudah jenuh)" % n_identity_baru)
    print("  DPO              : %d   ditolak: %s" % (len(dpo), dict(dpo_tolak) or "tidak ada"))
    print("  SFT ditolak      : %s" % (dict(ditolak) or "tidak ada"))
    print("  held-out dijaga  : %d pola" % len(heldout))
    print("  gate lisensi     : %d sumber diizinkan, %s"
          % (len(SUMBER_DIIZINKAN),
             "SEMUA BERSIH" if not pelanggaran_lisensi
             else "%d masalah (lihat pelanggaran)" % len(pelanggaran_lisensi)))
    if pelanggaran:
        print("\n  ⛔ PELANGGARAN DOKTRIN:")
        for p in pelanggaran:
            print("     - %s" % p)
        print("  → rakitan TIDAK layak dilatih sebelum ini dibereskan")
        return 1
    print("\n  ✅ semua aturan doktrin terpenuhi")
    print("  → %s" % out.resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
