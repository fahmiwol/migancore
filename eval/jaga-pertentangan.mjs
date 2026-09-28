#!/usr/bin/env node
/**
 * jaga-pertentangan.mjs — mencari DUA BARIS GOLD YANG SALING BERTENTANGAN.
 *
 * ============================== KENAPA ADA ==================================
 * Seluruh gerbang kami memeriksa tiap baris SENDIRI-SENDIRI. Tidak satu pun
 * pernah bertanya: apakah baris ini bertentangan dengan baris lain di korpus?
 *
 * Lubang itu ketahuan 30 Agu pada gold tulisan tangan Fahmi sendiri:
 *
 *   "Apa fungsi kode OTP?"
 *      -> "...jika terbaca, TIDAK BISA DIGUNAKAN lagi - membuatnya sangat aman."
 *   "Mengapa OTP tidak boleh diberikan?"
 *      -> "...OTP DAPAT DIGUNAKAN untuk melewati verifikasi saat kode masih berlaku."
 *
 * Yang kedua benar; yang pertama keliru, dan justru itulah alasan seluruh
 * penipuan OTP berhasil. Kalau keduanya masuk data latih, model belajar
 * kontradiksi — dan tidak ada penjaga yang akan menangkapnya.
 *
 * ChatGPT menyebutnya "Gate 3 — Contradiction" (dibaca 30 Agu). Kami memang
 * belum punya. Ini dia.
 *
 * ======================= INI PENCURIGA, BUKAN HAKIM =========================
 * Mendeteksi kontradiksi secara umum itu masalah terbuka. Berkas ini TIDAK
 * mencoba menyelesaikannya. Ia mencari satu pola yang SEMPIT dan bisa dihitung:
 *
 *     subjek yang sama + kata kerja yang sama + POLARITAS BERLAWANAN
 *
 * Ia dibangun BOLEH DIAM — persis seperti ajar/pengusul.mjs. Melewatkan
 * kontradiksi jauh lebih murah daripada menuduh gold yang sehat, karena tuduhan
 * palsu membuat penjaganya diabaikan, dan penjaga yang diabaikan sama dengan
 * tidak ada.
 *
 * Pakai: node eval/jaga-pertentangan.mjs [cluster]
 *        node eval/jaga-pertentangan.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.dirname(DIR);

/** Kata yang terlalu umum untuk dipakai sebagai penanda subjek bersama. */
const UMUM = new Set(['yang', 'untuk', 'dengan', 'tidak', 'bisa', 'dapat', 'pada', 'dari', 'akan',
  'atau', 'dan', 'itu', 'ini', 'kamu', 'saya', 'aku', 'anda', 'kalau', 'jika', 'karena', 'sebagai',
  'agar', 'oleh', 'juga', 'lebih', 'harus', 'sudah', 'belum', 'masih', 'hanya', 'saja', 'bukan',
  'adalah', 'dalam', 'kepada', 'tersebut', 'sebaiknya', 'digunakan', 'menggunakan', 'melakukan']);

/** Istilah yang menandai satu topik teknis — cukup jarang untuk mengikat dua baris. */
export function istilah(teks) {
  const out = new Set();
  for (const w of String(teks).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (w.length >= 3 && !UMUM.has(w)) out.add(w);
  }
  return out;
}

/**
 * Klaim bermodal: (polaritas, kata kerja). Contoh:
 *   "tidak bisa digunakan"  -> { negatif: true,  kerja: 'digunakan' }
 *   "dapat digunakan"       -> { negatif: false, kerja: 'digunakan' }
 */
export function klaim(teks) {
  const out = [];
  const re = /(tidak\s+(?:pernah\s+)?(?:bisa|dapat)|tidak\s+pernah|bisa|dapat|boleh|tidak\s+boleh)\s+([a-z]{4,})/gi;
  let m;
  while ((m = re.exec(String(teks).toLowerCase())) !== null) {
    out.push({ negatif: /tidak/.test(m[1]), kerja: m[2] });
  }
  return out;
}

/**
 * Dua baris DICURIGAI bertentangan kalau:
 *   1. berbagi >= `minIstilah` istilah teknis (topiknya sama), DAN
 *   2. memuat kata kerja yang sama dengan polaritas berlawanan.
 */
export function curiga(a, b, { minIstilah = 1, kunciTopik = null } = {}) {
  const ia = istilah(a), ib = istilah(b);
  let bersama = [...ia].filter((x) => ib.has(x));
  if (kunciTopik) bersama = bersama.filter((x) => kunciTopik.has(x));
  if (bersama.length < minIstilah) return null;

  const ka = klaim(a), kb = klaim(b);
  for (const x of ka) {
    for (const y of kb) {
      if (x.kerja === y.kerja && x.negatif !== y.negatif) {
        return { kerja: x.kerja, topik: bersama.slice(0, 4), aNegatif: x.negatif };
      }
    }
  }
  return null;
}

function muat(cluster) {
  const f = path.join(AKAR, 'flywheel', 'dataset', 'ajar', `${cluster}.jsonl`);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((x) => JSON.parse(x))
    .map((r) => ({
      id: r.id,
      tanya: r.conversations.find((c) => c.from === 'human')?.value ?? '',
      jawab: r.conversations.find((c) => c.from === 'gpt')?.value ?? '',
    }));
}

