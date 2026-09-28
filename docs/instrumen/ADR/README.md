# ADR — Architecture Decision Records

> Catatan keputusan teknis untuk **perkakas audit instrumen** MiganCore.
> Bahasa Indonesia, karena ini dokumentasi kerja internal.
> README dan PAPER teknis memakai bahasa Inggris.

Tiap berkas mencatat **satu** keputusan: konteksnya, pilihan yang ditolak, dan
apa yang membuat keputusan itu bisa dibatalkan. Format ringkas — konteks,
keputusan, alasan, konsekuensi, cara membatalkan.

**Aturan yang mengikat berkas-berkas ini:**

- ADR **tidak pernah disunting** sesudah statusnya `Diterima`. Kalau keputusannya
  berubah, tulis ADR baru yang menggantikannya dan tandai yang lama
  `Digantikan oleh ADR-NNN`. Riwayat keputusan yang bisa disunting bukan riwayat.
- Tiap ADR menyebut **apa yang membuatnya salah** — kondisi yang, kalau terjadi,
  berarti keputusan ini harus ditinjau. Keputusan tanpa syarat-batal adalah
  keyakinan, bukan keputusan.
- Fahmi punya **hak veto belakangan** atas semuanya. ADR mencatat alasan supaya
  veto itu bisa dilakukan dengan informasi, bukan dengan firasat.

| # | judul | status |
|---|---|---|
| [001](001-perkakas-instrumen-berversi-sendiri.md) | Perkakas instrumen berversi sendiri, terpisah dari versi model | Diterima |
| [002](002-kebenaran-dasar-non-sirkular.md) | Kebenaran-dasar penilai diambil dari rancangan petak, bukan dari vonis penilai | Diterima |
| [003](003-angkutan-aliran-untuk-pengukuran.md) | Pengukuran memakai angkutan ALIRAN, dan kesetaraannya wajib diukur | Diterima |
| [004](004-vonis-membawa-keadaan.md) | Vonis membawa keadaan yang bisa dibaca mesin; prosa untuk manusia | Diterima |
| [005](005-gerbang-pada-sidik-mesin.md) | Gerbang membandingkan sidik mesin, bukan alamat jaringan | Diterima |
| [006](006-tiap-uji-wajib-digerbang.md) | Tiap berkas bermode uji wajib digerbang atau dikecualikan dengan alasan | Diterima |
| [007](007-perbaikan-kamus-mekanis-vs-pertimbangan.md) | Perbaikan kamus dipisah: mekanis vs pertimbangan, masing-masing episode sendiri | Diterima |
| [008](008-lisensi-mit-dan-tanpa-api-komersial.md) | Perkakas ini MIT, self-hosted, tanpa dependensi API komersial | Diterima |
