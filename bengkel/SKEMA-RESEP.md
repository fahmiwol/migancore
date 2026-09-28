# BENGKEL — skema resep model

> Kerangka untuk menempa model apa pun, bukan hanya MiganCore. Satu folder
> `resep/<nama>/` memegang seluruh keputusan tentang satu model, dari arah
> sampai gerbang ujinya. Semua tahap sebelum GPU.

---

## Kenapa resep, bukan sekadar dataset

Kami sudah dua kali melatih model yang datanya bagus tapi hasilnya tidak jelas —
karena tidak pernah ada dokumen yang menyatakan **model ini seharusnya jadi
apa**, dan **bagaimana kita tahu ia sudah jadi**. Tanpa itu, tiap hasil bisa
dibaca sebagai keberhasilan sesudah kejadian.

Resep memaksa keputusan itu ditulis **sebelum** ada angka yang bisa
dirasionalisasi.

---

## Aturan pengikat: kemampuan tanpa alat ukur = ditolak

Aturan yang sama yang menyelamatkan register cacat berlaku di sini:

> **Setiap kemampuan yang dinyatakan di kurikulum WAJIB punya `caraUkur`.**
> Kalau tidak, `bengkel periksa` menolak resepnya, dan pipa tidak jalan.

Ini yang mencegah "model ahli keuangan" berakhir sebagai daftar harapan.
Menyatakan "ia harus paham arus kas" memaksa kita menuliskan soal yang
membuktikannya — sekarang, bukan nanti.

---

## Sebelas berkas, urut sesuai ketergantungannya

| # | Berkas | Menjawab | Bergantung pada |
|---|---|---|---|
| 01 | `ARAH.json` | model ini untuk siapa, dan **bukan** untuk apa | — |
| 02 | `IDENTITAS.json` | siapa dia: nama, suara, batas peran | 01 |
| 03 | `PERILAKU.json` | kapan menolak, kapan berinisiatif, kapan mengaku tidak tahu | 01, 02 |
| 04 | `NALAR.json` | cara berpikir yang dipasang: langkah, periksa balik, cabang | 01 |
| 05 | `KURIKULUM.json` | kemampuan apa saja, urut dari fondasi ke lanjutan | 01, 04 |
| 06 | `SSOT.json` | fakta yang WAJIB benar, satu sumber kebenaran | 01 |
| 07 | `KORPUS.json` | sumber bahan + lisensinya + rencana RAG | 05, 06 |
| 08 | `GERBANG.json` | alat ukur, **diturunkan dari 03/04/05** | 03, 04, 05 |
| 09 | `TOLOK.json` | pembanding luar + baseline | 05, 08 |
| 10 | `LATIH.json` | base model, hiperparameter, anggaran | 05, 07 |
| 11 | `PETA-JALAN.md` | tahap, urutan, dan syarat naik tahap | semua |

Nomornya bukan hiasan: **urutan itu urutan ketergantungan.** Menulis kurikulum
sebelum arah menghasilkan daftar kemampuan yang tidak tahu untuk siapa; menulis
gerbang sebelum perilaku menghasilkan ujian yang mengukur hal yang salah.

---

## Bentuk tiap berkas

### 01 ARAH.json — untuk siapa, dan bukan untuk apa
```json
{
  "nama": "omiga-keuangan",
  "kalimatSatu": "Pendamping keuangan untuk pemilik usaha kecil Indonesia.",
  "penggunaNyata": "pemilik usaha 1–20 karyawan yang mengurus pembukuannya sendiri",
  "pekerjaanYangDibantu": ["membaca arus kas", "menyiapkan berkas pajak", "menilai kelayakan utang"],
  "BUKANUntuk": ["nasihat investasi personal", "menghitung pajak final tanpa akuntan", "menggantikan auditor"],
  "kenapaBukanModelUmum": "istilah, aturan, dan musim usaha Indonesia tidak tertangkap model umum"
}
```
`BUKANUntuk` bukan basa-basi hukum. Ia dipakai membangkitkan **data menolak**:
tiap butir jadi soal yang jawabannya harus penolakan.

### 03 PERILAKU.json — kontrak perilaku
```json
{
  "suara": "ringkas, langsung, tanpa jargon yang tidak perlu",
  "menolakKalau": ["diminta angka yang tidak ada dasarnya", "diminta menjamin hasil"],
  "berinisiatifKalau": ["angka yang diberikan janggal", "ada risiko yang tidak ditanyakan"],
  "mengakuTidakTahuKalau": ["sumbernya lebih lama dari 12 bulan", "aturannya berbeda antar-daerah"],
  "panjangJawaban": "seperlunya — tidak dibatasi kalau memang perlu panjang"
}
```

