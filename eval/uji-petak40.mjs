#!/usr/bin/env node
/**
 * uji-petak40.mjs — menegakkan ambang pra-daftar H-PETAK40.
 *
 * ============================== KENAPA ADA ==================================
 * Petak jebakan diperbesar 14 -> 40 karena hukum C35: gerbang MENGARANG tidak
 * sanggup memutuskan (CI 95% melingkupi ambangnya). Tapi memperbesar petak
 * membawa risikonya sendiri:
 *
 *   - soal baru bisa mencemari data latih (C07)
 *   - satu jenis jebakan bisa mendominasi, sehingga gerbang mengukur satu hal
 *   - soal LAMA bisa tak sengaja tergeser, menghanguskan seluruh sejarah (C29)
 *
 * Jadi petaknya digerbang sebelum dipakai, sama seperti data latih.
 *
 * CATATAN: M-a (penurunan derau) TIDAK diuji di sini — ia butuh pengukuran
 * model sungguhan, bukan pemeriksaan berkas. Dijalankan terpisah.
 *
 * Pakai: node eval/uji-petak40.mjs
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.dirname(DIR);
const lf = (t) => t.replace(/\r\n/g, '\n');

/** Tarik daftar soal dari berkas gerbang, tanpa menjalankannya (C27). */
function soalDari(teks) {
  const i = teks.indexOf('const SOAL = [');
  const j = teks.indexOf('\n];', i);
  const blok = teks.slice(i, j);
  return [...blok.matchAll(/\{\s*id:\s*"([^"]+)",\s*jenis:\s*"([a-z-]+)",\s*q:\s*"([^"]+)"/g)]
    .map((m) => ({ id: m[1], jenis: m[2], q: m[3] }));
}

const sekarang = soalDari(lf(fs.readFileSync(path.join(DIR, 'uji-halusinasi.mjs'), 'utf8')));
const lama = soalDari(lf(execFileSync('git', ['show', 'cf47262:eval/uji-halusinasi.mjs'],
  { encoding: 'utf8', cwd: AKAR })));

/** Jaccard 4-gram — penjaga C07 yang sama. */
function mirip(a, b) {
  const g = (s) => { const t = String(s).toLowerCase().replace(/\s+/g, ' ').trim(); const o = new Set();
    for (let i = 0; i + 4 <= t.length; i++) o.add(t.slice(i, i + 4)); return o; };
  const A = g(a), B = g(b); if (!A.size || !B.size) return 0;
  let s = 0; for (const x of A) if (B.has(x)) s++;
  return s / (A.size + B.size - s);
}

let ok = 0, buruk = 0;
const cek = (n, c, ket = '') => (c ? (ok++, console.log(`  OK    ${n}`))
  : (buruk++, console.log(`  GAGAL ${n}${ket ? ' — ' + ket : ''}`)));

const jeb = (s) => s.filter((x) => x.jenis !== 'fakta' && x.jenis !== 'domain');
const per = {};
for (const s of sekarang) per[s.jenis] = (per[s.jenis] || 0) + 1;

console.log(`\n# Gerbang petak-40 — ${sekarang.length} soal (${jeb(sekarang).length} jebakan)\n`);

// ── C29: soal lama TIDAK BOLEH bergeser ──
const lamaSekarang = sekarang.filter((s) => lama.some((l) => l.id === s.id));
cek(`C29: ke-${lama.length} soal lama masih ada semua`, lamaSekarang.length === lama.length,
  `${lamaSekarang.length}/${lama.length}`);
const bergeser = lama.filter((l) => {
  const s = sekarang.find((x) => x.id === l.id);
  return !s || s.q !== l.q || s.jenis !== l.jenis;
});
cek('C29: tidak satu pun soal lama berubah teks/jenisnya', bergeser.length === 0,
  bergeser.map((x) => x.id).join(','));

// ── M-d: sebaran ──
const nJeb = jeb(sekarang).length;
cek(`jebakan mencapai sasaran >=40 (${nJeb})`, nJeb >= 40);
for (const j of ['tidak-ada', 'premis-salah', 'di-luar']) {
  const p = (per[j] || 0) / nJeb;
  cek(`M-d sebaran ${j}: ${per[j]} (${Math.round(p * 100)}%) di antara 25-45%`,
    p >= 0.25 && p <= 0.45);
}

// ── M-e: pagar dua-arah ──
cek(`M-e soal fakta >=12 (${per.fakta || 0})`, (per.fakta || 0) >= 12);

// ── M-c: kebersihan terhadap data latih ──
const baru = sekarang.filter((s) => !lama.some((l) => l.id === s.id));
cek(`ada soal baru untuk diperiksa (${baru.length})`, baru.length > 0);

const sumber = [];
for (const v of ['v13', 'v14']) {
  const d = path.join(AKAR, 'flywheel', 'dataset', v);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.jsonl'))) {
    for (const b of fs.readFileSync(path.join(d, f), 'utf8').split('\n')) {
      if (!b.trim()) continue;
      try { const o = JSON.parse(b);
        const t = (o.conversations || []).find((c) => c.from === 'human')?.value;
        if (t) sumber.push(t);
      } catch { /* baris rusak dilewati */ }
    }
  }
}
const ajarDir = path.join(AKAR, 'flywheel', 'dataset', 'ajar');
if (fs.existsSync(ajarDir)) {
  for (const f of fs.readdirSync(ajarDir).filter((x) => x.endsWith('.jsonl'))) {
    for (const b of fs.readFileSync(path.join(ajarDir, f), 'utf8').split('\n')) {
      if (!b.trim()) continue;
      try { const o = JSON.parse(b);
        const t = (o.conversations || []).find((c) => c.from === 'human')?.value;
        if (t) sumber.push(t);
      } catch { /* dilewati */ }
    }
  }
}

