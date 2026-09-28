#!/usr/bin/env node
/**
 * bersihkan-pencemaran.mjs — MEMBUANG baris latih yang memuat soal gerbang eval.
 *
 * ============================ DUA OBAT, DUA SEBAB ===========================
 * Pencemaran punya dua bentuk, dan obatnya BERBEDA. Memakai obat yang salah
 * merusak hal lain:
 *
 *   (a) SOALNYA yang bocor — kalimat soal gerbang ikut tertulis di data latih
 *       karena keduanya lahir dari templat yang sama.
 *       Obat: BUANG baris latihnya. Murah (1,6% baris), dan soal gerbang tetap
 *       utuh — jadi seluruh baseline lama masih sah dibandingkan.
 *
 *   (b) KUNCI JAWABANNYA yang bocor — soalnya beda kalimat, tapi angka
 *       jawabannya ada di data latih. Ini terjadi pada harga bisnis yang MEMANG
 *       harus diketahui model (Rp14.500/kg -> 12 ton = Rp174.000.000).
 *       Obat: JANGAN buang barisnya — itu pengetahuan yang sah. Yang diganti
 *       SOALNYA (lihat eval/susun-soal-bersih.mjs). Harganya: baseline
 *       aritmetika lama batal dan harus diukur ulang.
 *
 * Berkas ini mengerjakan (a) saja. Membuang baris harga demi (b) akan membuat
 * model bodoh soal harga — menukar satu masalah dengan masalah yang lebih besar.
 *
 * Pakai: node bersihkan-pencemaran.mjs [--terapkan]
 *        tanpa --terapkan hanya melaporkan (kering), tidak menyentuh berkas.
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DIR, '..');
const LAPORAN = path.join(AKAR, 'eval', 'laporan-pencemaran.json');
const DATA = path.join(DIR, 'dataset', 'migancore-curated.jsonl');
const TERAPKAN = process.argv.includes('--terapkan');

// Laporan harus SEGAR — memakai laporan basi berarti membuang baris yang salah.
console.log('# Bersihkan pencemaran\n');
process.stdout.write('  memindai ulang (laporan basi = baris salah yang dibuang) … ');
// Pemindai keluar dengan kode 1 justru KETIKA menemukan pencemaran — itu keadaan
// yang normal di sini, bukan kegagalan. Tanpa try/catch, alat pembersih ini mati
// persis pada saat ia paling dibutuhkan.
try { execFileSync(process.execPath, [path.join(AKAR, 'eval', 'periksa-pencemaran.mjs')], { stdio: 'pipe' }); }
catch { /* kode 1 = ada temuan; laporannya tetap ditulis */ }
console.log('selesai');

const lap = JSON.parse(fs.readFileSync(LAPORAN, 'utf8'));
const buang = new Set();
for (const t of lap.tingkat2) for (const b of (t.baris || [])) buang.add(b);
for (const t of lap.tingkat3) if (t.baris) buang.add(t.baris);

const semua = fs.readFileSync(DATA, 'utf8').split(/\r?\n/).filter((l) => l.trim());
const simpan = [], dibuang = [];
for (const l of semua) {
  let o; try { o = JSON.parse(l); } catch { simpan.push(l); continue; }
  (buang.has(o.id) ? dibuang : simpan).push(buang.has(o.id) ? o : l);
}

console.log(`\n  baris awal   : ${semua.length}`);
console.log(`  dibuang      : ${dibuang.length} (${(dibuang.length / semua.length * 100).toFixed(1)}%)`);
console.log(`  tersisa      : ${simpan.length}`);

const perSumber = {};
for (const o of dibuang) perSumber[o.sumber || '?'] = (perSumber[o.sumber || '?'] || 0) + 1;
console.log('\n  yang dibuang, menurut sumbernya:');
for (const [s, n] of Object.entries(perSumber).sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(3)}  ${s}`);

console.log('\n  contoh baris yang dibuang:');
for (const o of dibuang.slice(0, 3)) {
  const t = (o.conversations || []).find((c) => c.from === 'human');
  console.log(`    [${o.sumber}] ${String(t?.value || '').replace(/\s+/g, ' ').slice(0, 110)}`);
}

if (!TERAPKAN) {
  console.log('\n  (jalan kering — tidak ada berkas disentuh. Tambahkan --terapkan untuk membuang.)');
  process.exit(0);
}

const cadangan = DATA.replace('.jsonl', `-sebelum-bersih.jsonl`);
if (!fs.existsSync(cadangan)) fs.copyFileSync(DATA, cadangan);
fs.writeFileSync(DATA, simpan.join('\n') + '\n', 'utf8');
console.log(`\n  cadangan   : ${path.basename(cadangan)}`);
console.log(`  ditulis    : ${path.basename(DATA)} (${simpan.length} baris)`);

// ── VERIFIKASI: pindai ulang. Perbaikan yang tidak diperiksa bukan perbaikan. ──
process.stdout.write('\n  memindai ulang untuk membuktikan bersih … ');
let keluar = 0, keluaran = '';
try { keluaran = execFileSync(process.execPath, [path.join(AKAR, 'eval', 'periksa-pencemaran.mjs')], { encoding: 'utf8' }); }
catch (e) { keluar = e.status ?? 1; keluaran = String(e.stdout || ''); }
const vonis = keluaran.split('\n').find((l) => l.includes('VONIS:')) || '(tak terbaca)';
console.log('selesai');
console.log(`  ${vonis.trim()}`);
process.exit(keluar);
