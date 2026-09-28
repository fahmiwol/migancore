#!/usr/bin/env node
/**
 * jaga-repo.mjs — penjaga untuk cacat C11: `git add -A` menelan biner.
 *
 * 21 Agu 2026 satu commit memuat 2.032 MB DLL CUDA dan zip stable-diffusion,
 * ketahuan sebelum push. Kalau lolos, push gagal (batas GitHub 100 MB) dan
 * repo tercemar permanen — sejarahnya tidak bisa dibersihkan tanpa menulis
 * ulang seluruh riwayat.
 *
 * Penjaga ini memeriksa dua hal:
 *   1. tidak ada berkas TERLACAK yang lebih besar dari batas,
 *   2. tidak ada berkas BESAR yang belum terlacak dan juga belum diabaikan —
 *      itu ranjau yang menunggu `git add -A` berikutnya.
 *
 * Pakai: node jaga-repo.mjs [batasMB=25]
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AKAR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATAS_MB = Number(process.argv[2]) || 25;
const BATAS = BATAS_MB * 1024 * 1024;

const git = (...a) => execFileSync('git', a, { cwd: AKAR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const mb = (b) => (b / 1048576).toFixed(1) + ' MB';

console.log(`# Jaga repo — batas ${BATAS_MB} MB per berkas\n`);
let masalah = 0;

// 1. berkas terlacak yang kelewat besar
// 2 Sep: dulu DUA proses git per berkas terlacak (rev-parse + cat-file) — ribuan
// proses, >2 menit, dan `migan periksa` tersangkut di sini saat mesin sibuk.
// `ls-tree -r -l HEAD` memberi ukuran semua blob dalam SATU panggilan.
const besarTerlacak = [];
for (const baris of git('ls-tree', '-r', '-l', '-z', 'HEAD').split('\0').filter(Boolean)) {
  // bentuk: "<mode> <type> <hash> <size>\t<path>"
  const tab = baris.indexOf('\t');
  const meta = baris.slice(0, tab).trim().split(/\s+/);
  const ukuran = Number(meta[3]);
  if (Number.isFinite(ukuran) && ukuran > BATAS) besarTerlacak.push([baris.slice(tab + 1), ukuran]);
}
console.log('## Berkas TERLACAK yang kelewat besar');
if (!besarTerlacak.length) console.log('  bersih');
else { masalah += besarTerlacak.length; for (const [f, u] of besarTerlacak.sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${mb(u).padStart(10)}  ${f}`); }

// 2. ranjau: berkas besar yang belum terlacak DAN belum diabaikan
const belum = git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
const ranjau = [];
for (const f of belum) {
  // 2 Sep: dulu satu proses node per berkas hanya untuk statSync — diganti stat langsung.
  try {
    const ukuran = fs.statSync(path.join(AKAR, f)).size;
    if (ukuran > BATAS) ranjau.push([f, ukuran]);
  } catch { /* tak terbaca */ }
}
console.log('\n## RANJAU — besar, belum terlacak, belum diabaikan');
console.log('   (ini yang akan ditelan `git add -A` berikutnya)');
if (!ranjau.length) console.log('  bersih');
else { masalah += ranjau.length; for (const [f, u] of ranjau.sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${mb(u).padStart(10)}  ${f}`); }

console.log(`\n## VONIS: ${masalah === 0 ? 'BERSIH' : `TAHAN — ${masalah} berkas. Tambahkan ke .gitignore sebelum commit berikutnya.`}`);
process.exit(masalah === 0 ? 0 : 1);
