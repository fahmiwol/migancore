"""
F-075 router unit-test — volatile-fact forced grounding precision/recall.
========================================================================
The Ollama-based eval (eval_3axis/eval_gate) calls /api/chat directly and NEVER
exercises tool_router.route_tools / _reflex_tool. This test does — it asserts the
decision gate directly (the reflex in chat.py mirrors the SAME _is_volatile_fact_query,
so testing the gate certifies both routing AND execution).

Run:  PYTHONPATH=. python eval/test_volatile_router.py
Exit: 0 = all pass, 1 = any failure.
"""
from __future__ import annotations

import asyncio
import sys

from services.tool_router import (
    _is_volatile_fact_query,
    _clean_volatile_query,
    route_tools,
)

AVAIL = [
    "onamix_search", "onamix_get", "web_search", "web_read",
    "stock_quote", "currency_convert", "create_reminder", "finance_calc",
    "generate_image", "generate_chart", "memory_search", "memory_write",
    "get_datetime", "translate_text", "read_pdf",
]

# (A) MUST FIRE the volatile gate (current-fact lookup → search, not abstain)
FIRE = [
    "siapa presiden indonesia hari ini",
    "siapa presiden indonesia",
    "siapa gubernur jawa barat saat ini",
    "siapa menteri keuangan",
    "harga emas hari ini",
    "berapa harga emas sekarang",
    "presiden indonesia sekarang",
    "cuaca jakarta hari ini",
    "berapa suhu bandung sekarang",
    "who is the president now",
]

# (B) MUST NOT FIRE (opinion / meta / stable-historical / casual / math / self-worth / long statement)
NO_FIRE = [
    "menghargai diri sendiri sekarang gimana caranya",     # 'harga' is a substring, NOT a token
    "harga diri ku sekarang lagi jatuh banget",            # 'harga diri' phrase exclude
    "siapa presiden pertama indonesia",                    # 'pertama' stable exclude
    "apakah kamu bisa kasih berita sekarang",              # 'apakah kamu' meta exclude
    "dulu harga bensin murah sekarang mahal ya",           # 'dulu' exclude + statement
    "kenapa harga barang sekarang naik terus sih",         # 'kenapa' opinion exclude
    "menurutmu siapa gubernur terbaik sepanjang sejarah",  # 'menurut'/'sejarah' exclude
    "eh kabar kamu gimana sekarang udah lama ga ngobrol",  # 'kabar' is not a volatile noun
    "siapa kamu",                                          # identity, no volatile noun
    "berapa 15 + 27 x 2",                                  # math, no volatile noun
    "halo apa kabar",                                      # casual
    "kalung emas kamu bagus banget sekarang ya kan asli",  # long statement (>8 words), no lookup
    "jelaskan apa itu inflasi",                            # concept (also short-circuited upstream)
]

# (C) Dedicated-tool collisions — keyword pass must win; volatile fallback must NOT hijack to onamix.
COLLISION = [
    ("harga saham bbca hari ini", "stock_quote"),
    ("kurs dollar ke rupiah sekarang", "currency_convert"),
    ("harga bitcoin sekarang", "stock_quote"),
    ("ingatkan aku meeting jam 3 hari ini", "create_reminder"),
    ("berapa cicilan kpr 500 juta", "finance_calc"),
]

# (D) clean-query (F-073f: role/entity only, no year)
CLEAN = [
    ("siapa presiden indonesia hari ini", "presiden indonesia"),
    ("berapa harga emas sekarang", "harga emas"),
    ("siapa gubernur jawa barat saat ini", "gubernur jawa barat"),
    ("siapa menteri keuangan", "menteri keuangan"),
]


async def main() -> int:
    fails: list[str] = []

    for q in FIRE:
        if not _is_volatile_fact_query(q):
            fails.append(f"[FIRE-gate] expected True: {q!r}")
            continue
        routed = await route_tools(q, AVAIL)
        if "onamix_search" not in routed:
            fails.append(f"[FIRE-route] expected onamix_search in {routed}: {q!r}")

    for q in NO_FIRE:
        if _is_volatile_fact_query(q):
            fails.append(f"[NO_FIRE-gate] expected False: {q!r}")

    for q, want in COLLISION:
        routed = await route_tools(q, AVAIL)
        if want not in routed:
            fails.append(f"[COLLISION] expected {want} in {routed}: {q!r}")
        if "onamix_search" in routed:
            fails.append(f"[COLLISION] onamix_search wrongly hijacked {q!r} -> {routed}")

    for q, want in CLEAN:
        got = _clean_volatile_query(q)
        if got != want:
            fails.append(f"[CLEAN] {q!r} -> {got!r} (want {want!r})")

    total = len(FIRE) * 2 + len(NO_FIRE) + len(COLLISION) * 2 + len(CLEAN)
    print(f"volatile_router: {total - len(fails)}/{total} checks passed")
    if fails:
        print("\nFAILURES:")
        for f in fails:
            print("  -", f)
        return 1
    print("ALL PASS")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
