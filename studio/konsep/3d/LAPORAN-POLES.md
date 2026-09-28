# LAPORAN POLES — enam wilayah dan siklus cahaya

Tanggal kerja: 21 September 2026 (Asia/Jakarta).

## Lingkup yang dikerjakan

1. Menambah tempat dunia untuk M13–M18, lengkap di dunia 3D, minimap, gerbang cepat, bilah navigasi, panel, dan Mode Baca.
2. Mengganti dua lampu statis dengan tabel empat keyframe yang diinterpolasi dan dikalibrasi dari piksel hasil render.

## Ukuran sebelum dan sesudah

Angka awal di bawah adalah hasil perintah pada checkout sebelum perubahan sesi ini. Angka itu berbeda dari ringkasan 75 draw call / 61.384 segitiga di permintaan: pemeriksa yang benar-benar berjalan saat sesi dimulai memberi 89 main call / 35.046 segitiga. Perbedaan ini tidak disembunyikan.

| Ukuran | Sebelum (pemeriksa Node) | Sesudah (pemeriksa Node) | Sesudah (browser hidup) |
|---|---:|---:|---:|
| Draw call pass utama | 89 | 66 | 90 (`renderer.info.render.calls`) |
| Panggilan kaster bayangan | 4 | 4 | tidak dicampur ke kolom statis |
| Kaster bayangan | belum dilaporkan alat lama | 4 | — |
| Segitiga | 35.046 | 35.264 | 64.060 (`renderer.info.render.triangles`) |
| Landmark | 13 | 19 (18 modul + portal) | 19 dibangun |
| Collider lingkaran | 47 | 53 | 53 dibangun |
| PointLight | belum dijaga | 0 | 0 |
| FPS | tidak diukur ulang sebelum edit | — | 65 pada tab aktif; tab latar tercekik browser dan tidak dipakai sebagai bukti performa |

Selisih pemeriksa Node terhadap meter browser masih ada (66 vs 90 call; 35.264 vs 64.060 segitiga). Karena keduanya tetap di bawah batas 110 / 90.000, pekerjaan tidak melonggarkan ambang. Selisih dicatat sebagai keraguan, bukan disamakan secara paksa.

## Cahaya yang benar-benar diukur

Alat: `tools/ukur-piksel.mjs`, dijalankan melalui `tools/ukur-piksel.html` pada WebGL 960×540, pixel ratio 1, ACES exposure 0,82. Setiap fase dicari dengan 13 langkah pencarian biner, memakai median 15 titik tanah yang diproyeksikan dari koordinat dunia. Setelah target kena, seluruh 518.400 piksel dipindai untuk penjaga kanal.

Sebagai pembanding, pasangan lampu statis lama (`DirectionalLight 0xffd69a / 2,15` + `HemisphereLight 0xb7d8da, 0x263b2a / 1,45`) diukur oleh alat yang sama pada geometri akhir: median RGB **[84, 111, 92]**, kanal maksimum **207**, kanal ≥250 **0**. Ini pembanding lampu lama pada geometri akhir, bukan klaim tangkapan layar pra-edit yang tidak pernah dibuat.

| Fase | Kanal target | Skala hasil biner | Median RGB tanah | Maksimum seluruh bingkai | Kanal ≥250 |
|---|---:|---:|---:|---:|---:|
| kandungan-hening | G=68±2 | 3,389375 | [47, 68, 54] | 179 | 0 |
| pijar-pertama | R=88±2 | 6,945937 | [88, 82, 47] | 205 | 0 |
| kabut-magrib | R=62±2 | 10,5025 | [62, 55, 58] | 190 | 0 |
| malam-dalam | B=40±2 | 6,75875 | [21, 37, 40] | 157 | 0 |

Audit scene menemukan **0 lampu tak-terkendali**. Hemisphere memakai warna langit berbeda pada tiap keyframe; fase hangat tidak memakai isi biru lama. Angka lengkap yang dibaca runtime berada di `tools/kalibrasi-cahaya.json`.

## Enam wilayah baru

