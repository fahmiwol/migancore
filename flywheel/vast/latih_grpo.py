#!/usr/bin/env python
"""latih_grpo.py — RLVR (GRPO) multi-objektif untuk cluster tool, di atas adapter SFT.

============================== KENAPA GRPO, BUKAN DPO ======================
Hukum A12: SFT-murni di 4B mentok — 4 pengukuran tier-2 berkisar 72-91, tak
pernah >=92, dan komposisi data hanya MEMILIH kategori pemenang. Rencana lama
("lanjut DPO/KTO diamond") mengandaikan hambatannya METODE. Yang sebenarnya
menghambat adalah JUMLAH PASANGAN: DPO butuh 1.000-5.000, kami punya 29.
Sementara syarat RLVR — fungsi ganjaran yang bisa diverifikasi mesin — sudah
kami penuhi bertahun sebelum membutuhkannya (eval/nilai-alat.mjs).
Aset langka kami bukan datanya; verifikatornya.

========================= KENAPA MO-GRPO, BUKAN GRPO POLOS ==================
MO-GRPO (arXiv 2509.22047): GRPO dengan ganjaran gabungan DIDOMINASI objektif
ber-varians besar, dan objektif ber-varians kecil diabaikan.

    GRPO      A = (SUM R - mean(SUM R)) / std(SUM R)
    MO-GRPO   A = SUM_i [ (R_i - mean(R_i)) / std(R_i) ]

Itu A12 yang dinyatakan sebagai rumus. Kalau kami memakai satu skalar, kami akan
MENGULANG A12 di metode baru: `panggil` (kategori terbesar, varians terbesar)
akan menelan `konfirmasi`.

CARA MENERAPKANNYA TANPA MENAMBAL ISI PERUT TRL. TRL memanggil tiap reward
function dengan SELURUH batch, lalu menjumlahkannya dan menormalkan sekali per
grup. Jadi tiap fungsi di sini menerima batch, MENATA ULANG jadi
[n_prompt, n_generasi], lalu mengembalikan z-score DI DALAM grupnya sendiri.
Akibatnya jumlah yang diterima TRL sudah bermean-nol, dan penormalan terakhir
TRL cuma penskalaan seragam per grup:

    A_kami = SUM_i z_i / std(SUM_i z_i) = A_MO / std(A_MO)

Keseimbangan antar-objektif — satu-satunya hal yang A12 butuhkan — terjaga
PERSIS. Yang berbeda cuma besaran per grup, yang berperan seperti laju belajar
efektif per grup. Ini ditulis terang supaya tidak ada yang mengira ini
implementasi harfiah makalahnya. Kalau kelak butuh yang harfiah, jalannya
subclass GRPOTrainer dan mengganti perhitungan advantage-nya.

============================== YANG DIJAGA =================================
- Ganjaran memakai flywheel/vast/ganjaran.py, yang kesepakatannya dengan sisi JS
  dibuktikan uji_ganjaran.py (147/147). Kalau port menyimpang, yang DILATIH
  bukan yang DIUJI, dan skornya tetap terlihat masuk akal.
- Kolam prompt datang dari data latih, BUKAN dari 24 skenario eval. Melatih di
  atas soal ujian menaikkan skor tanpa memberi tahu apa pun.
- Batch diseimbangkan per kategori: A12 adalah dagang antar-kategori, dan
  membiarkan `panggil` (157 dari 333) mendominasi batch akan mengulanginya lewat
  pintu belakang — penormalan MO menyeimbangkan OBJEKTIF, bukan KATEGORI.

Pakai: python latih_grpo.py --uji-instrumen      (tanpa torch/GPU)
       python latih_grpo.py --kolam <jsonl> --keluar <dir> [--langkah N]
"""
import json
import os
import sys
from pathlib import Path

DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(DIR))
import ganjaran as G  # noqa: E402

# ── PIN: dicatat di manifest, dibandingkan kontrak. Beda pin = run tidak sah.
PIN = {"trl": "0.14.0", "transformers": "4.51.3", "peft": "0.14.0"}

