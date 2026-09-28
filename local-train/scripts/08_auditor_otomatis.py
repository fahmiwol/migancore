#!/usr/bin/env python3
"""
08_auditor_otomatis.py — menemukan jawaban yang HAMPIR PASTI salah, tanpa perlu tahu
jawaban benarnya.

Kenapa ada: Fahmi sering tidak memberi 👍/👎 karena tidak yakin jawabannya benar atau
salah — dan itu wajar, memverifikasi jawaban LLM memang kerja keras. Akibatnya flywheel
koreksi mandek di 82/500.

Idenya: JANGAN minta manusia menilai semua. Sebagian kelas kesalahan bisa dibuktikan
salah **secara struktural**, tanpa mengetahui fakta yang benar:

  1. KLAIM-TOOL-PALSU — model berkata "saya sudah membaca/cek/cari…" padahal kolom
     tool_calls pada pesan itu KOSONG.

     ⛔ ASUMSI INI TERBUKTI SALAH (2026-07-26) — JANGAN percaya label "bukti mati"
     pada keluaran lama. Lihat docs/jarvis/74_TOOL_CALLING_SARANA_AUDIT.md §T-1.
     Sebabnya: di api/routers/chat.py, SATU-SATUNYA tempat yang menulis
     Message.tool_calls ada di jalur NON-streaming (baris ~982). Jalur streaming
     (SSE — yang dipakai app) memakai stream_tool_calls_acc tetapi hanya
     meneruskannya ke _fire_reflect_background(), bukan ke DB. Jadi tool_calls
     kosong adalah kondisi NORMAL untuk semua pesan streaming, dipanggil atau tidak.

     Kelas ini karena itu diturunkan ke "perlu dicek" (lihat KEYAKINAN di bawah),
     bukan "bukti mati". Untuk memulihkan kesahihannya: perbaiki dulu persistensi
     di jalur streaming, baru jalankan ulang auditor ini.
  2. FAKTA-VOLATILE-TANPA-TOOL      — menyebut harga/kurs/jadwal/skor/cuaca "hari ini"
     tanpa memanggil web_search. Fakta yang berubah tiap hari tidak bisa datang dari bobot.
  3. ANGKA-SPESIFIK-TANPA-SUMBER    — statistik/tahun/jumlah presisi tanpa retrieval.
     Tidak pasti salah, tapi kandidat pemeriksaan paling bernilai.
  4. JANJI-TANPA-EKSEKUSI           — "akan saya carikan sekarang" lalu percakapan
     berakhir tanpa tool call.

Keluaran: daftar terurut prioritas, tiap baris berisi kutipan bukti — Fahmi tinggal
menjawab "ya, salah" / "bukan", bukan menilai dari nol.

Pakai:
    python scripts/08_auditor_otomatis.py --live --out data/audit
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
SEP = "\x1f"

# ── Pola klaim tool: model MENGAKU sudah melakukan aksi yang butuh tool ──
KLAIM_TOOL = re.compile(
    r"(saya (telah|sudah|barusan) (membaca|menganalisa|menganalisis|mengecek|memeriksa|"
    r"mengakses|membuka|mencari|menelusuri|melihat|mengunjungi)"
    r"|sudah saya (baca|cek|periksa|cari|buka|akses)"
    r"|(setelah|berdasarkan) (saya )?(membaca|mengecek|menelusuri|mencari)"
    r"|hasil pencarian (saya|menunjukkan)"
    r"|dari (situs|halaman|artikel) (itu|tersebut))", re.I)

# ── Fakta volatile: berubah dari waktu ke waktu, mustahil akurat dari bobot ──
VOLATILE = re.compile(
    r"(harga|kurs|nilai tukar|tarif|biaya)\s+\w+.{0,40}(hari ini|sekarang|saat ini|terkini)"
    r"|(jadwal|skor|hasil pertandingan|cuaca|suhu).{0,30}(hari ini|besok|malam ini|sekarang)"
    r"|(saldo|stok|ketersediaan).{0,25}(sekarang|saat ini)"
    r"|(berita|headline).{0,25}(hari ini|terbaru|pagi ini)", re.I)

# ── Angka/nama spesifik yang biasanya butuh sumber ──
SPESIFIK = re.compile(
    r"(\b\d{1,3}([.,]\d{3})+\b"                       # 1.234.567
    r"|\b\d+([.,]\d+)?\s*(juta|miliar|triliun|persen|%)\b"
    r"|\btahun\s+(19|20)\d{2}\b"
    r"|\bRp\s?\d)", re.I)

JANJI = re.compile(
    r"(akan (segera )?saya (cari|carikan|cek|periksa|baca|buka)"
    r"|saya (cari|carikan|cek)kan (dulu|sekarang)"
    r"|tunggu sebentar,? saya)", re.I)


def psql(sql: str, host: str) -> str:
    cmd = ["ssh", "-i", str(Path.home() / ".ssh" / "sidix_session_key"), host,
           "docker exec ado-postgres-1 psql -U ado -d ado -Atc '%s'" % sql.replace("'", "'\"'\"'").replace("\n", " ")]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("query gagal: " + (r.stderr or "")[:300])
    return r.stdout or ""


def punya_tool(tool_calls: str) -> bool:
    t = (tool_calls or "").strip()
    return bool(t) and t not in ("null", "[]", "{}", "")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--host", default="<user>@<host>")
    ap.add_argument("--out", default="data/audit")
    ap.add_argument("--min-len", type=int, default=40)
    args = ap.parse_args()

    if not args.live:
        raise SystemExit("pakai --live selagi server masih hidup")

    out = ROOT / args.out
    out.mkdir(parents=True, exist_ok=True)

    nl = lambda c: "replace(replace(coalesce(%s::text,''), chr(10), ' '), chr(13), ' ')" % c
    rows = psql(
        "select m.id||'%s'||%s||'%s'||%s||'%s'||coalesce(f.signal_type,'') "
        "from messages m "
        "left join interactions_feedback f on f.message_id = m.id "
        "where m.role='assistant' and length(m.content) > %d"
        % (SEP, nl("m.content"), SEP, nl("m.tool_calls"), SEP, args.min_len), args.host)

    temuan, stat = [], Counter()
    total = 0
    for line in rows.splitlines():
        if not line.strip():
            continue
        p = line.split(SEP)
        if len(p) < 4:
            continue
        mid, isi, tools, sinyal = p[0], p[1], p[2], p[3]
        total += 1
        ada_tool = punya_tool(tools)
        sudah_dinilai = bool(sinyal)

        masalah = []
        if KLAIM_TOOL.search(isi) and not ada_tool:
            m = KLAIM_TOOL.search(isi)
            # Diturunkan dari "bukti mati" (2026-07-26): tool_calls kosong TIDAK
            # membuktikan apa pun selama jalur streaming belum menyimpannya. Lihat
            # docstring + docs/jarvis/74_TOOL_CALLING_SARANA_AUDIT.md §T-1.
            masalah.append(("KLAIM_TOOL_PALSU", "perlu dicek", m.group(0)[:70]))
        if VOLATILE.search(isi) and not ada_tool:
            m = VOLATILE.search(isi)
            masalah.append(("FAKTA_VOLATILE_TANPA_TOOL", "hampir pasti", m.group(0)[:70]))
        if JANJI.search(isi) and not ada_tool:
            m = JANJI.search(isi)
            masalah.append(("JANJI_TANPA_EKSEKUSI", "hampir pasti", m.group(0)[:70]))
        if SPESIFIK.search(isi) and not ada_tool and len(isi) > 200:
            m = SPESIFIK.search(isi)
            masalah.append(("ANGKA_TANPA_SUMBER", "perlu dicek", m.group(0)[:70]))

        for kelas, keyakinan, bukti in masalah:
            stat[kelas] += 1
            if sudah_dinilai:
                stat["_sudah_dinilai"] += 1
            temuan.append({
                "message_id": mid, "kelas": kelas, "keyakinan": keyakinan,
                "bukti": bukti, "ada_tool_call": ada_tool,
                "sudah_dinilai_user": sinyal or None,
                "kutipan": isi[:400],
            })

    urutan = {"bukti mati": 0, "hampir pasti": 1, "perlu dicek": 2}
    temuan.sort(key=lambda t: (urutan[t["keyakinan"]], t["kelas"]))

    with open(out / "temuan_audit.jsonl", "w", encoding="utf-8") as f:
        for t in temuan:
            f.write(json.dumps(t, ensure_ascii=False) + "\n")

    # Daftar konfirmasi untuk manusia — hanya yang keyakinannya tinggi, ringkas.
    tinggi = [t for t in temuan if t["keyakinan"] in ("bukti mati", "hampir pasti")
              and not t["sudah_dinilai_user"]]
    with open(out / "untuk_dikonfirmasi.md", "w", encoding="utf-8") as f:
        f.write("# Daftar konfirmasi cepat\n\n")
        f.write("Semua di bawah ini terdeteksi **secara struktural**, tanpa perlu tahu jawaban benarnya.\n")
        f.write("Cukup jawab: **ya (salah)** atau **bukan**.\n\n")
        for i, t in enumerate(tinggi[:80], 1):
            f.write("## %d. %s  _(%s)_\n\n" % (i, t["kelas"], t["keyakinan"]))
            f.write("**Bukti:** model menulis _\"%s\"_ — tetapi **tidak ada tool call** pada pesan itu.\n\n"
                    % t["bukti"])
            f.write("> %s\n\n" % t["kutipan"][:300].replace("\n", " "))
            f.write("`message_id: %s`\n\n---\n\n" % t["message_id"])

    laporan = {
        "waktu": datetime.now(timezone.utc).isoformat(),
        "pesan_asisten_diperiksa": total,
        "temuan": len(temuan),
        "per_kelas": {k: v for k, v in stat.items() if not k.startswith("_")},
        "sudah_pernah_dinilai_user": stat["_sudah_dinilai"],
        "untuk_dikonfirmasi": len(tinggi),
        "catatan": ("KLAIM_TOOL_PALSU DITURUNKAN ke 'perlu dicek' (2026-07-26): kolom "
                    "tool_calls memang SELALU kosong di jalur streaming (SSE) karena "
                    "hanya jalur non-streaming yang menyimpannya. Jadi kolom kosong "
                    "tidak membuktikan model mengarang. Perbaiki persistensi streaming "
                    "dulu, baru kelas ini sahih. Lihat docs/jarvis/74_TOOL_CALLING_"
                    "SARANA_AUDIT.md sec T-1."),
    }
    (out / "laporan_audit.json").write_text(json.dumps(laporan, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=" * 64)
    print("AUDITOR OTOMATIS — kesalahan yang terbukti tanpa tahu jawaban benar")
    print("=" * 64)
    print("  pesan asisten diperiksa : %d" % total)
    print("  temuan                  : %d" % len(temuan))
    for k, v in sorted(stat.items(), key=lambda x: -x[1]):
        if not k.startswith("_"):
            print("     %-28s %d" % (k, v))
    print("  sudah pernah dinilai    : %d (sisanya belum tersentuh)" % stat["_sudah_dinilai"])
    print("  → siap dikonfirmasi     : %d  (untuk_dikonfirmasi.md)" % len(tinggi))
    print("  → %s" % out.resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