### 04 NALAR.json — cara berpikir yang dipasang
```json
{
  "metode": [
    { "nama": "periksa-balik", "kapan": "setiap hitungan",
      "bentuk": "hitung ulang lewat jalan lain sebelum menyebut hasil final" },
    { "nama": "sebut-jebakan", "kapan": "soal bersatuan atau bermusim",
      "bentuk": "sebutkan salah-baca yang paling mungkin, lalu tunjukkan yang benar" },
    { "nama": "cabang-sadar", "kapan": "pertanyaan benar-benar ambigu",
      "bentuk": "sebut dua bacaan beserta angkanya, jangan memilih diam-diam" }
  ],
  "ragamBentukMinimal": 12
}
```
`ragamBentukMinimal` langsung menjadi ambang di gerbang ragam-narasi. Itu
pelajaran C13: satu operasi yang diceritakan dengan tiga templat menghasilkan
model yang menghafal naskah.

### 05 KURIKULUM.json — kemampuan + cara mengukurnya
```json
{
  "modul": [
    { "kode": "F1", "lapis": "fondasi", "kemampuan": "aritmetika uang & satuan",
      "kenapa": "seluruh modul di atasnya bergantung pada ini",
      "contohBenar": "12 juta ÷ 4 termin = 3 juta per termin, diperiksa dengan mengalikan balik",
      "contohSalah": "menyebut angka tanpa memeriksa, atau salah satuan",
      "caraUkur": { "jenis": "hitung", "berkas": "uji-aritmetika.mjs", "ambang": "≥90% per jenis" } },
    { "kode": "K1", "lapis": "domain", "kemampuan": "membaca arus kas bulanan",
      "prasyarat": ["F1"],
      "caraUkur": { "jenis": "soal-kunci", "jumlah": 20, "ambang": "≥16/20" } }
  ]
}
```
`prasyarat` membentuk urutan belajar. `bengkel periksa` menolak modul yang
prasyaratnya tidak ada — itu mencegah kurikulum yang menggantung.

### 08 GERBANG.json — diturunkan, bukan dikarang
Tidak ditulis tangan. `bengkel rakit` menurunkannya dari 03/04/05 supaya tidak
ada kemampuan yang dinyatakan tanpa gerbang, dan tidak ada gerbang yang tidak
mengukur kemampuan yang dinyatakan. Dua arah, dua-duanya diperiksa.

---

## Tahapan, dan syarat naik tahap

| Tahap | Selesai kalau | Perintah |
|---|---|---|
| 1 ARAH | 01–02 terisi, `BUKANUntuk` ≥3 butir | `bengkel baru <nama>` |
| 2 KONTRAK | 03–04 terisi | `bengkel periksa <nama>` |
| 3 KURIKULUM | tiap modul punya `caraUkur`, prasyarat utuh | `bengkel periksa <nama>` |
| 4 BAHAN | 06–07 terisi, tiap sumber punya lisensi | `bengkel periksa <nama>` |
| 5 GERBANG | 08 diturunkan, tiap modul terpetakan | `bengkel rakit <nama>` |
| 6 DATA | dataset dirakit, semua penjaga hijau | `bengkel rakit <nama>` |
| 7 IZIN | pipa siap-latih hijau + pra-daftar terkunci | `bengkel siap <nama>` |
| 8 LATIH | GPU | di luar bengkel |
| 9 UKUR | gerbang + petak tahan + kenari | `bengkel nilai <nama>` |

Tahap yang belum selesai **menghentikan** tahap berikutnya — aturan yang sama
dengan pipa data, karena sebabnya sama: mengerjakan tahap 6 di atas tahap 3 yang
bolong menghasilkan data yang rapi untuk tujuan yang salah.

---

## Multimodal, dan model spesialis lain

Skema ini tidak mengandaikan teks. `KURIKULUM.modul[].caraUkur.jenis` boleh
`gambar`, `suara`, atau `alat`; `KORPUS.sumber[].modalitas` menyebut bentuknya.
Yang berubah cuma isi resepnya — tahapan, aturan pengikat, dan gerbangnya sama.

Itu memang tujuannya: **yang dibangun bukan satu model, melainkan cara menempa
model.**
