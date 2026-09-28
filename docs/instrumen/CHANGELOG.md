# CHANGELOG — instrumen

Versi semantik terpisah dari versi model ([ADR-001](ADR/001-perkakas-instrumen-berversi-sendiri.md)).

- **MAJOR** — kamus penilai berubah sehingga angka lama TIDAK sebanding. Wajib jembatan (C38).
- **MINOR** — perkakas/diagnostik baru; angka lama tetap sebanding.
- **PATCH** — perbaikan yang terbukti tidak mengubah satu pun angka tersimpan.

---

## instrumen-v1.0.0 — 2026-09-11

Rilis pertama. Menandai titik di mana perkakas audit instrumen punya nama,
versi, lisensi, dan dokumennya sendiri. **Tidak ada kamus penilai yang berubah
di rilis ini** — seluruhnya diagnostik, penjaga, dan dokumentasi.

### Ditambahkan — diagnostik

- `eval/audit-sinyal.mjs` — laju positif-palsu tiap sinyal penilai, dengan
  kebenaran-dasar dari RANCANGAN petak, bukan dari vonis penilai (yang sirkular).
  Menemukan jurang **143×** antara sinyal terbersih dan terkotor.
- `eval/kebutaan-panjang.mjs` — apakah laju picu sebuah sinyal bergantung pada
  panjang jawaban. `TANYA` naik 11 % → 95 %.
- `eval/bukti-tanya.mjs`, `eval/bukti-menolak.mjs` — pengumpul bukti untuk satu
  sinyal, sebelum satu huruf kamus diubah. `bukti-menolak` **berhenti sendiri**
  kalau jumlah cabang polanya tidak berkurang sesuai harapan.

### Ditambahkan — lintas jalur

- `eval/paritas-klien.mjs` — empat klien, tiga bahasa, melawan peladen tiruan.
  **Jalan tanpa Ollama, GPU, atau jaringan.** Ramalan P1–P4 dikunci di sumbernya
  sebelum sekali pun dijalankan; keempatnya benar.
- `eval/uji-batas-fetch.mjs` — reproduksi langit-langit 300 dtk (`--penuh`),
  kesetaraan angkutan dengan prasyarat determinisme (`--setara`), dan sensus
  siapa lagi yang terpapar (`--sensus`).

### Ditambahkan — penjaga

- `eval/jaga-vonis.mjs` — tiap pra-daftar wajib punya vonis yang terbaca SSOT,
  atau tidak punya medan bervonis sama sekali. Menutup kelas cacat yang sudah
  terjadi **tiga kali**.
- `eval/jaga-uji-yatim.mjs` — tiap berkas bermode uji wajib digerbang, atau
  dikecualikan **dengan alasan tertulis yang ikut dicetak**.

### Diubah — jalur pengukuran

- `eval/ukur-jujur2.mjs`: angkutan `ALIRAN` (`stream:true`), dicatat di tiap
  berkas hasil, kesetaraannya diukur (3/3 identik byte demi byte).
- Pelari **BERHENTI** di putaran 100 % galat alih-alih membakar sisa putaran ke
  server yang sudah mati.
- Gerbang membandingkan **sidik mesin**, bukan alamat jaringan.
- `migan status`: vonis membawa `keadaan` yang bisa dibaca mesin; tebakan kata
  tinggal cadangan dan ditandai `?`.

### Temuan yang menyertainya

`F-220` … `F-232` di `docs/jarvis/FINDINGS_LOG.md`. Ringkasnya:
langit-langit 300 dtk milik klien · paritas empat klien · jangkar base terukur ·
`TANYA` merosot jadi pendeteksi tanda tanya · ambang yang tak bisa dimenangkan ·
"mesin mati" ternyata alamat basi · enam vonis sunyi + lima warna menipu ·
uji yatim · pelari membakar putaran ke server mati · klaim pembanding yang tidak
ada · `H-A6-1` gugur · **`MENOLAK` menyala pada `"masalah"`** · audit empat
sinyal + prinsip TINDAKAN-vs-TOPIK.

### Yang SENGAJA tidak dilakukan

- **Kamus tidak disentuh.** Tiga perbaikan sudah dipra-daftarkan
  (`PRA-DAFTAR-A6-TANYA`, `PRA-DAFTAR-A6B-MENOLAK`) dan menunggu pengukuran yang
  sedang berjalan selesai — mengubah penilai di tengah eksperimen mencampur
  kondisi (C29).
- **Perbaikan `TANYA` tidak dipasang**: mencapai rasio 2,98 terhadap ambang
  terkunci ≤2,64. Tidak disetel lebih lanjut sampai lolos.
- **Sumbu lintas-OS tidak diuji** — klaim "WSL2 tersedia" ternyata salah
  (runtime ada, distro tidak). Dicatat sebagai F-229, bukan disembunyikan.