# ── Resep. Semua angka di sini punya alasan; jangan diubah tanpa pra-daftar baru.
RESEP = {
    "base": "Qwen/Qwen3-4B-Instruct-2507",
    "lora": {"r": 16, "alpha": 32, "dropout": 0.0},
    # lr 5e-6, BUKAN 2e-4 seperti SFT kami. Anjuran umum untuk RL (DPO/GRPO)
    # adalah dua orde lebih kecil daripada SFT; memakai lr SFT di RL membuat
    # kebijakan melompat jauh dari acuan dan runtuh dalam beberapa langkah.
    "lr": 5e-6,
    # 8 generasi = minimum yang disebut stabil untuk taksiran advantage. Di bawah
    # itu, std per grup dihitung dari terlalu sedikit sampel dan z-score-nya
    # berisik — dan seluruh gagasan MO-GRPO bertumpu pada std per objektif.
    "n_generasi": 8,
    "suhu": 0.8,          # eksplorasi; suhu 0 tidak menghasilkan ragam untuk dibandingkan
    "beta": 0.04,         # penalti KL ke acuan — pagar supaya tidak melenceng jauh
    # 256 -> 128 pada 1 Sep, sesudah run penuh OOM (minta 9,31 GiB, tersisa 6,78).
    # Angkanya DIUKUR, bukan ditebak: 194 jawaban jebakan tersimpan dipotong pada
    # beberapa batas lalu dinilai ulang dengan penilai yang sama.
    #     batas 96  -> 40% terpotong, vonis berubah 3,1%
    #     batas 128 -> 30% terpotong, vonis berubah 1,5%   <- dipilih
    #     batas 192 -> 19% terpotong, vonis berubah 0,5%
    #     batas 256 ->  1% terpotong, vonis berubah 0,0%
    # Vonis kejujuran tahan potong karena penanda menolak muncul di AWAL jawaban.
    # 128 dipilih, bukan 192, karena kekurangan memorinya ~2,5 GiB dan 192 hanya
    # menghemat 25% — margin tipis berarti OOM kedua seharga run lagi. Ongkosnya
    # jujur: ~1,5% derau label pada objektif jujur, dan objektif `isi`/`takUlang`
    # melihat teks lebih pendek.
    "maks_token_baru": 128,
    "batch_prompt": 4,
    "akumulasi": 4,
    "seed": 42,
}

MIN_STD = 1e-4  # di bawah ini, satu grup dianggap seragam: advantage 0, bukan pembagian nol


def zscore_per_grup(nilai, n_generasi):
    """Z-score DI DALAM tiap grup rollout. Inti MO-GRPO.

    `nilai` adalah daftar datar sepanjang n_prompt*n_generasi, urut per prompt.
    Grup yang seragam (semua rollout mendapat angka sama pada objektif ini)
    mengembalikan NOL — bukan NaN, dan bukan angka besar acak. Itu benar secara
    perilaku: objektif yang tidak membedakan apa pun di grup ini memang tidak
    boleh memberi arah.
    """
    keluar = [0.0] * len(nilai)
    for a in range(0, len(nilai), n_generasi):
        grup = nilai[a:a + n_generasi]
        n = len(grup)
        if n == 0:
            continue
        rata = sum(grup) / n
        var = sum((x - rata) ** 2 for x in grup) / n
        sd = var ** 0.5
        if sd < MIN_STD:
            continue                      # sudah 0.0
        for i, x in enumerate(grup):
            keluar[a + i] = (x - rata) / sd
    return keluar


def buat_fungsi_ganjaran(nama_objektif, n_generasi, jejak=None):
    """Satu fungsi ganjaran TRL per objektif, masing-masing sudah ter-z-score.

    TRL memanggilnya dengan (prompts, completions, **kolom_dataset). Spesifikasi
    vonis (k/alat/wajib/riwayat) ikut sebagai kolom dataset, jadi ganjaran dinilai
    dengan konteks yang sama persis dengan gerbang.
    """
    def fungsi(prompts, completions, **kolom):
        n = len(completions)
        spek = kolom.get("spek")
        if spek is None:
            raise RuntimeError("kolom `spek` tidak ada di dataset — ganjaran tidak bisa dinilai")
        mentah = []
        for i in range(n):
            s = spek[i] if isinstance(spek[i], dict) else json.loads(spek[i])
            teks = completions[i]
            if isinstance(teks, list):                # format percakapan
                teks = "".join(m.get("content", "") for m in teks)
            nilai_obj = G.ganjaran(s, teks)[nama_objektif]
            # C39: None = objektif ABSTAIN (tidak berlaku untuk kategori ini).
            # Dulu cabang itu mengembalikan 1, dan 1 pada objektif bernilai-maksimum
            # tak terbedakan dari "sempurna" -- kolam yang tak tercakup jadi konstan
            # 1,000, ragam nol, gradien nol, dan GPU membayar untuk melatih
            # ketiadaan tanpa satu pun tanda di log. Meledak DI SINI jauh lebih
            # murah; pra-terbang (flywheel/pra-terbang-grpo.mjs) seharusnya sudah
            # menangkapnya sebelum GPU disewa.
            if nilai_obj is None:
                raise RuntimeError(
                    f"objektif `{nama_objektif}` ABSTAIN untuk kategori "
                    f"k={s.get('k')!r} jenis={s.get('jenis')!r}. Kolam berisi soal "
                    f"yang objektif ini tidak bisa nilai. Perluas cakupan objektif "
                    f"atau keluarkan soal itu dari kolam — JANGAN beri nilai bawaan."
                )
            mentah.append(float(nilai_obj))
        if jejak is not None:
            jejak.setdefault(nama_objektif, []).extend(mentah)
        return zscore_per_grup(mentah, n_generasi)
    fungsi.__name__ = f"ganjaran_{nama_objektif}"
    return fungsi


