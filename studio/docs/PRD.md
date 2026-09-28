# PRD — MiganCore Studio · laboratorium satu pintu

| | |
|---|---|
| **Versi dokumen** | 0.2 · draf · 18 Sep 2026 (0.2: lapisan dunia "Kandungan", modul M13–M17, integrasi proyek saudara) |
| **Pemilik produk** | Fahmi Ghani (guru, pemutus arah) |
| **Arsitek** | Claude · **Pembangun** Codex + Claude |
| **Dokumen saudara** | [ARD](ARD.md) · [ERD](ERD.md) · [Sumber kebenaran](SUMBER-KEBENARAN.md) · [DEVLOG](DEVLOG.md) |
| **Asal nama & rupa** | Rancangan *MiganCore Studio — satu pintu untuk data, gerbang, latihan, dan vonis* (`desain/migancore-studio.html`, 22 Agu 2026). Nama tidak diganti; lingkupnya diperluas. |

## 1. Masalah — yang sudah terukur, bukan dugaan

1. **Data MiganCore tersebar di empat lokasi** — laptop, GitHub, VPS-2, Bmax
   ([doc 99](../../docs/jarvis/99_SENSUS_DATA_MIGANCORE.md)). Tujuh model Ollama pernah menjadi
   salinan tunggal di laptop yang tinggal 19 GB; adapter MO-GRPO dan RLVR tidak ditemukan di mana pun;
   empat commit hasil riset sempat hanya ada di laptop.
2. **Konteks hilang lintas sesi.** Vonis A3 berbunyi "1 dari 5" lima hari setelah putaran ke-3 ada;
   PRA-DAFTAR-V15 berbunyi "LULUS" sehari setelah vonisnya dicabut; `0.13` pernah tertulis mati di
   empat tempat setelah model berlaku menjadi `0.14`. Penjaga lahir satu per satu setelah kejadian.
3. **Lencana yang menipu.** `ollama: hidup` di `migan.mjs status` memeriksa laptop, bukan mesin ukur.
4. **Antarmuka tercerai-berai.** `ajar` (8790), `bengkel` (8730), `papan-pantau.html` statis,
   `eval/REGISTER-CACAT.html`, `playground/publik` ("Adu Model"), `chat_live.html` (API VPS-1 yang
   sudah mati), UI OMIGA (7777), dan rancangan Studio 22 Agu yang belum pernah dibangun utuh.

## 2. Tujuan dan ukurannya

| # | Tujuan | Ukuran lulus |
|---|---|---|
| G1 | **Satu pintu.** Pertanyaan "di mana X / berapa angkanya / apa vonisnya" terjawab dari Studio | ≤ 30 detik, dan **setiap angka menampilkan sumbernya** (berkas + commit/cap waktu) |
| G2 | **Nol duplikasi fakta.** Studio membaca, tidak menyimpan fakta | Tidak ada fakta yang diketik ulang ke basis data Studio; indeks apa pun bisa dibangkitkan ulang dan dihapus |
| G3 | **Manusia dan agen melihat hal yang sama** | Registri sumber kebenaran mesin-terbaca dipakai Studio **dan** agen; `migan periksa` gagal kalau jalurnya putus |
| G4 | **Runtime jujur** | Tiap mesin tampil dengan peran & sidiknya; pengukuran tidak bisa diarahkan ke laptop |
| G5 | **Laboratorium tersambung** | Hipotesis → pra-daftar → putaran ukur → vonis → temuan → hukum → backlog bisa ditelusuri dua arah dengan klik |
| G6 | **Ringan di laptop** | Server tanpa dependensi, tanpa langkah build; memori server < 80 MB; muat awal < 1 detik |

## 3. Bukan tujuan (v0–v2)

Akun dan multi-pengguna · akses dari internet publik · menyunting vonis atau temuan dari UI ·
menjalankan latihan GPU dari UI (paling cepat v3, dengan gerbang pra-daftar) · menampilkan transkrip
sesi mentah (preferensi Fahmi: yang tampil pernyataan tersintesis, bukan dialog) · membaca berkas
rahasia (`.env`, kredensial, `KVM8-BACKUP\tier1`).

