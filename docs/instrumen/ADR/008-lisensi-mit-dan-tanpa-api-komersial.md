# ADR-008 — Perkakas ini MIT, self-hosted, tanpa dependensi API komersial

**Status:** Diterima · 2026-09-11
**Arahan:** Fahmi, 11 Sep 2026

## Konteks

Perkakas audit instrumen ini lahir dari kebutuhan internal, tapi masalah yang
dipecahkannya tidak khas MiganCore: **siapa pun yang mengukur LLM dengan penilai
berbasis kata kunci dan klien HTTP akan kena cacat yang sama.** Tiga minggu
hilang di sini karena batas waktu bawaan sebuah pustaka HTTP; itu bisa terjadi di
mana saja.

## Keputusan

1. **Lisensi MIT**, dilingkupi ke perkakas instrumen dan dokumennya
   (`docs/instrumen/` + berkas `eval/` yang disebut di dalamnya). **Bukan**
   seluruh repositori — repo ini memuat korpus, model, dan bahan bisnis yang
   lisensinya bukan urusan ADR ini.
2. **Tanpa dependensi API komersial.** Seluruh perkakas berjalan dengan pustaka
   bawaan Node dan Python, melawan Ollama yang self-hosted. Nol kunci API, nol
   layanan berbayar, nol panggilan keluar.
3. **Self-hosted sebagai bawaan.** Mesin ukur adalah milik sendiri; tidak ada
   jalur yang mengharuskan data pengukuran keluar dari jaringan sendiri.

## Kenapa dilingkupi, bukan seluruh repo

Melisensikan repo yang memuat korpus privat dan dokumen bisnis dengan MIT akan
menyatakan sesuatu yang tidak diniatkan. Pelingkupan membuat maksudnya tepat:
**yang boleh dipakai siapa pun adalah metodenya dan alatnya**, bukan datanya.

## Yang ditolak, dan kenapa

- **Apache-2.0.** Klausa patennya berharga, tapi lebih panjang dan proyek ini
  tidak punya paten untuk dilindungi. MIT lebih pendek dan lebih mudah dipatuhi.
- **Tanpa lisensi sama sekali.** Ditolak: tanpa lisensi, bawaannya "hak cipta
  penuh" dan tidak ada yang boleh memakainya — kebalikan dari maksudnya.
- **Menerbitkan sebagai repo terpisah sekarang.** Ditolak untuk saat ini: alatnya
  masih terikat pada bentuk berkas hasil MiganCore. Memisahkannya butuh lapisan
  adaptor, dan itu pekerjaan sendiri. Dicatat sebagai kemungkinan, bukan rencana.

## Konsekuensi

- Berkas `docs/instrumen/LICENSE` berlaku untuk isi folder itu dan perkakas yang
  disebutkan di README-nya.
- Setiap dependensi baru pada perkakas ini **wajib** memenuhi syarat: bawaan
  bahasa, atau self-hosted, atau tidak dipakai.

## Apa yang membuat keputusan ini salah

Kalau perkakas ini nanti butuh model juri untuk hal yang regex tidak bisa
lakukan, dan satu-satunya juri yang cukup baik adalah layanan komersial, maka
syarat "tanpa API komersial" akan menghalangi pekerjaan yang benar. Jalan
keluarnya sudah ada bentuknya: juri self-hosted, dan pengakuan jujur kalau
kualitasnya lebih rendah.

## Cara membatalkan

Hapus `docs/instrumen/LICENSE` dan catatan lingkupnya di README. Hak ciptanya
kembali penuh secara bawaan.
