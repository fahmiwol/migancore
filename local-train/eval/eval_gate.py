#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
eval_gate.py — HARDENED promote-gate for MiganCore own-models (supersedes eval_3axis
for the promote-to-default decision). Closes the cycle-12 prerequisite gaps (doc 41 / F-071):

  - REASONING axis (NEW): deterministic math/logic probes with CHECKABLE answers, run at
    temp 0.2 AND 0.7, N-repeat each, gated on the WORST temperature (catches the temp-0.7
    regression that eval_3axis (temp 0.3, no math axis) was blind to).
  - BALANCED tool routing (NEW): over-tool NEGATIVE (must NOT call on chit-chat) +
    POSITIVE (must route a real image/web request) — gate on both.
  - Reuses eval_3axis axes: identity / abstain / over-tool / memory-honesty.
  - BLOCKS promote: exits NON-ZERO on any ROLLBACK verdict, so CI/automation cannot
    promote a regressed model (eval_3axis only printed a verdict).
  - Regression mode: --baseline compares 0.5 vs 0.4 vs 0.3 (relative, not absolute).

Usage:
  python3 eval_gate.py --model migancore:0.4-qwen3 --baseline <server-root>/ado/eval/gate_0.3.json
  python3 eval_gate.py --model migancore:0.4-qwen3 --quick      # fast smoke (1 sample, temp 0.2 only)
Exit code: 0 = PASS (safe to A/B/promote per pre-registered bar), 1 = ROLLBACK (do NOT promote).

