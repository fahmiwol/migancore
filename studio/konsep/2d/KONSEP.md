# MiganCore Studio — Kandungan

## Status artefak

Ini adalah konsep visual interaktif statis, bukan aplikasi produksi. Semua layar memakai HTML, CSS, Canvas 2D ringan, dan JavaScript biasa. Tidak ada CDN, build, autentikasi, penyimpanan, panggilan model, atau koneksi mesin. Data dibaca dari `./data-nyata.json`, salinan identik dari `sumber/data-nyata.json` (SHA-256 keduanya: `B02589917168E3995464C89685F3D8A0CDC8CEA0BC882E91245D3252189DA056`).

## Visi

**Kandungan** adalah atlas instrumen berbentuk dunia: menyenangkan untuk dijelajah seperti Game UI, tetapi setiap panel bekerja seperti catatan laboratorium. Dunia menolong orientasi; panel padat menjaga pembacaan. Pusatnya bukan “model yang hampir selesai”, melainkan embrio MAKSARA yang **tertidur/terkunci** karena syarat bibit belum terdefinisi.

Tiga lapisan DNA desain:

1. **Sistem desain:** hijau–oranye MiganCore lama, panel gelap Studio/Ajar, grid HUD, tipografi sans + mono, radius 8–22 px.
2. **Gaya:** rahim digital, observatorium fantasi, instrumen ilmiah; hangat tetapi tidak mistik dalam menyampaikan data.
3. **Efek visual:** terrain topografis Canvas 2D, selaput embrio CSS, cahaya titik, dan avatar abstrak. Semua berhenti pada `prefers-reduced-motion`; Mode Baca menghapus konteks dunia.

## Peta metafora → modul → data

| Wilayah dunia | Modul / fungsi | Data yang ditampilkan | Perlakuan jujur |
|---|---|---|---|
| Inti Kandungan | Status kelahiran MAKSARA | `sorotan.A4` | Embrio tertidur/terkunci; tidak ada persen kemajuan |
| Pohon Silsilah | Silsilah & sejarah model | `modelBerlaku`, `dilarangPromosi`, pra-daftar V13–V18 | Garis menyatakan urutan penyajian, bukan pewarisan bobot |
| Observatorium | Riset & hasil eksperimen | `praDaftar`, `sorotan`, `tanggaMengarang_petakJujur2` | Grafik selalu berlabel instrumen; n putaran sah ada di setiap model |
| Perpustakaan | Temuan & Hukum | `temuan`, `hukum` | Dua instrumen ditampilkan terpisah |
| Tugu Galat | Register cacat | `registerCacat` | “Kelas cacat” tidak disebut “jumlah insiden” |
| Papan Misi | Backlog | `backlog` | Status ditampilkan dari teks sumber; hanya status/tujuan yang diawali “SELESAI” yang disaring sebagai selesai |
| Kabut Belum | Riset & ide belum dicoba | pra-daftar berkeadaan `belum`, backlog selain selesai tersurat | Kabut bukan prioritas otomatis dan bukan tanda sudah dimulai |
| Lapangan Latihan | Playground Ajar | alur dari Studio Ajar; label model dari `modelBerlaku` | Simulasi UI; model tidak dipanggil dan data tidak disimpan |
| Balai Bicara | Chat berpemandu avatar | label model dari `modelBerlaku` | Mesin selalu dilabeli “belum dihubungkan” |
| Lingkar Majelis | Majelis & guru | belum tersedia | Keadaan kosong jujur, tanpa anggota/guru rekaan |
| Akar / Sungai | Retrieval | belum tersedia | Tidak mengklaim korpus, indeks, cakupan, atau mutu |
| Tempa / Ruang Mesin | Infrastruktur | `mesin` | “Tercatat” tidak berarti sedang daring |
| Gudang | Data & aset | `sensus` | Salinan tunggal dan belum ditemukan dipisah |

## Palet

Palet hijau–oranye **ditemukan dengan jelas**, bukan direka dari bahan yang tidak cocok. Jejak terdekat dan konsisten ada di Chat, Dashboard, Design System, dan halaman MiganCore lama.

