#!/usr/bin/env python
"""ukur_latih.py — pengukur & perekam untuk latih_cluster.py. TANPA torch.

============================== KENAPA BERKAS INI ADA ==========================
Audit 23 Agu 2026 atas latih_cluster.py: skrip melatih dan mengukur, tetapi
TIDAK MEREKAM apa yang masuk dan apa yang keluar secara lengkap:
  - sidik data/soal/kenari tidak tertulis di ringkasan  -> sanad disambung tangan
  - versi pustaka/torch/cuda/GPU tidak tertulis          -> C16 tak terlacak
  - seed & weight_decay berlaku diam-diam (bawaan)       -> keputusan tanpa sadar
  - baris terpotong di 1024 token tidak dihitung         -> jawaban buntung ikut dilatih
  - kurva loss dibuang, hanya rata-rata akhir            -> divergensi tak terlihat
  - gerbang tier-1 tidak tahu jawaban terpotong/tidak    -> "gagal" bisa = buntung
  - prompt gerbang ditulis ulang sebagai literal         -> paritas latih/ukur tak diperiksa

Semua fungsi di sini MURNI (tanpa torch) supaya bisa diuji di laptop:
    python ukur_latih.py --uji-instrumen
latih_cluster.py mengimpornya di GPU. Kontrak keluarannya diperiksa oleh
flywheel/kontrak-latih.mjs (lapisan 2, lihat ARSITEKTUR.md).
"""
import hashlib
import json
import os
import platform
import statistics
import sys
from collections import Counter

FORMAT_KONTRAK = 2  # ringkasan lama (v13) = format 1 (tanpa kunci ini)

