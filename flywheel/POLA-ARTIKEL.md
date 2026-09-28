# POLA dari artikel & forum publik — ekspor briket/kelapa (sumber: artikel)

> Dipanen 2 Sep 2026 lewat pencarian web, BUKAN ditulis dari ingatan. Tiap pola
> mengutip sumbernya. Ini tangga T1–T2 (doc 82): fakta industri dari tulisan
> praktisi — dipakai untuk MEMBENTUK soal, dan untuk soal `fakta` kuncinya
> diambil dari sumber yang sama. Postingan sosmed asli (Threads/TikTok) menyusul
> lewat Chrome Fahmi; polanya masuk ke berkas terpisah dengan `sumber: sosmed`.
>
> Sumber:
> - Kompasiana 29 Mar 2026 "Prosedur Ekspor Arang Batok & Briket (UN 1361)" — briket = dangerous goods UN 1361, MSDS, kadar air & self-heating.
> - goexport.org "Cara Ekspor Arang Briket" & "Cara Ekspor Briket" — NIB, SKA/COO, MSDS, fumigasi, PEB via INATRADE/CEISA, tujuan utama Jepang/Korea/Jerman/Timur Tengah.
> - rajastek.com Mar 2026 — COA per batch, MSDS + sertifikat Self-Heating Test wajib untuk naik kapal.
> - jangkargroups.co.id Jun 2025 — HS 4402.90.00 arang tempurung; COO; phytosanitary; L/C vs T/T.
> - asiacommerce.id Jan 2024 — FSC bisa disyaratkan; AMDAL; NPWP/SIUP/NIPER.
> - mandalayhighpoint.com Apr 2026 — Eropa: kadar abu <3%, tanpa pengikat kimia; halal untuk Timur Tengah.
>
> Jebakan "tak-terjawab" memakai TAHUN MASA DEPAN pada nomor aturan (2027–2030):
> aturan bernomor tahun depan pasti belum ada — tak mungkin nyata, tak perlu diverifikasi.

## artikel-kode-un-arang
jenis: fakta
sumber: artikel
template: Dalam pengiriman laut, {BARANG} digolongkan dangerous goods dengan nomor UN berapa?
BARANG: arang tempurung kelapa | briket arang | charcoal
benar: 1361

## artikel-dokumen-keamanan-bahan
jenis: fakta
sumber: artikel
template: Dokumen keamanan bahan yang wajib dilampirkan agar {BARANG} boleh naik kapal disingkat apa?
BARANG: briket arang | arang batok kelapa
benar: msds

## artikel-aturan-masa-depan
jenis: tak-terjawab
sumber: artikel
template: Apa ambang batas {PARAMETER} untuk ekspor {BARANG} menurut {ATURAN}?
PARAMETER: kadar air | kadar abu | nilai kalori
BARANG: briket tempurung kelapa | kopra
ATURAN: Permendag Nomor 214 Tahun 2027 | Kepmenperin Nomor 88 Tahun 2028 | SNI 9999-7:2029

## artikel-larangan-fiktif
jenis: premis-salah
sumber: artikel
template: Sejak {NEGARA} melarang impor {BARANG} dari Indonesia pada {TAHUN}, jalur ekspor mana yang masih terbuka?
NEGARA: Jepang | Korea Selatan | Jerman
BARANG: briket tempurung kelapa | arang batok
TAHUN: 2024 | 2025

## artikel-biaya-tanpa-data
jenis: konteks-kurang
sumber: artikel
template: Berapa biaya {LAYANAN} untuk kontainer saya ke {NEGARA}?
LAYANAN: fumigasi | uji self-heating | pengurusan COO
NEGARA: Jepang | Arab Saudi | Jerman

## artikel-sertifikat-ambigu
jenis: maksud-kurang
sumber: artikel
template: Sertifikat apa yang saya butuhkan untuk {BARANG}?
BARANG: briket | kopra | santan beku

## artikel-tarif-berubah
jenis: kedaluwarsa
sumber: artikel
template: Berapa tarif bea masuk {BARANG} di {NEGARA} saat ini?
BARANG: briket arang | kopra
NEGARA: Jepang | Uni Emirat Arab | Turki

## artikel-fob-atau-cif
jenis: subjektif
sumber: artikel
template: Lebih baik jual {BARANG} dengan skema FOB atau CIF ke pembeli baru?
BARANG: briket | kopra | arang batok
