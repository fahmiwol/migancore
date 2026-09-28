#!/usr/bin/env node
/**
 * susun-soal-bersih.mjs — MENYUSUN SOAL GERBANG VETO YANG TIDAK BISA DIHAFAL.
 *
 * ================================ MASALAHNYA ================================
 * `periksa-pencemaran.mjs` menemukan 3 dari 6 kunci jawaban gerbang aritmetika
 * ADA DI DATA LATIH:
 *   174.000.000  (1 baris)  <- "12 ton x Rp14.500/kg"
 *   240.000.000  (2 baris)  <- "8 ton x Rp30.000/kg"
 *    31.200.000  (3 baris)  <- "6 ton x Rp13.000/kg, DP 40%"
 * Artinya model kami bisa menyebut angka yang benar TANPA menghitung. Bukti
 * langsungnya ada di jawaban v11 sendiri:
 *   "12 ton : 10 = 1.200 kg. 1.200 x 14.500 = Rp174.000.000."
 * Dua langkahnya salah, hasilnya tepat. Itu bukan berhitung, itu mengingat.
 *
 * Model pembanding `0.4-qwen3` tidak pernah melihat data kami, jadi ia TIDAK
 * punya keuntungan itu. Selisih yang kami ukur selama ini berarti BATAS BAWAH
 * kerusakan — yang sebenarnya lebih buruk.
 *
 * ================================= CARANYA ==================================
 * Soal tidak lagi diketik tangan. Ia disusun dari kombinasi angka, kuncinya
 * dihitung program, lalu SETIAP calon diadu dengan korpus latih:
 *   - kunci jawabannya muncul di data latih?      -> BUANG
 *   - potongan 8 kata soalnya muncul di latih?     -> BUANG
 *   - angka-angka soalnya muncul bersamaan?        -> BUANG
 * Yang lolos ketiganya baru boleh jadi soal.
 *
 * Sifat penting: bisa disusun ULANG kapan pun data latih berubah. Gerbang yang
 * ditulis sekali lalu dibiarkan akan tercemar lagi diam-diam saat data tumbuh.
 *
 * Pakai: node susun-soal-bersih.mjs [korpus.jsonl]
 * Keluaran: soal-aritmetika-bersih.json  (dibaca uji-aritmetika.mjs)
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const KORPUS = process.argv[2] || path.join(DIR, '..', 'flywheel', 'dataset', 'migancore-curated.jsonl');

// ─────────────────────────────────────────────── korpus latih ──
function muatKorpusBaris(p) {
  const berkas = fs.statSync(p).isDirectory()
    ? fs.readdirSync(p).filter((x) => x.endsWith('.jsonl')).map((x) => path.join(p, x))
    : [p];
  const baris = [];
  for (const b of berkas) {
    for (const l of fs.readFileSync(b, 'utf8').split(/\r?\n/)) {
      if (!l.trim()) continue;
      try { baris.push((JSON.parse(l).conversations || []).map((c) => c.value).join(' ')); } catch { /* lewati */ }
    }
  }
  return baris;
}
const korpusBaris = muatKorpusBaris(KORPUS);
const korpusBarisAngka = korpusBaris.map((b) => b.replace(/[.,]/g, ''));
const korpusAngka = korpusBarisAngka.join('\n');           // 174.000.000 -> 174000000
const rapikan = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const korpusKata = rapikan(korpusBaris.join('\n'));

/**
 * Kunci KECIL (mis. rata-rata = 76) selalu "ditemukan" di korpus mana pun —
 * dua digit itu muncul di dalam angka lain. Memakai pencocokan mentah untuk
 * kunci kecil akan menolak SEMUA calon, dan itulah yang terjadi pada percobaan
 * pertama berkas ini: jenis "rata-berbobot" habis, nol calon lolos.
 *
 * Jadi ambangnya dibedakan:
 *   kunci >= 1000  -> cukup khas, pencocokan langsung sudah bermakna
 *   kunci  < 1000  -> hanya dianggap bocor bila SATU baris latih memuat kunci
 *                     DAN semua angka soalnya sekaligus. Itu baru hafalan.
 */