def kategori_baris(b):
    """Kategori satu baris kolam, apa pun bentuk kolamnya.

    Kolam ALAT memakai `k` (panggil/jangan/alat_hilang/...); kolam KEJUJURAN
    memakai `jenis` (fakta/tidak-ada/premis-salah/di-luar). Probe 1 Sep mati
    dengan `KeyError: 'k'` di sini — persis gunanya probe: $0,05 untuk menemukan
    apa yang run penuh akan temukan dengan harga penuh.

    Baris tanpa keduanya adalah GALAT, bukan "lain-lain". Kategori yang jatuh ke
    ember bawaan akan merusak penyeimbangan batch tanpa satu pun pesan — dan
    penyeimbangan itulah yang menahan A12 lewat pintu belakang.
    """
    k = b.get("k") or b.get("jenis")
    if not k:
        raise RuntimeError(
            f"baris kolam tanpa `k` maupun `jenis`: {str(b)[:120]}. "
            "Kategori tak dikenal merusak penyeimbangan batch secara senyap."
        )
    return k


def batch_seimbang(baris, batch, seed=42):
    """Urutkan kolam supaya tiap batch memuat kategori sebanyak mungkin berbeda.

    A12 adalah dagang ANTAR-KATEGORI. Penormalan MO menyeimbangkan objektif, bukan
    kategori; kalau `panggil` (157 dari 333) menumpuk di batch yang sama, gradiennya
    tetap didominasi kategori itu dan A12 kembali lewat pintu belakang. Ini
    penyeimbangan by construction — bisa diperiksa mata, tidak bergantung pada
    matematika ganjaran.
    """
    import random
    rnd = random.Random(seed)
    per = {}
    for b in baris:
        per.setdefault(kategori_baris(b), []).append(b)
    for v in per.values():
        rnd.shuffle(v)
    urut, kunci = [], sorted(per.keys())
    while any(per[k] for k in kunci):
        for k in kunci:
            if per[k]:
                urut.append(per[k].pop())
    return urut