| Token | Hex | Peran | Sumber visual |
|---|---:|---|---|
| Rahim 0 | `#050d0a` | latar terdalam | `sumber/migancore/migancore.com-index.html` (`--bg`) |
| Rahim 1 | `#07100e` | latar aplikasi | `sumber/migancore/chat_live.html`, `tmp_dashboard.html` (`--bg-0`) |
| Rahim 2 | `#0d1f1a` | lapisan latar | `sumber/migancore/chat_live.html`, `tmp_dashboard.html` (`--bg-1`) |
| Panel pekat | `#161b22` | panel data Studio | `sumber/migancore/rancangan-studio-22agu.html` |
| Garis | `#30363d` | pembatas Studio | `sumber/migancore/rancangan-studio-22agu.html` |
| Hijau hidup | `#2fe39a` | bukti / kehidupan / fokus | `sumber/migancore/chat_live.html`, `design-sistem/styles.css` |
| Hijau lembut | `#7ef0bd` | teks aksen | `sumber/migancore/design-sistem/styles.css` |
| Oranye inti | `#ff8a24` | embrio / keputusan / perhatian | `sumber/migancore/chat_live.html`, `tmp_dashboard.html`, `design-sistem/styles.css` |
| Oranye lembut | `#ffc15c` | status menunggu / cahaya | `sumber/migancore/design-sistem/styles.css` |
| Biru riset | `#58a6ff` | tautan / status netral / instrumen | `sumber/migancore/rancangan-studio-22agu.html` |
| Kuning peringatan | `#d29922` | peringatan ilmiah | `sumber/migancore/rancangan-studio-22agu.html`, `ajar-index.html` |
| Cyan pemandu | `#4fc3cf` | avatar / balai bicara | `sumber/migancore/papan-pantau.html` |
| Teks | `#edf7f2` | isi utama | adaptasi terang dari `#e9f5ee` pada Chat/Dashboard agar kontras aman |
| Teks redup | `#a8bbb2` | keterangan sekunder | dinaikkan dari `#93b3a5` agar ukuran 14 px tetap terbaca |
| Galat | `#ff8f85` | gagal / register | `sumber/migancore/papan-pantau.html` |

Mode Baca memakai latar `#f4f7f4`, panel putih, teks `#17221d`, dan aksen yang digelapkan. Data, urutan, dan label tidak berubah.

## Tipografi

- **Display:** `Arial Narrow` / `Bahnschrift Condensed` / system sans. Digunakan untuk judul, bukan isi panjang.
- **UI/body:** `Inter` bila sudah tersedia di sistem, lalu system UI. Isi minimum 15 px; keterangan data minimum 12 px hanya untuk metadata, bukan informasi utama.
- **Data/label:** `Cascadia Code`, `IBM Plex Mono`, `Consolas`, monospace.
- Angka kuantitatif memakai `font-variant-numeric: tabular-nums`.
- Tidak ada font jaringan. Identitas tidak bergantung pada keberhasilan unduhan font.

## Komponen

- **Bilah atas:** merek, navigasi berlabel, commit sumber, Mode Baca.
- **Panel instrumen:** latar padat 94%, garis hijau, sudut oranye sebagai isyarat “alat”, bukan kaca transparan lemah.
- **Status pil:** titik + teks; warna tidak pernah menjadi satu-satunya pembeda.
- **Angka bersumber:** garis bawah titik-titik dan tooltip yang dapat dibuka dengan hover atau fokus keyboard.
- **Keadaan kosong:** bingkai putus-putus dengan kalimat “belum ada data”, bukan kartu tersembunyi.
- **Kartu misi/pra-daftar:** status asli, rincian yang dapat dibuka, dan filter yang tidak mengubah data.
- **Terrain:** Canvas dekoratif di bawah tombol wilayah; tidak pernah menjadi tempat teks isi.
- **Avatar:** wajah partikel abstrak CSS, dengan label mesin dan model permanen.

## Pola interaksi

