#!/usr/bin/env node
/**
 * banding-berpasangan.mjs — uji BERPASANGAN (McNemar eksak) untuk dua berkas hasil
 * gerbang yang memakai SOAL YANG SAMA (uji-nalar, uji-halusinasi, uji-alat, ...).
 *
 * Lahir 23 Agu (C19): membandingkan "24/42 vs 33/42" dengan uji proporsi bebas
 * salah — soalnya identik, jadi satuan = soal, dan yang dihitung = soal diskordan.
 * Alat ini membaca dua JSON hasil, mencocokkan soal lewat kunci teks, dan
 * mencetak b (A benar, B salah), c (A salah, B benar), seri, p McNemar eksak.
 *
 * Pakai: node banding-berpasangan.mjs <hasilA.json> <hasilB.json> [labelA] [labelB]
 *        node banding-berpasangan.mjs --uji-instrumen
 */
'use strict';
import fs from 'node:fs';
import { mcnemarEksak } from './statistik.mjs';

export function daftarSoal(j) {
  // Bentuk berkas berbeda antar gerbang; ambil array pertama yang elemennya punya nilai lulus.
  // uji-halusinasi: array akar [{id, jenis, q, hasil:'BENAR'|'MENGARANG'|...}]
  if (Array.isArray(j)) {
    return j.map((x) => {
      const kunci = x.id || x.q || x.soal;
      const lulus = typeof x.hasil === 'string' ? x.hasil === 'BENAR' : (x.nilai ?? x.ok ?? x.benar ?? x.lulus);
      return kunci !== undefined && typeof lulus === 'boolean' ? { kunci: String(kunci).slice(0, 80), lulus, kategori: x.jenis || x.kategori || '' } : null;
    }).filter(Boolean);
  }
  const kandidat = [j.rinci, j.hasil, j.soal, j.percobaan, j.jawaban, j.detail].filter(Array.isArray);
  for (const arr of kandidat) {
    const rows = arr.map((x) => {
      const kunci = x.kode || x.id || x.t || x.tanya || x.soal || x.pertanyaan || x.prompt;
      const lulus = x.nilai ?? x.ok ?? x.benar ?? x.lulus ?? x.pass;
      return kunci !== undefined && typeof lulus === 'boolean' ? { kunci: String(kunci).slice(0, 80), lulus, kategori: x.kategori || x.k || x.jenis || '' } : null;
    }).filter(Boolean);
    if (rows.length) return rows;
  }
  // gerbang yang menyimpan per-kategori: {kategori: [{...}]}
  const rows = [];
  for (const [kat, v] of Object.entries(j)) {
    if (Array.isArray(v)) for (const x of v) {
      const kunci = x.kode || x.id || x.t || x.tanya || x.soal;
      const lulus = x.nilai ?? x.ok ?? x.benar ?? x.lulus;
      if (kunci !== undefined && typeof lulus === 'boolean') rows.push({ kunci: String(kunci).slice(0, 80), lulus, kategori: kat });
    }
  }
  return rows;
}

export function pasangkan(A, B) {
  const mb = new Map(B.map((x) => [x.kunci, x]));
  let b = 0, c = 0, seri = 0, n = 0;
  const diskordan = [];
  const perKat = new Map();
  for (const a of A) {
    const x = mb.get(a.kunci); if (!x) continue;
    n++;
    const k = perKat.get(a.kategori) || { b: 0, c: 0, seri: 0 }; perKat.set(a.kategori, k);
    if (a.lulus && !x.lulus) { b++; k.b++; diskordan.push({ kunci: a.kunci, arah: 'A>B', kategori: a.kategori }); }
    else if (!a.lulus && x.lulus) { c++; k.c++; diskordan.push({ kunci: a.kunci, arah: 'B>A', kategori: a.kategori }); }
    else { seri++; k.seri++; }
  }
  return { n, b, c, seri, p: mcnemarEksak(b, c), diskordan, perKat: [...perKat].map(([kategori, v]) => ({ kategori, ...v })) };
}

if (process.argv.includes('--uji-instrumen')) {
  const kasus = [];
  const cek = (nm, ok) => kasus.push([nm, ok]);
  const A = [{ kunci: 's1', lulus: true, kategori: 'x' }, { kunci: 's2', lulus: true, kategori: 'x' }, { kunci: 's3', lulus: false, kategori: 'y' }];
  const B = [{ kunci: 's1', lulus: false, kategori: 'x' }, { kunci: 's2', lulus: true, kategori: 'x' }, { kunci: 's3', lulus: false, kategori: 'y' }, { kunci: 's9', lulus: true, kategori: 'z' }];
  const r = pasangkan(A, B);
  cek('hanya soal yang ada di KEDUA berkas (3, s9 dibuang)', r.n === 3);
  cek('b=1 (A>B), c=0, seri=2', r.b === 1 && r.c === 0 && r.seri === 2);
  cek('p McNemar b=1,c=0 = 1.0', Math.abs(r.p - 1) < 1e-9);
  cek('per kategori terisi', r.perKat.find((k) => k.kategori === 'x').b === 1);
  cek('daftarSoal: bentuk {rinci:[{soal,ok}]}', daftarSoal({ rinci: [{ soal: 'q', ok: true }] }).length === 1);
  cek('daftarSoal: bentuk per-kategori {kat:[{t,nilai}]}', daftarSoal({ panggil: [{ t: 'q', nilai: false }] }).length === 1 && daftarSoal({ panggil: [{ t: 'q', nilai: false }] })[0].kategori === 'panggil');
  cek('daftarSoal: kosong aman', daftarSoal({}).length === 0);
  // kendali: 9 diskordan searah -> p=0.0039 (nyata); 5 -> 0.0625 (belum)
  cek('kendali: 9 searah nyata', mcnemarEksak(9, 0) < 0.01);
  let gagal = 0;
  for (const [nm, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nm}`); if (!ok) gagal++; }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

const [fA, fB, labA = 'A', labB = 'B'] = process.argv.slice(2);
if (!fA || !fB) { console.error('pakai: node banding-berpasangan.mjs <hasilA.json> <hasilB.json> [labelA] [labelB]'); process.exit(2); }
const A = daftarSoal(JSON.parse(fs.readFileSync(fA, 'utf8')));
const B = daftarSoal(JSON.parse(fs.readFileSync(fB, 'utf8')));
if (!A.length || !B.length) { console.error(`tidak bisa membaca daftar soal (A ${A.length}, B ${B.length}) — bentuk berkas tidak dikenal`); process.exit(1); }
const r = pasangkan(A, B);
console.log(`# Berpasangan — ${labA} vs ${labB}: ${r.n} soal sama`);
console.log(`  ${labA} benar & ${labB} salah (b): ${r.b} · ${labB} benar & ${labA} salah (c): ${r.c} · seri: ${r.seri}`);
console.log(`  McNemar eksak p = ${r.p.toFixed(4)} → ${r.p < 0.05 ? 'BEDA NYATA' : 'belum terbukti'}${r.b !== r.c ? ` · arah: ${r.b > r.c ? labA : labB} lebih baik` : ''}`);
for (const k of r.perKat) console.log(`  - ${k.kategori || '(tanpa kategori)'}: b ${k.b} · c ${k.c} · seri ${k.seri}`);
if (r.diskordan.length) { console.log('  diskordan:'); for (const d of r.diskordan.slice(0, 12)) console.log(`    ${d.arah} [${d.kategori}] ${d.kunci.slice(0, 70)}`); }