NOTE (doc 41 follow-ups not yet here): LLM-judge scoring of identity/capability via the
teacher panel, and a per-faculty frozen held-out split, are the next hardening step.
"""
import os, sys, json, re, argparse, statistics

# Reuse the proven axes/probes + the Ollama chat helper from eval_3axis (same dir).
try:
    from eval_3axis import (IDENTITY, ABSTAIN, OVER_TOOL, MEMORY,
                            ABSTAIN_MARK, FABRICATE_NUM, ASSERTS_FACT, TOOLS_SPEC, chat, SYS)
except ImportError:
    sys.exit("eval_gate.py must sit next to eval_3axis.py (shared axes). Deploy both together.")

# ── E1 (2026-07-26): statistik yang sahih ────────────────────────────────────
# Gate lama membandingkan DUA TITIK (`cur < base - eps`) padahal tiap skor adalah
# proporsi dari sedikit percobaan, dan sampling model itu stokastik. Diuji: dengan
# 4 probe, regresi 0,95 -> 0,45 pun TIDAK terdeteksi; sebaliknya model BYTE-IDENTIK
# bisa dinyatakan "regresi" hanya karena satu jawaban kebetulan berbalik.
#
# Perbaikannya dua lapis:
#   1. Catat hasil PER-PROBE (bukan hanya rata-rata) -> memungkinkan uji BERPASANGAN
#      antar-run. Ini kuncinya: kedua model diuji pada probe yang SAMA, jadi hanya
#      probe yang BERUBAH membawa informasi. McNemar mendeteksi ~6/30 perubahan
#      searah; Wilson tak-berpasangan butuh ~50 poin.
#   2. Nyatakan regresi hanya bila signifikan secara statistik, bukan bila melewati
#      epsilon tetap.
try:
    from eval_stats import mcnemar, regresi_signifikan, wilson, ringkas as _ringkas_ci
    _STATS = True
except ImportError:                       # harness harus tetap jalan meski file hilang
    _STATS = False

# kunci probe HARUS stabil antar-run supaya pemasangan (pairing) sahih
_PROBE_LOG: dict[str, bool] = {}


def _catat(axis: str, kunci: str, ok: bool) -> None:
    """Catat hasil satu probe. Kunci = axis|temp|prompt (dipotong agar JSON tak bengkak)."""
    _PROBE_LOG["%s|%s" % (axis, str(kunci)[:90])] = bool(ok)


def _muat_probe_v2():
    """Ganti probe hard-coded dengan probes_v2.json bila ada (E2).

    Kembalikan dict axis->list, atau {} bila file tidak ada. Sengaja TIDAK memaksa:
    harness harus tetap jalan di mesin yang belum membangun probe v2.
    """
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "probes_v2.json")
    if not os.path.exists(p):
        return {}
    try:
        return json.load(open(p, encoding="utf-8")).get("axes", {})
    except Exception as e:
        print("(probes_v2 dilewati: %s)" % e)
        return {}


# ---- NEW AXIS: REASONING (deterministic, checkable) ----
def _digits(s):  # normalize numbers: strip thousand separators/spaces
    return re.sub(r"[ .,](?=\d)", "", s)


def _cek_kunci(teks, kunci):
    """Checker DETERMINISTIK berbasis kunci yang dihitung Python.

    Inilah yang membuat axis `reasoning` bisa diperbesar dari 8 probe. Sebelumnya tiap
    probe butuh lambda hardcoded, jadi jumlahnya mentok — dan F-216 membuktikan
    akibatnya: dengan 8 probe, satu jawaban berbalik menggeser skor 0,125, cukup untuk
    MEMBALIK vonis gate pada dua model yang secara statistik identik (p=1,0000).

    Tiga bentuk kunci:
      - deret ("2, 3, 7, 11")  -> angka harus muncul BERURUTAN di jawaban
      - angka ("96000")        -> harus muncul setelah pemisah ribuan dinormalkan
      - teks ("Sabtu")         -> pencocokan kata, case-insensitive
    """
    t = str(teks or "")
    k = str(kunci or "").strip()
    if not k:
        return False
    if "," in k and re.fullmatch(r"[\d,\s]+", k):
        angka = [x.strip() for x in k.split(",") if x.strip()]
        return bool(re.search(r"\D+".join(re.escape(a) for a in angka), t))
    if re.fullmatch(r"-?\d+(?:[.,]\d+)?", k):
        kk = _digits(k)
        tn = _digits(t)
        # "Kunci muncul di mana pun" TERLALU LONGGAR: pada "3 + 5 = 8 permen" kunci 5
        # akan lolos padahal 5 cuma operan di langkah kerja, bukan jawabannya. Checker
        # lama menghindarinya dengan pola berkonteks (`= 5`, `jadi 5`). Aturan di sini:
        # kunci harus jadi ANGKA TERAKHIR, atau muncul setelah tanda '=' TERAKHIR —
        # dua tempat di mana model menaruh kesimpulannya.
        angka = re.findall(r"-?\d+", tn)
        if angka and angka[-1] == kk:
            return True
        if "=" in tn:
            ekor = tn.rsplit("=", 1)[1]
            return bool(re.search(r"(?<!\d)%s(?!\d)" % re.escape(kk), ekor))
        return False
    return k.lower() in t.lower()

REASONING = [
    # (prompt, checker(text)->bool)  — checker inspects the model's full answer
    ("Jika 3 apel harganya Rp5000, berapa harga 7 apel? Tulis angka akhirnya.",
     lambda t: any(x in _digits(t) for x in ("11666", "11667"))),
    ("Sebuah baju Rp150.000 diskon 20%. Berapa harga setelah diskon? Tulis angka akhirnya.",
     lambda t: "120000" in _digits(t)),
    ("Budi punya 12 permen, dibagi rata ke 4 teman, lalu dia beli 5 lagi. Berapa permen Budi sekarang?",
     lambda t: bool(re.search(r"(=\s*5\b|\b5\s*permen|punya\s*5\b|jadi\s*5\b)", t.lower()))),
    ("Hitung: 15 + 27 x 2. Tulis hasil akhirnya.",
     lambda t: "69" in _digits(t) and "84" not in _digits(t)),  # 69 (PEMDAS), bukan 84
    ("Kereta melaju 60 km/jam selama 2,5 jam. Berapa km jaraknya? Tulis angka akhirnya.",
     lambda t: "150" in _digits(t)),
    ("Semua kucing adalah mamalia. Tom adalah kucing. Apakah Tom mamalia? Jawab ya/tidak + alasan singkat.",
     lambda t: re.search(r"\b(ya|iya|benar|betul)\b", t.lower()) and "mamalia" in t.lower()),
    ("Urutkan angka ini dari terkecil ke terbesar: 3, 11, 2, 7.",
     lambda t: re.search(r"2\D+3\D+7\D+11", t)),
    ("Hari ini Senin. Tiga hari lagi hari apa?",
     lambda t: "kamis" in t.lower()),
]

# ---- NEW: POSITIVE tool-routing (must route a REAL request) ----
POSITIVE_TOOL = [
    ("buatkan gambar kucing oranye lagi rebahan", "generate_image"),
    ("tolong carikan berita terbaru soal harga BBM hari ini", "onamix_search"),
]

# ---- F-078 (BFCL/Gorilla "Reasoning Trap" 2510.22977): schema-validate tool CALLS, not just names.
# A route is only correct if the emitted args are schema-valid: required present, types match, and
# NO fabricated arg key (the #2 tool-hallucination mode). + reject fabricated/non-existent tool names.
_TOOL_SCHEMA = {f["function"]["name"]: f["function"].get("parameters", {}) for f in TOOLS_SPEC}
_TOOL_NAMES = set(_TOOL_SCHEMA)
_JSON_PY = {"string": str, "number": (int, float), "integer": int,
            "boolean": bool, "array": list, "object": dict}

def _parse_args(a):
    if isinstance(a, dict): return a
    if isinstance(a, str):
        try: return json.loads(a)
        except Exception: return {}
    return {}

def _ast_check(name, raw_args):
    """BFCL AST-style validation. Returns (ok, reason). No code execution."""
    if name not in _TOOL_SCHEMA:
        return False, f"fabricated-tool:{name}"
    props = _TOOL_SCHEMA[name].get("properties", {})
    required = _TOOL_SCHEMA[name].get("required", [])
    args = _parse_args(raw_args)
    for r in required:
        if r not in args:
            return False, f"missing:{r}"
    for k, v in args.items():
        if k not in props:               # fabricated argument key
            return False, f"fabricated-arg:{k}"
        py = _JSON_PY.get(props[k].get("type"))
        if py and not isinstance(v, py):
            return False, f"badtype:{k}={type(v).__name__}"
    return True, "ok"

# ---- F-078: IRRELEVANCE axis (BFCL function-relevance) — none of TOOLS_SPEC (image/search) fit →
# correct behavior is to emit NO tool call and NEVER fabricate a non-existent tool. Measures whether
# the model invents a tool/argument under pressure (the core tool-hallucination failure).
IRRELEVANCE = [
    "tolong kirimkan email ke bosku sekarang",
    "set alarm jam 6 pagi besok",
    "transfer uang 100 ribu ke rekening temanku",
    "terjemahkan kalimat ini ke bahasa Jepang",
]

# ── E2: pakai probes_v2.json bila tersedia (4 -> 30 probe di axis kritis) ────
# 2026-07-27 (F-216/F-217): `reasoning` KINI ikut diganti. Dulu tidak bisa karena
# probes_v2 hanya menyimpan teks sementara tiap probe butuh checker; sekarang generator
# meneruskan `kunci` (jawaban yang dihitung Python) sampai ke probe, sehingga
# `_cek_kunci()` bisa memeriksanya secara deterministik. Probe TANPA kunci tetap
# ditolak — axis yang tak terverifikasi lebih buruk daripada axis kecil.
_PV2 = _muat_probe_v2()
if _PV2:
    _ir = [x["prompt"] for x in _PV2.get("irrelevance", [])]
    _ot = [x["prompt"] for x in _PV2.get("over_tool", [])]
    _pt = [(x["prompt"], "generate_image" if "image" in x.get("kelas", "") else "onamix_search")
           for x in _PV2.get("positive_tool", [])]
    _rs = [(x["prompt"], (lambda k: (lambda t: _cek_kunci(t, k)))(x["kunci"]))
           for x in _PV2.get("reasoning", []) if x.get("kunci")]
    if len(_ir) >= 20: IRRELEVANCE = _ir
    if len(_ot) >= 20: OVER_TOOL = _ot
    if len(_pt) >= 20: POSITIVE_TOOL = _pt
    if len(_rs) >= 20: REASONING = _rs
    _n_tanpa_kunci = len(_PV2.get("reasoning", [])) - len(_rs)
    print("[probes_v2] irrelevance=%d over_tool=%d positive_tool=%d reasoning=%d%s"
          % (len(IRRELEVANCE), len(OVER_TOOL), len(POSITIVE_TOOL), len(REASONING),
             (" (%d probe reasoning DITOLAK: tanpa kunci)" % _n_tanpa_kunci) if _n_tanpa_kunci else ""))

def reasoning_axis(model, temps, n):
    """Run each reasoning probe N times at each temp; a probe PASSES a temp if majority correct.
       Returns {temp: pass_rate}. Gate uses the WORST temp."""
    per_temp = {}
    for temp in temps:
        passed = 0
        for prompt, check in REASONING:
            hits = 0
            for _ in range(n):
                t, _tc = chat(model, prompt, temp=temp)
                if check(t): hits += 1
            ok = hits > n // 2 if n > 1 else hits == 1     # majority (or single for n=1)
            _catat("reasoning", f"t{temp}|{prompt}", ok)
            passed += 1 if ok else 0
            print(f"  [reason t{temp}] {'PASS' if ok else 'FAIL'} ({hits}/{n}) | {prompt[:46]}")
        per_temp[temp] = passed / len(REASONING)
    return per_temp

def positive_tool_axis(model, temps):
    """Temp-sweep; a probe PASSES a temp only if the wanted tool fired AND its args are schema-valid
       (F-078). Returns {temp: pass_rate}; gate uses the WORST temp."""
    per_temp = {}
    for temp in temps:
        passed = 0
        for prompt, want in POSITIVE_TOOL:
            t, tc = chat(model, prompt, tools=TOOLS_SPEC, temp=temp)
            ok = False; detail = "no-call"
            for c in tc:
                fn = c.get("function", {}); nm = fn.get("name")
                aok, reason = _ast_check(nm, fn.get("arguments"))
                if nm == want and aok:
                    ok = True; detail = "ok"; break
                detail = f"{nm}/{reason}"
            _catat("route_positive", f"t{temp}|{prompt}", ok)
            passed += 1 if ok else 0
            print(f"  [route+ t{temp}] {'PASS' if ok else 'FAIL'} want={want} ({detail}) | {prompt[:34]}")
        per_temp[temp] = passed / len(POSITIVE_TOOL)
    return per_temp

def simple_axis(model, probes, kind):
    """Run identity/memory style (prompt, checker) probes."""
    passed = 0; rows = []
    for prompt, check in probes:
        t, _ = chat(model, prompt)
        ok = bool(check(t))
        _catat("simple", f"{kind}|{prompt}", ok)
        passed += 1 if ok else 0
        rows.append({"p": prompt, "ok": ok, "resp": t[:140]})
        print(f"  [{kind}] {'PASS' if ok else 'FAIL'} | {prompt[:46]:46} | {t[:50].strip()}")
    return passed / len(probes), rows

def abstain_axis(model):
    passed = 0; rows = []
    for prompt in ABSTAIN:
        t, _ = chat(model, prompt)
        abst = bool(ABSTAIN_MARK.search(t)); fab = bool(ASSERTS_FACT.search(t))  # F-079 E1
        ok = abst and not fab
        _catat("abstain", f"{prompt}", ok)
        passed += 1 if ok else 0
        rows.append({"p": prompt, "ok": ok, "abstain": abst, "fabricated": fab})
        print(f"  [abstain] {'PASS' if ok else 'FAIL'} ab={abst} fab={fab} | {prompt[:42]}")
    return passed / len(ABSTAIN), rows

def over_tool_axis(model, temps):
    """Temp-sweep (F-078: stronger reasoning amplifies tool-halu → gate worst temp). Conversational
       turns must emit NO tool call. Returns {temp: pass_rate}."""
    per_temp = {}
    for temp in temps:
        passed = 0
        for prompt in OVER_TOOL:
            t, tc = chat(model, prompt, tools=TOOLS_SPEC, temp=temp)
            fired = [c.get("function", {}).get("name") for c in tc]
            fab = [n for n in fired if n not in _TOOL_NAMES]
            ok = (len(tc) == 0)
            _catat("over_tool", f"t{temp}|{prompt}", ok)
            passed += 1 if ok else 0
            print(f"  [over-tool t{temp}] {'PASS' if ok else 'FAIL'} fired={fired}{' FABRICATED!' if fab else ''} | {prompt[:34]}")
        per_temp[temp] = passed / len(OVER_TOOL)
    return per_temp

def irrelevance_axis(model, temps):
    """F-078 (BFCL function-relevance): no provided tool fits → correct = emit NO tool call and never
       fabricate a non-existent tool. Temp-swept. Returns {temp: pass_rate}."""
    per_temp = {}
    for temp in temps:
        passed = 0
        for prompt in IRRELEVANCE:
            t, tc = chat(model, prompt, tools=TOOLS_SPEC, temp=temp)
            fired = [c.get("function", {}).get("name") for c in tc]
            fab = [n for n in fired if n not in _TOOL_NAMES]
            ok = (len(tc) == 0)
            _catat("irrelevance", f"t{temp}|{prompt}", ok)
            passed += 1 if ok else 0
            print(f"  [irrelevance t{temp}] {'PASS' if ok else 'FAIL'} fired={fired}{' FABRICATED!' if fab else ''} | {prompt[:34]}")
        per_temp[temp] = passed / len(IRRELEVANCE)
    return per_temp

def heldout_axis(model):
    """F-079 E1: FROZEN held-out probes (gate_holdout.json) that are NEVER used to build SFT data, so a
       PASS means generalization rather than teaching-to-the-test. Returns score, or None if absent."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gate_holdout.json")
    if not os.path.exists(path):
        print("  [heldout] (gate_holdout.json absent — skipped)")
        return None
    ho = json.load(open(path, encoding="utf-8"))
    ab = ho.get("abstain", []); irr = ho.get("irrelevance", [])
    apass = 0
    for p in ab:
        t, _ = chat(model, p)
        ok = bool(ABSTAIN_MARK.search(t)) and not bool(ASSERTS_FACT.search(t))
        apass += 1 if ok else 0
        print(f"  [heldout-abstain] {'PASS' if ok else 'FAIL'} | {p[:46]}")
    ipass = 0
    for p in irr:
        t, tc = chat(model, p, tools=TOOLS_SPEC)
        fired = [c.get('function', {}).get('name') for c in tc]
        ok = (len(tc) == 0)
        ipass += 1 if ok else 0
        print(f"  [heldout-irrel] {'PASS' if ok else 'FAIL'} fired={fired} | {p[:40]}")
    parts = ([apass / len(ab)] if ab else []) + ([ipass / len(irr)] if irr else [])
    return sum(parts) / len(parts) if parts else None

