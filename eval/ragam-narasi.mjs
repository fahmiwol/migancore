#!/usr/bin/env node
/**
 * ragam-narasi.mjs — penjaga C13: DATA PADAT TAPI SERAGAM MENGAJARKAN NASKAH,
 * BUKAN OPERASI.
 *
 * ================================= KEJADIANNYA ==============================
 * Data latih memuat 116 baris yang mengajarkan `1 ton = 1.000 kg`, dan NOL baris
 * yang mengajarkan konversi salah. Meski begitu v11 menjawab, dua belas dari dua
 * belas kali:
 *   "Kupecah jadi langkah kecil: 1. Ubah ton ke kg: 19 ton : 10 = 1.900 kg."
 * Kalimat pembukanya adalah templat NOMOR SATU di data latih (20 dari 116
 * baris), kata demi kata. Angkanya ngawur.
 *
 * Jadi yang dipelajari bukan operasinya, melainkan CARA MENCERITAKAN operasinya.
 * Dan kegagalan terberat justru jatuh di operasi yang PALING sering dinarasikan
 * — kepadatan tanpa keragaman bentuk melatih naskah, bukan kemampuan.
 *
 * ================================== UKURANNYA ===============================
 * Untuk tiap operasi: berapa banyak BENTUK PEMBUKA jawaban yang berbeda,
 * dibagi jumlah barisnya. Ambang: minimal 1 bentuk unik per 3 baris. Di bawah
 * itu, keragamannya terlalu tipis dan naskahnya akan menang atas operasinya.
 *
 * Ambangnya bukan angka keramat — ia dipilih supaya keadaan 21 Agu (ton/kg:
 * 48 bentuk untuk 116 baris = 1 per 2,4) LULUS di tingkat operasi, sementara
 * pemusatan yang lebih parah (satu templat menutupi lebih dari sepertiga baris)
 * TETAP DITOLAK lewat pemeriksaan kedua di bawah.
 *
 * Dua pemeriksaan, keduanya harus lulus:
 *   1. rasio bentuk-unik per baris >= 1/3
 *   2. tidak ada SATU templat yang menutupi > 1/3 baris satu operasi
 * Pemeriksaan kedua itu yang menangkap kasus nyata kita: 20+18+16 = 47% baris
 * ton/kg hanya memakai tiga pembuka.
 *
 * Pakai: node ragam-narasi.mjs [korpus.jsonl]
 *        node ragam-narasi.mjs --uji-instrumen
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RASIO_MIN = 1 / 3;
const DOMINASI_MAKS = 1 / 3;
const TIGA_TERATAS_MAKS = 0.40;   // tiga templat teratas tidak boleh menutupi >40% baris
const PANJANG_PEMBUKA = 42;

/** Operasi dikenali dari kata kerja hitungnya di dalam soal ATAU jawaban. */
const OPERASI = [
  /**
   * Pola pertama saya cuma mengenali SATU cara menulis konversi ("ubah ton ke
   * kg"). Sesudah data dirombak dan kalimatnya bervariasi, tidak ada satu pun
   * operasi yang cocok — dan gerbang ini memberi vonis "BERAGAM CUKUP" pada
   * tabel KOSONG. Hijau karena buta adalah kegagalan yang paling berbahaya,
   * karena ia terlihat persis seperti keberhasilan.
   * Sekarang polanya mengenali BENTUK pernyataannya (angka + satuan besar =
   * angka + satuan kecil), bukan satu susunan kata tertentu — dan bila nol
   * operasi terukur, gerbang menolak memberi vonis lulus.
   */
  ['konversi-satuan', /\b\d[\d.]* (ton|kuintal|liter|meter|kg)\b[^\n]{0,20}=[^\n]{0,20}\b[\d.]+ (kg|gram|mililiter|sentimeter)\b/i],
  ['konversi-ton-kg', /ubah ton ke kg|1 ton = 1\.?000 kg|ton menjadi kg/i],
  ['diskon-berantai', /didiskon .* lalu|diskon kedua|dari harga baru/i],
  ['rata-berbobot', /rata-rata gabungan|rata-rata berbobot/i],
  ['persen-dp', /\bDP \d+%|uang muka \d+%/i],
  ['selisih-harga', /selisih (harga|biaya)/i],
];