| Modul | Wilayah | Bentuk 3D pembeda | Isi panel |
|---|---|---|---|
| M13 Buku Besar | Pustaka Akar Bintang | tujuh lempeng pengetahuan berwarna di alas batu | kosong jujur: snapshot belum membawa BOOK / brain_learn |
| M14 Galat & Insiden | Tugu Retak Penjaga | tiga pecahan tugu dan cincin penjaga | 20 kelas, 19 dijaga; insiden runtime dinyatakan belum tersedia |
| M15 Sejarah | Lingkar Jejak Zaman | tiga cincin waktu dan satu jarum | kosong jujur: garis waktu tunggal belum dibangkitkan |
| M16 Kabut | Rawa Selubung Sunyi | lima lentera redup di selubung kabut | enam pra-daftar berstatus `belum`; tidak menambah ide rekaan |
| M17 Akademi | Gerbang Akar Ilmu | lima undakan dan gerbang setengah lingkar | kosong jujur: paket pelajaran belum ada di snapshot |
| M18 Penjaga Jejak | Menara Mata Jejak | tiga ruas menara, cincin mata, dan inti | kosong jujur: keluaran detektor belum ada, bukan status hijau |

Prop kecil berulang memakai `InstancedMesh`, geometri satuan, ukuran dalam matriks, material putih + `setColorAt`, serta `frustumCulled=false`. Papan misi, blok arena, dan tugu Log lama juga digabung; 19 proxy klik dibuat tidak ikut pass render tetapi tetap menjadi sasaran raycast. Gerak kristal kumulatif yang bisa hanyut dihentikan.

## Verifikasi

- `node tools/periksa-data.mjs`: LULUS; 18 modul, empat fase, target piksel, dan penjaga kliping ditegakkan.
- `node tools/periksa-geometri.mjs`: LULUS; main call ≤110, segitiga ≤90.000, PointLight ≤3, 19 landmark, 53 collider.
- `node --check` untuk seluruh modul `.mjs`: bersih.
- Browser hidup: navigasi 18, minimap 18, gerbang cepat 18, Mode Baca 18; keenam ID baru hadir di semua jalur. Snapshot akhir membawa 234 temuan, 29 hukum, dan 26 pra-daftar.
- Browser hidup pada tab bersih: 0 galat dan 0 peringatan konsol.
- Mode Baca dibangun dari data sebelum fallback WebGL; bila WebGL gagal, 18 kartu dan panel tetap dapat dibuka tanpa renderer.

## Yang sengaja ditolak

- Tidak mengarang isi OMIGA, insiden runtime, sejarah, materi Akademi, atau temuan Penjaga Jejak yang belum ada di `data-nyata.json`.
- Tidak menyunting `data-nyata.json` dengan tangan. Snapshot dibangkitkan oleh `studio/alat/bangkitkan-data-nyata.mjs`; sandbox melarang `spawnSync git`, sehingga hash commit disuntikkan ke proses generator tanpa mengubah generator atau isi faktanya.
- Tidak menyentuh fisika/algoritme kolisi; hanya enam collider lingkaran yang ditambahkan lewat bentuk lama.
- Tidak menambah dependensi atau akses jaringan.
- Tidak memperbaiki 80 kegagalan `node migan.mjs periksa` di luar wilayah tugas ini. Kegagalan itu sudah ada sebelum edit dan mencakup area riset/model yang tidak diotorisasi untuk episode ini.

## Yang masih diragukan / batas bukti

- Penyebab tepat selisih hitungan statis dan `renderer.info` belum dibuktikan. Angka browser diperlakukan sebagai bukti yang lebih dekat ke layar; keduanya masih di bawah batas.
- Bukti FPS berasal dari Chrome desktop pada tab aktif. Ini bukan bukti ponsel nyata, GPU lain, atau uji rasa manusia.
- Bentuk keenam landmark diverifikasi dari konstruksi, anggaran, dan browser; belum ada penilaian estetika manusia untuk keterbacaan dari semua sudut kamera.
- `node migan.mjs periksa` global tetap merah sejak baseline. Dua pemeriksa lokal episode ini hijau, tetapi itu tidak membuktikan kesehatan seluruh repo MiganCore.
- Omiga Brain tidak dapat dibaca atau ditulisi pada sesi ini karena konektor meminta persetujuan sementara kebijakan sesi melarang persetujuan. Tidak ada klaim bahwa hasil ini sudah dicatat ke Brain.
- Saat sesi berjalan, `HEAD` maju dari `7592d43` ke `37f48d5` lalu `c0dbd63` oleh proses lain dan menyapu sebagian perubahan 3D ke commit. Commit `37f48d5` juga membawa `aset/wilayah-m13-buku-besar.glb` yang tidak dibuat, tidak dimuat, dan tidak dibutuhkan oleh implementasi prosedural sesi ini. Berkas milik proses lain itu tidak dihapus atau diubah.
