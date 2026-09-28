#!/usr/bin/env node
/**
 * jaga-serving — penjaga untuk lapisan yang paling panas dan paling tidak dijaga:
 * `mcp/` (jalur yang benar-benar menjawab Fahmi).
 *
 * ====================== KENAPA INI HARUS ADA ==============================
 * Audit arsitektur 3 Sep menghitungnya: `sistem/` 8 dari 9 modul punya `--uji`,
 * `flywheel/` 24, `eval/` 30 — dan `mcp/` **NOL**. Lapisan serving diubah tiga kali
 * dalam satu hari (model penjawab, num_ctx, ekstraksi kanon) tanpa satu pun penjaga
 * di `migan periksa`; satu-satunya ujinya (`eval/uji-mcp-gerbang.mjs`) butuh model
 * hidup sehingga tidak pernah ikut pemeriksaan cepat.
 *
 * Dua invarian yang dijaga, keduanya lahir dari kegagalan NYATA:
 *
 * 1. NAMA MODEL TIDAK BOLEH MENYIMPANG DIAM-DIAM dari `models/BERLAKU.json`.
 *    30 Agu: `migancore:0.13` ditulis di empat tempat padahal model berlaku sudah
 *    `0.14` sejak 24 Agu — Pencatat Ajar menginterogasi model yang sudah digantikan,
 *    dan Fahmi yang menemukannya. 3 Sep kelas yang sama ketahuan lagi di tempat yang
 *    lebih mahal: `mcp/server.js` menjawab dengan `0.8-8b` sementara seluruh
 *    pengukuran gerbang memakai `0.14`. Penyimpangan boleh — asal DIAKUI dengan
 *    penanda `beda-dari-BERLAKU: <alasan>` (pola yang sama dengan `tanpa-pin:` di
 *    periksa-pin.mjs), supaya ia jadi keputusan tercatat, bukan sisa yang terlupa.
 *
 * 2. Retrieval tingkat-1 (`mcp/kanon.js`) harus benar-benar membaca Buku Besar.
 *    Kalau BOOK pindah/kosong, ia gagal SENYAP (catch → kanon kosong) dan jawaban
 *    kehilangan sumber kanonik tanpa satu pun pesan — kelas F-034/C33.
 *
 * Pakai: node eval/jaga-serving.mjs [--uji]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const OMIGA_DIR = process.env.OMIGA_DIR || '<memory-dir>';

export function modelBerlaku() {
  return JSON.parse(fs.readFileSync(path.join(AKAR, 'models', 'BERLAKU.json'), 'utf8')).model;
}

/** Nama model `migancore:*` yang ditulis langsung di kode serving, dengan konteksnya. */
export function namaModelDiKode(isi) {
  const keluar = [];
  const baris = isi.split('\n');
  baris.forEach((b, i) => {
    // Hanya baris KODE — komentar & docstring memang sering menyebut model lama
    // sebagai sejarah, dan penjaga yang berisik akan diabaikan orang.
    const kode = b.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/^\s*\*/.test(b)) return;
    for (const m of kode.matchAll(/['"`](migancore:[A-Za-z0-9._-]+)['"`]/g)) {
      // Naik ke atas selama barisnya masih komentar — bukan jendela tetap. Jendela
      // 2 baris ditulis lebih dulu dan langsung salah pada percobaan pertama: alasan
      // yang jujur biasanya panjang (7 baris), dan penjaga yang memaksa alasannya
      // pendek akan mendorong alasan yang buruk.
      const blok = [b];
      for (let k = i - 1; k >= 0 && /^\s*(\/\/|\*|\/\*)/.test(baris[k]); k--) blok.unshift(baris[k]);
      keluar.push({ nama: m[1], baris: i + 1, diakui: /beda-dari-BERLAKU\s*:/i.test(blok.join('\n')) });
    }
  });
  return keluar;
}

export function periksaBerkas(rel, berlaku) {
  const isi = fs.readFileSync(path.join(AKAR, rel), 'utf8');
  const nama = namaModelDiKode(isi);
  return nama
    .filter((n) => n.nama !== berlaku && !n.diakui)
    .map((n) => `${rel}:${n.baris} memakai '${n.nama}' ≠ BERLAKU '${berlaku}' tanpa penanda 'beda-dari-BERLAKU: <alasan>'`);
}

export function periksaKanon() {
  const masalah = [];
  const K = require_(path.join(AKAR, 'mcp', 'kanon.js'));
  const seksi = K.muatKanon(OMIGA_DIR);
  if (!seksi.length) masalah.push(`mcp/kanon.js membaca NOL seksi dari ${OMIGA_DIR}\\BOOK — retrieval tingkat-1 mati senyap`);
  const brief = K.kartuIdentitas(OMIGA_DIR);
  if (!brief || brief.length < 200) masalah.push('BRIEF.md kosong/terlalu pendek — kartu identitas tidak akan menolong jawaban');
  // Pertanyaan yang PASTI punya kanon; kalau nol, penjaga sedang memeriksa udara (C33).
  const uji = K.cariKanon('Siapa Fahmi Ghani dan perusahaan apa yang dia miliki?', 2, OMIGA_DIR);
  if (!uji.length) masalah.push('cariKanon tidak menemukan apa pun untuk pertanyaan identitas — saringan kanon rusak');
  return { masalah, seksi: seksi.length, briefBita: brief ? brief.length : 0 };
}

const BERKAS_SERVING = ['mcp/server.js', 'mcp/kanon.js'];

function uji() {
  let n = 0; const ok = (k, p) => { n++; if (!p) { console.error('GAGAL:', k); process.exit(1); } };
  ok('nama model di baris kode terdeteksi', namaModelDiKode(`const M = 'migancore:0.9';`).length === 1);
  ok('nama model di komentar // diabaikan', namaModelDiKode(`// dulu 'migancore:0.3'`).length === 0);
  ok('nama model di docstring * diabaikan', namaModelDiKode(` * pakai 'migancore:0.3'`).length === 0);
  ok('penanda beda-dari-BERLAKU diakui', namaModelDiKode(`// beda-dari-BERLAKU: lulus gerbang alat\nconst M = 'migancore:0.8-8b';`)[0].diakui === true);
  ok('penanda pada baris yang sama juga diakui', namaModelDiKode(`const M = 'migancore:0.8-8b'; // beda-dari-BERLAKU: alasan`)[0].diakui === true);
  // Kegagalan nyata 3 Sep: jendela 2 baris menolak alasan sepanjang 7 baris.
  ok('penanda di puncak komentar blok panjang tetap terbaca', namaModelDiKode(
    ['// beda-dari-BERLAKU: alasannya panjang', '// baris dua', '// baris tiga', '// baris empat',
      '// baris lima', '// baris enam', '// baris tujuh', `const M = 'migancore:0.8-8b';`].join('\n'))[0].diakui === true);
  ok('komentar blok yang TIDAK memuat penanda tetap ditolak', namaModelDiKode(
    ['// penjelasan panjang', '// tanpa penanda', `const M = 'migancore:0.8-8b';`].join('\n'))[0].diakui === false);
  ok('tanpa penanda tidak diakui', namaModelDiKode(`const M = 'migancore:0.8-8b';`)[0].diakui === false);
  const k = periksaKanon();
  ok('kanon membaca Buku Besar (bukan nol seksi)', k.seksi >= 20);
  ok('BRIEF terbaca', k.briefBita >= 200);
  ok('cariKanon menemukan kanon identitas', k.masalah.length === 0);
  console.log(`jaga-serving: ${n}/${n} uji lulus`);
}

function utama() {
  if (process.argv.includes('--uji')) return uji();
  const berlaku = modelBerlaku();
  const masalah = [];
  for (const f of BERKAS_SERVING) masalah.push(...periksaBerkas(f, berlaku));
  const k = periksaKanon();
  masalah.push(...k.masalah);
  if (masalah.length) {
    for (const m of masalah) console.log(`GAGAL: ${m}`);
    process.exit(1);
  }
  console.log(`OK: serving selaras BERLAKU '${berlaku}' · kanon ${k.seksi} seksi · BRIEF ${k.briefBita} bita`);
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) utama();