export function ukurRagam(baris) {
  const hasil = [];
  for (const [nama, pola] of OPERASI) {
    const kena = baris.filter((b) => pola.test(b.teks));
    if (kena.length < 5) continue;             // terlalu sedikit untuk dinilai
    const pembuka = new Map();
    for (const b of kena) {
      const p = String(b.jawab).replace(/\s+/g, ' ').slice(0, PANJANG_PEMBUKA);
      pembuka.set(p, (pembuka.get(p) || 0) + 1);
    }
    /**
     * KOREKSI 21 Agu: ambang pertama saya memakai templat TERBESAR saja, dan
     * itu statistik yang salah. Pada data nyata, templat terbesar cuma 18% —
     * lulus — padahal TIGA templat teratas menutupi 47% baris (20+18+16 dari
     * 116). Pemusatan yang sebenarnya ada di ekor atas, bukan di puncaknya.
     * Jadi yang diukur: pangsa tiga templat teratas.
     */
    const urut = [...pembuka].sort((a, b) => b[1] - a[1]);
    const terbanyak = urut[0][1];
    const tiga = urut.slice(0, 3).reduce((s, x) => s + x[1], 0) / kena.length;
    hasil.push({
      operasi: nama, baris: kena.length, bentuk: pembuka.size,
      rasio: pembuka.size / kena.length,
      dominasi: terbanyak / kena.length,
      tigaTeratas: tiga,
      contohDominan: urut[0],
      // 25 Agu: aturan tiga-teratas DEGENERAT di n<10 — tiga dari enam baris
      // yang SEMUA unik pun = 50% > 40%, mustahil lolos secara matematis
      // (ketahuan saat 79 gold Fahmi menggeser kelas konversi-ton-kg jadi n=6
      // semua-unik dan divonis TIPIS). Pengecualian SEMPIT: aturan tiga-teratas
      // hanya berlaku bila n >= 10 ATAU ada templat yang benar-benar berulang.
      lulus: pembuka.size / kena.length >= RASIO_MIN
             && terbanyak / kena.length <= DOMINASI_MAKS
             && (tiga <= TIGA_TERATAS_MAKS || (kena.length < 10 && terbanyak <= 1)),
    });
  }
  return hasil;
}

if (process.argv.includes('--uji-instrumen')) {
  console.log('# Uji instrumen — ragam-narasi.mjs\n');
  // Ragamnya WAJIB ditaruh di awal kalimat: pengukur memotong 42 huruf pertama,
  // jadi variasi yang diletakkan sesudahnya tidak akan terlihat. Kendali uji
  // pertama saya justru menaruhnya di belakang — dan alat ini menangkapnya.
  const buat = (n, bentukBerbeda, prefiks = null) =>
    Array.from({ length: n }, (_, i) => ({
      teks: 'Ubah ton ke kg lalu kalikan',
      jawab: prefiks
        ? `${prefiks} varian ${i % bentukBerbeda} — angka ${i}`
        : `Bentuk-${i % bentukBerbeda}: ubah ton ke kg lalu kalikan harganya, hasil ${i}`,
    }));
  const kasus = [
    { nama: 'seragam ekstrem (1 bentuk untuk 30 baris) -> WAJIB gagal',
      baris: buat(30, 1, 'Kupecah jadi langkah kecil: 1. Ubah ton ke kg:'), harus: false },
    { nama: 'satu templat menutupi separuh -> WAJIB gagal',
      baris: [...buat(15, 1, 'Kupecah jadi langkah kecil: 1. Ubah ton ke kg:'), ...buat(15, 15)],
      harus: false },
    { nama: 'beragam penuh (30 bentuk untuk 30 baris) -> WAJIB lulus',
      baris: buat(30, 30), harus: true },
    { nama: 'kurang dari 5 baris -> tidak dinilai (tidak muncul di hasil)',
      baris: buat(3, 1, 'Kupecah jadi langkah kecil: 1. Ubah ton ke kg:'), harus: null },
    // 25 Agu: aturan tiga-teratas degenerat di n<10 (3 dari 6 unik-semua = 50%).
    // Dua arah: 6 baris SEMUA unik wajib LULUS; 6 baris dgn templat berulang tetap GAGAL.
    { nama: 'n=6 semua bentuk unik -> WAJIB lulus (pengecualian n-kecil)',
      baris: buat(6, 6), harus: true },
    { nama: 'n=6 tapi satu templat berulang 3x -> tetap GAGAL',
      baris: [...buat(3, 1, 'Kupecah jadi langkah kecil: 1. Ubah ton ke kg:'), ...buat(3, 3)], harus: false },
  ];
  let cacat = 0;
  for (const k of kasus) {
    const r = ukurRagam(k.baris);
    const dapat = r.length === 0 ? null : r[0].lulus;
    const ok = dapat === k.harus;
    if (!ok) cacat++;
    console.log(`  ${ok ? 'OK   ' : 'CACAT'} ${k.nama}`);
    if (!ok) console.log(`         harap ${k.harus} · dapat ${dapat}`);
  }
  console.log(`\n${cacat === 0 ? `SEHAT: ${kasus.length}/${kasus.length}` : `CACAT: ${cacat}`}`);
  process.exit(cacat === 0 ? 0 : 1);
}

