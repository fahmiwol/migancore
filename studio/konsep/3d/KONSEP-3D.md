# MiganCore Studio — Kandungan 3D

## Status prototipe

Prototipe ini menerjemahkan modul riset MiganCore menjadi dunia terbuka kecil yang dapat dijelajahi. Fahmi hadir sebagai peziarah berjubah, dapat berjalan menuju landmark, berpindah cepat, membuka modul lewat dashboard, atau meninggalkan dunia 3D melalui Mode Baca. Semua angka panel berasal dari `data-nyata.json` salinan `sumber/data-nyata.json`, commit data `8e6c42a`. Prototipe berjalan sepenuhnya lokal dan tidak memanggil jaringan.

Status MAKSARA sengaja tidak memakai persentase atau progress bar: syarat bibit A4 belum terdefinisi, sehingga embrio tampil tertidur/redup. Balai Bicara juga sengaja tidak mengarang hasil model: label **CONTOH ANTARMUKA — BELUM TERSAMBUNG** selalu tampak, tombol kirim hanya menampilkan peringatan lokal, dan meter token/latensi bernilai `—`.

## DNA desain dan arahan seni

DNA visual diselaraskan dengan `keluaran/KONSEP.md` yang ditemukan saat pengerjaan, tanpa menyunting berkas tersebut.

| Lapisan | Keputusan |
|---|---|
| Metafora | Embrio = kelahiran MAKSARA; gerbang/cincin = promosi dan evaluasi; kristal = model dan pengukuran; sungai = aliran retrieval; pedang = hukum/temuan; peziarah = manusia dan agen. |
| Bentuk | Siluet besar, sederhana, terbaca dari jauh: lengkung patah, cincin, obelisk, pedang, paviliun, dan bola berakar. Rune hanya dekorasi/ID; isi panel tetap huruf biasa. |
| Material | Batu abu kehijauan, lumut, kayu kering, kristal emissive; `MeshLambertMaterial`/`MeshPhongMaterial` untuk biaya rendah. |
| Palet dasar | Rahim `#050d0a`, panel `#161b22`, hijau `#2fe39a`, hijau terang `#7ef0bd`, oranye `#ff8a24`, emas `#ffc15c`, sian `#4fc3cf`, teks `#edf7f2`, redup `#a8bbb2`. |
| Mode Baca | Latar `#f4f7f4`, kartu putih, teks `#17221d`; sengaja terang dan tenang agar isi serius tidak bertarung dengan dunia. |
| Suasana | Fantasi terlukis, bukan fotoreal: kabut berlapis, bayangan lembut, kristal sian, senja emas. Enam referensi diterjemahkan sebagai motif, bukan disalin sebagai aset berat. |
| Gerak | Nafas embrio, apung kristal, air berdenyut, dan transisi portal singkat. `prefers-reduced-motion` menghentikan gerak besar dan memangkas transisi. |

## Tata letak dunia

Satuan koordinat adalah meter dunia Three.js pada bidang X–Z. Posisi dibuat cukup rapat untuk jelajah singkat, tetapi tiap siluet tetap punya ruang baca.

| Wilayah | Modul | X | Z | Landmark |
|---|---:|---:|---:|---|
| Hutan Kandungan | Beranda | 0 | 0 | Bola kristal berakar, embrio ruh Migan |
| Padang Obelisk Emas | Silsilah | 31 | 27 | Dua belas obelisk kristal/model |
| Lembah Gerbang Patah | Riset | -34 | -25 | Lengkung melayang dan piramida kristal |
| Padang Pedang Rune | Lab | 34 | -23 | Pedang instanced ber-ID |
| Sungai Toska | Retrieval | 4 | 31 | Aliran toska berkelok |
| Balai Bicara | Chat | 7 | 9 | Paviliun di depan embrio |
| Lapangan Latihan | Ajar | 21 | 16 | Arena cincin batu |
| Papan Misi Peziarah | Backlog | 17 | 3 | Tugu misi 22 episode |
| Kepulauan Cincin | Data | -55 | 3 | Pulau dan cincin aset |
| Lingkar Majelis | Majelis | -18 | -3 | Monolit melingkar |
| Kabut Tepi Dunia | Log | 58 | 3 | Kabut riset yang belum dicoba |
| Tempa | Mesin | -12 | 21 | Api dan tiga batu mesin |
| Puncak Cincin | Portal | -31 | 32 | Gerbang pindah cepat |