1. Pintu masuk mengantar ke Dunia atau langsung ke Menara Pantau.
2. Di Dunia, klik wilayah mengubah panel pratinjau di kanan; tautan membuka layar kerja.
3. Filter Lab dan Misi hanya menyembunyikan/menampilkan kartu yang sudah dimuat.
4. Tooltip angka aktif pada hover dan fokus keyboard.
5. Mode Baca disimpan di `localStorage` dan berlaku pada semua halaman.
6. Playground dan chat menampilkan respons antarmuka jujur: “model tidak dipanggil” / “mesin belum dihubungkan”.

## Keterbacaan & kejujuran

- Semua teks isi berada di atas panel padat. Terrain dan avatar hanya konteks latar.
- Ukuran isi utama 15 px; kontrol setidaknya 42 px tinggi.
- Kontras dipilih untuk melewati AA pada pasangan utama; warna sekunder dinaikkan dari sumber bila terlalu redup.
- Ikon dekoratif memakai `aria-hidden`; fungsi selalu memiliki teks.
- Semua angka yang dirender dari JSON menggunakan helper `Nadi.angka` atau `Nadi.teksData`, dengan tooltip `data-nyata.json → jalur · commit`.
- Temuan, hukum, kelas cacat, backlog, dan pra-daftar tidak dijumlahkan lintas instrumen.
- Grafik tangga berjudul **MENGARANG · petak-jujur2**, dan setiap baris menampilkan **n = putaran sah**.
- Model frontier n=1 tetap ditampilkan sebagai n=1; tidak disamarkan.
- Cincin vonis adalah distribusi keadaan pra-daftar, bukan kemajuan kelahiran.
- Garis silsilah tidak mengklaim lineage bobot karena data lineage rinci tidak tersedia.
- Mode Baca menyajikan data yang sama dalam grid 2D bersih.

## Anggaran performa

Target untuk laptop dengan RAM bebas sekitar 2 GB:

- Tanpa framework, bundler, WebGL, gambar besar, video, atau font jaringan.
- Satu Canvas 2D hanya pada layar Dunia; DPR dibatasi maksimum 1,5.
- Terrain memakai 11 garis kontur dan 70 titik statis per bingkai, tanpa partikel fisika.
- Satu `requestAnimationFrame`; berhenti ketika Mode Baca aktif atau `prefers-reduced-motion: reduce`.
- `ResizeObserver` hanya untuk ukuran Canvas; tidak ada polling.
- JSON sekitar 20 KB; dimuat satu kali per halaman dan dicache di memori halaman.
- Target kasar: HTML+CSS+JS buatan < 120 KB di luar JSON, nol permintaan jaringan luar, waktu kerja animasi < 4 ms/bingkai pada laptop menengah.

## Apa yang diambil dari tiap sumber

Kutipan di bawah pendek dan literal; penerapannya disesuaikan untuk mockup ini.

