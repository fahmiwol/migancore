#!/usr/bin/env node
/**
 * periksa-alat.mjs — PEMERIKSAAN PRA-TERBANG untuk seluruh perkakas eval.
 *
 * ============================== KENAPA INI ADA ==============================
 * 21 Agu 2026, saya merapikan `ulang-gerbang.mjs` **sementara sebuah rantai
 * pengukuran sedang memakainya.** Penggantinya cacat sintaks. Akibatnya:
 *   - dua gerbang pertama (alat, kias) selesai memakai berkas LAMA — hasil sah,
 *   - gerbang ketiga (kelemahan) memakai berkas BARU yang rusak — mati,
 *   - dan rantainya tetap keluar dengan kode 0, jadi kelihatan "selesai".
 * Satu jam pengukuran hilang, dan yang lebih buruk: laporannya bisa terbaca
 * seolah gerbang ketiga tidak punya masalah, padahal ia tidak pernah jalan.
 *
 * Dua pelajaran, dua penjaga:
 *   1. JANGAN menyunting alat yang sedang dipakai. (aturan, bukan kode)
 *   2. Periksa sintaks + uji-instrumen SEBELUM menjalankan pengukuran panjang.
 *      (kode — berkas ini; 2 detik, menghemat berjam-jam)
 *
 * Pakai: node periksa-alat.mjs
 * Keluar 1 bila ada yang cacat — cocok dipasang di depan rantai pengukuran.
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const berkas = fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs')).sort();

console.log('# Pemeriksaan pra-terbang perkakas eval\n');
let cacat = 0;

console.log('## 1. Sintaks — setiap berkas harus bisa diurai');
for (const f of berkas) {
  try {
    execFileSync(process.execPath, ['--check', path.join(DIR, f)], { stdio: 'pipe' });
    console.log(`  OK    ${f}`);
  } catch (e) {
    cacat++;
    const pesan = String(e.stderr || e.stdout || e.message).split('\n').find((x) => /Error|error/.test(x)) || 'gagal diurai';
    console.log(`  CACAT ${f} — ${pesan.trim()}`);
  }
}

// Berkas yang punya mode uji-instrumen sendiri: jalankan semuanya.
// Syaratnya BUKAN sekadar menyebut '--uji-instrumen' di mana pun (komentar pun
// akan cocok, dan berkas ini sendiri akan memanggil dirinya sendiri tanpa henti).
// Yang dicari: penjaga argumen yang benar-benar ada di kode.
const AKU = path.basename(fileURLToPath(import.meta.url));
const punyaUjiSendiri = berkas.filter((f) => {
  if (f === AKU) return false;
  try {
    return /process\.argv\.includes\(\s*['"]--uji-instrumen['"]\s*\)/
      .test(fs.readFileSync(path.join(DIR, f), 'utf8'));
  } catch { return false; }
});

console.log('\n## 2. Uji instrumen — alat ukur yang menguji dirinya sendiri');
if (!punyaUjiSendiri.length) console.log('  (tidak ada)');
for (const f of punyaUjiSendiri) {
  try {
    const keluar = execFileSync(process.execPath, [path.join(DIR, f), '--uji-instrumen'],
      { encoding: 'utf8', timeout: 5 * 60 * 1000 });
    const akhir = keluar.trim().split('\n').pop();
    console.log(`  OK    ${f} — ${akhir}`);
  } catch (e) {
    cacat++;
    const keluar = String(e.stdout || '') + String(e.stderr || '');
    const barisCacat = keluar.split('\n').filter((x) => /CACAT/.test(x)).slice(0, 3);
    console.log(`  CACAT ${f}`);
    for (const b of barisCacat) console.log(`        ${b.trim()}`);
  }
}

console.log(`\n${cacat === 0 ? 'SIAP TERBANG — semua perkakas sehat.' : `TAHAN — ${cacat} masalah. Perbaiki dulu sebelum mengukur apa pun.`}`);
process.exit(cacat === 0 ? 0 : 1);