## 4. Pengguna

- **Fahmi** — membaca keadaan, memutuskan, memberi data ajar. Tidak teknis; butuh bahasa polos dan
  tautan ke bukti.
- **Agen AI (Claude, Codex, dan lainnya)** — membaca registri sumber kebenaran sebelum bekerja, menulis
  hanya lewat alat CLI yang sudah dijaga.
- **Peneliti luar (nanti)** — versi publik tersintesis, terpisah, lewat repo metode.

## 5. Modul

| Modul | Isi | Kriteria terima utama |
|---|---|---|
| **M1 Beranda** | Vonis berlaku (24 pra-daftar), model berlaku, mesin & kesehatannya, daftar "menunggu Fahmi", aktivitas terbaru | Semua kartu bertautan sumber; data > 7 hari ditandai basi |
| **M2 Silsilah** | Pohon generasi model: base, data, metode, hasil per instrumen, vonis, sanad, lokasi artefak & jumlah salinan | Angka lintas instrumen **tidak pernah** berdampingan tanpa label instrumen; dibangkitkan dari `bangun-silsilah` + SANAD + BERLAKU + sensus |
| **M3 Riset** | Pra-daftar (hipotesis, ambang terkunci, ramalan + skor Brier, vonis), temuan F-xxx, hukum C-xx, register cacat | Pencarian teks; tautan silang F↔C↔pra-daftar; cap "dikunci sebelum data" terlihat |
| **M4 Lab Ukur** | Hasil pengukuran per model × kondisi (petak-jujur2, gerbang alat, regresi): tabel, sebaran putaran, CI95 | Kondisi berbeda (`bedaKondisi`) ditandai merah; putaran tidak sah tidak ikut rata-rata |
| **M5 Retrieval** | Korpus & koleksi (OMIGA, qdrant cadangan VPS-1), audit golden set (recall@k, MRR), kasus gagal (C48, C54), eksperimen L2b/L2c | Setiap kasus gagal menunjuk soal, dokumen yang terambil, dan sumber yang seharusnya |
| **M6 Chat** | Ngobrol dengan model MiganCore lewat mesin yang dipilih (bawaan Bmax), menampilkan sumber retrieval dan penjaga sitasi | Label mesin + model selalu terlihat; tidak pernah diam-diam jatuh ke laptop |
| **M7 Playground Ajar** | Integrasi `ajar` (pencatat, kontras, pengusul, misi kejujuran) + "Adu Model" | Data ajar ditulis lewat jalur yang sama dengan CLI; tidak ada jalur tulis kedua |
| **M8 Backlog** | Epik/episode dari doc 93 dan 96, tertaut ke pra-daftar & vonis | Status episode diturunkan dari vonis, bukan diketik ulang |
| **M9 Data & Aset** | Sensus empat lokasi: model, adapter, dataset, korpus; jumlah salinan; yang hilang | Salinan tunggal ditandai; cap waktu sensus terlihat |
| **M10 Majelis & Guru** | Kursi majelis, lisensi (izin distilasi), jalur akses, riwayat sidang | Model tanpa izin distilasi tidak bisa ditandai "guru distilasi" |
| **M11 Log** | CHANGELOG, living log riset, keputusan (ADR), handoff | Tanpa transkrip mentah |
| **M12 Mesin** | Laptop / Bmax / VPS-2: peran, sidik, Ollama, jembatan GPU, beban | Pemeriksaan baca-saja; lencana memeriksa mesin yang benar |
| **M13 Buku Besar** | Pengetahuan lintas proyek dari OMIGA: `BOOK/` (orang, bisnis, infrastruktur, keputusan) dan entri `brain_learn` (pelajaran, jebakan, keputusan, fakta) yang menyangkut MiganCore | Baca-saja lewat MCP `omiga-brain`; entri yang digantikan (`supersedes`) ditandai, tidak ditampilkan sebagai kebenaran |
| **M14 Galat & Insiden** | Register cacat (kelas + penjaga) **dan** insiden runtime: tunnel ke server mati, lencana yang memeriksa mesin salah, putaran ukur gagal, galat jaringan | Tiap insiden menunjuk bukti (log/berkas) dan hukum/penjaga yang lahir darinya |
| **M15 Sejarah** | Garis waktu tunggal: versi model, pra-daftar dikunci & divonis, temuan, hukum, keputusan, sesi kerja (ringkasan tersintesis), insiden | Bisa disaring per jenis dan rentang tanggal; setiap titik membuka rinciannya |
| **M16 Kabut — yang belum dicoba** | Hipotesis & ide yang belum diuji: pra-daftar berkeadaan `belum`, episode backlog yang belum jalan, usulan "bisa dielaborasi" dari ekstraksi silsilah, adapter yang belum pernah diukur (6 run MO-GRPO, RLVR V17), riset guru/majelis | Tiap ide punya asal (berkas) dan syarat untuk mulai; tidak ada yang tampil "sedang jalan" tanpa bukti proses |
| **M17 Akademi — belajar MiganCore** | Jalur belajar untuk Fahmi dan agen baru: cara kerja MiganCore (panen → saring → laporan → mata manusia → latih → gerbang), glosarium, hukum C-xx dijelaskan dengan kejadiannya, metode riset (repo `migancore-research-method`), tur terpandu | Setiap pelajaran menautkan sumber kanonik; tidak ada materi yang diketik ulang dari sumber |