# ─────────────────────────────────────────────────────── uji instrumen ──
if "--uji-instrumen" in sys.argv:
    ok = bad = 0

    def cek(n, c, ket=""):
        global ok, bad
        if c:
            ok += 1
            print(f"  OK    {n}")
        else:
            bad += 1
            print(f"  GAGAL {n}" + (f" — {ket}" if ket else ""))

    # z-score
    z = zscore_per_grup([0, 0, 0, 1, 1, 1], 3)
    cek("z: grup seragam -> nol (bukan NaN, bukan pembagian nol)", z == [0.0] * 6)
    z = zscore_per_grup([0, 1, 0, 1], 2)
    cek("z: dua nilai beda -> +-1", abs(z[0] + 1) < 1e-9 and abs(z[1] - 1) < 1e-9)
    cek("z: tiap grup dinormalkan SENDIRI", abs(z[2] + 1) < 1e-9 and abs(z[3] - 1) < 1e-9)
    z = zscore_per_grup([0, 0, 0, 100], 4)
    cek("z: pencilan tidak meledak", all(abs(x) < 3 for x in z))
    cek("z: mean tiap grup ~0", abs(sum(z)) < 1e-9)

    # INTI MO-GRPO: objektif ber-skala kecil TIDAK boleh tenggelam
    besar = [0.0, 10.0] * 4      # varians besar
    kecil = [0.0, 0.01] * 4      # varians kecil, arah SAMA
    polos_besar = [x - sum(besar) / len(besar) for x in besar]
    polos_kecil = [x - sum(kecil) / len(kecil) for x in kecil]
    rasio_polos = (max(map(abs, polos_besar)) or 1) / (max(map(abs, polos_kecil)) or 1)
    zb, zk = zscore_per_grup(besar, 2), zscore_per_grup(kecil, 2)
    rasio_mo = (max(map(abs, zb)) or 1) / (max(map(abs, zk)) or 1)
    cek("MO: tanpa normalisasi, objektif besar menelan yang kecil (rasio >100x)", rasio_polos > 100,
        f"rasio {rasio_polos:.0f}")
    cek("MO: sesudah normalisasi per objektif, pengaruhnya SETARA (rasio ~1)", abs(rasio_mo - 1) < 1e-6,
        f"rasio {rasio_mo}")

    # fungsi ganjaran terpasang ke ganjaran nyata
    spek = {"k": "panggil", "t": "Berapa kadar abu?", "alat": "brain_search"}
    benar = '<tool_call>\n{"name": "brain_search", "arguments": {"query": "abu"}}\n</tool_call>'
    salah = "Kadar abunya sekitar 3%."
    f = buat_fungsi_ganjaran("perilaku", 2)
    hasil = f(["p", "p"], [benar, salah], spek=[spek, spek])
    cek("ganjaran: jawaban benar mendapat advantage POSITIF", hasil[0] > 0)
    cek("ganjaran: jawaban salah mendapat advantage NEGATIF", hasil[1] < 0)
    f2 = buat_fungsi_ganjaran("isi", 2)
    h2 = f2(["p", "p"], ["?", "Aku tidak punya alat untuk itu."], spek=[spek, spek])
    cek("ganjaran: serangan '?' dihukum objektif isi", h2[0] < 0 < h2[1])
    try:
        f(["p"], [benar])
        cek("ganjaran: tanpa kolom spek -> galat jelas", False)
    except RuntimeError as e:
        cek("ganjaran: tanpa kolom spek -> galat jelas", "spek" in str(e))

    # batch seimbang
    contoh = [{"k": "panggil"}] * 20 + [{"k": "konfirmasi"}] * 4 + [{"k": "jangan"}] * 6
    urut = batch_seimbang(contoh, 4)
    cek("batch: jumlah baris utuh", len(urut) == len(contoh))
    awal = [b["k"] for b in urut[:3]]
    cek("batch: tiga baris pertama dari tiga kategori berbeda", len(set(awal)) == 3, str(awal))
    cek("batch: kategori langka muncul lebih awal daripada urutan aslinya",
        urut.index(next(b for b in urut if b["k"] == "konfirmasi")) < 5)

    cek("resep: lr RL jauh di bawah lr SFT (2e-4)", RESEP["lr"] <= 1e-5)
    cek("resep: n_generasi >= 8 (taksiran advantage stabil)", RESEP["n_generasi"] >= 8)
    cek("resep: suhu > 0 (tanpa ragam tidak ada yang bisa dibandingkan)", RESEP["suhu"] > 0)
    cek("resep: beta > 0 (ada pagar KL ke acuan)", RESEP["beta"] > 0)
    cek("objektif sama dengan sisi ganjaran", G.OBJEKTIF == ["perilaku", "format", "jujur", "isi", "takUlang"])

    print("\n" + "=" * 52)
    print(f"{ok} lulus · {bad} gagal")
    sys.exit(1 if bad else 0)


# ────────────────────────────────────────────────────────────────── jalan ──
def muat_kolam(jalur, batch, n_generasi):
    """Kolam prompt -> dataset TRL. Kolom `spek` ikut supaya ganjaran dinilai
    dengan konteks yang sama persis dengan gerbang."""
    baris = [json.loads(x) for x in open(jalur, encoding="utf-8") if x.strip()]
    baris = batch_seimbang(baris, batch, RESEP["seed"])
    contoh = []
    for b in baris:
        # `sistem` OPSIONAL, dan ketiadaannya di kolam kejujuran DISENGAJA.
        # MENGARANG diukur dengan pembungkus `polos` — tanpa system prompt sama
        # sekali. Kalau latihan memakai system prompt sementara gerbang tidak,
        # yang dilatih bukan yang diukur, dan perbaikan apa pun bisa lenyap
        # begitu pembungkusnya dilepas. Kolam alat MEMANG butuh `sistem` karena
        # daftar alatnya hidup di sana; jadi keduanya benar untuk kolamnya
        # masing-masing, dan yang salah adalah memaksakan satu bentuk.
        pesan = []
        if b.get("sistem"):
            pesan.append({"role": "system", "content": b["sistem"]})
        pesan.append({"role": "user", "content": b["t"]})
        for m in b.get("riwayat", []):
            pesan.append({"role": m["role"], "content": m["content"]})
        # `jenis` dan `benar` WAJIB ikut untuk baris kejujuran: tanpa keduanya
        # ganjaran `jujur` abstain (C39) dan run meledak di langkah pertama.
        spek = {k: b[k] for k in ("k", "jenis", "benar", "t", "alat", "wajib", "riwayat") if k in b}
        # spek dikirim sebagai STRING JSON, bukan dict. Baris kolam punya kunci
        # yang BERBEDA-BEDA (alat/wajib/riwayat hanya ada di sebagian kategori),
        # dan pyarrow harus menyatukan skema kolom bersarang — itu bisa gagal,
        # atau lebih buruk: diam-diam mengisi None dan mengubah arti vonis.
        # Sisi ganjaran sudah menerima kedua bentuk.
        contoh.append({"prompt": pesan, "spek": json.dumps(spek, ensure_ascii=False),
                       "kategori": kategori_baris(b)})
    return contoh


