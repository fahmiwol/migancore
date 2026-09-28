#!/usr/bin/env python
"""suling.py — perbanyak data latih dengan GURU TERBUKA, tanpa guru menyentuh jawaban.

Dijalankan DI INSTANCE vast. Guru dan benih dikirim lewat /workspace/.

======================= ATURAN YANG PALING MENENTUKAN ========================
GURU TIDAK BOLEH MENULIS JAWABAN. Ia hanya boleh menulis ulang PERTANYAANNYA.

Kenapa sekeras itu: pilot14 (27 Jul 2026) gagal justru karena labelnya salah —
soal "dibagi ke 4 teman" tapi kunci jawabannya menghitung Budi ikut kebagian.
Model belajar setia pada data, lalu dinilai gagal oleh kunci yang keliru. Dan
pelajaran yang tertinggal: "dihasilkan program" TIDAK SAMA DENGAN "terverifikasi".

Maka pembagian kerjanya:
  - JAWABAN  <- dari benih kita, dihasilkan deterministik, sudah lolos validator.
               Kebenarannya tidak bergantung pada guru sama sekali.
  - PERTANYAAN <- guru menulis ulang dengan kata & sudut yang berbeda-beda.
               Kalau guru mengarang di sini, akibat terburuknya cuma kalimat
               janggal yang dibuang penyaring — bukan kunci jawaban yang salah.

Ini juga menjawab C20/H-prompt-ragam (23 Agu): kebiasaan tidak boleh terikat
pada satu kalimat. Yang kita butuh dari guru memang KERAGAMAN, bukan kepintaran.

============================ LISENSI ========================================
Guru bawaan Qwen3-8B berlisensi Apache-2.0 (diperiksa 26 Agu, 14,7 juta unduhan).
Alternatif berlisensi MIT: DeepSeek-R1-Distill-Qwen-14B — tapi butuh MUAT_4BIT=1
di 3090. Jangan ganti guru tanpa memeriksa lisensinya lewat
flywheel/model-terbuka.mjs -> wajibBebas(id). Bisa-diunduh bukan boleh-dipakai;
"OX Alpha" 26 Agu adalah contoh mahal dari melewatkan langkah ini.

Pakai (di instance):
  VARIAN=3 python suling.py                 (guru bawaan Qwen3-8B, Apache-2.0)
  GURU=<lain> MUAT_4BIT=1 python suling.py  (guru besar di GPU kecil)
Masukan : /workspace/benih.jsonl        (ShareGPT {"conversations":[...]} atau {"messages":[...]})
Keluaran: /workspace/hasil-suling.jsonl + /workspace/ringkasan-suling.json
"""
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

W = Path("/workspace")
BENIH = W / "benih.jsonl"
HASIL = W / "hasil-suling.jsonl"
RINGKAS = W / "ringkasan-suling.json"