| **M18 Penjaga Jejak — apa yang belum tercatat** | Detektor kerja yang **menguap**: (a) berkas riset/vonis yang berubah sesudah entri `CHANGELOG.md` terakhir; (b) pra-daftar berkeadaan `belum`/`netral` yang tidak bergerak > 7 hari; (c) bobot/adapter yang ada tetapi **tidak pernah dievaluasi** (6 run MO-GRPO, RLVR V17); (d) nomor F-xxx / C-xx yang **dirujuk tetapi tidak punya entri** (C01–C21, C23–C29); (e) baris di ingatan proyek / OMIGA yang **bertentangan** dengan sumber kanonik; (f) angka yang muncul di > 1 berkas dengan nilai berbeda (kelas F-248) | Setiap butir menunjuk berkas + baris dan **satu tindakan** untuk menutupnya. Daftar ini **dibangkitkan**, tidak diketik. Kosong hanya kalau benar-benar kosong — tidak ada keadaan "hijau" tanpa pemeriksaan |

> **Kenapa M18 ada.** Fahmi, 18 Sep 2026 (disarikan): sesi itu menghasilkan banyak temuan dan
> eksperimen, dan tidak satu pun boleh hilang; dasbor harus melacak semua perubahan, temuan,
> dan eksperimen. Modul lain **menampilkan** yang sudah tercatat; M18 menampilkan yang **belum** —
> dan itulah yang selama ini hilang. Buktinya sudah ada di tiga tempat sekaligus: enam run MO-GRPO
> punya bobot tanpa evaluasi, OMIGA sempat menyatakan adapter "belum ditemukan" padahal sudah
> ketemu, dan satu angka ringkasan hidup salah di lima berkas (F-248).

## 5a. Lapisan rupa — "Kandungan: dunia kelahiran Migan"

Permintaan Fahmi (18 Sep): terasa seperti **Game UI dan dunia virtual** — terrain, abstrak, interaktif,
nuansa fantasi, "tempat kelahiran ruh Migan yang masih dalam embrio" — **tetapi isi serius dan antarmuka
harus terbaca.** Konsep visualnya digambar Codex lebih dulu (`studio/konsep/`), lalu diputuskan Fahmi.

