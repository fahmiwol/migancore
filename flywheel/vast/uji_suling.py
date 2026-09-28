#!/usr/bin/env python
"""uji_suling.py — uji PENJAGA suling.py tanpa GPU, tanpa guru, tanpa biaya.

Kenapa ada: satu sesi GPU yang terbuang karena penjaga cacat harganya lebih mahal
daripada uji ini, dan bagian suling.py yang paling menentukan justru bagian yang
TIDAK butuh GPU — pemeriksa angka, pemeriksa kemiripan, pembuang jawaban.
Yang bisa diuji di laptop, diuji di laptop.

Tiap kasus di bawah adalah cara nyata guru bisa merusak data:
menggeser angka (fatal), menjawab padahal disuruh bertanya (mencemari),
menyalin ulang (bukan varian, cuma menggandakan bobot satu kalimat).

Pakai: python flywheel/vast/uji_suling.py
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# suling.py mengimpor torch/transformers hanya di dalam main(), jadi aman diimpor di sini
from suling import (angka_sama, mirip, giliran, ganti_pengguna, bentuk,  # noqa: E402
                    bukanIndonesia, ARAHAN, R_ANGKA, R_JEJAK_PIKIR)

lulus = gagal = 0


def cek(nama, dapat, harap):
    global lulus, gagal
    if dapat == harap:
        lulus += 1
        print(f"  OK   {nama}")
    else:
        gagal += 1
        print(f"  GAGAL {nama}\n        dapat: {dapat!r}\n        harap: {harap!r}")


print("angka WAJIB tidak bergeser (penjaga paling menentukan)")
cek("kalimat ditulis ulang, angka utuh",
    angka_sama("Berapa margin kalau beli 3 ton di harga 8.500?",
               "Kalau saya ambil 3 ton dengan harga 8.500, marginnya berapa ya?"), True)
cek("satu angka DIUBAH -> ditolak",
    angka_sama("beli 3 ton di harga 8.500", "beli 4 ton di harga 8.500"), False)
cek("satu angka HILANG -> ditolak",
    angka_sama("beli 3 ton di harga 8.500", "beli beberapa ton di harga 8.500"), False)
cek("angka DITAMBAH -> ditolak",
    angka_sama("beli 3 ton", "beli 3 ton, kira-kira 2 hari lagi"), False)
cek("titik/koma pemisah ribuan tidak dianggap beda",
    angka_sama("harga 8.500 per kg", "per kg-nya 8.500"), True)
cek("kalimat tanpa angka sama-sama lolos",
    angka_sama("tolong buatkan gambar", "bisa tolong bikinkan gambarnya?"), True)

print("\nkemiripan: varian harus benar-benar berbeda")
cek("salinan persis -> mirip penuh", mirip("beli 3 ton arang", "beli 3 ton arang") == 1.0, True)
cek("hanya urutan ditukar -> masih terlalu mirip (>=0,8)",
    mirip("beli 3 ton arang batok", "arang batok beli 3 ton") >= 0.8, True)
cek("ditulis ulang sungguhan -> di bawah ambang",
    mirip("Berapa margin kalau beli 3 ton di harga 8.500?",
          "Saya mau ambil 3 ton, harganya 8.500 — untungnya berapa?") < 0.8, True)

print("\nguru yang MENJAWAB padahal disuruh bertanya")
pola = re.compile(r"(\b(jawab|jawabannya|hasilnya)|=\s*\d)", re.I)  # sama persis dgn suling.py
cek("'jawabannya adalah' tertangkap", bool(pola.search("Jawabannya adalah 25.500")), True)
cek("'= 25500' tertangkap", bool(pola.search("3 x 8500 = 25500")), True)
cek("pertanyaan wajar TIDAK tertangkap", bool(pola.search("Kalau ambil 3 ton, untungnya berapa?")), False)

print("\npembaca giliran - bentuk OpenAI")
oai = {"messages": [{"role": "system", "content": "S"}, {"role": "user", "content": "U"},
                    {"role": "assistant", "content": "A"}]}
cek("ambil giliran pengguna", giliran(oai, "pengguna"), "U")
cek("ambil giliran jawaban", giliran(oai, "jawab"), "A")
cek("baris rusak -> kosong, tidak meledak", giliran({}, "pengguna"), "")

# Ini bentuk yang BENAR-BENAR dipakai seluruh dataset flywheel. Versi pertama
# suling.py hanya membaca "messages" -> akan pulang 0 baris setelah GPU dibayar.
print("\npembaca giliran - bentuk ShareGPT (yang dipakai dataset kita)")
sgpt = {"conversations": [{"from": "system", "value": "S"}, {"from": "human", "value": "U"},
                          {"from": "gpt", "value": "A"}],
        "id": "x1", "sumber": "cluster-tool", "formatAngka": "polos"}
cek("ambil giliran pengguna (human)", giliran(sgpt, "pengguna"), "U")
cek("ambil giliran jawaban (gpt)", giliran(sgpt, "jawab"), "A")
cek("bentuk dikenali sebagai conversations", bentuk(sgpt)[0], "conversations")
cek("bentuk dikenali sebagai messages", bentuk(oai)[0], "messages")

print("\nbentuk tak dikenal harus BERTERIAK, bukan diam")
try:
    bentuk({"aneh": 1})
    cek("bentuk asing melempar ValueError", "tidak melempar", "melempar")
except ValueError:
    cek("bentuk asing melempar ValueError", "melempar", "melempar")

print("\nganti giliran pengguna tanpa merusak yang lain")
g = ganti_pengguna(sgpt, "PERTANYAAN BARU")
cek("giliran pengguna terganti", giliran(g, "pengguna"), "PERTANYAAN BARU")
cek("JAWABAN TIDAK TERSENTUH (aturan paling keras)", giliran(g, "jawab"), "A")
cek("giliran system utuh", g["conversations"][0]["value"], "S")
cek("kunci id ikut terbawa", g.get("id"), "x1")
cek("kunci formatAngka ikut terbawa", g.get("formatAngka"), "polos")
cek("benih ASLI tidak ikut berubah", giliran(sgpt, "pengguna"), "U")
go = ganti_pengguna(oai, "BARU")
cek("bentuk OpenAI juga bisa diganti", giliran(go, "pengguna"), "BARU")
cek("bentuk OpenAI: jawaban tetap utuh", giliran(go, "jawab"), "A")

print("\ntanpa giliran pengguna -> menolak, tidak diam-diam lolos")
try:
    ganti_pengguna({"conversations": [{"from": "gpt", "value": "A"}]}, "X")
    cek("tanpa giliran pengguna melempar", "tidak melempar", "melempar")
except ValueError:
    cek("tanpa giliran pengguna melempar", "melempar", "melempar")

print("\narahan ke guru menyebut larangan menjawab")
cek("arahan memuat 'JANGAN menjawab'", "JANGAN menjawab" in ARAHAN, True)
cek("arahan memuat larangan mengubah angka", "angka" in ARAHAN.lower(), True)
cek("pola angka menangkap ribuan bertitik", R_ANGKA.findall("harga 8.500 dan 12.000"), ["8.500", "12.000"])

print("\njejak pikir guru - SEMUA kasus di bawah LOLOS penjaga lama")
# Percobaan 27 Agu: 1.047 baris diterima, dan contoh-contohnya ternyata bukan
# pertanyaan melainkan guru sedang berpikir. Lolos karena angka_sama() hanya
# melindungi baris YANG PUNYA ANGKA: jejak pikir tanpa angka vs benih tanpa
# angka = sama-sama nol = lolos. Penjaga yang cuma bekerja di sebagian data
# bukan penjaga.
tolak = lambda t: bool(R_JEJAK_PIKIR.search(t)) or bukanIndonesia(t)
cek("'First, I need to make sure not to' ditolak", tolak("First, I need to make sure not to"), True)
cek("'Okay, the user wants me to rephrase' ditolak",
    tolak("Okay, the user wants me to rephrase their original query in Indonesian"), True)
cek("'the core meaning remains the same' ditolak",
    tolak("First, I need to ensure that the core meaning remains the same. The question"), True)
cek("'Original query:' ditolak", tolak('Original query: "Ada 225 lead belum dikontak"'), True)
cek("'Berikut versi lain:' ditolak", tolak("Berikut versi lain dari pertanyaan itu"), True)

print("\npertanyaan Indonesia yang WAJAR tidak boleh ikut tertolak")
cek("pertanyaan lead lolos", tolak("Berapa lead yang belum dikontak sekarang?"), False)
cek("pertanyaan santai lolos", tolak("Coba cek ada berapa lead yang belum kita hubungi ya"), False)
cek("pertanyaan berangka lolos", tolak("Tolong hitung margin kalau ambil 3 ton di harga 8.500"), False)
cek("kalimat pendek tidak dihakimi bahasanya", bukanIndonesia("Cek dong"), False)

print("\nkenapa penjaga angka saja TIDAK cukup (bukti lubangnya)")
cek("jejak pikir tanpa angka LOLOS angka_sama - inilah lubangnya",
    angka_sama("Berapa lead yang belum dikontak?", "First, I need to make sure not to"), True)
cek("...tapi penjaga baru menangkapnya", tolak("First, I need to make sure not to"), True)

print("\n" + "=" * 56)
print(f"{lulus} lulus · {gagal} gagal")
sys.exit(1 if gagal else 0)
