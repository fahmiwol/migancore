#!/usr/bin/env node
/**
 * hitung-ulang-v13-berpasangan.mjs — koreksi C19 atas klaim statistik SANAD-13.
 *
 * SANAD-migancore-13.json (22 Agu) menulis: "v13 vs v11-asli p<0.0001 BEDA NYATA
 * · ton 0/12->12/12 p<0.0001 · v13 vs v11-produksi p=0.0573 · v13 vs base
 * p=0.4958". Semua dihitung Fisher atas 60 percobaan gabungan (10 soal x 2 suhu
 * x 3 ulangan) — pseudo-replikasi. Berkas ini menghitung ulang dengan satuan
 * yang sah (SOAL, berpasangan, McNemar eksak) dari berkas hasil yang SAMA.
 *
 * Pakai: node hitung-ulang-v13-berpasangan.mjs   (cetak tabel + JSON baris akhir)
 */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fisher, vonisBerpasangan, pasangkanPerSoal } from './statistik.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const baca = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

// lengan "dengan": v11-asli = hasil-arit-migancore_0.11-4b-dengan (prompt produksi lama),
// v11-produksi = -fakta-saja, base = 0.4-qwen3-dengan, v13 = 0.13-dengan
const PASANG = [
  ['v11-asli (dengan)', 'hasil-arit-migancore_0.11-4b-dengan.json', 'v13 (dengan)', 'hasil-arit-migancore_0.13-dengan.json'],
  ['v11-produksi fakta-saja', 'hasil-arit-migancore_0.11-4b-fakta-saja.json', 'v13 (dengan)', 'hasil-arit-migancore_0.13-dengan.json'],
  ['base 0.4 (dengan)', 'hasil-arit-migancore_0.4-qwen3-dengan.json', 'v13 (dengan)', 'hasil-arit-migancore_0.13-dengan.json'],
  ['v11-asli (tanpa)', 'hasil-arit-migancore_0.11-4b-tanpa.json', 'v13 (tanpa)', 'hasil-arit-migancore_0.13-tanpa.json'],
  ['base 0.4 (tanpa)', 'hasil-arit-migancore_0.4-qwen3-tanpa.json', 'v13 (tanpa)', 'hasil-arit-migancore_0.13-tanpa.json'],
];

const keluar = [];
console.log('# Hitung ulang v13 — satuan SOAL, berpasangan (koreksi C19)\n');
console.log('| A | B | gabungan A | gabungan B | Fisher gabungan (INDIKATIF) | soal B>A | soal A>B | seri | McNemar p (SAH) |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [la, fa, lb, fb] of PASANG) {
  if (!fs.existsSync(path.join(DIR, fa)) || !fs.existsSync(path.join(DIR, fb))) { console.log(`| ${la} | ${lb} | berkas tidak ada | | | | | | |`); continue; }
  const A = baca(fa), B = baca(fb);
  const kA = A.rinci.filter((r) => r.ok).length, kB = B.rinci.filter((r) => r.ok).length;
  const pF = fisher(kA, A.rinci.length, kB, B.rinci.length);
  const v = vonisBerpasangan(pasangkanPerSoal(A.rinci, B.rinci));
  keluar.push({ a: la, b: lb, gabunganA: `${kA}/${A.rinci.length}`, gabunganB: `${kB}/${B.rinci.length}`, fisherGabungan: +pF.toFixed(4),
    nSoal: v.nSoal, soalBLebihBaik: v.c, soalALebihBaik: v.b, seri: v.seri, mcnemarP: +v.p.toFixed(4), nyata: v.nyata });
  console.log(`| ${la} | ${lb} | ${kA}/${A.rinci.length} | ${kB}/${B.rinci.length} | ${pF < 0.0001 ? '<0,0001' : pF.toFixed(4)} | ${v.c} | ${v.b} | ${v.seri} | **${v.p.toFixed(4)}**${v.nyata ? ' NYATA' : ' belum terbukti'} |`);
}

// jenis ton saja (2 soal): klaim "0/12 -> 12/12 p<0.0001"
const A = baca('hasil-arit-migancore_0.11-4b-dengan.json'), B = baca('hasil-arit-migancore_0.13-dengan.json');
const ton = (r) => /ton x Rp.*total/.test(r.soal);
const vt = vonisBerpasangan(pasangkanPerSoal(A.rinci.filter(ton), B.rinci.filter(ton)));
const kAt = A.rinci.filter(ton).filter((r) => r.ok).length, kBt = B.rinci.filter(ton).filter((r) => r.ok).length;
console.log(`\nJenis ton-harga (v11-asli vs v13, dengan): gabungan ${kAt}/12 vs ${kBt}/12, Fisher ${fisher(kAt, 12, kBt, 12).toFixed(5)} (indikatif) · berpasangan: ${vt.nSoal} soal, B>A ${vt.c}, McNemar p=${vt.p.toFixed(3)} — ${vt.nyata ? 'nyata' : 'BELUM TERBUKTI (cuma 2 soal)'}`);
keluar.push({ a: 'v11-asli ton (dengan)', b: 'v13 ton (dengan)', gabunganA: `${kAt}/12`, gabunganB: `${kBt}/12`, fisherGabungan: +fisher(kAt, 12, kBt, 12).toFixed(5), nSoal: vt.nSoal, soalBLebihBaik: vt.c, soalALebihBaik: vt.b, seri: vt.seri, mcnemarP: +vt.p.toFixed(4), nyata: vt.nyata });

console.log('\nCatatan: selisih PROPORSI tetap nyata sebagai deskripsi (60/60 vs 45/60). Yang dikoreksi adalah KLAIM INFERENSIAL "beda nyata p<0,0001" — dengan 10 soal, McNemar eksak butuh >=6 soal diskordan searah untuk p<0,05. Ambang pra-daftar (hitungan) tidak berubah; label signifikansi di SANAD-13 diturunkan menjadi indikatif.');
console.log(JSON.stringify(keluar));