| Wilayah dunia | Modul | Aturan kejujuran |
|---|---|---|
| Kandungan di tengah — embrio ruh Migan | Status kelahiran MAKSARA | Selama syarat bibit **belum terdefinisi** (A4), embrio tampil **tertidur/terkunci** dengan penjelasan — tidak pernah bar kemajuan palsu |
| Pohon silsilah & lapisan strata | M2 Silsilah, M15 Sejarah | Angka berlabel instrumen |
| Laboratorium & observatorium | M3 Riset, M4 Lab Ukur | Status dari vonis pra-daftar |
| Perpustakaan arsip | Temuan, hukum, M13 Buku Besar | — |
| Tugu galat | M14 Galat & Insiden | — |
| Papan misi | M8 Backlog | Status tidak boleh dinaikkan melebihi bukti |
| Kabut wilayah belum dijelajah | M16 Kabut | Kabut hanya tersingkap oleh vonis nyata |
| Lapangan latihan | M7 Playground Ajar | Tulis hanya lewat modul `ajar` |
| Balai bicara | M6 Chat (dipandu avatar MiganPro) | Label mesin + model selalu terlihat |
| Lingkar majelis | M10 Majelis & Guru | Guru distilasi hanya bila lisensi mengizinkan |
| Akar & sungai | M5 Retrieval | — |
| Tempa | M12 Mesin | Pemeriksaan baca-saja |
| Gudang | M9 Data & Aset | Salinan tunggal ditandai |
| Gerbang akademi | M17 Akademi | — |

**Keterbacaan:** teks selalu di panel dengan kontras ≥ AA; dunia menjadi latar, tidak pernah di belakang
teks isi; huruf isi ≥ 14 px; tombol **Mode Baca** di setiap layar menampilkan data yang sama dalam tata
letak 2D bersih; `prefers-reduced-motion` dihormati.

**Palet:** nuansa chatboard awal (`chat_live.html`) dan dashboard awal (`tmp_dashboard.html`,
`papan-pantau.html`), plus UI MiganCore lama hijau-oranye — sumber pastinya dicatat di `KONSEP.md`
konsep Codex dengan kutipan berkas.

## 5b. Integrasi proyek saudara (semua milik Fahmi)

| Proyek | Yang dipakai di Studio |
|---|---|
| **MiganPro** (`fahmiwol/miganpro`) | Avatar bicara sebagai **pemandu** di Balai bicara dan Akademi |
| **EMIGA** (`fahmiwol/emiga`) | Pola antarmuka asisten untuk M6 Chat |
| **Rupa3D** (proyek terpisah) | Pola terrain/adegan terukur (`pemandang`, `fisika`) untuk lapisan dunia; aset dibangun dengan ukuran, bukan tebakan |
| **Mighantect 3D** (`fahmiwol/mighantect-3d`) | Pola dunia agen & HUD; panel admin sebagai rujukan tata letak padat |
| **Mighan-3D-Studio** | Pola studio/avatar/builder |
| **Frontend lama** (`ops.mighan.com`, `mighan.com` dari cadangan KVM8) | Rujukan gaya historis |
| **`ajar`, `bengkel`, OMIGA UI** | Modul yang dipasang ke Studio, bukan ditulis ulang |

## 6. Rencana rilis

| Rilis | Isi | Syarat selesai |
|---|---|---|
| **v0 — lensa baca** | M1, M2, M3, M8, M9, M11, M12, M14, M15, M16 + registri sumber kebenaran + penjaga di `migan periksa` · Mode Baca dulu, lapisan dunia menyusul | Semua adapter lulus uji pada berkas nyata; diverifikasi di peramban; G1, G2, G6 terukur |
| **v1 — lab & dunia** | M4, M5, M10, M13, M17 + lapisan dunia "Kandungan" (setelah konsep disetujui Fahmi) | Angka Studio = angka CLI untuk run yang sama (uji kesetaraan); dunia lancar di laptop dengan RAM bebas ±2 GB |
| **v2 — interaktif** | M6, M7 | Tidak ada jalur tulis baru; semua tulis lewat modul `ajar` yang ada |
| **v3 — kemudi** | Menjalankan ukur/latih dari UI | Hanya bila pra-daftar terkunci; butuh keputusan Fahmi |

## 7. Risiko

- **Laptop sempit** (RAM bebas 1,9 GB, disk 19 GB saat diukur) → tanpa build, tanpa dependensi, server kecil.
- **Data sensitif** (dump Postgres, `.env`, kunci) → Studio hanya membaca metadata; daftar tolak jalur di server.
- **Keusangan** → setiap tampilan membawa cap waktu sumber; penjaga menandai registri yang basi.
- **Studio jadi sumber kebenaran kedua tanpa sengaja** → ARD AD-01; penjaga menolak berkas fakta di `studio/`.