# ────────────────────────────────────────────────────────────── berkas ──
def sidik(path, n=16):
    """SHA-256 isi berkas, dipotong n heksa — sama dengan sidik() di migan.mjs."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for blok in iter(lambda: f.read(1 << 20), b""):
            h.update(blok)
    return h.hexdigest()[:n]


def baca_jsonl(path):
    baris = []
    with open(path, encoding="utf-8") as f:
        for i, l in enumerate(f, 1):
            if not l.strip():
                continue
            try:
                baris.append(json.loads(l))
            except json.JSONDecodeError as e:
                raise ValueError(f"{path} baris {i}: JSON rusak ({e})") from None
    return baris


# ──────────────────────────────────────────────────────────────── resep ──
KUNCI_RESEP_WAJIB = {
    "base": str,
    "lora.r": int, "lora.alpha": int, "lora.dropout": (int, float), "lora.target_modules": list,
    "latih.epoch": int, "latih.batch": int, "latih.akumulasi": int, "latih.lr": (int, float),
    "latih.warmup_ratio": (int, float), "latih.scheduler": str, "latih.optim": str,
    "latih.bf16": bool, "latih.weight_decay": (int, float), "latih.seed": int,
    "latih.maks_token": int, "latih.penopengan_prompt": bool,
}


def _ambil(d, jalur):
    for k in jalur.split("."):
        if not isinstance(d, dict) or k not in d:
            return None, False
        d = d[k]
    return d, True


def periksa_resep(resep):
    """Kembalikan daftar masalah (kosong = sehat). Memeriksa kelengkapan & tipe."""
    masalah = []
    for jalur, tipe in KUNCI_RESEP_WAJIB.items():
        v, ada = _ambil(resep, jalur)
        if not ada:
            masalah.append(f"kunci hilang: {jalur}")
        elif isinstance(v, bool) and tipe is not bool:
            masalah.append(f"tipe salah: {jalur} (bool)")
        elif not isinstance(v, tipe):
            masalah.append(f"tipe salah: {jalur} ({type(v).__name__})")
    if not masalah:
        if resep["lora"]["r"] <= 0 or resep["lora"]["alpha"] <= 0:
            masalah.append("lora r/alpha harus > 0")
        if not (0 < resep["latih"]["lr"] < 1):
            masalah.append("lr di luar akal (0,1)")
        if resep["latih"]["epoch"] <= 0:
            masalah.append("epoch harus > 0")
    return masalah


def beda_resep(a, b, awalan=""):
    """Daftar kunci yang nilainya beda antara dua resep (rekursif, lewati 'catatan*'/'keputusanSadar')."""
    beda = []
    kunci = set(a) | set(b)
    for k in sorted(kunci):
        if k.startswith("catatan") or k in ("keputusanSadar", "nama", "pin", "gerbangTier1"):
            continue
        va, vb = a.get(k), b.get(k)
        if isinstance(va, dict) and isinstance(vb, dict):
            beda += beda_resep(va, vb, awalan + k + ".")
        elif va != vb:
            beda.append(f"{awalan}{k}: {va!r} != {vb!r}")
    return beda


# ───────────────────────────────────────────────────────────────── data ──
PERAN = {"system", "human", "gpt"}


def inventaris_data(baris):
    """Ukur yang bisa diukur TANPA tokenizer: prompt sistem, urutan peran, kosong, id ganda, sumber."""
    prompt = Counter()
    sumber = Counter()
    masalah = []
    ids = Counter()
    for i, b in enumerate(baris):
        conv = b.get("conversations")
        if not isinstance(conv, list) or not conv:
            masalah.append(f"baris {i}: tanpa conversations")
            continue
        peran = [m.get("from") for m in conv]
        if any(p not in PERAN for p in peran):
            masalah.append(f"baris {i}: peran asing {peran}")
        if peran[-1] != "gpt":
            masalah.append(f"baris {i}: giliran terakhir bukan gpt ({peran[-1]})")
        if peran.count("system") > 1 or ("system" in peran and peran[0] != "system"):
            masalah.append(f"baris {i}: system bukan di awal / lebih dari satu")
        inti = [p for p in peran if p != "system"]
        for j, p in enumerate(inti):
            if p != ("human" if j % 2 == 0 else "gpt"):
                masalah.append(f"baris {i}: urutan human/gpt tidak bergantian {peran}")
                break
        if any(not str(m.get("value", "")).strip() for m in conv):
            masalah.append(f"baris {i}: ada nilai kosong")
        prompt[conv[0]["value"] if peran[0] == "system" else "(tanpa system)"] += 1
        sumber[b.get("sumber", "(tanpa sumber)")] += 1
        if "id" in b:
            ids[b["id"]] += 1
    ganda = [k for k, n in ids.items() if n > 1]
    if ganda:
        masalah.append(f"id ganda: {len(ganda)} ({ganda[:3]}...)")
    return {
        "baris": len(baris),
        "promptSistem": [{"n": n, "teks": t} for t, n in prompt.most_common()],
        "sumber": dict(sumber.most_common()),
        "masalah": masalah,
    }


def statistik_dari_panjang(n_penuh, n_prompt, ids, maks):
    """Statistik dari daftar panjang token (penuh & prompt) per baris — SATU logika
    untuk GPU (panjang dari tokenizer asli atas teks ber-chat-template) dan uji.
    Mengembalikan JUMLAH BARIS TERPOTONG pada batas maks — ukuran yang sebelumnya tidak ada."""
    if not n_penuh:
        return {"baris": 0, "terpotong": 0, "terpotongId": [], "min": 0, "median": 0, "p95": 0, "maks": 0,
                "batas": maks, "labelPersen": 0.0}
    terpotong_id = [(ids[i] if i < len(ids) and ids[i] is not None else str(i))
                    for i, t in enumerate(n_penuh) if t > maks]
    n_label = [max(0, min(t, maks) - min(p, maks)) for t, p in zip(n_penuh, n_prompt)]
    urut = sorted(n_penuh)
    p95 = urut[min(len(urut) - 1, int(round(0.95 * (len(urut) - 1))))]
    return {
        "baris": len(n_penuh),
        "terpotong": len(terpotong_id),
        "terpotongId": terpotong_id[:20],
        "min": urut[0], "median": int(statistics.median(urut)), "p95": p95, "maks": urut[-1],
        "batas": maks,
        "labelPersen": round(100.0 * sum(n_label) / max(1, sum(min(t, maks) for t in n_penuh)), 1),
    }


def statistik_token(baris, panjang_token, maks):
    """Hitung panjang token per baris lewat callable panjang_token(teks)->int,
    lalu serahkan ke statistik_dari_panjang. Di GPU latih_cluster.py memanggil
    statistik_dari_panjang langsung dengan panjang dari tokenizer asli."""
    n_penuh, n_prompt, ids = [], [], []
    for i, b in enumerate(baris):
        conv = b.get("conversations", [])
        n_penuh.append(panjang_token("\n".join(m.get("value", "") for m in conv)))
        n_prompt.append(panjang_token("\n".join(m.get("value", "") for m in conv[:-1])))
        ids.append(b.get("id", str(i)))
    return statistik_dari_panjang(n_penuh, n_prompt, ids, maks)


# ───────────────────────────────────────────────────────────── lingkungan ──
def versi_lingkungan():
    """Rekam versi yang MEMENGARUHI hasil. Tanpa torch -> 'tidak ada' (bukan galat)."""
    v = {"python": platform.python_version(), "os": platform.platform()[:60],
         "gitCommit": os.environ.get("GIT_COMMIT", "(tidak dikirim)")}
    for nama in ("torch", "transformers", "peft", "datasets", "accelerate"):
        try:
            mod = __import__(nama)
            v[nama] = getattr(mod, "__version__", "?")
        except Exception:
            v[nama] = "tidak ada"
    try:
        import torch  # noqa
        v["cuda"] = torch.version.cuda
        v["gpu"] = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "tidak ada"
    except Exception:
        v["cuda"], v["gpu"] = "tidak ada", "tidak ada"
    return v


# ────────────────────────────────────────────────────────────── kurva loss ──
def ringkas_kurva(log_history):
    """Dari trainer.state.log_history -> kurva + tanda bahaya.

    naikDiAkhir: loss akhir > loss minimum + 0.15 (model memburuk sesudah titik
    terbaik; Databricks memilih checkpoint lewat eval_loss — kami belum, jadi
    minimal TANDAI). nan: ada loss NaN/inf.
    """
    titik = [{"step": h.get("step"), "epoch": round(h.get("epoch", 0), 3), "loss": h["loss"],
              "lr": h.get("learning_rate")} for h in log_history if "loss" in h]
    if not titik:
        return {"titik": [], "n": 0}
    losses = [t["loss"] for t in titik]
    nan = any(not (x == x) or x in (float("inf"), float("-inf")) for x in losses)
    bersih = [x for x in losses if x == x]
    mn = min(bersih) if bersih else None
    return {
        "n": len(titik), "titik": titik,
        "lossAwal": losses[0], "lossAkhir": losses[-1], "lossMin": mn,
        "naikDiAkhir": bool(bersih and losses[-1] > mn + 0.15),
        "nan": nan,
    }


# ────────────────────────────────────────────────────────────── ringkasan ──
def rakit_ringkasan(cluster, resep, sidik_masukan, inventaris, token, kurva, lingkungan, gerbang, menit,
                    beda_resep_izin=None, petak_tahan=None):
    """Satu bentuk keluaran — kontrak format 2. Diperiksa kontrak-latih.mjs."""
    return {
        "formatKontrak": FORMAT_KONTRAK,
        "cluster": cluster,
        "baris": inventaris["baris"],
        "sidik": sidik_masukan,            # {data, soal, kenari, resep, skrip, promptGerbang, tahan}
        "resep": {k: resep[k] for k in ("base", "lora", "latih") if k in resep},
        "resepBedaDiizinkan": beda_resep_izin or [],
        "lingkungan": lingkungan,
        "data": {"promptSistem": inventaris["promptSistem"], "sumber": inventaris["sumber"],
                 "masalah": inventaris["masalah"]},
        "token": token,
        "kurva": kurva,
        # loss = loss langkah terakhir (bukan rata-rata); cadangan ke rata-rata
        # bila kurva kosong supaya pembaca lama (luncurkan_cluster.py) tidak meledak.
        "loss": kurva.get("lossAkhir") if kurva.get("n") else gerbang.get("lossRata"),
        "lossRata": gerbang.get("lossRata"),
        "tokenDilatihPersen": gerbang.get("tokenDilatihPersen"),
        "petakTahan": petak_tahan,          # {n, lossBase, lossAdapter, delta}
        **{k: v for k, v in gerbang.items() if k not in ("lossRata", "tokenDilatihPersen")},
        "menit": menit,
    }


# ───────────────────────────────────────────────────────────── uji instrumen ──
def _uji():
    lulus = gagal = 0

    def cek(nama, ok):
        nonlocal lulus, gagal
        print(("LULUS " if ok else "GAGAL ") + nama)
        if ok:
            lulus += 1
        else:
            gagal += 1

    tok_palsu = lambda t: max(1, len(t) // 4)  # 4 huruf/token

    # resep
    resep_baik = {"base": "X", "lora": {"r": 16, "alpha": 32, "dropout": 0.0, "target_modules": ["q"]},
                  "latih": {"epoch": 2, "batch": 4, "akumulasi": 4, "lr": 2e-4, "warmup_ratio": 0.05,
                            "scheduler": "cosine", "optim": "adamw_torch", "bf16": True,
                            "weight_decay": 0.0, "seed": 42, "maks_token": 1024, "penopengan_prompt": True}}
    cek("resep lengkap diterima", periksa_resep(resep_baik) == [])
    rusak = json.loads(json.dumps(resep_baik)); del rusak["latih"]["seed"]
    cek("resep tanpa seed DITOLAK", any("seed" in m for m in periksa_resep(rusak)))
    rusak2 = json.loads(json.dumps(resep_baik)); rusak2["latih"]["lr"] = "2e-4"
    cek("lr bertipe string DITOLAK", any("lr" in m for m in periksa_resep(rusak2)))
    ubah = json.loads(json.dumps(resep_baik)); ubah["latih"]["lr"] = 1e-4
    cek("beda_resep menemukan lr berubah", beda_resep(resep_baik, ubah) == ["latih.lr: 0.0002 != 0.0001"])
    cek("beda_resep resep identik = kosong", beda_resep(resep_baik, json.loads(json.dumps(resep_baik))) == [])
    sama_plus_catatan = json.loads(json.dumps(resep_baik)); sama_plus_catatan["catatan"] = "x"; sama_plus_catatan["keputusanSadar"] = {"a": 1}
    cek("beda_resep mengabaikan catatan/keputusanSadar", beda_resep(resep_baik, sama_plus_catatan) == [])

    # data
    # Fixture mewakili kasus nyata (ARSITEKTUR.md aturan modul #3): kalimat
    # sepanjang baris cluster sungguhan, bukan satu huruf.
    S = "Kerjakan bertahap dan tunjukkan angka antaranya. Jawab dengan angka yang jelas."
    baik = [{"id": "a", "sumber": "s1", "conversations": [
                {"from": "system", "value": S},
                {"from": "human", "value": "Kalau 7 kuintal arang dijual Rp9.500 per kg, berapa totalnya?"},
                {"from": "gpt", "value": "Satu kuintal setara 100 kg, jadi 7 kuintal = 700 kg. Dikalikan Rp9.500 per kg = Rp6.650.000."}]},
            {"id": "b", "sumber": "s2", "conversations": [
                {"from": "human", "value": "Modal Rp7.000/kg dijual Rp11.000/kg, berapa marginnya?"},
                {"from": "gpt", "value": "Untung per kilogram Rp4.000. Terhadap harga jual, itu 36 persen."}]}]
    inv = inventaris_data(baik)
    cek("inventaris: 2 baris, tanpa masalah", inv["baris"] == 2 and inv["masalah"] == [])
    cek("inventaris: prompt sistem S=1 & (tanpa system)=1",
        {p["teks"]: p["n"] for p in inv["promptSistem"]} == {S: 1, "(tanpa system)": 1})
    buruk = [{"id": "a", "conversations": [{"from": "human", "value": "q"}, {"from": "human", "value": "q"}]},
             {"id": "a", "conversations": [{"from": "gpt", "value": ""}]},
             {"id": "c", "conversations": [{"from": "human", "value": "q"}, {"from": "gpt", "value": "j"}, {"from": "system", "value": "S"}]}]
    invb = inventaris_data(buruk)
    cek("inventaris: human-human DITANDAI", any("bergantian" in m or "terakhir bukan gpt" in m for m in invb["masalah"]))
    cek("inventaris: nilai kosong DITANDAI", any("kosong" in m for m in invb["masalah"]))
    cek("inventaris: id ganda DITANDAI", any("id ganda" in m for m in invb["masalah"]))
    cek("inventaris: system di tengah DITANDAI", any("system bukan di awal" in m for m in invb["masalah"]))

    # token
    panjang = [{"id": "p", "conversations": [{"from": "human", "value": "x" * 40}, {"from": "gpt", "value": "y" * 8000}]}]
    st = statistik_token(baik + panjang, tok_palsu, 1024)
    cek("token: baris >1024 dihitung TERPOTONG", st["terpotong"] == 1 and st["terpotongId"] == ["p"])
    st2 = statistik_token(baik, tok_palsu, 1024)
    cek("token: baris pendek tidak terpotong", st2["terpotong"] == 0 and st2["maks"] <= 1024)
    cek("token: labelPersen di (0,100]", 0 < st2["labelPersen"] <= 100)

    # kurva
    k = ringkas_kurva([{"loss": 2.0, "step": 10, "epoch": 0.2}, {"loss": 1.0, "step": 20, "epoch": 0.5}, {"loss": 0.9, "step": 30, "epoch": 1.0}])
    cek("kurva: turun -> naikDiAkhir False", k["naikDiAkhir"] is False and k["lossMin"] == 0.9)
    k2 = ringkas_kurva([{"loss": 2.0, "step": 1}, {"loss": 0.8, "step": 2}, {"loss": 1.2, "step": 3}])
    cek("kurva: naik 0.4 di akhir -> naikDiAkhir True", k2["naikDiAkhir"] is True)
    k3 = ringkas_kurva([{"loss": float("nan"), "step": 1}])
    cek("kurva: NaN ditandai", k3["nan"] is True)
    cek("kurva: kosong aman", ringkas_kurva([]) == {"titik": [], "n": 0})

    # lingkungan & ringkasan
    v = versi_lingkungan()
    cek("lingkungan: python terisi, torch 'tidak ada' tidak meledak", bool(v["python"]) and "torch" in v)
    r = rakit_ringkasan("uji", resep_baik, {"data": "abc"}, inv, st2, k, v,
                        {"arit-dengan": {"benar": 1, "total": 1}, "kenari": "0/4", "kode7": True,
                         "lossRata": 1.1, "tokenDilatihPersen": 50.0}, 1.0)
    cek("ringkasan: formatKontrak=2 & kunci inti ada",
        r["formatKontrak"] == 2 and r["cluster"] == "uji" and r["sidik"]["data"] == "abc"
        and r["resep"]["latih"]["seed"] == 42 and "arit-dengan" in r and r["loss"] == 0.9)
    cek("ringkasan: bisa di-JSON", json.dumps(r) is not None)

    print(f"\n{lulus}/{lulus + gagal} lulus")
    sys.exit(1 if gagal else 0)


if __name__ == "__main__":
    if "--uji-instrumen" in sys.argv:
        _uji()
    else:
        print("pakai: python ukur_latih.py --uji-instrumen  (modul ini diimpor latih_cluster.py)")