| Proyek / berkas | Kutipan sumber | Yang diambil |
|---|---|---|
| `sumber/migancore/chat_live.html` | “MiganCore — Chat” dan token `--orange: #ff8a24; --green: #2fe39a` | identitas hijau–oranye, latar rahim, chat sebagai ruang inti |
| `sumber/migancore/tmp_dashboard.html` | “MiganCore — Admin Dashboard” | grid metrik padat dan keluarga warna status |
| `sumber/migancore/papan-pantau.html` | “panel instrumen, bukan dokumen” | prinsip panel tegas dan Mode Baca sebagai pasangan dokumen |
| `sumber/migancore/design-sistem/index.html` | “MIGANCORE — Embrio dalam Kandungan Digital” | metafora kandungan dan pusat embrio |
| `sumber/migancore/design-sistem/sections.jsx` | “Embrio dalam Kandungan Digital” | judul dunia dan bahasa kelahiran |
| `sumber/migancore/design-sistem/visuals.jsx` | “Migancore Orb — animated digital organism centerpiece” | orb/selaput sebagai pusat visual |
| `sumber/migancore/migancore.com-index.html` | “MIGANCORE — Organisme Digital yang Tumbuh” | organisme bertumbuh dan panel transparan gelap |
| `sumber/migancore/rancangan-studio-22agu.html` | “satu pintu untuk data, gerbang, latihan, dan vonis” | informasi padat, navigasi studio, token gelap GitHub-like |
| `sumber/migancore/ajar-index.html` | “data latih dari kegagalan nyata” | urutan playground: tanya, nilai, koreksi |
| `sumber/migancore/ajar-studio.html` | “keadaan dibaca langsung dari berkas hasil kerja” | data-first dan keterangan arah, bukan angka telanjang |
| `sumber/mighantect/dunia-index.html` | “Gedung Operasi V1” | susunan toolbar + dunia + panel status |
| `sumber/mighantect/styles.css` | `#game-canvas`, `#lift-panel`, `#status-panel` | pola HUD tiga wilayah; diubah menjadi peta + pratinjau |
| `sumber/mighantect/admin-panel.html` | “Gedung Operasi V1” | kesinambungan rasa operasi dunia |
| `sumber/mighan-3d-studio/studio.html` | “Mighan 3D Studio” | panel editor gelap dan toolbar ringkas |
| `sumber/mighan-3d-studio/avatar-studio.html` | “Mighan Avatar Studio” | avatar sebagai objek yang bisa dipandu, bukan ornamen |
| `sumber/mighan-3d-studio/builder.html` | “Mighan World Builder” | panel mengambang, inspector, dan chat di atas dunia |
| `sumber/rupa3d/pemandang.html` | “menampilkan angka yang harus dipercaya” | angka tabular pada panel gelap yang tidak melawan render |
| `sumber/rupa3d/fisika.html` | “ketiadaan animasi tidak boleh SENYAP” | fallback dan status eksplisit saat efek mati |
| `sumber/miganpro/app/page.tsx` | “Rupa (avatar) is the hero; Pusaka panels flank it.” | avatar pusat dengan panel pengetahuan di sisi |
| `sumber/miganpro/components/avatar/renderers/OrbRenderer.tsx` | “A breathing sphere of particles” | napas embrio ringan |
| `sumber/miganpro/components/avatar/renderers/ParticleFaceRenderer.tsx` | “hero hologram face” | wajah partikel abstrak untuk Balai Bicara |
| `sumber/emiga/index.html` | “avatar asap hidup, antarmuka bersih dengan chatboard suara” | panggung avatar + command bar bawah; tanpa kamera/suara pada mockup |
| `sumber/kvm8-frontend/www-ops.mighan.com/ops.mighan.com/index.html` | “CENTER: GAME CANVAS” dan “RIGHT: STATUS PANEL” | dunia sebagai pusat, bukti di panel kanan |
| `sumber/kvm8-frontend/www-mighan.com-static/mighan.com/index.html` | “Virtual Office for AI Agents” dan “Design Studio Tools” | dunia sebagai pintu ke alat, bukan sekadar landing page |
| `sumber/data-nyata.json` | “Angka lintas instrumen tidak boleh dibandingkan tanpa label.” | sumber tunggal angka, label instrumen, n frontier, status jujur |

## Struktur layar

- `index.html`: pintu masuk emosional + tiga fakta inti.
- `00-dunia.html`: atlas seluruh wilayah dan pratinjau data.
- `01-beranda.html`: model berlaku, distribusi vonis, mesin, sensus, arsip, keadaan kosong.
- `02-silsilah-sejarah.html`: pohon keadaan model + garis waktu V13–V18.
- `03-riset-lab.html`: sorotan A3/A4/H-RAGU, tangga MENGARANG, semua kartu pra-daftar.
- `04-ajar-chat.html`: playground Ajar dan chat/avatar dengan label mesin/model.
- `05-misi-kabut.html`: backlog dengan status sumber + pra-daftar yang belum dicoba; filter selesai hanya membaca penanda di awal status/tujuan agar kalimat prasyarat tidak ikut terhitung.

## Bukan bagian konsep ini

- Menentukan syarat bibit MAKSARA.
- Menghubungkan model, retrieval, kamera, mikrofon, atau mesin.
- Mengubah backlog, menyimpan data ajar, atau menaikkan status.
- Membuktikan layanan Laptop/Bmax/VPS-2 hidup.
- Menentukan prioritas riset atau menafsirkan hubungan lineage bobot yang tidak ada di sumber.
