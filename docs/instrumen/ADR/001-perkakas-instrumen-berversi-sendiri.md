# ADR-001 — Perkakas instrumen berversi sendiri, terpisah dari versi model

**Status:** Diterima · 2026-09-11
**Konteks episode:** C56 (F-220), audit sinyal (F-232)

## Konteks

MiganCore punya dua hal yang berubah dan sering tertukar: **model** (`0.14`,
`0.4-qwen3`, …) dan **alat yang mengukur model** (`eval/*`). Sepanjang 10–11 Sep
kami menemukan **empat cacat berbeda pada alat ukurnya**, dan tiga di antaranya
sempat terbaca sebagai sifat model:

- langit-langit 300 detik milik klien HTTP terbaca "base tidak bisa diukur",
- `MENOLAK` menyala pada kata `"masalah"` sehingga MENGARANG terukur terlalu rendah,
- `TANYA` menyala pada nalar model yang bocor sehingga kelulusan palsu lolos,
- vonis yang ditulis di medan bernama lain lenyap dari SSOT.

Selama alat ukur tidak punya versi sendiri, kalimat *"angka ini diukur dengan
alat yang mana"* tidak punya jawaban. Dan tanpa jawaban itu, jembatan antar-kamus
(C38) tidak bisa dibuat tanpa menebak.

## Keputusan

Perkakas audit instrumen mendapat **rumah dan versi semantiknya sendiri**:
`docs/instrumen/`, versi `instrumen-vMAJOR.MINOR.PATCH`, **terpisah** dari
penomoran model dan dari penomoran dokumen `docs/jarvis/NN_*`.

Aturan naiknya:

- **MAJOR** — kamus penilai berubah sehingga angka lama **tidak sebanding**.
  Wajib disertai jembatan (C38).
- **MINOR** — perkakas atau diagnostik baru; angka lama tetap sebanding.
- **PATCH** — perbaikan yang terbukti tidak mengubah satu pun angka tersimpan.

Versi dicatat di `docs/instrumen/VERSION` dan disebut di tiap berkas hasil
pengukuran baru.

## Yang ditolak, dan kenapa

- **Ikut versi model.** Ditolak: alat dan yang diukur berubah karena sebab yang
  berbeda. Menyatukannya berarti tiap perbaikan alat terlihat seperti model baru.
- **Tanpa versi sama sekali** (keadaan sebelum ADR ini). Ditolak: sudah terbukti
  gagal — kami tidak bisa menyatakan angka mana yang diukur dengan kamus sebelum
  H4 dan mana sesudahnya tanpa membaca tanggal berkas satu per satu.
- **Versi per-berkas.** Ditolak: sinyal penilai saling bergantung; `MENOLAK`
  berubah mengubah arti keluaran seluruh pengukur.

## Konsekuensi

- Tiap perubahan kamus **wajib** menaikkan MAJOR dan **wajib** membawa jembatan.
  Itu membuat "ubah kamus diam-diam" jadi mahal secara prosedural — disengaja.
- Angka lintas-MAJOR **tidak boleh** dibandingkan tanpa melewati jembatan.
- Berkas hasil lama tidak punya medan versi. Ia dibaca sebagai
  `instrumen-v0` — **apa adanya, bukan ditebak**.

## Apa yang membuat keputusan ini salah

Kalau ternyata perubahan kamus hampir tidak pernah terjadi (< 1×/tahun), beban
prosedural versi ini lebih besar daripada manfaatnya, dan cukup dicatat di
CHANGELOG. Sinyalnya: dua belas bulan tanpa kenaikan MAJOR.

## Cara membatalkan

Hapus `docs/instrumen/VERSION` dan medan `instrumen` di penulis berkas hasil.
Tidak ada data yang hilang; yang hilang hanya kemampuan menyatakan alat mana
yang dipakai.