# ── Gerbang kolam: BISA DIJALANKAN LOKAL, tanpa torch, tanpa GPU ────────────
# Lahir dari probe 1 Sep yang mati `KeyError: 'k'` sesudah menyewa GPU, mengirim
# 5 berkas, dan memasang pustaka. Ongkosnya $0,05 dan 15 menit untuk menemukan
# sesuatu yang bisa diketahui gratis dalam 2 detik.
#
# Aturan yang lahir hari itu juga: hukum baru wajib punya penjaga di commit yang
# sama. Ini penjaganya.
if "--uji-kolam" in sys.argv:
    jalur = sys.argv[sys.argv.index("--uji-kolam") + 1]
    contoh = muat_kolam(jalur, RESEP["batch_prompt"], RESEP["n_generasi"])
    print(f"# Gerbang kolam — {jalur}")
    print(f"  baris termuat : {len(contoh)}")

    kat = {}
    for c in contoh:
        kat[c["kategori"]] = kat.get(c["kategori"], 0) + 1
    print(f"  kategori      : {kat}")

    # Tiap baris HARUS bisa dinilai oleh SETIAP objektif. Objektif yang abstain
    # (None) akan meledakkan run di langkah pertama — lebih baik ketahui di sini.
    abstain = {}
    for c in contoh:
        s = json.loads(c["spek"])
        for o, v in G.ganjaran(s, "jawaban contoh untuk memeriksa cakupan.").items():
            if v is None:
                abstain[o] = abstain.get(o, 0) + 1
    if abstain:
        print(f"\n  GAGAL — objektif ABSTAIN pada sebagian baris: {abstain}")
        print("  Run AKAN meledak di langkah pertama (C39). Perbaiki kolam atau cakupan objektif.")
        sys.exit(1)
    print("  cakupan       : semua objektif bisa menilai SEMUA baris")

    # Pembungkus harus sama dengan yang dipakai gerbang pengukur. Kalau kolam
    # kejujuran diam-diam membawa system prompt, yang dilatih bukan yang diukur.
    dgn_sistem = sum(1 for c in contoh if c["prompt"][0]["role"] == "system")
    print(f"  system prompt : {dgn_sistem}/{len(contoh)} baris")
    print("\nGERBANG KOLAM LULUS\n")
    sys.exit(0)



def kurva_aman(trainer):
    try:
        import ukur_latih as U
        return U.ringkas_kurva(trainer.state.log_history)
    except Exception as e:
        return {"gagal": f"{type(e).__name__}: {e}"}


