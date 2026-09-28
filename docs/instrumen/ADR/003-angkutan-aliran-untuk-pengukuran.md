# ADR-003 — Pengukuran memakai angkutan ALIRAN, dan kesetaraannya wajib diukur

**Status:** Diterima · 2026-09-10
**Konteks episode:** C56 / F-220, paritas klien / F-221

## Konteks

`fetch` bawaan Node (undici) memberi `headersTimeout` **300.000 ms**. Dengan
`stream: false`, Ollama tidak mengirim satu byte pun sampai seluruh jawaban
selesai dibuat. Akibatnya setiap jawaban yang butuh lebih dari 300 detik
**memutus koneksinya sendiri**, berapa pun batas waktu yang kami pasang.

Ini menyandera satu episode jalur-kritis selama tiga minggu: base mentah
`qwen3:4b` diukur **11 kali**, divonis TIDAK SAH **11 kali**, dan diagnosisnya
tertulis di beberapa dokumen sebagai sifat model. Nilai `BATAS=300` yang dipilih
sebagai perbaikan berdiri **persis di langit-langit itu**.

Diverifikasi dari tiga sumber: rantai `cause` galat aslinya
(`UND_ERR_HEADERS_TIMEOUT`), reproduksi offline tanpa Ollama (menyerah 304,8 dtk
walau batas 1.800), dan matriks empat klien — **hanya Node yang menyerah**;
`curl`, `python-requests`, dan `python-urllib` semuanya selesai.

## Keputusan

1. Jalur pengukuran memakai `stream: true` (`ALIRAN=1`). Header datang seketika,
   tiap potongan menyegarkan `bodyTimeout`, langit-langitnya hilang.
2. **Kesetaraan angkutan wajib DIUKUR sebelum dipakai**, bukan diasumsikan:
   seed dikunci, dan **prasyarat determinisme diperiksa lebih dulu** — dua
   panggilan pada MODA YANG SAMA dengan seed sama harus identik. Kalau tidak,
   ujinya **BATAL**, bukan lulus dan bukan gagal.
3. Medan `aliran` dicatat di tiap berkas hasil, dan gerbang menolak mencampur
   dua angkutan dalam satu perbandingan (C29).

## Kenapa prasyarat determinisme ada

Rancangan pertama uji kesetaraan membandingkan `qwen3:4b` dan mendapat
"BEDA 48 vs 171 huruf". Kesimpulan yang hampir diambil: aliran mengubah jawaban.
**Salah** — ujinya tidak bisa memisahkan "angkutan mengubah jawaban" dari "model
ini memang tidak deterministik pada seed". Sesudah prasyarat ditambahkan dan
diukur pada model yang deterministik: **3/3 identik byte demi byte**.

Percobaan prasyarat yang pertama pun cacat: `num_predict 200` pada model bernalar
habis di dalam blok nalar → dua jawaban **kosong** → "IDENTIK". Lulus-kosong.
Prasyarat sekarang membatalkan uji kalau jawabannya kosong.

## Yang ditolak, dan kenapa

- **Menaikkan `BATAS` saja.** Ditolak: tidak bisa berhasil, karena batasnya bukan
  milik kami.
- **Memasang `num_predict`.** Ditolak untuk pengukuran: ia memotong gejala yang
  sedang diukur. (Diperiksa dan dicatat: `num_predict 4096` terbukti tidak
  memotong satu pun dari 3.151 jawaban tersimpan — tersedia kalau suatu saat
  benar-benar dibutuhkan.)
- **Pindah ke `curl` atau Python untuk pengukuran.** Ditolak: memindahkan
  masalahnya ke tumpukan lain yang batas bawaannya juga tidak kami baca. Yang
  benar bukan memilih klien yang "tidak punya batas" melainkan **batasnya
  dipilih dan ditulis**.

## Konsekuensi

- Sebelas berkas hasil `qwen3:4b` yang TIDAK SAH tetap disimpan sebagai bukti,
  **tidak dihapus**.
- Angka yang pernah terbit **tidak tercemar** — aturan kesahihan C33 (putaran
  dengan >10 % GALAT tidak sah) menahan seluruh kerusakannya. Gerbang yang
  ditulis untuk alasan lain menyelamatkan pengukuran dari cacat yang belum ada
  namanya saat gerbangnya dibuat.
- **Batas bukti yang ditulis apa adanya**: kesetaraan diukur pada
  `migancore:0.14`, **bukan** pada `qwen3:4b` — seed tidak memberi determinisme
  di sana, jadi uji byte-demi-byte tidak bisa dijalankan. Yang tersisa: bukti di
  lapisan API pada model yang deterministik, plus alasan mekanis (Ollama
  menjalankan lingkar generasi yang sama, hanya berbeda kapan ia menyiram
  keluarannya).

## Apa yang membuat keputusan ini salah

Kalau suatu hari terbukti `stream:true` mengubah keluaran pada suatu model —
misalnya karena pemenggalan token berbeda — maka seluruh angka ber-`aliran`
harus dipisahkan. Pemeriksaannya sudah tersedia:
`node eval/uji-batas-fetch.mjs --setara <model>` pada model deterministik mana pun.

## Cara membatalkan

`ALIRAN=0`. Perilakunya kembali persis seperti sebelum 10 Sep, termasuk
langit-langit 300 detiknya.