Kabut bukan skor ketidakpastian rekaan. Ia hanya menandai pra-daftar berstatus `belum` dan episode yang belum berjalan; pengungkapan permanen baru layak dibuat setelah ada vonis nyata di data.

## Kontrol dan dua jalur UX

### Menjelajah

- `WASD` atau panah: bergerak; `Shift`: lari.
- Seret mouse pada dunia: putar kamera; roda mouse: dekat/jauh.
- `E`: buka landmark terdekat ketika petunjuk interaksi muncul.
- Klik ikon minimap: pindah cepat dengan transisi portal cincin.

Simulasi gerak memakai fixed timestep `1/60` detik, maksimum lima langkah per frame, dengan interpolasi render. Kolisi adalah pengontrol kinematik sederhana: lingkar pemain meluncur pada lingkar penghalang dan batas radial dunia. Rapier tidak ditemukan pada dua lokasi lokal yang diizinkan, sehingga prototipe ini belum memiliki capsule cast, kemiringan, tangga, maupun depenetrasi mesin fisika.

### Langsung membaca

- `Tab` atau tombol cincin: buka Menu Cepat. Panah mengubah pilihan, `Enter` membuka, `Esc` menutup.
- Bilah atas selalu menyediakan Beranda, Silsilah, Riset, Lab, Retrieval, Chat, Ajar, Backlog, Data, Majelis, Log, dan Mesin.
- Mode Baca membekukan/menyembunyikan dunia lalu menampilkan semua modul sebagai kartu 2D. Data yang dipakai sama dengan panel dunia.
- Panel besar dapat ditutup dengan `Esc`. Fokus keyboard dijaga di dalam menu/panel ketika relevan.

## Balai Bicara: pola aplikasi AI desktop

Tabel ini adalah pemetaan desain, bukan klaim paritas produk. Nama pola mengikuti arahan pemilik dan pengetahuan desain umum; detail versi terbaru aplikasi tidak diverifikasi lewat web dalam pekerjaan ini dan dapat berubah.

| Asal pola | Pola yang dipinjam | Terjemahan di Balai Bicara | Kepastian |
|---|---|---|---|
| ChatGPT / Claude desktop | Riwayat percakapan dan proyek di kiri | Kolom proyek, status prototipe, dan contoh percakapan terpisah dari ruang kerja utama | Tinggi untuk pola umum; detail versi tidak diperiksa |
| Google AI Studio | Model, parameter jalan, compare | Pemilih model + label **MESIN**, suhu, top-p, panjang konteks, instruksi sistem, dan Adu Model berdampingan | Tinggi untuk pola umum; nomenklatur dapat berubah |
| Claude Projects / Gemini | Dokumen proyek dan konteks retrieval | Panel kanan berisi lempeng rune A3/H-RAGU, skor, kutipan, serta tombol buka sumber lokal | Sedang; penyatuan tiga produk adalah interpretasi desain |
| opencode | Jejak alat yang dapat dilipat | Elemen `details` menunjukkan nol pemanggilan nyata sampai backend tersambung | Tinggi untuk pola umum; tampilan persis tidak disalin |
| Antarmuka model umum | Meter token dan latensi | Selalu tampak, bernilai `—` ketika belum ada eksekusi | Tinggi |
| MiganPro/Balairung | Pemandu/avatar dan panggung ruang | Peziarah di dunia serta paviliun yang menghadap embrio | Adaptasi lokal, bukan salinan aset/avatar MiganPro |

Embrio dapat dipratinjau berpendar melalui kontrol **visual saja**. Ini bukan sinyal bahwa model benar-benar berpikir. Tombol sumber membuka panel data lokal; tidak ada tautan eksternal atau retrieval tersembunyi.

## Data dan kejujuran tampilan

