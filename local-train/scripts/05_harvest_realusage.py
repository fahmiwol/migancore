#!/usr/bin/env python3
"""
05_harvest_realusage.py — panen data training dari pemakaian NYATA (gratis, tanpa teacher API).

Kenapa ada: doktrin sudah memvonis data teacher-sintetis JENUH (F-106: 0.6 == 0.4), dan
lever berikutnya adalah data real-usage. Bahannya ternyata sudah ada dan belum dipanen:
327 preference-pair (semuanya belum pernah dipakai training), 394 thumb_down yang
terhubung ke jawaban asisten, dan 215 feedback bertkomentar.

Yang dilakukan:
  1. Tarik preference_pairs (chosen/rejected) → siap jadi data DPO
  2. Tarik thumb_down + jawaban asisten yang di-thumb_down → kandidat perbaikan perilaku
  3. KLASIFIKASI kelas kesalahan secara heuristik (bukan LLM — gratis & deterministik):
       fabrikasi_fakta · klaim_palsu_tool · over_tool · terlalu_bertele · lainnya
  4. Tandai mana yang FAKTA (→ KB/RAG, JANGAN ke bobot) vs PERILAKU (→ boleh ke bobot),
     sesuai FLAME filter di 32_TRAINING_DOCTRINE.
  5. Tulis JSONL + laporan ringkas

Sumber: dump pg_ado_ALL.sql.gz (offline) ATAU DB langsung (--live, butuh SSH ke server).

Pakai:
    python scripts/05_harvest_realusage.py --live   --out data/harvest
    python scripts/05_harvest_realusage.py --dump <local-dir>\\...\\pg_ado_ALL.sql.gz --out data/harvest
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── Klasifikasi kelas kesalahan (heuristik deterministik, tanpa LLM) ──
# Pola diambil dari kelas gagal yang sudah tercatat di FINDINGS (F-197/200/201-203)
# dan dari contoh nyata di data.
POLA = [
    ("klaim_palsu_tool", re.compile(
        r"(saya (telah|sudah) (membaca|menganalisa|menganalisis|mengecek|memeriksa|mengakses|membuka)"
        r"|sudah saya (baca|cek|periksa)"
        r"|akan segera saya (baca|cek|proses)"
        r"|saya akan (mencari|membaca)nya sekarang)", re.I)),
    ("over_tool", re.compile(r"(memanggil tool|menjalankan tool|tool_call)", re.I)),
    ("terlalu_bertele", None),      # ditentukan dari panjang
    ("fabrikasi_fakta", None),      # ditentukan dari sinyal komentar user
]

# Komentar user yang menandakan model MENGARANG fakta
SINYAL_FABRIKASI = re.compile(
    r"(salah|keliru|ngawur|halusinasi|tidak ada|gak ada|nggak ada|bukan di|palsu|"
    r"itu di |mengada-ada|hoax|tidak benar|bohong)", re.I)

# Komentar yang menandakan masalah GAYA/PERILAKU, bukan fakta
SINYAL_PERILAKU = re.compile(
    r"(kepanjangan|bertele|terlalu panjang|basa-basi|jangan janji|langsung saja|"
    r"terlalu formal|jangan sok tahu|jawab singkat)", re.I)


def psql(sql: str, live_host: str | None) -> str:
    """Jalankan query. --live = lewat SSH ke server; kalau tidak, pakai dump lokal."""
    if live_host:
        cmd = ["ssh", "-i", str(Path.home() / ".ssh" / "sidix_session_key"), live_host,
               "docker exec ado-postgres-1 psql -U ado -d ado -Atc " + json_quote(sql)]
    else:
        raise SystemExit("mode dump belum diimplementasi — pakai --live selagi server hidup")
    # encoding=utf-8 WAJIB: default Windows (cp1252) merusak teks Indonesia/Arab dari
    # subprocess dan melempar UnicodeDecodeError di tengah panen.
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("query gagal: " + (r.stderr or "")[:300])
    return r.stdout or ""


def json_quote(s: str) -> str:
    return "'" + s.replace("'", "'\"'\"'").replace("\n", " ") + "'"


def klasifikasi(jawaban: str, komentar: str | None) -> tuple[str, str]:
    """Kembalikan (kelas, tujuan) — tujuan: 'bobot' (perilaku) atau 'kb' (fakta)."""
    t = jawaban or ""
    k = komentar or ""

    for nama, pola in POLA:
        if pola and pola.search(t):
            return nama, "bobot"          # klaim palsu / over-tool = PERILAKU → boleh ke bobot

    if k and SINYAL_FABRIKASI.search(k):
        # FLAME filter: koreksi FAKTA masuk KB/RAG, BUKAN bobot
        # (melatih fakta asing ke bobot = mengajari model berhalusinasi)
        return "fabrikasi_fakta", "kb"
    if k and SINYAL_PERILAKU.search(k):
        return "gaya_perilaku", "bobot"
    if len(t) > 1800:
        return "terlalu_bertele", "bobot"
    return "lainnya", "perlu_tinjau"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="tarik langsung dari server (selagi hidup)")
    ap.add_argument("--host", default="<user>@<host>")
    ap.add_argument("--out", default="data/harvest")
    args = ap.parse_args()

    host = args.host if args.live else None
    out = ROOT / args.out
    out.mkdir(parents=True, exist_ok=True)
    SEP = "\x1f"   # pemisah kolom yang tak muncul di teks

    # ── 1. preference pairs (siap DPO) ──
    # WAJIB replace newline di SETIAP kolom teks: psql -A menulis satu record per baris,
    # jadi teks ber-newline memecah record dan parsing per-baris membuang ~80% data
    # (ketahuan karena hasil 42 vs 201 yang dihitung langsung di DB).
    nl = lambda c: "replace(replace(coalesce(%s,''), chr(10), ' '), chr(13), ' ')" % c
    rows = psql(
        "select %s||'%s'||%s||'%s'||%s||'%s'||%s||'%s'||%s "
        "from preference_pairs where chosen is not null and rejected is not null "
        "and length(chosen)>20 and length(rejected)>10"
        % (nl("prompt"), SEP, nl("chosen"), SEP, nl("rejected"), SEP,
           nl("source_method"), SEP, nl("judge_model")), host)

    dpo, judge_ct = [], Counter()
    for line in rows.splitlines():
        if not line.strip():
            continue
        p = line.split(SEP)
        if len(p) < 5:
            continue
        judge = p[4] or "?"
        # ⛔ F-092: SELF-DISTILLATION / SELF-JUDGE DILARANG. Pasangan yang dinilai oleh
        # migancore sendiri = confidence-laundering (model mengukuhkan biasnya sendiri) —
        # inilah yang membuat 0.5 harus di-ROLLBACK. Teacher/judge WAJIB eksternal-lebih-kuat.
        self_judge = judge.startswith("local:migancore")
        dpo.append({"prompt": p[0], "chosen": p[1], "rejected": p[2],
                    "meta": {"sumber": p[3], "judge": judge, "asal": "real_usage",
                             "self_judge": self_judge}})
        judge_ct[judge] += 1

    aman = [d for d in dpo if not d["meta"]["self_judge"]]
    ditolak = [d for d in dpo if d["meta"]["self_judge"]]

    # Hanya yang AMAN yang boleh masuk berkas training.
    with open(out / "dpo_realusage.jsonl", "w", encoding="utf-8") as f:
        for d in aman:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
    # Yang ditolak tetap disimpan terpisah — bukan dibuang, tapi JANGAN dilatih.
    with open(out / "dpo_DITOLAK_self_judge.jsonl", "w", encoding="utf-8") as f:
        for d in ditolak:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")

    # ── 2. thumb_down + jawaban asisten (+ komentar bila ada) ──
    rows = psql(
        "select replace(replace(coalesce(f.comment,''), chr(10), ' '), chr(13), ' ')"
        "||'%s'||replace(replace(m.content, chr(10), ' '), chr(13), ' ') "
        "from interactions_feedback f join messages m on m.id=f.message_id "
        "where f.signal_type='thumb_down' and m.role='assistant' and length(m.content)>20" % SEP, host)

    kelas_ct, tujuan_ct, kandidat = Counter(), Counter(), []
    for line in rows.splitlines():
        if not line.strip():
            continue
        p = line.split(SEP)
        komentar, jawaban = (p[0], p[1]) if len(p) > 1 else ("", p[0])
        kelas, tujuan = klasifikasi(jawaban, komentar)
        kelas_ct[kelas] += 1
        tujuan_ct[tujuan] += 1
        kandidat.append({"jawaban_ditolak": jawaban[:2000], "komentar_user": komentar,
                         "kelas": kelas, "tujuan": tujuan})

    with open(out / "kandidat_perbaikan.jsonl", "w", encoding="utf-8") as f:
        for k in kandidat:
            f.write(json.dumps(k, ensure_ascii=False) + "\n")

    # yang boleh masuk BOBOT saja (FLAME filter: fakta → KB, bukan bobot)
    bobot = [k for k in kandidat if k["tujuan"] == "bobot"]
    with open(out / "kandidat_bobot.jsonl", "w", encoding="utf-8") as f:
        for k in bobot:
            f.write(json.dumps(k, ensure_ascii=False) + "\n")

    laporan = {
        "waktu": datetime.now(timezone.utc).isoformat(),
        "dpo_pairs_total": len(dpo),
        "dpo_pairs_AMAN": len(aman),
        "dpo_DITOLAK_self_judge": len(ditolak),
        "judge": dict(judge_ct),
        "kandidat_perbaikan": len(kandidat),
        "kelas": dict(kelas_ct),
        "tujuan": dict(tujuan_ct),
        "boleh_ke_bobot": len(bobot),
        "catatan": ("Kelas 'fabrikasi_fakta' SENGAJA diarahkan ke KB/RAG, bukan bobot "
                    "(FLAME filter, 32_TRAINING_DOCTRINE): melatih fakta asing ke bobot "
                    "justru mengajari model berhalusinasi."),
    }
    (out / "laporan_panen.json").write_text(json.dumps(laporan, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=" * 60)
    print("PANEN REAL-USAGE (gratis, tanpa teacher API)")
    print("=" * 60)
    print("  DPO pairs total     : %d" % len(dpo))
    print("  → AMAN dilatih      : %d  (judge eksternal / sinyal user)" % len(aman))
    print("  → DITOLAK self-judge: %d  (F-092: judge = model sendiri = confidence-laundering)" % len(ditolak))
    print("  judge               : %s" % dict(judge_ct))
    print("  kandidat perbaikan  : %d" % len(kandidat))
    print("  kelas               : %s" % dict(kelas_ct))
    print("  tujuan              : %s" % dict(tujuan_ct))
    print("  → boleh ke BOBOT    : %d  (sisanya fakta → KB/RAG atau perlu tinjau)" % len(bobot))
    print("  keluaran            : %s" % out.resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
