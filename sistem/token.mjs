#!/usr/bin/env node
/**
 * sistem/token.mjs — jembatan token untuk kode.
 *
 * token.css adalah sumber kebenaran, tapi separuh permukaan MiganCore tidak
 * bisa menautkan CSS: papan-pantau.html dan REGISTER-CACAT.html DIGENERATE
 * program, dan artboard .dc.html menulis nilainya inline. Berkas ini membuat
 * satu-satunya sumber itu tetap satu — generator mengimpor dari sini alih-alih
 * menyalin hex, sehingga mengubah token.css cukup sekali dan semuanya ikut.
 *
 * Pakai:
 *   import { token, css, warna } from '../sistem/token.mjs';
 *   warna('hijau')        -> '#3fb950'
 *   css()                 -> isi token.css (untuk disuntikkan ke <style>)
 *   token().sudut         -> { kecil: 4, sedang: 7, besar: 10, pil: 20 }
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BERKAS = path.join(DIR, 'token.css');

let _cache = null;

export function css() {
  return fs.readFileSync(BERKAS, 'utf8');
}

export function token() {
  if (_cache) return _cache;
  const isi = css();
  const semua = {};
  for (const [, nama, nilai] of isi.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    semua[nama] = nilai.trim();
  }
  _cache = {
    semua,
    warna: {
      bg: semua.bg, panel: semua.panel, cekung: semua.cekung,
      garis: semua.garis, tombol2: semua.tombol2,
      teks: semua.teks, redup: semua.redup,
      hijau: semua.hijau, merah: semua.merah, kuning: semua.kuning,
      biru: semua.biru, ungu: semua.ungu, aksi: semua.aksi,
    },
    lembut: {
      hijau: [semua['hijau-lembut'], semua['hijau-tepi']],
      merah: [semua['merah-lembut'], semua['merah-tepi']],
      kuning: [semua['kuning-lembut'], semua['kuning-tepi']],
      biru: [semua['biru-lembut'], semua['biru-tepi']],
    },
    sudut: {
      kecil: parseInt(semua['sudut-kecil'], 10),
      sedang: parseInt(semua.sudut, 10),
      besar: parseInt(semua['sudut-besar'], 10),
      pil: parseInt(semua['sudut-pil'], 10),
    },
    huruf: {
      keluarga: semua.huruf, mono: semua['huruf-mono'],
      xs: parseInt(semua['teks-xs'], 10), sm: parseInt(semua['teks-sm'], 10),
      md: parseInt(semua['teks-md'], 10), base: parseInt(semua['teks-base'], 10),
      lg: parseInt(semua['teks-lg'], 10), xl: parseInt(semua['teks-xl'], 10),
    },
    sela: [1, 2, 3, 4, 5, 6].map((i) => parseInt(semua[`sela-${i}`], 10)),
  };
  return _cache;
}

export const warna = (nama) => {
  const w = token().warna[nama];
  if (!w) throw new Error(`token warna tidak ada: ${nama} — tambahkan di sistem/token.css dulu`);
  return w;
};

// ────────────────────────────────────────────────── uji instrumen ──
function ujiInstrumen() {
  const t = token();
  const kasus = [
    ['warna terbaca', warna('hijau') === '#3fb950' && warna('bg') === '#0d1117'],
    ['warna tak dikenal melempar, bukan diam', (() => {
      try { warna('warna-karangan'); return false; } catch { return true; }
    })()],
    ['skala sudut lengkap', t.sudut.kecil === 4 && t.sudut.sedang === 7 && t.sudut.besar === 10 && t.sudut.pil === 20],
    ['tangga huruf lengkap', [t.huruf.xs, t.huruf.sm, t.huruf.md, t.huruf.base, t.huruf.lg, t.huruf.xl]
      .join() === '11,12,13,15,17,23'],
    ['jarak enam tingkat', t.sela.join() === '4,8,12,16,24,32'],
    ['warna lembut berpasangan', Object.values(t.lembut).every(([a, b]) => a?.startsWith('rgba') && b?.startsWith('rgba'))],
    ['css() mengembalikan sumber utuh', /:root\s*{/.test(css()) && css().includes('--hijau')],
  ];
  let g = 0;
  for (const [n, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${n}`); if (!ok) g++; }
  console.log(`\n${kasus.length - g}/${kasus.length} lulus`);
  process.exit(g ? 1 : 0);
}

const iniUtama = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (iniUtama) ujiInstrumen();