const kunciBocor = (n, angkaSoal = []) => {
  const k = String(Math.round(n));
  if (n >= 1000) return korpusAngka.includes(k);
  return korpusBarisAngka.some((b) => b.includes(k) && angkaSoal.every((a) => b.includes(String(a))));
};
function soalBocor(t) {
  const k = rapikan(t).split(' ');
  for (let i = 0; i + 8 <= k.length; i++) if (korpusKata.includes(k.slice(i, i + 8).join(' '))) return true;
  return false;
}

// ─────────────────────────────────────── pabrik calon soal ──
const rp = (n) => 'Rp' + n.toLocaleString('id-ID');
const CALON = [];

// (1) ton x harga per kg — mengukur konversi satuan + perkalian besar
for (const ton of [7, 9, 11, 13, 14, 16, 17, 19, 21, 23, 26, 29, 31, 34, 37]) {
  for (const harga of [11500, 12500, 15500, 16500, 17500, 21000, 22500, 26500, 28500, 31500]) {
    CALON.push({ jenis: 'ton-harga',
      soal: `${ton} ton x ${rp(harga)}/kg, berapa total?`,
      kunci: ton * 1000 * harga,
      hitung: `${ton} * 1000 * ${harga}` });
  }
}
// (2) diskon berantai — mengukur bahwa diskon kedua dihitung dari harga BARU
for (const awal of [280000, 320000, 360000, 440000, 520000, 610000, 740000, 860000]) {
  for (const [d1, d2] of [[20, 15], [25, 10], [30, 20], [15, 25], [35, 10]]) {
    const k = awal * (1 - d1 / 100) * (1 - d2 / 100);
    if (!Number.isInteger(k)) continue;
    CALON.push({ jenis: 'diskon-berantai',
      soal: `${rp(awal)} didiskon ${d1}%, lalu didiskon ${d2}% lagi dari harga baru. Berapa harga akhirnya?`,
      kunci: k, hitung: `${awal} * ${1 - d1 / 100} * ${1 - d2 / 100}` });
  }
}
// (3) rata-rata berbobot — jebakan klasik: merata-ratakan dua rata-rata
for (const [n1, v1, n2, v2] of [[3, 40, 27, 80], [6, 55, 14, 90], [8, 35, 12, 85],
                                 [5, 48, 45, 76], [9, 62, 21, 92], [7, 30, 13, 95]]) {
  const k = (n1 * v1 + n2 * v2) / (n1 + n2);
  if (!Number.isInteger(k)) continue;
  CALON.push({ jenis: 'rata-berbobot',
    soal: `${n1} orang rata-rata ${v1}, dan ${n2} orang rata-rata ${v2}. Berapa rata-rata gabungannya?`,
    kunci: k, hitung: `(${n1}*${v1} + ${n2}*${v2}) / ${n1 + n2}` });
}
// (4) DP persen dari total — dua langkah beruntun
for (const ton of [8, 12, 14, 18, 22, 27]) {
  for (const harga of [11500, 15500, 17500, 22500]) {
    for (const dp of [25, 35, 45, 60]) {
      const k = ton * 1000 * harga * dp / 100;
      if (!Number.isInteger(k)) continue;
      CALON.push({ jenis: 'dp-persen',
        soal: `${ton} ton x ${rp(harga)}/kg. Berapa DP ${dp}% dari totalnya?`,
        kunci: k, hitung: `${ton}*1000*${harga}*${dp}/100` });
    }
  }
}
// (5) selisih dua produk — mengukur ketelitian membaca dua angka
for (const [a, b] of [[26500, 17500], [31500, 12500], [28500, 15500], [22500, 11500]]) {
  for (const kg of [1400, 2600, 3800]) {
    CALON.push({ jenis: 'selisih-kali',
      soal: `Harga A ${rp(a)}/kg dan harga B ${rp(b)}/kg. Berapa selisih biaya untuk ${kg} kg?`,
      kunci: (a - b) * kg, hitung: `(${a}-${b})*${kg}` });
  }
}

