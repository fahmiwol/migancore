# Audit menyeluruh

Data: `migancore-curated.jsonl` · 1351 baris

**22 lulus · 0 gagal · 2 belum bisa diperiksa**

| Kode | Kelompok | Pemeriksaan | Vonis | Hasil |
|---|---|---|---|---|
| A1 | ISI | rahasia / kredensial | LULUS | 0 baris |
| A2 | ISI | data pribadi (telepon / email / NIK) | PERLU KEPUTUSAN | 5 baris memuat kontak (nomor/email) — milik usaha Fahmi sendiri |
| A3 | ISI | soal eval bocor ke data latih | LULUS | bersih |
| A4 | ISI | kunci jawaban gerbang bocor | LULUS | soal veto disusun bersih |
| A5 | ISI | kontradiksi angka antar-baris | LULUS | 0 pertentangan nyata · 4 pengecoh disengaja (nilai minoritas muncul sekali) |
| A6 | ISI | kebenaran fakta di dalam jawaban | BELUM BISA | butuh rujukan luar per-klaim; belum ada cara otomatis. Yang ADA: A5 memeriksa konsistensi  |
| A7 | ISI | tanggal / harga kedaluwarsa | LULUS | tahun disebut: 2011, 2012, 2015, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 202 |
| B1 | BENTUK | gerbang data 9 pemeriksaan | LULUS | 9/9 hijau |
| B2 | BENTUK | nyaris-kembar / terpotong / timpang / pangsa-prompt | LULUS | semua lulus |
| B3 | BENTUK | ragam narasi per operasi | LULUS | beragam cukup |
| B4 | BENTUK | susunan peran percakapan sah | LULUS | 0 baris susunannya menyimpang |
| B5 | BENTUK | jawaban terlalu pendek | LULUS | 0 baris < 40 huruf (0.0%) |
| B6 | BENTUK | keseimbangan kemampuan | LULUS | dokumen 29% · hitung 21% · menolak 13% · kias 6% · kognitif 3% · agent 2% |
| C1 | LATIH | penopengan prompt (loss hanya di jawaban) | LULUS | prompt ditopengi |
| C2 | LATIH | simpan bobot SEBELUM uji cium | LULUS | simpan dulu, uji belakangan |
| C3 | LATIH | seed tercatat | LULUS | seed=42 |
| C4 | LATIH | epoch & laju belajar masuk akal untuk ukuran data | LULUS | epoch=2 · lr=0.0002 · 1351 baris |
| C5 | LATIH | token akhir (EOS/pad) ditangani | LULUS | disebut di train.py |
| D1 | UKUR | perkakas eval sehat (sintaks + uji instrumen) | LULUS | siap terbang |
| D2 | UKUR | register cacat: semua penjaga hijau | PERLU KEPUTUSAN | KUNING — semua penjaga hijau, tapi ada kelas cacat yang belum berpenjaga (C09) |
| D3 | UKUR | agregat tidak menyamarkan arah berlawanan | LULUS | penjaga sehat |
| D4 | UKUR | petak tahan (holdout) dari data kita sendiri | LULUS | ada |
| D5 | UKUR | baris kenari (canary) pengukur hafalan | LULUS | ada |
| D6 | UKUR | baseline diukur ulang sesudah instrumen berubah | BELUM BISA | butuh mencatat versi instrumen di tiap berkas hasil lalu membandingkannya. Sekarang masih  |
| E1 | PROSES | pra-daftar (kesimpulan dikunci sebelum diukur) | LULUS | ada |
| E2 | PROSES | repo tidak menyimpan ranjau biner | LULUS | bersih |
