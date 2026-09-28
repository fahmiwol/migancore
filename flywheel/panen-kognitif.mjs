#!/usr/bin/env node
/**
 * panen-kognitif.mjs — DNA PENALARAN: dilatih per OPERASI KOGNITIF, bukan per topik.
 *
 * Kerangka ini dirancang FAHMI (21 Agu 2026), bukan diambil dari mana pun:
 *   *"model tidak dilatih 'tentang fisika', tetapi dilatih MELAKUKAN abstraction,
 *   analogy, decomposition, induction, deduction, causal inference, counterfactual,
 *   hypothesis generation, error correction, constraint reasoning, transfer,
 *   recursive reasoning, problem reframing. Dengan begitu satu pola dari fisika
 *   muncul lagi di bisnis, engineering, matematika, bahasa, kehidupan."*
 *
 * ================= PENILAIANKU ATAS KERANGKA INI (jujur) =================
 * KUAT — dan alasannya bisa dipertanggungjawabkan: SFT kecil memang tidak
 * menanam kemampuan mentah, tapi ia SANGAT baik menanam METODE. Kerangka ini
 * murni metode, jadi cocok dengan yang bisa dicapai SFT.
 *
 * BAHAYANYA satu, dan justru diperingatkan oleh pola Fahmi sendiri (nomor 8:
 * "surface form ≠ underlying principle"): model bisa hafal BENTUKNYA —
 * merapal "OBSERVASI → POLA → ABSTRAKSI → ..." tanpa benar-benar bernalar.
 * Itu akan lolos gerbang yang mencari kata kunci, dan tetap bodoh.
 *
 * TIGA PENJAGA yang dipasang supaya bahaya itu tidak terjadi:
 *   1. LABEL RANTAI DIVARIASIKAN — kadang bernomor, kadang mengalir sebagai
 *      paragraf, kadang tanpa label sama sekali. Yang tetap: urutan berpikirnya.
 *   2. SATU OPERASI × BANYAK DOMAIN — operasi jadi konstanta, domain berubah
 *      (fisika, dagang, mesin, bahasa, pertanian, kode). Itu yang memaksa
 *      generalisasi; kalau domain tetap, yang dihafal domainnya.
 *   3. TIAP BARIS MEMBAWA BATAS — analogi disebut sekaligus di mana ia PATAH,
 *      aturan disebut sekaligus PENGECUALIANnya. Nalar tanpa batas = kepercayaan
 *      diri palsu, dan itu persis penyakit yang sedang kita obati.
 * ========================================================================
 *
 * Keluaran: dataset/migancore-kognitif.jsonl → panen.mjs → saring.mjs
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'dataset', 'migancore-kognitif.jsonl');
const hash = (t) => crypto.createHash('sha1').update(t).digest('hex').slice(0, 10);

const SIS =
  'Kamu MiganCore. Kalau menghadapi soal yang butuh penalaran, tunjukkan jalan pikirmu: ' +
  'apa yang diamati, pola apa yang muncul, aturan apa yang ditarik, sampai mana aturan itu ' +
  'berlaku, dan apa yang membuatnya patah. Panjang jawaban mengikuti kebutuhan soal — ' +
  'jangan memangkas sampai alasanmu tak bisa diperiksa, jangan pula bertele-tele.';

const rows = [];
const lihat = new Set();
function tambah(tanya, jawab, operasi, domain) {
  const id = hash(tanya + '||' + jawab.slice(0, 200));
  if (lihat.has(id)) return;
  lihat.add(id);
  rows.push({
    conversations: [
      { from: 'system', value: SIS },
      { from: 'human', value: tanya },
      { from: 'gpt', value: jawab },
    ],
    id, sumber: `kognitif-${operasi}`, operasi, domain,
  });
}

// ══════════════ 1. ESKALASI SKALA — "bisa jalan, harusnya bisa lari" ══════════════
// Kerangka Fahmi: kemampuan dasar → kemampuan lanjutan; yang dipelajari BUKAN
// pasangannya, melainkan HUKUM TRANSISInya.
const ESKALASI = [
  ['fisik', 'merangkak', 'berjalan', 'sumbu tumpuan berkurang dari empat jadi dua — yang bertambah bukan tenaga, tapi kendali keseimbangan'],
  ['fisik', 'menjaga keseimbangan sepeda', 'melakukan drift motor', 'dari mempertahankan keseimbangan menjadi MENGENDALIKAN ketidakseimbangan dengan sengaja'],
  ['bahasa', 'mengenal huruf', 'menyusun kalimat retoris', 'dari memetakan simbol ke bunyi, menjadi memilih bentuk demi efek pada pendengar'],
  ['bahasa', 'menerjemahkan kata per kata', 'menerjemahkan nuansa budaya', 'dari padanan leksikal ke padanan MAKSUD; kesetiaan berpindah dari kata ke niat'],
  ['kognitif', 'menghafal rumus', 'menurunkan teorema baru', 'dari memakai aturan menjadi memeriksa dari mana aturan itu lahir'],
  ['kognitif', 'menjawab pertanyaan "apa"', 'menjawab "mengapa dan bagaimana"', 'dari mengambil fakta menjadi menyusun rantai sebab'],
  ['teknologi', 'menulis skrip satu baris', 'membangun arsitektur microservices', 'dari mengatur langkah menjadi mengatur BATAS antar bagian dan kegagalannya'],
  ['teknologi', 'menyimpan data di array', 'mengelola basis data terdistribusi', 'dari menyimpan menjadi menjaga konsistensi saat banyak pihak menulis sekaligus'],
  ['teknologi', 'membuat if-else sederhana', 'melatih agen AI otonom', 'dari menuliskan semua cabang menjadi menyiapkan tujuan, alat, dan pagar'],
  ['teknologi', 'memperbaiki bug kecil', 'merapikan sistem lama menyeluruh', 'dari menambal gejala menjadi mengubah struktur yang melahirkan gejala'],
  ['bisnis', 'berjualan ke satu tetangga', 'membangun lapak daring lintas negara', 'dari percaya karena kenal, menjadi membangun kepercayaan lewat sistem'],
  ['bisnis', 'menyelesaikan konflik dua orang', 'melakukan diplomasi antarpihak besar', 'dari menengahi kepentingan yang bisa ditanyakan, ke kepentingan yang harus disimpulkan'],
  ['bisnis', 'mengelola keuangan pribadi', 'menyusun portofolio', 'dari menahan pengeluaran menjadi mengatur risiko yang tidak bisa dihilangkan'],
];
for (const [dom, dasar, lanjut, hukum] of ESKALASI) {
  tambah(
    `Dari "${dasar}" ke "${lanjut}" — apa yang sebenarnya berubah? Lalu beri satu contoh eskalasi setara dari bidang lain.`,
    `Yang berubah bukan sekadar ukurannya. ${hukum.charAt(0).toUpperCase() + hukum.slice(1)}.\n\n` +
    `Jadi hukum transisinya: kemampuan dasar menguasai SATU variabel; kemampuan lanjutan menguasai HUBUNGAN antar variabel, termasuk yang tidak stabil.\n\n` +
    `Contoh setara di bidang lain: dari mencatat pengeluaran harian ke menyusun anggaran tahunan — yang bertambah bukan jumlah catatan, tapi kemampuan memperkirakan yang belum terjadi.\n\n` +
    `Batasnya: tidak semua kemampuan dasar punya jalur ke versi lanjutan. Kalau yang membatasi bukan keterampilan melainkan bahan atau hukum alam, latihan sebanyak apa pun tidak menaikkannya.`,
    'eskalasi', dom);
}

// ══════════════ 2. INDUKSI → ATURAN → PREDIKSI → BATAS ══════════════
const INDUKSI = [
  ['fisika', ['besi memuai saat dipanaskan', 'aluminium memuai saat dipanaskan', 'tembaga memuai saat dipanaskan'],
   'pemanasan cenderung memuaikan bahan padat',
   'bahan padat lain yang belum diamati kemungkinan juga memuai saat dipanaskan',
   'air antara 0–4 °C justru MENYUSUT saat dipanaskan; jadi "cenderung", bukan "selalu" — dan pengecualian itu bukan gangguan, itu petunjuk bahwa mekanismenya soal susunan molekul, bukan panas semata'],
  ['dagang', ['lead yang membalas dalam sehari lebih sering menutup transaksi', 'lead yang dibalas cepat lebih sering membalas lagi', 'lead yang dibiarkan seminggu jarang kembali'],
   'kecepatan tanggapan berhubungan dengan peluang transaksi',
   'mempercepat balasan kemungkinan menaikkan penutupan',
   'bisa jadi terbalik: lead yang memang serius yang membalas cepat. Kalau begitu, mempercepat balasan tidak menaikkan apa pun — ujilah dengan membagi dua kelompok secara acak'],
  ['mesin', ['pengering dengan blower lebih besar lebih cepat kering', 'ruang dengan sirkulasi lebih baik lebih cepat kering', 'bahan yang ditipiskan lebih cepat kering'],
   'perpindahan uap air dipengaruhi kondisi aliran dan luas permukaan',
   'memperbesar aliran udara kemungkinan mempercepat pengeringan',
   'begitu bahan mencapai kadar air seimbang, menambah aliran hampir tidak berpengaruh; penghambatnya berpindah ke perpindahan panas atau difusi air di dalam bahan'],
];
for (const [dom, contoh, aturan, prediksi, batas] of INDUKSI) {
  tambah(
    `Pengamatan: ${contoh.map((c, i) => `(${i + 1}) ${c}`).join('; ')}. Apa yang bisa disimpulkan, apa yang bisa diramalkan, dan di mana kesimpulan itu berhenti berlaku?`,
    `Polanya: ketiganya berubah ke arah yang sama saat satu hal yang sama diubah.\n\n` +
    `Aturan yang ditarik: ${aturan}.\n\n` +
    `Ramalannya: ${prediksi}.\n\n` +
    `Batasnya — dan ini yang paling penting: ${batas}.\n\n` +
    `Tiga contoh belum membuktikan aturan; ia baru mengusulkannya. Yang membuktikan adalah usaha mencari contoh yang MEMBANTAH.`,
    'induksi', dom);
}

// ══════════════ 3. ANALOGI DAN DI MANA IA PATAH ══════════════
const ANALOGI = [
  ['jantung', 'pompa', 'sama-sama mendorong cairan dalam sirkuit tertutup dengan tekanan berulang',
   'jantung mengatur dirinya sendiri lewat umpan balik saraf dan hormon, memperbaiki jaringannya, dan berubah kapasitas mengikuti kebutuhan tubuh — pompa mekanis tidak melakukan satu pun dari itu',
   'analogi ini sah untuk menjelaskan aliran dan tekanan; ia PATAH begitu bicara adaptasi, penyembuhan, atau kelelahan'],
  ['ingatan model AI', 'lemari arsip', 'sama-sama menyimpan dan mengambil kembali',
   'lemari arsip mengembalikan dokumen persis seperti dimasukkan; model mengembalikan sesuatu yang direkonstruksi — bisa mirip, bisa keliru, dan ia tidak tahu bedanya',
   'analoginya sah untuk menjelaskan "menyimpan lalu mengambil"; PATAH begitu bicara ketepatan, karena arsip tidak pernah mengarang isi map'],
  ['perusahaan', 'organisme', 'sama-sama punya bagian berfungsi khusus, tumbuh, dan bisa sakit',
   'organisme punya batas tubuh yang jelas dan satu tujuan bertahan hidup; perusahaan bisa memecah diri, digabung, dan bagian-bagiannya bisa punya kepentingan yang berlawanan',
   'sah untuk menjelaskan saling ketergantungan bagian; PATAH saat dipakai membenarkan "yang lemah harus dibuang" — itu memindahkan hukum biologi ke ranah keputusan manusia'],
];
for (const [a, b, sama, beda, batas] of ANALOGI) {
  tambah(
    `"${a.charAt(0).toUpperCase() + a.slice(1)} itu seperti ${b}." Sejauh mana analogi ini bisa dipakai?`,
    `Yang sama: ${sama}.\n\n` +
    `Yang BERBEDA — dan ini yang biasanya dilewati: ${beda}.\n\n` +
    `Jadi batas pakainya: ${batas}.\n\n` +
    `Cara memakai analogi dengan benar: pinjam STRUKTURnya, jangan pinjam kesimpulannya. Setelah meminjam, cari satu hal yang seharusnya benar kalau analoginya tepat — lalu periksa hal itu. Kalau tidak cocok, analoginya indah tapi tidak berguna.`,
    'analogi-batas', 'lintas');
}

// ══════════════ 4. FUNGSI vs BENTUK — satu tujuan, banyak jalan ══════════════
const FUNGSI = [
  ['mengeringkan kelapa', 'oven', 'menghilangkan air dari bahan',
   ['panas', 'udara bergerak', 'penurunan kelembapan udara', 'ruang hampa', 'sinar matahari', 'gabungan'],
   'oven cuma SATU cara memenuhi fungsi itu; kalau listrik mahal, penjemuran bertingkat dengan aliran udara bisa mengalahkannya dalam biaya per kilogram'],
  ['memindahkan barang dari A ke B', 'truk', 'memindahkan massa melintasi jarak dalam waktu tertentu',
   ['truk', 'kereta', 'kapal', 'pesawat', 'gabungan antar-moda', 'memindahkan produksinya, bukan barangnya'],
   'pilihannya bukan "yang tercepat", tapi hasil tukar-tambah biaya × waktu × keandalan × kapasitas × risiko — dan kadang jawabannya: jangan dipindahkan sama sekali'],
  ['membuat oven lebih panas', 'menaikkan suhu', 'sebenarnya: mengeringkan bahan lebih cepat',
   ['menambah aliran udara', 'menurunkan kelembapan', 'memperluas permukaan bahan', 'memperbaiki perpindahan panas', 'mengurangi panas yang lolos'],
   'ini pembingkaian ulang: pertanyaan aslinya menyebut ALAT, padahal yang dikejar HASIL. Menaikkan suhu bisa malah merusak bahan sementara tujuannya tetap tak tercapai'],
];
for (const [minta, alat, tujuan, cara, catatan] of FUNGSI) {
  tambah(
    `Ada permintaan: "${minta}". Apakah ${alat} jawabannya?`,
    `Sebelum menjawab, kupisahkan dulu ALAT dari TUJUAN. Tujuan sebenarnya: ${tujuan}.\n\n` +
    `Mekanisme yang bisa memenuhi tujuan itu: ${cara.join(', ')}.\n\n` +
    `Jadi ${alat} bukan jawaban — ia salah satu jalan. ${catatan.charAt(0).toUpperCase() + catatan.slice(1)}.\n\n` +
    `Urutan berpikirnya: tujuan → batasan → mekanisme yang mungkin → pilihan → baru alat.`,
    'fungsi-bentuk', 'rekayasa');
}

// ══════════════ 5. SEBAB, COUNTERFACTUAL, DAN RANTAI AKIBAT ══════════════
const SEBAB = [
  ['penjualan es krim naik bersamaan dengan jumlah orang tenggelam',
   'cuaca panas — orang membeli es krim DAN lebih banyak berenang',
   'melarang penjualan es krim tidak akan menurunkan angka tenggelam sama sekali'],
  ['karyawan yang datang paling pagi punya penilaian terbaik',
   'jenis pekerjaan atau jarak rumah bisa menentukan keduanya sekaligus; bisa juga arahnya terbalik — yang pekerjaannya lancar jadi lebih ringan datang pagi',
   'mewajibkan semua datang lebih pagi kemungkinan menambah kelelahan tanpa menaikkan hasil'],
  ['model dengan loss lebih kecil tampak lebih pintar',
   'loss kecil bisa berarti hafalan atas data latih, bukan pemahaman',
   'melatih lebih lama demi loss lebih kecil bisa MENURUNKAN hasil di data yang belum pernah dilihat'],
];
for (const [amatan, tandingan, akibat] of SEBAB) {
  tambah(
    `Diamati: ${amatan}. Apa kesimpulan yang bisa ditarik?`,
    `Belum ada kesimpulan sebab-akibat yang boleh ditarik dari ini.\n\n` +
    `Penjelasan tandingan yang harus dicoret dulu: ${tandingan}.\n\n` +
    `Kalau tandingan itu benar, akibat praktisnya: ${akibat}.\n\n` +
    `Uji yang memisahkannya: ubah SATU variabel pada kelompok yang dipilih acak, tahan yang lain, lalu bandingkan. Tanpa itu, yang kita punya cuma dua hal yang bergerak bersamaan — dan itu bukan sebab.`,
    'sebab-counterfactual', 'lintas');
}
// counterfactual bertingkat: perubahan kecil → akibat berantai
tambah(
  'Kalau diameter pipa diperbesar sedikit, apa yang terjadi pada sistem?',
  'Tidak berhenti di satu akibat — ia berantai.\n\n' +
  '1. Luas penampang naik, jadi untuk debit yang sama kecepatan aliran TURUN.\n' +
  '2. Kecepatan turun → gesekan berkurang → penurunan tekanan sepanjang pipa mengecil.\n' +
  '3. Penurunan tekanan mengecil → blower tidak perlu bekerja sekeras sebelumnya.\n' +
  '4. Beban blower turun → konsumsi listrik turun.\n\n' +
  'Tapi berhenti di situ berbahaya. Kalau kecepatan turun terlalu jauh, partikel yang tadinya terbawa bisa mengendap dan menyumbat — jadi ada BATAS BAWAH yang tidak boleh dilewati. Dan pipa lebih besar berarti biaya bahan naik, sementara penghematan listriknya bertahap.\n\n' +
  'Jadi jawabannya bukan "lebih besar lebih baik", tapi: ada rentang optimum, dan letaknya ditentukan angka — bukan arah.',
  'akibat-berantai', 'rekayasa');

// ══════════════ 6. KEGAGALAN → DIAGNOSIS → UBAH VARIABEL ══════════════
const GAGAL = [
  ['cara A dipakai untuk menaikkan penjualan, hasilnya nihil',
   'apakah A memang tidak bekerja, atau A tidak pernah benar-benar terjadi? Banyak "strategi gagal" sebenarnya strategi yang tidak dijalankan',
   'pisahkan kegagalan RANCANGAN dari kegagalan PELAKSANAAN sebelum mengganti strategi'],
  ['model dilatih ulang, skornya justru turun',
   'apa yang berubah selain data? kalau komposisi dan lama latihan diubah bersamaan, penyebabnya tidak bisa ditunjuk',
   'ulangi dengan satu perubahan saja; kegagalan yang bisa ditunjuk sebabnya lebih berharga daripada keberhasilan yang tidak dimengerti'],
  ['mesin pengering menghasilkan bahan yang masih lembap di bagian dalam',
   'permukaan kering lebih dulu lalu mengeras dan mengunci air di dalam — menambah panas justru memperparah',
   'ubah variabel yang lain: turunkan suhu, perpanjang waktu, atau istirahatkan agar kelembapan merata dulu'],
];
for (const [kasus, tanyakan, tindakan] of GAGAL) {
  tambah(
    `Situasi: ${kasus}. Apa langkah berikutnya?`,
    `Yang TIDAK kulakukan: mencatat "gagal" lalu mengganti cara.\n\n` +
    `Pertanyaan diagnosisnya dulu: ${tanyakan}.\n\n` +
    `Baru tindakannya: ${tindakan}.\n\n` +
    `Kegagalan yang tidak didiagnosis akan terulang dengan baju baru. Yang berharga dari kegagalan bukan bahwa ia terjadi, tapi variabel apa yang ia tunjukkan.`,
    'kegagalan-diagnosis', 'lintas');
}

// ══════════════ 7. KEBERHASILAN → EKSTRAK PRINSIP → PINDAHKAN ══════════════
tambah(
  'Sebuah mesin berhasil mengeringkan bahan dengan udara panas. Apa yang sebaiknya diambil dari keberhasilan itu?',
  'Yang salah: meniru mesinnya.\n\n' +
  'Yang benar: mengurai prinsipnya — panas menambah energi air untuk lepas, aliran udara membawa uapnya pergi, dan perbedaan kelembapan menjadi pendorongnya. Tiga hal itu: sumber energi, pembawa, dan beda potensial.\n\n' +
  'Begitu prinsipnya terpisah dari bentuknya, ia bisa dipindahkan: mengeringkan gabah, mengeringkan cat, bahkan mengeringkan ruangan lembap — dengan bentuk mesin yang sama sekali berbeda.\n\n' +
  'Batasnya: bahan yang rusak oleh panas (misalnya yang mengandung minyak atsiri) memutus jalur "sumber energi = panas"; di situ prinsipnya tetap, tapi mekanismenya harus diganti — misalnya menurunkan tekanan.',
  'ekstrak-prinsip', 'rekayasa');

// ══════════════ 8. TRANSITIVITAS DAN JEBAKANNYA ══════════════
const TRANSITIF = [
  ['A lebih murah dari B, B lebih murah dari C', 'A lebih murah dari C', true,
   'sah, karena "lebih murah" membandingkan besaran yang sama pada satu sumbu'],
  ['tim A mengalahkan tim B, tim B mengalahkan tim C', 'tim A pasti mengalahkan tim C', false,
   'tidak sah: hasil pertandingan bergantung gaya bermain yang saling mengunci, bukan satu sumbu tunggal'],
  ['pupuk menaikkan hasil panen, hasil panen menaikkan pendapatan', 'menambah pupuk selalu menaikkan pendapatan', false,
   'tidak sah: tiap rantai punya titik jenuh dan biaya. Melewati dosis optimum, pupuk menurunkan hasil sekaligus menambah biaya'],
];
for (const [premis, simpul, sah, alasan] of TRANSITIF) {
  tambah(
    `${premis}. Berarti ${simpul}?`,
    `${sah ? 'Sah' : 'TIDAK sah'} — ${alasan}.\n\n` +
    `Aturan umumnya: sifat "kalau A→B dan B→C maka A→C" hanya berlaku bila hubungannya mengurutkan pada SATU sumbu yang sama dan tidak jenuh. Begitu ada saling-pengaruh, titik jenuh, atau biaya yang ikut naik, rantainya putus.\n\n` +
    `Kebiasaan yang menyelamatkan: setiap kali menyambung dua hubungan, tanyakan "apa yang bisa membuat sambungan ini putus?" sebelum memakainya.`,
    'transitivitas', 'logika');
}

// ══════════════ 9. PEMBINGKAIAN ULANG & HIRARKI SISTEM ══════════════
tambah(
  'Mesin produksi sering berhenti mendadak. Bagaimana cara menelusurinya?',
  'Kutelusuri dua arah, karena satu arah saja gampang menyesatkan.\n\n' +
  'Dari atas ke bawah: apa fungsi mesin ini → subsistem apa yang menopangnya (penggerak, kendali, pasokan bahan, pendingin) → komponen apa di tiap subsistem → mekanisme apa yang bisa gagal.\n\n' +
  'Dari bawah ke atas: komponen mana yang menunjukkan gejala → subsistem mana yang terganggu → fungsi apa yang berubah → apakah gejalanya cocok dengan berhenti mendadak.\n\n' +
  'Yang menentukan bukan menemukan komponen rusak, tapi menemukan komponen yang kerusakannya MENJELASKAN pola gejalanya — termasuk kenapa berhentinya mendadak, bukan melambat perlahan.\n\n' +
  'Kalau tidak ada yang menjelaskan pola itu, kemungkinan besar penyebabnya di luar mesin: pasokan listrik, suhu ruangan, atau bahan yang berubah sifat.',
  'hirarki-sistem', 'rekayasa');

// ══════════════ 10. RANTAI PENUH — dijalankan, bukan dirapal ══════════════
// Sengaja TANPA label rantai, supaya model belajar urutan berpikirnya,
// bukan menghafal kata "OBSERVASI → POLA → ABSTRAKSI".
tambah(
  'Blower yang lebih besar membuat pengeringan lebih cepat. Kembangkan pengamatan ini sejauh yang bisa dipertanggungjawabkan.',
  'Yang teramati: menaikkan ukuran blower memperpendek waktu kering pada bahan dan suhu yang sama.\n\n' +
  'Polanya: aliran udara memengaruhi laju pengeringan.\n\n' +
  'Kalau ditarik lebih abstrak: yang sebenarnya bekerja adalah perpindahan massa — uap air berpindah dari bahan ke udara, dan lajunya bergantung pada seberapa cepat udara jenuh itu diganti udara kering.\n\n' +
  'Dari situ aturannya: memperbesar beda potensial atau memperbaiki kondisi perpindahan akan mempercepat pelepasan air.\n\n' +
  'Aturan itu bisa dipindahkan ke pengering lain — gabah, kayu, cat — karena mekanismenya sama meski bentuk mesinnya beda.\n\n' +
  'Ramalannya: menambah aliran udara mempercepat pengeringan.\n\n' +
  'Tapi ramalan itu punya syarat. Kalau bahan sudah mencapai kadar air seimbang dengan udara sekitar, menambah aliran hampir tidak berpengaruh; penghambatnya sudah pindah ke perpindahan panas atau ke difusi air dari dalam bahan ke permukaan.\n\n' +
  'Jadi hipotesis berikutnya: penghambat sesungguhnya mungkin bukan aliran udara, melainkan panas atau difusi. Cara mengujinya: tahan aliran udara, ubah suhu saja, lihat apakah waktu kering berubah. Kalau berubah banyak, penghambatnya panas — dan membeli blower lebih besar berarti membuang uang.',
  'rantai-penuh', 'rekayasa');

tambah(
  'Satu pelanggan membeli lagi setelah dikirimi ucapan terima kasih. Kembangkan pengamatan ini sejauh yang bisa dipertanggungjawabkan.',
  'Yang teramati: satu pelanggan membeli lagi sesudah menerima ucapan terima kasih. Satu kejadian.\n\n' +
  'Godaannya: menyimpulkan ucapan terima kasih menaikkan pembelian ulang. Itu terlalu cepat — satu kejadian tidak membentuk pola.\n\n' +
  'Kalau memang ada polanya, dugaan mekanismenya: perhatian setelah transaksi membuat pembeli merasa dikenali, dan orang lebih mudah kembali ke tempat yang mengingatnya.\n\n' +
  'Aturan yang lebih umum kalau mekanisme itu benar: sentuhan setelah transaksi menaikkan peluang kembali — dan kalau begitu, bentuk sentuhannya bisa bermacam-macam, bukan hanya ucapan terima kasih.\n\n' +
  'Ramalannya: pengingat perawatan produk atau tanya-kabar pemakaian mestinya memberi efek serupa.\n\n' +
  'Batasnya: kalau sentuhannya terlalu sering, efeknya berbalik jadi gangguan. Dan kalau yang dikirimi hanya pelanggan yang memang sudah puas, kita mengukur kepuasan, bukan efek ucapan.\n\n' +
  'Ujinya: dari daftar pembeli baru, pilih acak separuh untuk dikirimi, separuh tidak, lalu bandingkan pembelian ulang dalam periode yang sama. Tanpa pembanding, angka setinggi apa pun tidak membuktikan apa-apa.',
  'rantai-penuh', 'bisnis');

// ─────────────────────────────────────────────────────── tulis ──
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
const perOp = {}, perDom = {};
for (const r of rows) { perOp[r.operasi] = (perOp[r.operasi] || 0) + 1; perDom[r.domain] = (perDom[r.domain] || 0) + 1; }
console.log(`panen-kognitif: ${rows.length} baris → ${OUT}`);
console.log('  per OPERASI (yang dilatih):');
for (const [k, v] of Object.entries(perOp).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(22)} ${v}`);
console.log('  per DOMAIN (yang divariasikan):');
for (const [k, v] of Object.entries(perDom).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(22)} ${v}`);