/**
 * Istilah yang JARANG di korpus = penanda topik yang bisa dipercaya. Kata yang
 * muncul di lebih dari sepertiga baris terlalu umum untuk mengikat apa pun.
 */
export function topikJarang(baris) {
  const hitung = new Map();
  for (const r of baris) for (const w of istilah(r.tanya + ' ' + r.jawab)) hitung.set(w, (hitung.get(w) || 0) + 1);
  const batas = Math.max(2, Math.ceil(baris.length / 3));
  return new Set([...hitung.entries()].filter(([, n]) => n >= 2 && n <= batas).map(([w]) => w));
}

// ─────────────────────────────────────────────────────────── uji instrumen ──
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('jaga-pertentangan.mjs')
    && process.argv.includes('--uji')) {
  let ok = 0, buruk = 0;
  const cek = (n, c, ket = '') => (c ? (ok++, console.log(`  OK    ${n}`))
    : (buruk++, console.log(`  GAGAL ${n}${ket ? ' — ' + ket : ''}`)));

  // KENDALI POSITIF: kasus NYATA yang melahirkan berkas ini.
  const otpSalah = 'Kode OTP berfungsi sebagai autentikasi. Kode ini tidak pernah disimpan, dan jika terbaca, tidak bisa digunakan lagi sehingga sangat aman.';
  const otpBenar = 'Karena OTP dapat digunakan untuk melewati tahap verifikasi tertentu pada saat kode tersebut masih berlaku.';
  const c = curiga(otpSalah, otpBenar);
  cek('KENDALI POSITIF: kontradiksi OTP nyata TERTANGKAP', !!c, JSON.stringify(c));
  cek('  ...dan menyebut kata kerjanya', c && c.kerja === 'digunakan');

  // KENDALI NEGATIF — yang TIDAK boleh dituduh.
  cek('dua jawaban sehat setopik TIDAK dituduh',
    !curiga('PIN berfungsi sebagai kode pengaman rekening.',
            'PIN sebaiknya tidak dibagikan lewat pesan biasa karena bisa diteruskan.'));
  cek('topik berbeda TIDAK dituduh meski polaritas berlawanan',
    !curiga('Token API tidak bisa dibagikan.', 'Briket tempurung dapat dibakar lebih lama.'));
  cek('kalimat yang sama dengan dirinya TIDAK dituduh',
    !curiga(otpBenar, otpBenar));
  cek('penolakan vs penjelasan (pasangan kontras SEHAT) tidak dituduh',
    !curiga('Saya tidak bisa memberikan PIN rekening perusahaan.',
            'PIN berfungsi memastikan hanya pemilik rekening yang dapat mengaksesnya.'),
    JSON.stringify(curiga('Saya tidak bisa memberikan PIN rekening perusahaan.',
            'PIN berfungsi memastikan hanya pemilik rekening yang dapat mengaksesnya.')));

  // fungsi dasar
  cek('klaim(): menangkap negatif', klaim('tidak bisa digunakan').some((x) => x.negatif && x.kerja === 'digunakan'));
  cek('klaim(): menangkap positif', klaim('dapat digunakan').some((x) => !x.negatif && x.kerja === 'digunakan'));
  cek('istilah(): membuang kata umum', !istilah('yang untuk dengan tidak').size);
  cek('istilah(): menyimpan istilah teknis', istilah('kode OTP berlaku').has('otp'));

  console.log('\n' + '='.repeat(56));
  console.log(`${ok} lulus · ${buruk} gagal`);
  process.exit(buruk ? 1 : 0);
}

// ───────────────────────────────────────────────────────────────── jalan ──
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('jaga-pertentangan.mjs')) {
  const cluster = process.argv[2] || 'gaya';
  const baris = muat(cluster);
  if (!baris.length) { console.log(`\n  (${cluster}.jsonl kosong atau tidak ada)\n`); process.exit(0); }

  const kunci = topikJarang(baris);
  console.log(`\n# Jaga pertentangan — cluster ${cluster}, ${baris.length} baris\n`);
  console.log(`  Ini PENCURIGA, bukan hakim. Ia mencari satu pola sempit: subjek sama,`);
  console.log(`  kata kerja sama, polaritas berlawanan. Ia sengaja BOLEH DIAM.\n`);

  let n = 0;
  for (let i = 0; i < baris.length; i++) {
    for (let j = i + 1; j < baris.length; j++) {
      const c = curiga(baris[i].jawab, baris[j].jawab, { kunciTopik: kunci });
      if (!c) continue;
      n++;
      console.log(`  ⚠ DICURIGAI — kata kerja "${c.kerja}", topik: ${c.topik.join(', ')}`);
      console.log(`     [${baris[i].id}] ${baris[i].tanya}`);
      console.log(`        ${baris[i].jawab.replace(/\s+/g, ' ').slice(0, 150)}`);
      console.log(`     [${baris[j].id}] ${baris[j].tanya}`);
      console.log(`        ${baris[j].jawab.replace(/\s+/g, ' ').slice(0, 150)}\n`);
    }
  }
  console.log(n ? `  ${n} pasangan dicurigai — PERIKSA TANGAN, jangan hapus otomatis.\n`
                : '  Tidak ada pasangan yang dicurigai bertentangan.\n');
}
