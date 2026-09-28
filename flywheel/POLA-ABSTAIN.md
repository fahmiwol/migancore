# POLA ABSTAIN — bahan latih sumbu kejujuran (sumber: mesin)

> Ditulis 7 Sep 2026 untuk Episode F1 (doc 88). Berkas ini **terpisah** dari
> `POLA-ARTIKEL.md` supaya provenance tetap jujur: pola di sana **dipanen dari
> artikel publik**, pola di sini **dibuat mesin**. Semua `sumber: mesin`, jadi
> `terbit: false` — bahan latih, tidak pernah jadi soal ujian.
>
> **Aturan konstruksi yang membuat jawabannya bisa dipercaya**: tiap pola di bawah
> menjamin kebenaran jawabannya sendiri, tanpa perlu memverifikasi ke dunia luar.
>
> - Nomor aturan bertahun **2027–2030** pasti belum ada saat catatan dibuat.
> - Lembaga/skema yang **memang tidak ada** (dirangkai dari kata yang benar tapi
>   kombinasinya fiktif) tidak akan punya catatan.
> - Pertanyaan biaya/jumlah **tanpa besaran** memang tidak bisa dijawab angka —
>   yang kurang bisa disebut dari struktur soalnya.
> - Pertanyaan bercabang memang punya cabang; cabangnya ada di isiannya.
>
> Yang **tidak** ada di sini: pola yang jawabannya menuntut pengetahuan dunia
> (mis. "apakah benar negara X melarang Y") — di situ mesin tidak bisa menjamin
> kebenarannya, dan data latih karangan lebih mahal daripada tidak ada data.

## mesin-aturan-masa-depan-luas
jenis: tak-terjawab
sumber: mesin
template: Berapa ambang {PARAMETER} yang diwajibkan {ATURAN} untuk {BARANG}?
PARAMETER: kadar air | kadar abu | nilai kalori | kadar zat terbang | kadar sulfur
ATURAN: Permendag Nomor 317 Tahun 2028 | Kepmenperin Nomor 45 Tahun 2029 | SNI 8812-3:2030
BARANG: briket tempurung kelapa | arang batok | kopra putih

## mesin-lembaga-fiktif
jenis: tak-terjawab
sumber: mesin
template: Bagaimana prosedur pendaftaran {BARANG} di {LEMBAGA}?
BARANG: briket arang | arang tempurung
LEMBAGA: Badan Sertifikasi Biomassa Nasional | Direktorat Standardisasi Arang Ekspor | Lembaga Verifikasi Karbon Tempurung

## mesin-biaya-tanpa-besaran
jenis: konteks-kurang
sumber: mesin
template: Berapa total biaya {LAYANAN} yang harus saya siapkan?
LAYANAN: sertifikasi mutu | pengujian laboratorium | pengurusan dokumen ekspor | penyimpanan gudang

## mesin-waktu-tanpa-acuan
jenis: konteks-kurang
sumber: mesin
template: Berapa lama proses {LAYANAN} sampai selesai?
LAYANAN: fumigasi | uji self-heating | penerbitan COO | inspeksi muatan

## mesin-permintaan-ambigu
jenis: maksud-kurang
sumber: mesin
template: Dokumen apa yang harus saya siapkan untuk {TUJUAN}?
TUJUAN: ekspor | pengiriman pertama | pembeli baru | audit mutu

## mesin-harga-berubah
jenis: kedaluwarsa
sumber: mesin
template: Berapa harga {BARANG} per ton sekarang?
BARANG: briket tempurung kelapa | arang batok | kopra

## mesin-pilihan-selera
jenis: subjektif
sumber: mesin
template: Mana yang lebih baik untuk {TUJUAN}: {A} atau {B}?
TUJUAN: pasar Eropa | pasar Timur Tengah | pembeli baru
A: briket bentuk kubus | kemasan karton
B: briket bentuk silinder | kemasan karung

> ### Tambahan 7 Sep — mengejar target F1 (>=120 baris)

> Batch pertama menghasilkan 82 baris; target F1 di doc 88 adalah **>=120**.
> Angka itu ambang pra-daftar, jadi yang dinaikkan adalah jumlah polanya —
> bukan targetnya. Empat jenis paling tipis diisi di bawah, semuanya tetap
> tunduk pada aturan konstruksi di kepala berkas ini.
>
> Satu tambahan aturan yang lahir hari ini: **pola baru wajib punya cabang
> pengekstrak di `jawabanAbstain()`**. Batch pertama membuktikan kenapa —
> template `Berapa ambang {PARAMETER} yang diwajibkan {ATURAN}...` tidak cocok
> dengan pengekstrak mana pun, sehingga 45 soal jatuh ke satu kalimat cadangan
> yang sama. Pola tanpa cabang = data seragam, dan gerbang keragaman kini
> menolaknya.

## mesin-pencabutan-mustahil
jenis: premis-salah
sumber: mesin
template: Setelah {ATURAN} mencabut kewajiban {SYARAT} untuk {BARANG}, apakah eksportir masih perlu mengurusnya?
ATURAN: Permendag Nomor 402 Tahun 2029 | Kepmenperin Nomor 77 Tahun 2030 | Perpres Nomor 12 Tahun 2028
SYARAT: sertifikat mutu | uji kadar air | surat keterangan asal | inspeksi pra-kirim
BARANG: briket tempurung kelapa | arang batok

## mesin-ukuran-ambigu
jenis: maksud-kurang
sumber: mesin
template: Berapa ukuran {BARANG} yang tepat untuk {TUJUAN}?
BARANG: briket tempurung kelapa | arang batok | kopra
TUJUAN: ekspor | pembeli baru | kontrak jangka panjang

## mesin-standar-ambigu
jenis: maksud-kurang
sumber: mesin
template: Apa standar {ASPEK} untuk {BARANG}?
ASPEK: mutu | kemasan | pelabelan | penyimpanan
BARANG: briket tempurung kelapa | arang batok | kopra

## mesin-kurs-berubah
jenis: kedaluwarsa
sumber: mesin
template: Berapa kurs yang dipakai untuk menghitung nilai ekspor {BARANG} sekarang?
BARANG: briket tempurung kelapa | arang batok | kopra | serat kelapa

## mesin-pembeli-berubah
jenis: kedaluwarsa
sumber: mesin
template: Siapa pembeli terbesar {BARANG} Indonesia saat ini?
BARANG: briket tempurung kelapa | arang batok | kopra | serat kelapa | tempurung kelapa

## mesin-strategi-selera
jenis: subjektif
sumber: mesin
template: Apakah {STRATEGI} layak dicoba untuk {TUJUAN}?
STRATEGI: menurunkan harga | menambah kapasitas gudang | ikut pameran dagang | menyewa agen lokal
TUJUAN: menembus pasar Eropa | menggaet pembeli pertama | menaikkan volume