- Ringkasan sumber: 24 pra-daftar (`lulus 7`, `netral 8`, `gagal 4`, `belum 5`), 29 hukum, 230 temuan, 12 model silsilah, 22 episode backlog, empat lokasi sensus, dan tiga mesin.
- `hukum.terbaru` dan `temuan.terbaru` masing-masing hanya memuat 12 judul/ID di snapshot. Panel menyebut jumlah total 29/230 tetapi hanya merender judul yang memang tersedia; tidak membuat 17 hukum atau 218 temuan fiktif.
- Retrieval dan Majelis menampilkan keadaan kosong yang jujur sesuai sumber.
- Setiap panel/kartu menyertakan tooltip `data-nyata.json · commit 8e6c42a · <bagian>`.
- `data-nyata.json` di keluaran diverifikasi identik secara SHA-256 dengan sumber pada pemeriksaan akhir.

## Anggaran dan pengukuran performa

| Indikator | Batas | Hasil |
|---|---:|---:|
| Draw call termasuk shadow pass | ≤ 150 | Estimator seluruh adegan: 93 (89 utama + 4 shadow). Meter `renderer.info` terburuk yang terlihat saat QA: 114. |
| Segitiga | ≤ 300.000 | Estimator seluruh adegan: 35.046. Meter browser terburuk yang terlihat: 62.020. |
| Rumput/batu/pedang | Instancing | 900 rumput, 130 batu, 48 pedang memakai `InstancedMesh`. |
| Fixed timestep | 60 Hz | `1/60`, maksimum 5 catch-up steps per frame. |
| Pixel ratio | Adaptif | Maksimum 1,5; perangkat ≤4 GB/≤4 thread memakai 1. Kualitas turun setelah empat detik fokus dengan 12–45 FPS. |
| Sasaran | 60 FPS laptop iGPU, RAM bebas ±2 GB | **Belum terbukti.** Tab otomasi dapat diturunkan ke 1 FPS saat tidak fokus, sehingga tidak dipakai sebagai bukti performa aktif. |

Cara ukur ulang:

1. Jalankan server lokal, buka dunia pada laptop sasaran, dan biarkan tab aktif minimal 30 detik.
2. Catat meter kiri bawah pada Hutan Kandungan dan Padang Pedang; jelajahi sambil memutar kamera.
3. Buka DevTools hanya bila perlu, baca `renderer.info` melalui meter UI; jangan menjumlah hasil antarframe.
4. Bandingkan mode kualitas standar dan otomatis-turun. Jika draw call melewati 150, gabungkan landmark statis; jika FPS aktif di bawah 55, turunkan DPR/rumput sebelum mengurangi keterbacaan panel.

Pencahayaan memiliki sampler framebuffer 3×3 (`medianRgb`, kanal terklip) yang disimpan sebagai `window.__KANDUNGAN_METRICS` ketika tab aktif. Pada QA otomasi tab berada di latar sehingga nilai itu tidak dipakai sebagai klaim kalibrasi final; pemeriksaan visual tetap dilakukan pada tangkapan layar desktop dan seluler.

## Skill yang dipakai