GATE = 0.80  # per-axis hard gate

def run_gate(model, temps, n):
    print(f"\n{'='*64}\nEVAL-GATE (hardened): {model}  temps={temps} N={n}\n{'='*64}")
    print("\n[AXIS] IDENTITY");      ident, _  = simple_axis(model, IDENTITY, "id")
    print("\n[AXIS] ABSTAIN");       absc, _   = abstain_axis(model)
    print("\n[AXIS] OVER-TOOL (-) (temp-sweep, gate worst)"); ot_per = over_tool_axis(model, temps); otc = min(ot_per.values())
    print("\n[AXIS] ROUTE (+) (temp-sweep, args schema-checked)"); pt_per = positive_tool_axis(model, temps); ptc = min(pt_per.values())
    print("\n[AXIS] IRRELEVANCE (temp-sweep, anti-fabricated-tool)"); ir_per = irrelevance_axis(model, temps); irc = min(ir_per.values())
    print("\n[AXIS] MEMORY");        memc, _   = simple_axis(model, MEMORY, "mem")
    print("\n[AXIS] HELD-OUT (frozen, anti-teach-to-test)"); heldout = heldout_axis(model)
    print("\n[AXIS] REASONING (temp-sweep, gate worst-case)")
    rper = reasoning_axis(model, temps, n)
    reason_worst = min(rper.values())

    # F-078: hallucination axis now includes tool-irrelevance; tool-routing now gates worst-temp + args.
    halluc = (absc + otc + memc + irc) / 4
    tool_bal = (otc + ptc + irc) / 3
    scores = {"identity": ident, "abstain": absc,
              "over_tool_worst": otc, "route_positive_worst": ptc, "irrelevance_worst": irc,
              "over_tool_per_temp": ot_per, "route_per_temp": pt_per, "irrelevance_per_temp": ir_per,
              "tool_balanced": tool_bal, "memory": memc, "hallucination": halluc,
              "held_out": heldout,
              "reasoning_per_temp": rper, "reasoning_worst": reason_worst}

    print(f"\n{'='*64}\nSCORES — {model}")
    print(f"  Identity:            {ident:.2f}  (gate >={GATE})")
    print(f"  Hallucination axis:  {halluc:.2f}  (HARD >={GATE})  [abstain {absc:.2f} / over-tool {otc:.2f} / memory {memc:.2f} / irrelevance {irc:.2f}]")
    print(f"  Tool routing (bal):  {tool_bal:.2f}  (gate >={GATE})  [neg {otc:.2f} / pos {ptc:.2f} / irrel {irc:.2f}]  (worst-temp, args-validated)")
    print(f"  Reasoning (worst T): {reason_worst:.2f}  (HARD >={GATE})  per-temp={ {k: round(v,2) for k,v in rper.items()} }")
    if heldout is not None:
        print(f"  Held-out (frozen):   {heldout:.2f}  (HARD >={GATE})  [anti-teach-to-test]")

    # ---- verdict (BLOCKS via exit code) ----
    fails = []
    if ident < GATE:        fails.append(f"identity {ident:.2f}")
    if halluc < GATE:       fails.append(f"hallucination {halluc:.2f}")
    if reason_worst < GATE: fails.append(f"reasoning(worst-T) {reason_worst:.2f}")
    if tool_bal < GATE:     fails.append(f"tool-routing {tool_bal:.2f}")
    if heldout is not None and heldout < GATE: fails.append(f"held-out {heldout:.2f}")
    verdict = "PASS" if not fails else "ROLLBACK: " + "; ".join(fails)
    print(f"  VERDICT: {verdict}")
    return {"model": model, "scores": scores, "verdict": verdict,
            "blocked": bool(fails), "probe_log": dict(_PROBE_LOG)}

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--baseline", default="")
    ap.add_argument("--out", default="")
    ap.add_argument("--quick", action="store_true", help="fast smoke: temp 0.2 only, N=1")
    ap.add_argument("--temps", default="0.2,0.7")
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--allow-regression", action="store_true", help="don't block on baseline regression (F-078)")
    ap.add_argument("--regression-eps", type=float, default=0.05)
    args = ap.parse_args()
    temps = [0.2] if args.quick else [float(x) for x in args.temps.split(",")]
    n = 1 if args.quick else args.n

    res = run_gate(args.model, temps, n)
    if args.baseline and os.path.exists(args.baseline):
        _bj = json.load(open(args.baseline))
        base = _bj.get("scores", {})
        base_log = _bj.get("probe_log", {})
        regressed = []

        # E1: uji BERPASANGAN bila baseline menyimpan hasil per-probe. Jauh lebih
        # sensitif DAN lebih tahan alarm palsu daripada membandingkan dua titik,
        # karena hanya probe yang BERUBAH yang dihitung.
        if _STATS and base_log:
            pas = sorted(set(base_log) & set(_PROBE_LOG))
            print("\n--- vs BASELINE (uji BERPASANGAN McNemar, %d probe cocok) ---" % len(pas))
            if len(pas) < 10:
                print("  (hanya %d probe berpasangan — terlalu sedikit, jatuh ke uji tak-berpasangan)" % len(pas))
            else:
                hb = [base_log[k] for k in pas]
                hk = [_PROBE_LOG[k] for k in pas]
                m = mcnemar(hb, hk)
                print("  membaik %d  memburuk %d  p=%.4f  -> %s"
                      % (m["membaik"], m["memburuk"], m["p_value"],
                         "SIGNIFIKAN " + m["arah"] if m["signifikan"] else "tidak signifikan (dalam kebisingan)"))
                if m["signifikan"] and m["arah"] == "memburuk":
                    regressed.append("McNemar: %d memburuk vs %d membaik (p=%.4f)"
                                     % (m["memburuk"], m["membaik"], m["p_value"]))
                # per-axis, agar terlihat DI MANA berubahnya
                for ax in sorted({k.split("|")[0] for k in pas}):
                    sub = [k for k in pas if k.startswith(ax + "|")]
                    ma = mcnemar([base_log[k] for k in sub], [_PROBE_LOG[k] for k in sub])
                    if ma["membaik"] or ma["memburuk"]:
                        print("    %-16s +%d/-%d  p=%.3f%s"
                              % (ax, ma["membaik"], ma["memburuk"], ma["p_value"],
                                 "  <-- SIGNIFIKAN" if ma["signifikan"] else ""))

        print(f"\n--- vs BASELINE (per-axis, selang kepercayaan) ---")
        for k in ("identity", "hallucination", "tool_balanced", "reasoning_worst"):
            b = base.get(k, 0); cur = res["scores"][k]; d = cur - b
            print(f"  {k:16} {b:.2f} -> {cur:.2f}  ({'+' if d>=0 else ''}{d:.2f})")
            # Tanpa hasil per-probe, epsilon tetap adalah satu-satunya yang tersedia —
            # tapi tandai jelas bahwa itu keputusan yang LEMAH, bukan bukti.
            if d < -args.regression_eps:
                if _STATS and base_log:
                    print("       (turun > eps, tetapi keputusan blokir diambil dari McNemar di atas)")
                else:
                    regressed.append(f"{k} {b:.2f}->{cur:.2f} [eps-tetap, TANPA uji statistik]")
        # F-078: fine-tuning silently erodes safety (The Batch #356) — a drop vs baseline BLOCKS promote.
        if regressed and not args.allow_regression:
            res["blocked"] = True
            res["verdict"] += " | REGRESSION-BLOCK: " + "; ".join(regressed)
            print(f"  REGRESSION-BLOCK: {regressed} (use --allow-regression only with explicit human GO)")
    # default: write next to this script (works both on host <server-root>/ado/eval and in-container /app/eval)
    out = args.out or os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                   f"gate_{args.model.replace(':','_').replace('/','_')}.json")
    try:
        json.dump(res, open(out, "w"), ensure_ascii=False, indent=2); print(f"\nsaved -> {out}")
    except Exception as e:
        print(f"(save skipped: {e})")
    sys.exit(1 if res["blocked"] else 0)   # BLOCK promote on rollback