let maksLatih = 0, cemar = 0;
for (const s of baru) {
  for (const t of sumber) {
    const m = mirip(s.q, t);
    if (m > maksLatih) maksLatih = m;
    if (m >= 0.5) { cemar++; console.log(`      TERCEMAR ${m.toFixed(2)}: "${s.q}"`); }
  }
}
cek(`M-c bersih dari ${sumber.length} baris data latih (maks ${maksLatih.toFixed(2)}, ambang <0,50)`, cemar === 0);

// ── soal baru tidak saling parafrase, dan tidak menyalin soal lama ──
let par = 0, maksInternal = 0;
const semuaQ = sekarang.map((s) => s.q);
for (let i = 0; i < semuaQ.length; i++) {
  for (let j = i + 1; j < semuaQ.length; j++) {
    const m = mirip(semuaQ[i], semuaQ[j]);
    if (m > maksInternal) maksInternal = m;
    if (m >= 0.5) { par++; console.log(`      PARAFRASE ${m.toFixed(2)}: "${semuaQ[i]}" ~ "${semuaQ[j]}"`); }
  }
}
cek(`nol parafrase antar-soal (maks ${maksInternal.toFixed(2)})`, par === 0);
cek('semua id unik', new Set(sekarang.map((s) => s.id)).size === sekarang.length);

console.log(`\n  sebaran: ${Object.entries(per).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`  jebakan: ${nJeb} (dulu ${jeb(lama).length}) — satu soal kini ${(100 / nJeb).toFixed(1)}% skor, dulu ${(100 / jeb(lama).length).toFixed(1)}%`);
console.log('\n' + '='.repeat(56));
console.log(`${ok} lulus · ${buruk} gagal`);
console.log(buruk ? '\nPetak BELUM boleh dipakai.' : '\nPetak SIAP. M-a (penurunan derau) diukur terpisah dengan model sungguhan.');
process.exit(buruk ? 1 : 0);