# ── PEMILIHAN GURU (ditinjau ulang 27 Agu, mengoreksi pilihan awal) ─────────
# Awalnya berkas ini memakai DeepSeek-R1-Distill-Qwen-14B karena lisensinya MIT
# dan nalarnya kuat. Ditinjau lagi, itu pilihan yang salah UNTUK TUGAS INI:
#
#   1. Tugasnya menulis ulang pertanyaan, bukan menalar. Model penalaran menulis
#      jejak <think> panjang sebelum menjawab -> token terbakar untuk pekerjaan
#      yang tidak kita butuhkan, dan tagihan GPU dibayar per detik.
#   2. 14B bf16 = ~28 GB VRAM. RTX 3090 (kelas termurah di vast) cuma 24 GB.
#      Jadi ia bahkan tidak muat, kecuali dikuantisasi 4-bit.
#
# Qwen3-8B: Apache-2.0, pengikut instruksi yang baik, Bahasa Indonesianya kuat,
# ~16 GB bf16 (muat longgar di 3090), dan tanpa jejak nalar panjang.
# Ganti guru? Periksa lisensinya dulu: node flywheel/model-terbuka.mjs
GURU = os.environ.get("GURU", "Qwen/Qwen3-8B")
MUAT_4BIT = os.environ.get("MUAT_4BIT", "0") == "1"   # untuk guru besar di GPU kecil
VARIAN = int(os.environ.get("VARIAN", "3"))           # pertanyaan baru per benih
BATAS_MENIT = float(os.environ.get("BATAS_MENIT", "45"))
SUHU = float(os.environ.get("SUHU", "0.95"))          # tinggi: kita MAU beragam
KELOMPOK = int(os.environ.get("KELOMPOK", "24"))      # 3090 sanggup; makin besar makin murah
# Satu pertanyaan yang ditulis ulang jarang lebih dari 40 token, TAPI jangan
# terlalu pelit: dengan 72 token (percobaan 27 Agu) model penalaran terpotong
# di tengah berpikir, "</think>" tak pernah muncul, dan yang tertangkap justru
# jejak pikirnya ("First, I need to make sure..."). Ruang lega + mode berpikir
# dimatikan jauh lebih murah daripada 1.047 baris sampah.
MAKS_TOKEN = int(os.environ.get("MAKS_TOKEN", "160"))