// ─────────────────────────────────────────────── pemakaian sungguhan ──
const KORPUS = process.argv[2] || path.join(DIR, '..', 'flywheel', 'dataset', 'migancore-curated.jsonl');
if (!fs.existsSync(KORPUS)) { console.error(`korpus tidak ada: ${KORPUS}`); process.exit(2); }

const baris = [];
for (const l of fs.readFileSync(KORPUS, 'utf8').split(/\r?\n/)) {
  if (!l.trim()) continue;
  try {
    const o = JSON.parse(l);
    const c = o.conversations || [];
    baris.push({ teks: c.map((x) => x.value).join(' '), jawab: (c.find((x) => x.from === 'gpt') || {}).value || '' });
  } catch { /* lewati */ }
}

const hasil = ukurRagam(baris);
console.log(`# Ragam narasi — ${path.basename(KORPUS)} (${baris.length} baris)\n`);
console.log(`  ambang: bentuk unik >= 1 per 3 baris · tidak ada templat > 33% baris\n`);
console.log('| Operasi | baris | bentuk unik | rasio | terbesar | 3 teratas | Vonis |');
console.log('|---|---|---|---|---|---|---|');
for (const h of hasil) {
  console.log(`| ${h.operasi} | ${h.baris} | ${h.bentuk} | 1 per ${(1 / h.rasio).toFixed(1)} | ${(h.dominasi * 100).toFixed(0)}% | ${(h.tigaTeratas * 100).toFixed(0)}% | ${h.lulus ? 'lulus' : '**TIPIS**'} |`);
}
const gagal = hasil.filter((h) => !h.lulus);
if (gagal.length) {
  console.log('\n## Operasi yang narasinya terlalu seragam');
  for (const h of gagal) {
    console.log(`\n  ${h.operasi} — ${h.bentuk} bentuk untuk ${h.baris} baris; templat terbesar ${(h.dominasi * 100).toFixed(0)}%:`);
    console.log(`    "${h.contohDominan[0]}…"  (${h.contohDominan[1]}x)`);
  }
  console.log('\n  Model akan menghafal kerangka kalimat ini dan mengisinya dengan angka');
  console.log('  yang tidak dihitung. Tambah RAGAM BENTUK, bukan tambah jumlah baris.');
}
// Nol operasi terukur BUKAN kelulusan — itu kebutaan. Gerbang yang tidak bisa
// mengukur apa pun tidak boleh memberi izin apa pun.
if (hasil.length === 0) {
  console.log('\n## VONIS: TIDAK BISA DIUKUR — tak satu pun operasi terdeteksi di korpus ini.');
  console.log('   Kemungkinan polanya sudah tidak cocok dengan cara data ditulis sekarang.');
  console.log('   Perbaiki polanya dulu; jangan pernah baca tabel kosong sebagai kabar baik.');
  process.exit(1);
}
console.log(`\n## VONIS: ${gagal.length === 0 ? 'BERAGAM CUKUP' : `TAHAN — ${gagal.length} operasi narasinya terlalu tipis`}`);
process.exit(gagal.length === 0 ? 0 : 1);
