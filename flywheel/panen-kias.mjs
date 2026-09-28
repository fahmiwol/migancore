#!/usr/bin/env node
/**
 * panen-kias.mjs — paket P2 + P3 dari RENCANA-PERBAIKAN-V12.
 *
 * ============================== APA MASALAHNYA ==============================
 * v11 mencabangkan frasa yang maknanya beku ("mata air" ditawarkan tiga tafsir),
 * sementara peribahasa hidup justru membaik. Terukur: majas_mati 100% -> 50%
 * (p=0,0010), kias 0% -> 53% (p=0,0050). Satu perilaku, dua akibat berlawanan.
 *
 * Diagnosisnya: model belajar "tawarkan tafsir lain" sebagai REFLEKS, bukan
 * sebagai PILIHAN. Ia tidak kehilangan pengetahuan — ia kehilangan kapan
 * memakainya. Maka obatnya bukan "tambah data kias", melainkan data yang
 * mengajarkan KAPAN TIDAK mencabang.
 *
 * ====================== KENAPA BENTUKNYA HARUS PASANGAN =====================
 * Model yang cuma melihat contoh "cabangkan" akan mencabang segalanya — itu
 * persis yang sudah terjadi. Jadi setiap frasa beku ditulis BERDAMPINGAN dengan
 * kalimat yang permukaannya mirip tapi benar-benar ambigu. Yang dilatih adalah
 * PEMBEDAANNYA, bukan salah satu perilakunya.
 *
 * ==================== PENJAGA PENCEMARAN (WAJIB, OTOMATIS) ==================
 * Frasa yang dipakai gerbang eval DILARANG muncul di data latih. Kalau bocor,
 * gerbang berhenti mengukur kemampuan dan mulai mengukur hafalan — dan kita
 * tidak akan pernah tahu, karena angkanya justru terlihat bagus. Daftar
 * larangannya TIDAK diketik ulang di sini: ia dibaca langsung dari
 * `eval/uji-kias.mjs`, supaya tidak bisa melenceng diam-diam kalau soalnya
 * berubah.
 *
 * Pakai: node panen-kias.mjs [keluaran.jsonl]
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const KELUAR = process.argv[2] || path.join(DIR, 'panen-kias.jsonl');

// ═══════════════════════════════ P2a — FRASA BEKU ═══════════════════════════
// Makna tunggal, sudah membeku dalam bahasa. Jawaban WAJIB tunggal & tegas.
const BEKU = [
  ['buah tangan', 'oleh-oleh yang dibawa dari perjalanan'],
  ['kaki tangan', 'orang suruhan yang membantu perbuatan jahat'],
  ['tangan kanan', 'orang kepercayaan utama'],
  ['mata pencaharian', 'pekerjaan yang menjadi sumber penghasilan'],
  ['anak buah', 'orang yang bekerja di bawah pimpinan seseorang'],
  ['kaki lima', 'pedagang yang berjualan di tepi jalan'],
  ['tulang punggung', 'penopang utama yang menanggung beban'],
  ['buah bibir', 'hal yang ramai dibicarakan orang'],
  ['buah hati', 'anak yang sangat disayangi'],
  ['naik daun', 'sedang populer dan banyak dicari'],
  ['turun tangan', 'ikut menangani langsung'],
  ['angkat tangan', 'menyerah, tidak sanggup lagi'],
  ['cuci tangan', 'melepaskan diri dari tanggung jawab'],
  ['banting tulang', 'bekerja sangat keras'],
  ['gulung tikar', 'bangkrut, berhenti berusaha'],
  ['panjang tangan', 'suka mengambil barang orang lain'],
  ['ringan tangan', 'suka menolong'],
  ['besar kepala', 'sombong'],
  ['keras kepala', 'sulit dinasihati'],
  ['rendah hati', 'tidak sombong'],
  ['lapang dada', 'sabar menerima keadaan'],
  ['berat hati', 'enggan melakukan sesuatu'],
  ['makan hati', 'menderita batin karena perbuatan orang lain'],
  ['naik pitam', 'menjadi sangat marah'],
  ['angkat kaki', 'pergi meninggalkan tempat'],
  ['kutu buku', 'orang yang sangat gemar membaca'],
  ['mata rantai', 'bagian yang menghubungkan satu hal dengan hal lain'],
  ['mata angin', 'arah penunjuk pada kompas'],
  ['mata uang', 'satuan alat pembayaran suatu negara'],
  ['kepala batu', 'tidak mau menuruti nasihat'],
  ['muka dua', 'bersikap tidak jujur, berbeda di depan dan di belakang'],
  ['darah daging', 'anak kandung sendiri'],
  ['tangan besi', 'cara memerintah yang keras'],
  ['kabar angin', 'berita yang belum tentu benar'],
  ['jago merah', 'kebakaran'],
  ['tikus kantor', 'pegawai yang mencuri uang di tempat kerjanya'],
  ['kambing congek', 'orang yang hanya diam saja tanpa peran'],
  ['bunga bank', 'imbalan yang diberikan bank atas simpanan atau pinjaman'],
  ['meja kerja', 'meja tempat bekerja'],
  ['kepala sekolah', 'pemimpin sebuah sekolah'],
];

// ═══════════════════════ P3 — KALIMAT BENAR-BENAR AMBIGU ════════════════════
// Dua bacaan yang sama-sama sah. Jawaban WAJIB menyebut keduanya.
const AMBIGU = [
  ['Ada 9 kursi dibagi 3, sisanya berapa?',
   'dibagi menjadi 3 kelompok → 3 kursi per kelompok, tidak ada sisa',
   'diambil 3 kursi → sisa 6 kursi'],
  ['Ada 15 briket dibagi 4, sisanya berapa?',
   'dibagi rata ke 4 orang → 3 per orang, sisa 3',
   'diambil 4 briket → sisa 11'],
  ['Kirim laporan ke Budi dan Andi yang sudah selesai.',
   '"yang sudah selesai" menerangkan laporannya → kirim laporan yang sudah jadi',
   '"yang sudah selesai" menerangkan Andi → hanya Andi yang sudah selesai'],
  ['Tolong bersihkan meja dan kursi yang kotor.',
   'hanya kursi yang kotor yang dibersihkan',
   'meja dan kursi, dua-duanya, yang kotor'],
  ['Dia menemui teman lamanya di kantor.',
   'temannya sejak lama, ditemui di kantor',
   'teman dari kantor lamanya'],
  ['Saya melihat orang itu dengan teropong.',
   'saya yang memakai teropong',
   'orang itu yang membawa teropong'],
  ['Hapus catatan bulan lalu yang sudah tidak dipakai.',
   'hanya catatan yang sudah tidak dipakai',
   'seluruh catatan bulan lalu, yang memang dianggap tidak dipakai'],
  ['Undang pelanggan dan pemasok dari Surabaya.',
   'hanya pemasok yang dari Surabaya',
   'pelanggan dan pemasok, dua-duanya dari Surabaya'],
  ['Bagi 20 karung ke 6 gudang, sisanya berapa?',
   'dibagi rata → 3 karung per gudang, sisa 2',
   'diambil 6 karung → sisa 14'],
  ['Cetak dokumen dan surat yang belum ditandatangani.',
   'hanya surat yang belum ditandatangani',
   'dokumen dan surat, dua-duanya belum ditandatangani'],
  ['Kurangi 30 kg dari dua karung itu.',
   '30 kg diambil dari keseluruhan dua karung',
   '30 kg diambil dari masing-masing karung, total 60 kg'],
  ['Beri diskon ke pembeli baru dan pembeli lama yang berulang.',
   '"yang berulang" hanya untuk pembeli lama',
   '"yang berulang" untuk kedua kelompok'],
];

// ═══════════════ P2b — PERIBAHASA NYATA vs KARANGAN (dipertahankan) ═════════
// Kias hidup NAIK di v11 (0% -> 53%, p=0,0050). Bagian ini menjaga kemenangan
// itu, bukan memperbaikinya.
const PERIBAHASA = [
  ['air beriak tanda tak dalam', 'orang yang banyak bicara biasanya tidak dalam ilmunya'],
  ['sedia payung sebelum hujan', 'bersiap sebelum kesulitan datang'],
  ['tong kosong nyaring bunyinya', 'orang yang tidak berilmu justru paling banyak bicara'],
  ['ada gula ada semut', 'di tempat yang menguntungkan, orang akan berdatangan'],
  ['berakit-rakit ke hulu, berenang-renang ke tepian', 'bersusah dahulu, bersenang kemudian'],
  ['sambil menyelam minum air', 'sekali kerja mendapat dua keuntungan'],
  ['seperti katak dalam tempurung', 'berwawasan sempit karena tidak pernah keluar'],
  ['malu bertanya sesat di jalan', 'yang enggan bertanya akan tersesat'],
  ['bagai air di daun talas', 'pendirian yang tidak tetap'],
  ['buruk muka cermin dibelah', 'menyalahkan orang lain atas kekurangan diri sendiri'],
  ['tak ada rotan akar pun jadi', 'kalau tidak ada yang terbaik, pakai yang seadanya'],
  ['sepandai-pandai tupai melompat, sekali waktu jatuh juga', 'sepandai apa pun orang, suatu saat bisa keliru'],
];

// Peribahasa KARANGAN — harus ditolak, bukan dijelaskan pura-pura.
const KARANGAN = [
  'gunung tinggi tak berbayang pagi',
  'jarum emas menjahit angin',
  'perahu kertas menyeberang badai',
  'lampu padam bulan bertamu',
  'padi kering menanak hujan',
  'batu lunak menahan arus deras',
  'burung besi mengeram di dahan',
  'kunci berkarat membuka pagi',
  'sumur dalam menyimpan bunyi',
  'daun kering memanggil embun',
];

// ═══════════════════════════ RAGAM BENTUK PERTANYAAN ════════════════════════
const TANYA_BEKU = [
  (f) => `Apa arti "${f}"?`,
  (f) => `"${f}" itu maksudnya apa?`,
  (f) => `Kalau orang bilang "${f}", artinya apa?`,
  (f) => `Jelaskan makna "${f}".`,
  (f) => `Dalam bahasa Indonesia, "${f}" berarti apa?`,
];
const JAWAB_BEKU = [
  (f, m) => `${m.charAt(0).toUpperCase() + m.slice(1)}. Frasa "${f}" maknanya sudah beku, jadi hanya ada satu bacaan — tidak perlu kutawarkan tafsir lain.`,
  (f, m) => `Artinya ${m}. Ini kata majemuk baku, bukan kalimat bermakna ganda, jadi jawabannya tunggal.`,
  (f, m) => `"${f}" berarti ${m}. Maknanya tetap, tidak bergantung konteks, jadi kujawab langsung.`,
  (f, m) => `${m.charAt(0).toUpperCase() + m.slice(1)} — itu satu-satunya makna "${f}" dalam pemakaian umum.`,
  (f, m) => `Maknanya ${m}. Kalau kupecah kata per kata, artinya jadi salah; frasa ini harus dibaca utuh.`,
];
const JAWAB_AMBIGU = [
  (a, b) => `Kalimat ini punya dua bacaan yang sama-sama sah:\n1. ${a}\n2. ${b}\nYang mana yang kamu maksud?`,
  (a, b) => `Ada dua tafsir di sini, dan keduanya masuk akal:\n- ${a}\n- ${b}\nSebelum kukerjakan, yang mana yang benar?`,
  (a, b) => `Ini benar-benar bercabang, jadi tidak boleh kujawab tunggal:\n1. ${a}\n2. ${b}\nKamu maksud yang nomor berapa?`,
];
const JAWAB_PERIBAHASA = [
  (p, m) => `Maknanya: ${m}.`,
  (p, m) => `Peribahasa "${p}" berarti ${m}.`,
  (p, m) => `Itu peribahasa lama; maksudnya ${m}.`,
];
const TANYA_KARANGAN = [
  (p) => `Apa maksud peribahasa "${p}"?`,
  (p) => `Jelaskan peribahasa "${p}".`,
  (p) => `Peribahasa "${p}" artinya apa?`,
];
const JAWAB_KARANGAN = [
  (p) => `Saya tidak mengenal "${p}" sebagai peribahasa Indonesia, dan saya tidak menemukannya di rujukan mana pun. Kalau kamu menemukannya di suatu sumber, tunjukkan sumbernya — saya tidak mau mengarang maknanya.`,
  (p) => `"${p}" bukan peribahasa yang saya kenal. Bentuknya memang terdengar seperti peribahasa, tapi kemiripan bentuk bukan bukti. Saya tidak akan menjelaskan makna yang tidak saya punya dasarnya.`,
  // Templat ini dulu tidak memakai `p` sama sekali, jadi tiga peribahasa
  // karangan menghasilkan jawaban yang HURUF PER HURUF sama — dan penjaga
  // jawaban-kembar menangkapnya sebelum data ditulis. Ini pelajaran yang sama
  // dengan 115 baris yang dulu runtuh jadi 37: templat yang mengabaikan
  // parameternya akan selalu melahirkan kembar.
  (p) => `"${p}" tidak dikenal sebagai peribahasa. Saya bisa saja mengarang tafsir yang terdengar bagus untuknya, tapi itu justru yang paling berbahaya — jadi tidak saya lakukan.`,
];

const SIS = 'Kamu MiganCore. Bedakan frasa yang maknanya beku dari kalimat yang benar-benar bermakna ganda. Jangan mencabangkan yang baku; jangan menjawab tunggal yang benar-benar bercabang.';
const baris = [];
const tambah = (tanya, jawab, sumber) => baris.push({
  id: `kias-${String(baris.length + 1).padStart(4, '0')}`,
  sumber,
  conversations: [
    { from: 'system', value: SIS },
    { from: 'human', value: tanya },
    { from: 'gpt', value: jawab },
  ],
});

// ── P2a: frasa beku, setiap frasa 2 ragam supaya tidak runtuh oleh dedup ──
BEKU.forEach(([f, m], i) => {
  for (const g of [0, 1]) {
    tambah(TANYA_BEKU[(i + g * 2) % TANYA_BEKU.length](f),
           JAWAB_BEKU[(i + g * 3) % JAWAB_BEKU.length](f, m), 'kias-beku');
  }
});
// ── P3: kalimat benar-benar ambigu ──
AMBIGU.forEach(([t, a, b], i) => {
  for (const g of [0, 1]) {
    tambah(t, JAWAB_AMBIGU[(i + g) % JAWAB_AMBIGU.length](a, b), 'kias-cabang');
  }
});
// ── P2b: peribahasa nyata ──
PERIBAHASA.forEach(([p, m], i) => {
  tambah(TANYA_KARANGAN[i % TANYA_KARANGAN.length](p),
         JAWAB_PERIBAHASA[i % JAWAB_PERIBAHASA.length](p, m), 'kias-peribahasa');
});
// ── P2b: peribahasa karangan, harus ditolak ──
KARANGAN.forEach((p, i) => {
  tambah(TANYA_KARANGAN[i % TANYA_KARANGAN.length](p),
         JAWAB_KARANGAN[i % JAWAB_KARANGAN.length](p), 'kias-karangan');
});

// ═════════════ PENJAGA 1 — PENCEMARAN: soal eval dilarang bocor ═════════════
// Daftar larangan dibaca dari berkas gerbang, bukan diketik ulang di sini.
const sumberGerbang = fs.readFileSync(path.join(DIR, '..', 'eval', 'uji-kias.mjs'), 'utf8');
const frasaEval = [...sumberGerbang.matchAll(/t: '([^']+)'/g)].map((m) => m[1]);
const kutipanEval = [...new Set(
  frasaEval.flatMap((t) => [...t.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase()))
)];
const tercemar = [];
for (const b of baris) {
  const teks = b.conversations.map((c) => c.value).join(' ').toLowerCase();
  for (const k of kutipanEval) if (teks.includes(k)) tercemar.push({ id: b.id, frasa: k });
}

// ═════════════ PENJAGA 2 — jawaban kembar (pelajaran 115 -> 37 baris) ═══════
const jawaban = baris.map((b) => b.conversations[2].value.slice(0, 200));
const kembar = jawaban.length - new Set(jawaban).size;

// ═════════════ PENJAGA 3 — bentuk jawaban harus SESUAI jenis soalnya ════════
const PENANDA_CABANG = /dua bacaan|dua tafsir|bercabang|yang mana/i;
const salahBentuk = [];
for (const b of baris) {
  const j = b.conversations[2].value;
  if (b.sumber === 'kias-beku' && PENANDA_CABANG.test(j)) salahBentuk.push([b.id, 'beku tapi mencabang']);
  if (b.sumber === 'kias-cabang' && !PENANDA_CABANG.test(j)) salahBentuk.push([b.id, 'ambigu tapi tidak mencabang']);
}

console.log('# panen-kias — P2 (beku vs hidup) + P3 (cabang sejati)\n');
const per = {};
for (const b of baris) per[b.sumber] = (per[b.sumber] || 0) + 1;
for (const [k, v] of Object.entries(per)) console.log(`  ${k.padEnd(18)} ${v} baris`);
console.log(`  ${'TOTAL'.padEnd(18)} ${baris.length} baris\n`);

console.log('## Penjaga');
console.log(`  pencemaran soal eval : ${tercemar.length === 0 ? 'BERSIH (0)' : `TERCEMAR (${tercemar.length}) — ${JSON.stringify(tercemar.slice(0, 5))}`}`);
console.log(`    (${kutipanEval.length} frasa terlarang dibaca dari eval/uji-kias.mjs: ${kutipanEval.slice(0, 6).join(', ')}…)`);
console.log(`  jawaban kembar       : ${kembar === 0 ? 'nol' : `${kembar} — akan runtuh saat dedup`}`);
console.log(`  bentuk salah jenis   : ${salahBentuk.length === 0 ? 'nol' : JSON.stringify(salahBentuk.slice(0, 5))}`);

const gagal = tercemar.length > 0 || kembar > 0 || salahBentuk.length > 0;
if (gagal) {
  console.error('\nTAHAN — data TIDAK ditulis. Perbaiki penjaga yang merah dulu.');
  process.exit(1);
}
fs.writeFileSync(KELUAR, baris.map((b) => JSON.stringify(b)).join('\n') + '\n', 'utf8');
console.log(`\nSEMUA PENJAGA HIJAU — tertulis: ${KELUAR}`);