def jalankan():
    import time
    import torch
    from datasets import Dataset
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import PeftModel
    from trl import GRPOConfig, GRPOTrainer
    import ukur_latih as U

    def arg(nama, bawaan=None):
        return sys.argv[sys.argv.index(nama) + 1] if nama in sys.argv else bawaan

    KOLAM = arg("--kolam", "kolam-tool.jsonl")
    ADAPTER = arg("--adapter", "adapter-tool")          # titik awal: adapter SFT v15
    KELUAR = arg("--keluar", "adapter-grpo")
    LANGKAH = int(arg("--langkah", "60"))
    PROBE = "--probe" in sys.argv

    if PROBE:
        # C26: gerbang harus dipasang DI TEMPAT kerjanya berjalan. Run-1 penyulingan
        # lolos semua gerbang laptop lalu mati DI DALAM instance setelah bobot 16 GB
        # terunduh. Probe = versi terkecil yang membuktikan tumpukan pustaka ini
        # benar-benar bisa jalan, sebelum run penuh membayar seluruh ongkosnya.
        LANGKAH = 2
        RESEP["n_generasi"] = 4
        RESEP["maks_token_baru"] = 64

    t0 = time.time()
    print(f"# GRPO {'PROBE' if PROBE else 'penuh'} — {LANGKAH} langkah, {RESEP['n_generasi']} generasi/prompt", flush=True)

    contoh = muat_kolam(KOLAM, RESEP["batch_prompt"], RESEP["n_generasi"])
    if PROBE:
        contoh = contoh[: RESEP["batch_prompt"] * 4]
    per_kat = {}
    for c in contoh:
        per_kat[c["kategori"]] = per_kat.get(c["kategori"], 0) + 1
    print(f"   kolam {len(contoh)} prompt · {per_kat}", flush=True)
    ds = Dataset.from_list(contoh)

    tok = AutoTokenizer.from_pretrained(RESEP["base"])
    model = AutoModelForCausalLM.from_pretrained(RESEP["base"], torch_dtype=torch.bfloat16, device_map="cuda")
    model = PeftModel.from_pretrained(model, ADAPTER, is_trainable=True)
    model.config.use_cache = False   # wajib bersama gradient_checkpointing
    # Pasangan kedua dari obat yang sama: hanya bobot LoRA yang requires_grad, dan
    # embedding beku membuat aktivasi masuk ke blok checkpoint tanpa graf. Ini
    # menyalakan grad pada keluaran embedding supaya rantainya tersambung.
    if hasattr(model, "enable_input_require_grads"):
        model.enable_input_require_grads()
    model.print_trainable_parameters()

    jejak = {}
    fungsi = [buat_fungsi_ganjaran(o, RESEP["n_generasi"], jejak) for o in G.OBJEKTIF]

    # DIUKUR di GPU nyata 28 Agu: konfigurasi pertama OOM di RTX 3090 24 GB pada
    # PROBE terkecil sekalipun (4 generasi, 64 token) — 22,76 GB terpakai, minta 944 MB
    # lagi. Riset sudah memperingatkan "GRPO makan 2-3x VRAM SFT"; sekarang angkanya
    # ada. Tiga pengubah, dari yang paling menentukan:
    #   1. per_device_train_batch_size = n_generasi, BUKAN batch_prompt*n_generasi.
    #      Satu grup rollout per langkah perangkat; jumlah prompt per langkah
    #      pengoptimasi tetap dijaga akumulasi gradien. Ini yang paling besar
    #      pengaruhnya: sebelumnya 16 barisan dibangkitkan DAN di-backprop sekaligus.
    #   2. gradient_checkpointing — menukar hitungan dengan memori aktivasi.
    #   3. expandable_segments (di jalan.sh) — melawan fragmentasi, yang galatnya
    #      sendiri menyarankan (1,36 GB tercadang tapi tak terpakai).
    cfg = GRPOConfig(
        output_dir=KELUAR, learning_rate=RESEP["lr"], beta=RESEP["beta"],
        num_generations=RESEP["n_generasi"], temperature=RESEP["suhu"],
        max_completion_length=RESEP["maks_token_baru"],
        per_device_train_batch_size=RESEP["n_generasi"],
        gradient_accumulation_steps=RESEP["akumulasi"] * RESEP["batch_prompt"],
        gradient_checkpointing=True,
        # use_reentrant=False wajib bersama PEFT. Dengan varian reentrant (bawaan),
        # masukan ke blok yang di-checkpoint tidak requires_grad sehingga grafnya
        # putus: "element 0 of tensors does not require grad and does not have a
        # grad_fn". Diukur di GPU nyata 28 Agu, sesudah OOM diperbaiki.
        gradient_checkpointing_kwargs={"use_reentrant": False},
        max_steps=LANGKAH, logging_steps=1, save_strategy="no",
        seed=RESEP["seed"], bf16=True, report_to=[],
    )
    # ── DIAGNOSTIK BOBOT ────────────────────────────────────────────────────
    # Dipasang 1 Sep sesudah run 60 langkah / 93 menit / $0,40 menghasilkan
    # adapter yang IDENTIK BYTE-PER-BYTE dengan titik awalnya (sha256
    # 15574e4288650575 sebelum dan sesudah). Run itu melapor sukses, menyimpan
    # artefak, dan mencetak metrik yang masuk akal — sementara nol bita berubah.
    #
    # Tanpa pengukuran ini, kegagalan seperti itu hanya bisa ditemukan dengan
    # membandingkan berkas SESUDAH membayar. Sekarang ia terlihat DI DALAM run.
    def sidik_bobot():
        n, jml, maks = 0, 0.0, 0.0
        for _, p in model.named_parameters():
            if p.requires_grad:
                n += p.numel()
                a = p.detach().abs().float()
                jml += a.sum().item()
                maks = max(maks, a.max().item())
        return n, jml, maks

    n_lat, jml_awal, maks_awal = sidik_bobot()
    print(f"   [diag] param terlatih {n_lat:,} · |w| jumlah {jml_awal:.6f} · maks {maks_awal:.6e}", flush=True)
    print(f"   [diag] dtype param terlatih: "
          f"{ {str(p.dtype) for _, p in model.named_parameters() if p.requires_grad} }", flush=True)

    trainer = GRPOTrainer(model=model, args=cfg, train_dataset=ds, reward_funcs=fungsi,
                          processing_class=tok)

    # ── AKUMULASI TIDAK BOLEH MELEBIHI JUMLAH BATCH YANG ADA ────────────────
    # Diukur 1 Sep: run 60 langkah / 93 menit / $0,40 berakhir dengan
    # `global_step=0` dan keadaan pengoptimasi terisi untuk NOL tensor — langkah
    # pengoptimasi tidak pernah terjadi sekali pun. Bobot identik byte-per-byte.
    #
    # Sebabnya aritmetika, bukan misteri: satu batch perangkat = 8 penyelesaian =
    # SATU prompt (karena per_device_train_batch_size = num_generations). Kolam
    # 36 prompt menghasilkan sedikit batch, sementara akumulasi diminta 16.
    # Kalau jumlah batch per epoch lebih kecil dari akumulasi, siklus akumulasi
    # tidak pernah tertutup dan pengoptimasi tidak pernah dipanggil — TANPA satu
    # pun galat, dengan metrik yang tetap terlihat masuk akal.
    #
    # Resep sebelumnya (akumulasi 4 x batch_prompt 4 = 16) diwarisi dari kolam
    # ALAT yang berisi 361 prompt. Ia tidak pernah diperiksa ulang saat kolam
    # kejujuran 36 prompt menggantikannya. Kelas cacat yang sama dengan C38:
    # angka yang sah untuk keadaan lama, dipakai di keadaan baru.
    try:
        n_batch = len(trainer.get_train_dataloader())
    except Exception as e:
        n_batch = -1
        print(f"   [diag] tidak bisa menghitung batch: {e}", flush=True)
    print(f"   [diag] batch per epoch = {n_batch} · akumulasi diminta = {cfg.gradient_accumulation_steps}",
          flush=True)
    if n_batch > 0 and cfg.gradient_accumulation_steps > n_batch:
        baru = max(1, n_batch)
        print(f"   [diag] AKUMULASI {cfg.gradient_accumulation_steps} > batch {n_batch} — "
              f"siklus tidak akan pernah tertutup. Diturunkan ke {baru}.", flush=True)
        cfg.gradient_accumulation_steps = baru
        trainer.args.gradient_accumulation_steps = baru
        # Trainer menghitung ulang jadwalnya dari args; bangun ulang supaya
        # perubahan ini benar-benar berlaku, bukan cuma tercatat di objek.
        trainer = GRPOTrainer(model=model, args=cfg, train_dataset=ds, reward_funcs=fungsi,
                              processing_class=tok)

    # Norma gradien pada langkah-langkah awal: membedakan "gradien nol" dari
    # "gradien ada tapi pembaruannya hilang". Dua sebab yang sangat berbeda.
    # Versi pertama diagnostik ini memakai `on_pre_optimizer_step` dan TIDAK PERNAH
    # menyala. Ketiadaan keluaran BUKAN bukti bahwa langkah pengoptimasi tak
    # terjadi — bisa jadi nama hook-nya yang tidak ada di versi ini. Jadi:
    # daftar hook dicetak dulu, dan pengamatannya dipasang di `on_step_end` yang
    # sudah ada sejak lama.
    from transformers import TrainerCallback
    _hooks = sorted(m for m in dir(TrainerCallback) if m.startswith("on_"))
    print(f"   [diag] hook TrainerCallback tersedia: {', '.join(_hooks)}", flush=True)

    n_param_lat = sum(1 for _, p in model.named_parameters() if p.requires_grad)

    class LihatGradien(TrainerCallback):
        def on_step_end(self, args, state, control, **kw):
            if state.global_step <= 3 or state.global_step % 20 == 0:
                ada = [p for _, p in model.named_parameters()
                       if p.requires_grad and p.grad is not None]
                g = sum(float(p.grad.detach().float().norm() ** 2) for p in ada) ** 0.5 if ada else float("nan")
                print(f"   [diag] langkah {state.global_step}: norma grad {g:.6e} · "
                      f"param bergradien {len(ada)}/{n_param_lat} · epoch {state.epoch}", flush=True)

    trainer.add_callback(LihatGradien())
    stat = trainer.train()

    # Bukti langsung dari pengoptimasinya sendiri, bukan dari gejala.
    try:
        opt = trainer.optimizer
        print(f"   [diag] global_step={trainer.state.global_step} · "
              f"keadaan pengoptimasi terisi untuk {len(getattr(opt, 'state', {}))} tensor · "
              f"lr sekarang {opt.param_groups[0]['lr']:.3e} · "
              f"param di grup {sum(len(g['params']) for g in opt.param_groups)}", flush=True)
    except Exception as e:
        print(f"   [diag] tidak bisa membaca pengoptimasi: {e}", flush=True)
    try:
        import trl as _trl
        print(f"   [diag] trl {_trl.__version__} · num_iterations="
              f"{getattr(cfg, 'num_iterations', '?')} · "
              f"per_device_train_batch_size={cfg.per_device_train_batch_size} · "
              f"grad_accum={cfg.gradient_accumulation_steps} · "
              f"num_generations={cfg.num_generations}", flush=True)
    except Exception as e:
        print(f"   [diag] tidak bisa membaca cfg/trl: {e}", flush=True)

    n2, jml_akhir, maks_akhir = sidik_bobot()
    delta = abs(jml_akhir - jml_awal)
    print(f"   [diag] |w| jumlah SESUDAH {jml_akhir:.6f} · selisih {delta:.6e}", flush=True)
    if delta == 0.0:
        print("   [diag] BOBOT TIDAK BERUBAH SAMA SEKALI — latihan tidak menghasilkan apa pun.", flush=True)
    model.save_pretrained(KELUAR)
    print(f"   adapter tersimpan: {KELUAR}", flush=True)

    # Ganjaran MENTAH per objektif (sebelum z-score) — inilah yang bisa dibaca
    # manusia. Angka yang dipakai pelatih sudah dinormalkan dan tidak bisa
    # ditafsirkan langsung; tanpa jejak ini, "ganjaran naik" tidak bisa dibuktikan.
    rata = {o: (sum(v) / len(v) if v else None) for o, v in jejak.items()}
    n_rollout = len(next(iter(jejak.values()))) if jejak else 0
    print(f"   ganjaran mentah rata-rata ({n_rollout} rollout): {rata}", flush=True)

    # ── A20 diukur DI DALAM run, pada model latih yang sebenarnya ──────────────
    # Rerata saja tidak cukup. Advantage GRPO dihitung di dalam grup rollout, jadi
    # objektif yang seragam DI DALAM grup memberi arah NOL — tak peduli reratanya
    # 1,0 atau 0,0 atau 0,5. Probe pertama hanya menyimpan rerata, sehingga
    # pertanyaan "berapa banyak grup yang benar-benar mengajarkan sesuatu"
    # tidak bisa dijawab dari artefaknya sama sekali.
    #
    # `jejak[o]` datar sepanjang n_prompt*n_generasi dan urut per prompt, jadi
    # ragamnya bisa dihitung ulang persis seperti zscore_per_grup melihatnya.
    ng = RESEP["n_generasi"]
    ragam = {}
    for o, v in jejak.items():
        total = beragam = 0
        for a in range(0, len(v) - ng + 1, ng):
            g = v[a:a + ng]
            m = sum(g) / len(g)
            sd = (sum((x - m) ** 2 for x in g) / len(g)) ** 0.5
            total += 1
            if sd >= MIN_STD:
                beragam += 1
        ragam[o] = {"grupBeragam": beragam, "grupTotal": total,
                    "persen": round(100 * beragam / total, 1) if total else None}
    ringkas_ragam = ", ".join(f"{o} {r['grupBeragam']}/{r['grupTotal']}" for o, r in ragam.items())
    print(f"   grup beragam per objektif (A20): {ringkas_ragam}", flush=True)

    # Jejak per JENDELA supaya keruntuhan kebijakan terlihat sebagai gerakan,
    # bukan cuma sebagai satu angka akhir. Pra-daftar V17 menyuruh menghentikan
    # run kalau rerata `jujur` menembus >0,98 atau <0,02 di tengah jalan; abort
    # otomatis TIDAK dipasang (jalur abort yang salah lebih mahal daripada satu
    # run 60 langkah seharga ~$0,40), jadi ini yang membuat vonis itu bisa dibaca
    # SESUDAHNYA — dan run berikutnya bisa memasang abortnya kalau perlu.
    jendela = {}
    for o, v in jejak.items():
        potong = max(1, len(v) // 6)
        jendela[o] = [round(sum(v[i:i + potong]) / len(v[i:i + potong]), 4)
                      for i in range(0, len(v), potong) if v[i:i + potong]]
    print(f"   jujur per jendela: {jendela.get('jujur')}", flush=True)

    ringkas = {
        "formatKontrak": 2, "cluster": "tool-grpo", "tahap": "MO-GRPO",
        "baris": len(contoh), "perKategori": per_kat,
        "resep": {"base": RESEP["base"], "lora": RESEP["lora"],
                  "latih": {k: RESEP[k] for k in ("lr", "n_generasi", "suhu", "beta",
                                                  "maks_token_baru", "batch_prompt",
                                                  "akumulasi", "seed")}},
        "pin": PIN, "langkah": LANGKAH, "probe": PROBE,
        "objektif": G.OBJEKTIF, "ganjaranMentahRata": rata, "nRollout": n_rollout,
        "ragamPerObjektif": ragam, "jejakJendela": jendela,
        # Kurva itu KETERANGAN, bukan hasil. Kalau bentuk log_history TRL berbeda
        # dari dugaan ukur_latih, jangan sampai run GPU yang sudah berhasil ikut
        # jatuh gara-gara ringkasannya.
        "kurva": kurva_aman(trainer),
        "lingkungan": U.versi_lingkungan(),
        "lossRata": getattr(stat, "training_loss", None),
        "menit": round((time.time() - t0) / 60, 1),
    }
    json.dump(ringkas, open(os.path.join(KELUAR, "ringkasan-grpo.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("SELESAI " + str(ringkas["menit"]) + " mnt", flush=True)


if __name__ == "__main__":
    jalankan()