// ─────────────────────────────────────── saring & pilih ──
const angkaDari = (s) => (String(s).replace(/[.,]/g, '').match(/\d+/g) || []).filter((x) => x.length >= 2);
const lolos = [], ditolak = { kunci: 0, soal: 0 };
for (const c of CALON) {
  if (kunciBocor(c.kunci, angkaDari(c.soal))) { ditolak.kunci++; continue; }
  if (soalBocor(c.soal)) { ditolak.soal++; continue; }
  lolos.push(c);
}
// satu soal per jenis, dipilih tetap (indeks tengah) supaya hasilnya dapat diulang
const JENIS = ['ton-harga', 'diskon-berantai', 'rata-berbobot', 'dp-persen', 'selisih-kali'];
const terpilih = [];
for (const j of JENIS) {
  const kel = lolos.filter((c) => c.jenis === j);
  if (!kel.length) { console.error(`TIDAK ADA calon bersih untuk jenis "${j}" — longgarkan pabriknya.`); process.exit(1); }
  terpilih.push(kel[Math.floor(kel.length / 2)]);
  if (kel.length > 1) terpilih.push(kel[Math.floor(kel.length / 3)]);   // dua per jenis
}

// ───────────────── periksa silang: kunci dihitung ULANG oleh program ──
// Kunci tidak boleh dipercaya hanya karena saya yang menuliskannya.
let cacatKunci = 0;
for (const t of terpilih) {
  const ulang = Function(`"use strict"; return (${t.hitung});`)();
  if (Math.abs(ulang - t.kunci) > 0.01) { cacatKunci++; console.error(`CACAT kunci: ${t.soal} — ${t.kunci} vs hitung ulang ${ulang}`); }
}

console.log('# Susun soal aritmetika BERSIH\n');
console.log(`  korpus     : ${KORPUS}`);
console.log(`  calon      : ${CALON.length}`);
console.log(`  ditolak    : ${ditolak.kunci} (kunci ada di latih) + ${ditolak.soal} (kalimat soal ada di latih)`);
console.log(`  lolos      : ${lolos.length}`);
console.log(`  terpilih   : ${terpilih.length} (${JENIS.length} jenis x 2)`);
console.log(`  silang kunci: ${cacatKunci === 0 ? 'semua cocok dengan hitungan ulang program' : `${cacatKunci} CACAT`}\n`);
for (const t of terpilih) console.log(`  [${t.jenis.padEnd(16)}] ${t.soal}\n${' '.repeat(21)}-> ${t.kunci.toLocaleString('id-ID')}`);

if (cacatKunci) { console.error('\nTAHAN — kunci tidak konsisten.'); process.exit(1); }

// periksa ulang: benar-benar tidak ada satu pun kunci terpilih yang bocor
const sisaBocor = terpilih.filter((t) => kunciBocor(t.kunci, angkaDari(t.soal)));
if (sisaBocor.length) { console.error(`\nTAHAN — ${sisaBocor.length} kunci terpilih masih bocor.`); process.exit(1); }

const keluar = path.join(DIR, 'soal-aritmetika-bersih.json');
fs.writeFileSync(keluar, JSON.stringify({
  korpus: path.basename(KORPUS), disusun: 'susun-soal-bersih.mjs',
  catatan: 'Soal & kunci diverifikasi TIDAK ada di korpus latih. Susun ulang setiap kali data latih berubah.',
  soal: terpilih.map((t) => ({ soal: t.soal, kunci: t.kunci, jenis: t.jenis, hitung: t.hitung })),
}, null, 2), 'utf8');
console.log(`\nSEMUA PENJAGA HIJAU — tertulis: ${path.basename(keluar)}`);