def sidik(x):
    return hashlib.sha256(json.dumps(x, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


# ── kemiripan: penjaga supaya "varian" tidak sekadar menyalin ulang ──────────
def kata(s):
    return set(re.findall(r"[a-z0-9]+", s.lower()))


def gram4(s):
    t = re.sub(r"\s+", " ", s.lower())
    return {t[i:i + 4] for i in range(max(0, len(t) - 3))}


def mirip(a, b):
    """Nilai kemiripan 0..1 — maksimum dari kemiripan kata dan kemiripan 4-gram.

    Dua ukuran dipakai bersama dengan sengaja: kemiripan kata buta terhadap
    susunan ("beli 3 ton" vs "3 ton beli" dianggap sama), sedangkan 4-gram buta
    terhadap sinonim. Yang lolos keduanya barulah benar-benar berbeda.
    """
    ka, kb = kata(a), kata(b)
    ga, gb = gram4(a), gram4(b)
    sk = len(ka & kb) / max(1, len(ka | kb))
    sg = len(ga & gb) / max(1, len(ga | gb))
    return max(sk, sg)


# ── DUA BENTUK BERKAS, SATU PEMBACA ─────────────────────────────────────────
# Ditemukan saat review 27 Agu: seluruh dataset flywheel memakai bentuk ShareGPT
# {"conversations":[{"from":"human","value":...}]}, BUKAN {"messages":[{"role":...}]}
# yang dibaca versi pertama berkas ini. Kalau tidak diperbaiki, suling.py akan
# membaca NOL giliran pengguna, tidak mengirim apa pun ke guru, lalu pulang dengan
# 0 baris — satu sesi GPU terbayar penuh untuk hasil kosong.
# Peran juga beda namanya: human/gpt (ShareGPT) vs user/assistant (OpenAI).
BENTUK = (
    ("conversations", "from", "value", {"pengguna": "human", "jawab": "gpt"}),
    ("messages", "role", "content", {"pengguna": "user", "jawab": "assistant"}),
)


def bentuk(baris):
    """Kenali bentuk baris. Melempar kalau tak dikenal — JANGAN mengembalikan
    bentuk bawaan diam-diam; itu cara paling halus menghasilkan berkas kosong."""
    for kunci, kPeran, kIsi, peta in BENTUK:
        if isinstance(baris.get(kunci), list):
            return kunci, kPeran, kIsi, peta
    raise ValueError(f"bentuk baris tak dikenal, kunci: {sorted(baris.keys())}")


def giliran(baris, peran):
    """peran: 'pengguna' atau 'jawab' — nama netral, bukan nama salah satu bentuk."""
    try:
        kunci, kPeran, kIsi, peta = bentuk(baris)
    except ValueError:
        return ""
    cari = peta.get(peran, peran)
    for m in baris.get(kunci, []):
        if m.get(kPeran) == cari:
            return m.get(kIsi, "") or ""
    return ""


def ganti_pengguna(baris, teks):
    """Salin baris dengan giliran pengguna diganti. Kunci lain (id, sumber,
    formatAngka, promptRagam) ikut terbawa apa adanya — beberapa berkas memakainya
    dan membuangnya akan memutus jejak asal-usul."""
    b = json.loads(json.dumps(baris))
    kunci, kPeran, kIsi, peta = bentuk(b)
    for m in b[kunci]:
        if m.get(kPeran) == peta["pengguna"]:
            m[kIsi] = teks
            return b
    raise ValueError("tidak ada giliran pengguna untuk diganti")


ARAHAN = (
    "Tulis ULANG permintaan pengguna di bawah ini dengan kata-kata yang BERBEDA, "
    "dalam Bahasa Indonesia yang wajar dan sehari-hari.\n"
    "ATURAN KERAS:\n"
    "1. Maksud dan SEMUA angka/nama/satuan harus PERSIS SAMA. Jangan mengubah, "
    "membulatkan, menambah, atau menghilangkan satu angka pun.\n"
    "2. JANGAN menjawab. Tulis permintaannya saja.\n"
    "3. Ganti susunan kalimat dan pilihan katanya — boleh lebih santai, lebih "
    "formal, lebih pendek, atau lewat sudut pandang berbeda.\n"
    "4. Keluarkan SATU baris saja, tanpa nomor, tanpa tanda kutip, tanpa penjelasan.\n\n"
    "Permintaan asli:\n{asli}\n\nTulis ulang:"
)

# angka yang WAJIB tetap ada; kalau guru menggeser angka, barisnya dibuang
R_ANGKA = re.compile(r"\d[\d.,]*")

# Tanda bahwa yang tertangkap adalah GURU SEDANG BERPIKIR, bukan hasil kerjanya.
# Semua frasa di bawah diambil dari keluaran nyata percobaan 27 Agu.
R_JEJAK_PIKIR = re.compile(
    r"(^|\b)(first,? i|okay,? (the|so|let)|let me|i need to|i should|the user (wants|is asking)"
    r"|we need to|my task|rephrase|paraphrase|original (query|question|request)"
    r"|berikut (adalah )?(versi|penulisan|hasil)|tulis ulang\s*:|sebagai (asisten|model))", re.I)

# Kata fungsi Inggris yang TIDAK lazim muncul di kalimat Indonesia. Dipakai untuk
# menangkap keluaran yang kabur ke bahasa Inggris — benih kita Bahasa Indonesia,
# dan model yang menjawab dalam bahasa lain berarti tidak mengerjakan tugasnya.
_ING = {"the", "and", "that", "with", "this", "for", "you", "are", "have", "what",
        "need", "make", "sure", "want", "user", "should", "would", "their", "there"}


def bukanIndonesia(t):
    kata = re.findall(r"[a-z']+", t.lower())
    if len(kata) < 4:
        return False
    asing = sum(1 for k in kata if k in _ING)
    return asing / len(kata) >= 0.25


def angka_sama(asli, baru):
    a = [x.rstrip(".,") for x in R_ANGKA.findall(asli)]
    b = [x.rstrip(".,") for x in R_ANGKA.findall(baru)]
    return sorted(a) == sorted(b)


def main():
    if not BENIH.exists():
        print("TIDAK ADA /workspace/benih.jsonl", file=sys.stderr)
        return 1
    benih = [json.loads(l) for l in BENIH.read_text(encoding="utf-8").splitlines() if l.strip()]
    print(f"benih: {len(benih)} baris · guru: {GURU} · varian/benih: {VARIAN}", flush=True)

    # Periksa bentuk SEBELUM guru dimuat (pemuatan guru makan menit dan uang).
    # Nol giliran pengguna = benih salah bentuk; berhenti sekarang, bukan setelah
    # membayar GPU untuk menghasilkan berkas kosong.
    berisi = sum(1 for b in benih if giliran(b, "pengguna").strip())
    print(f"benih dengan giliran pengguna terbaca: {berisi}/{len(benih)}", flush=True)
    if not berisi:
        print("BERHENTI: tak satu pun giliran pengguna terbaca — bentuk benih salah.", file=sys.stderr)
        return 3

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    t0 = time.time()
    tok = AutoTokenizer.from_pretrained(GURU)
    muat = dict(torch_dtype=torch.bfloat16, device_map="auto")
    if MUAT_4BIT:
        from transformers import BitsAndBytesConfig
        muat["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True)
        print("dimuat 4-bit (guru besar di GPU kecil)", flush=True)
    model = AutoModelForCausalLM.from_pretrained(GURU, **muat)
    model.eval()
    print(f"guru dimuat dalam {time.time()-t0:.0f} detik", flush=True)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    tok.padding_side = "left"

    keluar, tolak = [], {"kosong": 0, "angka_berubah": 0, "terlalu_mirip": 0, "menjawab": 0,
                         "kembar": 0, "jejak_pikir": 0, "bukan_indonesia": 0}
    terlihat = set()
    mulai = time.time()

    # kumpulkan semua permintaan (benih x varian) lalu proses berkelompok
    tugas = []
    for i, b in enumerate(benih):
        u = giliran(b, "pengguna")
        if u.strip():
            tugas += [(i, u)] * VARIAN
    # Perkiraan kasar supaya ongkos terlihat SEBELUM jam GPU berjalan, bukan sesudah.
    perkiraanMenit = len(tugas) / max(KELOMPOK, 1) * 18 / 60
    print(f"permintaan ke guru: {len(tugas)} · kelompok {KELOMPOK} · "
          f"perkiraan ~{perkiraanMenit:.0f} menit (batas {BATAS_MENIT:.0f})", flush=True)
    if perkiraanMenit > BATAS_MENIT:
        print(f"  PERINGATAN: perkiraan melampaui batas waktu — sebagian benih tidak akan "
              f"tergarap. Turunkan VARIAN atau naikkan BATAS_MENIT.", flush=True)

    for awal in range(0, len(tugas), KELOMPOK):
        if (time.time() - mulai) / 60 > BATAS_MENIT:
            print(f"BATAS WAKTU {BATAS_MENIT} menit tercapai — berhenti rapi", flush=True)
            break
        potong = tugas[awal:awal + KELOMPOK]
        # enable_thinking=False: Qwen3 itu penalar hibrida dan menulis jejak pikir
        # lebih dulu. Kita tidak butuh nalarnya, cuma kata-katanya. Template yang
        # tidak mengenal argumen ini akan mengabaikannya, jadi aman untuk guru lain.
        def bentukPesan(u):
            isi = [{"role": "user", "content": ARAHAN.format(asli=u)}]
            try:
                return tok.apply_chat_template(isi, tokenize=False, add_generation_prompt=True,
                                               enable_thinking=False)
            except TypeError:
                return tok.apply_chat_template(isi, tokenize=False, add_generation_prompt=True)

        pesan = [bentukPesan(u) for _, u in potong]
        enc = tok(pesan, return_tensors="pt", padding=True, truncation=True, max_length=2048).to(model.device)
        with torch.no_grad():
            out = model.generate(**enc, max_new_tokens=MAKS_TOKEN, do_sample=True, temperature=SUHU,
                                 top_p=0.95, pad_token_id=tok.pad_token_id)
        for (idx, asli), urut in zip(potong, out):
            teks = tok.decode(urut[enc["input_ids"].shape[1]:], skip_special_tokens=True)
            # guru penalaran menaruh jejak pikir; ambil kalimat terakhir yang berisi
            # Tag berpikir dibuang dalam TIGA bentuk, bukan satu: lengkap, hanya
            # penutup (pembukanya termakan template), dan hanya pembuka (jawabannya
            # terpotong batas token). Versi pertama cuma menangani bentuk lengkap,
            # sehingga jawaban yang terpotong lolos utuh sebagai "pertanyaan".
            teks = re.sub(r"<think>.*?</think>", " ", teks, flags=re.S)
            if "</think>" in teks:
                teks = teks.split("</think>")[-1]
            elif "<think>" in teks:
                teks = ""          # terpotong di tengah berpikir -> tidak ada jawaban sama sekali
            baris = [x.strip() for x in teks.strip().splitlines() if x.strip()]
            baru = baris[-1] if baris else ""
            baru = baru.strip(" \"'`").strip()

            if not baru or len(baru) < 8:
                tolak["kosong"] += 1; continue

            # ── LUBANG YANG DITAMBAL 27 Agu ────────────────────────────────
            # angka_sama() hanya melindungi baris YANG PUNYA ANGKA. Untuk benih
            # tanpa angka, jejak pikir guru ("First, I need to make sure...") punya
            # nol angka sama seperti aslinya -> lolos mulus. Dari 1.047 baris hasil
            # percobaan pertama, yang berangka tertolak (747) tapi yang tanpa angka
            # masuk semua. Penjaga yang hanya bekerja pada sebagian data bukan
            # penjaga; ia cuma menyaring, dan menyaring diam-diam itu menipu.
            if R_JEJAK_PIKIR.search(baru):
                tolak["jejak_pikir"] += 1; continue
            if bukanIndonesia(baru):
                tolak["bukan_indonesia"] += 1; continue

            if not angka_sama(asli, baru):
                tolak["angka_berubah"] += 1; continue          # penjaga untuk baris berangka
            # BUG YANG DITANGKAP uji_suling.py sebelum sepeser pun dibayar:
            # dulu ditulis \b(...|= *\d). "\b" di depan gugusan menuntut batas KATA
            # sebelum "=", padahal sebelum "=" hampir selalu spasi -> tidak pernah cocok.
            # Akibatnya "3 x 8500 = 25500" LOLOS: penjaganya mati diam-diam.
            if re.search(r"(\b(jawab|jawabannya|hasilnya)|=\s*\d)", baru, re.I):
                tolak["menjawab"] += 1; continue               # guru melanggar aturan 2
            if mirip(asli, baru) >= 0.8:
                tolak["terlalu_mirip"] += 1; continue          # bukan varian, cuma salinan
            k = re.sub(r"\W+", "", baru.lower())
            if k in terlihat:
                tolak["kembar"] += 1; continue
            terlihat.add(k)

            b = ganti_pengguna(benih[idx], baru)
            b["_asal"] = "suling"
            b["_guru"] = GURU
            b["_benih"] = sidik(benih[idx])
            keluar.append(b)

        print(f"  [{(time.time()-mulai)/60:>4.1f} mnt] {awal+len(potong)}/{len(tugas)} diminta · "
              f"{len(keluar)} diterima · ditolak {sum(tolak.values())}", flush=True)

    HASIL.write_text("\n".join(json.dumps(x, ensure_ascii=False) for x in keluar), encoding="utf-8")
    ringkasan = {
        "guru": GURU, "benih": len(benih), "diminta": len(tugas),
        "diterima": len(keluar), "ditolak": tolak,
        "menit": round((time.time() - mulai) / 60, 1),
        "sidikBenih": sidik([sidik(b) for b in benih]),
        "sidikHasil": sidik([sidik(b) for b in keluar]),
        "suhu": SUHU, "varianDiminta": VARIAN,
        "catatan": "guru HANYA menulis ulang giliran pengguna; jawaban tidak disentuh sama sekali",
    }
    RINGKAS.write_text(json.dumps(ringkasan, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n" + json.dumps(ringkasan, ensure_ascii=False, indent=1), flush=True)

    # Nol hasil = GAGAL, bukan "selesai dengan 0 baris". Kegagalan yang terlihat
    # seperti keberhasilan adalah cara paling mahal kehilangan satu sesi GPU.
    return 0 if keluar else 2


if __name__ == "__main__":
    sys.exit(main())
