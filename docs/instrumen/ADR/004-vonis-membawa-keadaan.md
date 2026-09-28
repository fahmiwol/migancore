# ADR-004 — Vonis membawa keadaan yang bisa dibaca mesin; prosa untuk manusia

**Status:** Diterima · 2026-09-10
**Konteks episode:** F-226

## Konteks

`node migan.mjs status` adalah SSOT MiganCore: ia membaca vonis langsung dari
`vonis.hasil` di tiap `flywheel/PRA-DAFTAR-*.json`. Dua cacat ditemukan bersamaan.

**Cacat 1 — vonis sunyi.** Vonis yang ditulis di medan bernama lain
(`vonis_9Sep`, `vonis_10Sep`, `VONIS`, `keputusan`) LENYAP tanpa suara. Terjadi
**tiga kali**: V15 (30 Agu, berbunyi "LULUS" sehari penuh padahal dicabut),
V16-JUJUR (31 Agu), lalu **enam sekaligus** pada 10 Sep — plus dua yang ditulis
beberapa jam sesudah hukumnya ditulis ulang.

**Cacat 2 — warna ditebak dari prosa.** Setelah keenamnya muncul, warnanya salah
di lima tempat. Yang terburuk: `L2B-RETRIEVAL` berbunyi **"GUGUR"** tapi tampil
**HIJAU**, karena "GUGUR" tidak ada di daftar kata gagal. Agen mana pun yang
membaca SSOT akan mengira L2b lulus. Itu cacat V15 dalam bentuk warna.

## Keputusan

Tiap vonis membawa **`vonis.keadaan`** dengan empat nilai:

| keadaan | arti |
|---|---|
| `lulus` | hipotesis diterima, hasilnya diadopsi |
| `gagal` | hipotesis ditolak |
| `belum` | belum dijalankan, atau belum bisa divonis |
| `netral` | run SELESAI, vonisnya SAH, tapi tidak ada yang diadopsi |

**Prosa untuk manusia, keadaan untuk program.** Tebakan kata ditahan hanya
sebagai cadangan, dan barisnya ditandai `?` supaya "ditebak" tidak pernah
tersamar jadi "dinyatakan".

Aturannya dijaga `eval/jaga-vonis.mjs`: tiap pra-daftar harus salah satu — punya
`vonis.hasil` (string tak-kosong) DAN `keadaan` yang sah, ATAU tidak punya satu
pun medan yang namanya mengandung "vonis". Apa pun di antaranya dilaporkan.

## Kenapa `netral` ada

Tiga keadaan tidak cukup. "TIDAK MENANG, tanpa kerusakan" adalah vonis sah dari
run yang selesai, tapi hijau membacanya sebagai keberhasilan dan merah
membacanya sebagai kegagalan. Memaksa empat kenyataan masuk tiga warna adalah
kelas C41 — dan ia sudah terjadi dua kali di berkas yang sama.

## Yang ditolak, dan kenapa

- **Menambah kata ke regex penebak.** Ditolak: menunda kejadian berikutnya. Kata
  "GUGUR" tidak ada di daftar; kata berikutnya juga tidak akan ada.
- **Memindahkan blok rincian ke `vonis`.** Ditolak: rinciannya panjang dan
  berharga. Yang benar **merangkum** ke `vonis.hasil` dan menunjuk balik lewat
  `vonis.rincian`.
- **Memaksa satu format vonis sejak awal.** Ditolak sebagai revisi sejarah:
  berkas lama diperbaiki dengan menambah, bukan dengan menulis ulang isinya.

## Konsekuensi

- 22 pra-daftar kini terbaca SSOT: 0 sunyi, 0 rusak, 0 warna ditebak.
- Menulis vonis jadi sedikit lebih repot — disengaja. Yang mahal bukan
  menulisnya, melainkan vonis yang tidak terbaca selama sehari penuh.

## Apa yang membuat keputusan ini salah

Kalau muncul keadaan kelima yang sering (mis. "dicabut sesudah diadopsi"),
empat nilai jadi kurang dan pemaksaan yang sama terulang. Sinyalnya: lebih dari
dua vonis yang keadaannya harus dipilih dengan menawar.

## Cara membatalkan

Hapus pemeriksaan `keadaan` di `migan.mjs`; ia jatuh kembali ke tebakan kata,
dan `jaga-vonis.mjs` akan melaporkan seluruh berkas sebagai `ditebak`.
