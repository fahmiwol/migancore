#!/usr/bin/env node
/**
 * uji-instrumen-alat.mjs — MEMBUKTIKAN bahwa mengangkat instrumen ke modul
 * bersama tidak mengubah instrumennya.
 *
 * ============================== KENAPA ADA ==================================
 * `instrumen-alat.mjs` lahir dengan menyalin ALAT/SISTEM/AMBANG/tanya keluar
 * dari `uji-alat.mjs`. Sebuah salinan yang meleset satu spasi akan menghasilkan
 * prompt sistem yang berbeda — dan SELURUH 20 pengukuran terdahulu jadi tak
 * sebanding (C29), tanpa satu pun gejala yang terlihat.
 *
 * Jadi kesetaraannya tidak dipercayakan pada mata. Berkas ini mengambil versi
 * uji-alat.mjs dari commit SEBELUM pemisahan, menariknya keluar apa adanya,
 * dan menuntut identik bita-per-bita dengan modul sekarang.
 *
 * Pola yang sama dipakai eval/uji-nilai-alat.mjs waktu aturan vonis dipisah.
 *
 * Pakai: node eval/uji-instrumen-alat.mjs [commit]
 */
'use strict';

import { execFileSync } from 'node:child_process';
import { ALAT, SISTEM, AMBANG } from './instrumen-alat.mjs';

const COMMIT = process.argv[2] || 'f987850';

const lama = execFileSync('git', ['show', `${COMMIT}:eval/uji-alat.mjs`],
  { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** Iris blok definisi dari berkas lama, lalu jalankan sebagai modul data: */
function iris(dari, sampai) {
  const i = lama.indexOf(dari), j = lama.indexOf(sampai);
  if (i < 0 || j < 0 || j <= i) throw new Error(`tidak ketemu: ${dari} .. ${sampai}`);
  return lama.slice(i, j);
}

const blokAlatSistem = iris('const ALAT = [', 'const SOAL = [');
const blokAmbang = iris('const AMBANG = {', '\n(async');

const sumber = blokAlatSistem + blokAmbang + '\nexport { ALAT, SISTEM, AMBANG };';
const lamaMod = await import('data:text/javascript;base64,' + Buffer.from(sumber, 'utf8').toString('base64'));

let ok = 0, buruk = 0;
const cek = (n, c, ket = '') => (c ? (ok++, console.log(`  OK    ${n}`))
  : (buruk++, console.log(`  GAGAL ${n}${ket ? ' — ' + ket : ''}`)));

console.log(`\n# Kesetaraan instrumen — sekarang vs commit ${COMMIT}\n`);

cek('SISTEM identik bita-per-bita', SISTEM === lamaMod.SISTEM,
  `panjang ${SISTEM.length} vs ${lamaMod.SISTEM.length}`);
cek('ALAT identik (JSON persis, urutan termasuk)',
  JSON.stringify(ALAT) === JSON.stringify(lamaMod.ALAT));
cek('AMBANG identik (pecahan, bukan desimal bulat)',
  JSON.stringify(AMBANG) === JSON.stringify(lamaMod.AMBANG));
cek('SISTEM memang memuat kelima alat',
  ALAT.every((a) => SISTEM.includes(a.name)), `${ALAT.length} alat`);
cek('AMBANG punya keenam kategori', Object.keys(AMBANG).length === 6);

console.log('\n' + '='.repeat(52));
console.log(`${ok} lulus · ${buruk} gagal`);
if (buruk) console.log('\nInstrumen BERUBAH saat dipisah. Semua angka lama jadi tak sebanding (C29).');
else console.log('\nInstrumen TIDAK berubah. Petak lama dan petak tahan sebanding.');
process.exit(buruk ? 1 : 0);