| Skill | Pemakaian nyata |
|---|---|
| `dunia-game-3d-terukur` | Fixed timestep, pengontrol kinematik, collider gameplay, spawn aman, anggaran draw call, meter render, batas bukti FPS. |
| `procedural-3d-verified` | Geometri landmark deterministik, seed konsisten, validasi bounding/segitiga/collider lewat skrip headless. |
| `threejs-fundamentals` | Scene, kamera perspektif, hierarchy, loop render, resize. |
| `threejs-geometry` | Primitive rendah-poligon, `TubeGeometry`, `InstancedMesh`. |
| `threejs-materials` | Lambert/Phong, warna vertex instancing, emissive kristal. |
| `threejs-lighting` | Hemisphere + directional light, shadow map terbatas dan adaptif. |
| `threejs-interaction` | Raycast landmark, input keyboard/pointer, minimap dan portal. |
| `threejs-animation` | Gerak prosedural embrio, kristal, sungai, dan avatar; tanpa klip tulang berat. |
| `threejs-shaders` | Prinsip efek murah diterapkan; shader khusus sengaja tidak ditambah karena material bawaan cukup. |
| `threejs-postprocessing` | Evaluasi biaya; composer/bloom ditolak agar anggaran stabil. Glow dibentuk dengan geometri/material emissive. |
| `threejs-textures` | Evaluasi pemakaian; dunia memakai warna/material prosedural agar tanpa aset tekstur dan tanpa jaringan. |
| `threejs-loaders` | Pola pemuatan asinkron diterapkan pada JSON; tidak ada GLTF eksternal untuk prototipe ini. |
| `motion-design`, `gsap-core`, `gsap-timeline` | Choreography dan reduced motion dipakai; gerak diimplementasikan CSS/loop Three tanpa GSAP runtime agar vendor kecil. |
| `design-dna` | Ekstraksi token, metafora, siluet, material, gerak, dan aturan kesinambungan enam referensi. |
| `grounding-a-chat-ui` | Status offline eksplisit, konteks bersumber, skor/kutipan/sumber, jejak alat nol, serta larangan jawaban palsu. |
| `balairung-build` | Struktur dashboard, sumber data lokal, dan panel modular dengan batas presentasi vs data. |
| `miganpro-deploy-webgl` | Pelajaran avatar WebGL, cache/aset lokal, dan pemisahan bukti browser dari deploy; tidak melakukan deploy. |
| `uji-layar-hidup-tanpa-tulis` | QA read-only di browser nyata: desktop, 390×800, navigasi, form offline, portal, Mode Baca. |
| `disciplined-execution` | Episode kecil, pemeriksaan sintaks/data/geometri/browser, dan dokumentasi batas bukti. |
| `imagegen` | Empat konsep visual dibuat lalu disimpan lokal; prompt final terdokumentasi di `PROMPT-GAMBAR.md`. |

## Verifikasi akhir

Pemeriksaan dijalankan dari root proyek pada 18 September 2026:

- `node --check` pada setiap `.mjs`: **lulus**.
- `node keluaran-3d/tools/periksa-data.mjs`: **lulus**; commit `8e6c42a`, 24 pra-daftar, 29 hukum, 230 temuan, 22 episode.
- `node keluaran-3d/tools/periksa-geometri.mjs`: **lulus**; 93 draw call estimasi termasuk shadow, 35.046 segitiga, 13 landmark, 47 collider.
- Pencarian `https?://` pada kode buatan proyek (HTML, CSS, JS, dan tools): **0 temuan**. Vendor Three.js upstream memuat satu URI namespace DOM `http://www.w3.org/1999/xhtml`; itu bukan endpoint jaringan dan tidak diambil saat runtime.
- SHA-256 sumber dan salinan data: **identik**.
- Browser desktop: dunia, avatar, HUD, landmark, panel Chat, quick menu keyboard, Silsilah 12 baris, portal minimap, dan Mode Baca diperiksa.
- Browser 390×800: dunia dan Balai Bicara diperiksa; `body` dan panel sama-sama 390 px, tanpa overflow horizontal; log browser 0 error dan 0 peringatan.
- Form Chat: submit tidak memanggil model dan menampilkan status **TIDAK DIKIRIM**.

## Keterbatasan dan langkah berikutnya

1. Uji 60 FPS perlu dijalankan pada laptop sasaran dengan tab aktif; hasil otomasi bukan bukti perangkat nyata.
2. Kolisi sederhana belum menangani lereng/tangga/capsule cast. Integrasikan Rapier bila paket lokal yang diizinkan tersedia pada iterasi berikutnya.
3. Balai Bicara belum memiliki endpoint model, retrieval, token counter, latensi, izin alat, atau pembuka berkas nyata. Sambungan pertama harus memakai kontrak sumber dan kutipan yang dapat diaudit.
4. Landmark dibuat prosedural untuk bukti interaksi; empat konsep gambar saat ini hanya arahan seni, belum dijadikan tekstur/skybox.
5. Aksesibilitas dasar sudah mencakup keyboard, fokus, kontras panel, ukuran teks isi ≥14 px, dan reduced motion; audit pembaca layar formal masih perlu dilakukan.
6. Setelah data hukum/temuan lengkap tersedia, panel dapat menambah pencarian dan virtualisasi tanpa mengarang entri yang hilang.
