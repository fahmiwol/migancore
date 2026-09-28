#!/usr/bin/env node
/**
 * periksa-token.mjs — penjaga sistem desain: cari nilai yang ditulis langsung
 * padahal sudah ada tokennya.
 *
 * ============================ KENAPA INI HARUS ADA ==========================
 * Audit 22 Agu menemukan 232 warna tertulis langsung di enam permukaan, dan
 * yang lebih buruk: DRIFT sudah terjadi. Dua merah (#f85149 dan #ff8f85) dan
 * dua kuning (#d29922 dan #dcbe4e) hidup berdampingan tanpa ada yang pernah
 * memutuskan mana yang benar. Dokumentasi tidak mencegah itu — hanya alat
 * yang dijalankan yang mencegahnya.
 *
 * Yang dilaporkan:
 *   MENYIMPANG  warna yang MIRIP token tapi tidak sama — hampir selalu salah
 *               ketik atau salinan lama, dan inilah yang merusak sistem.
 *   TANPA TOKEN warna asing yang belum punya nama peran.
 *   LIAR        radius/ukuran huruf di luar skala.
 *
 * Berkas .dc.html sengaja DIPERIKSA juga: artboard tidak bisa menautkan CSS
 * luar, jadi nilainya memang inline — tapi wajib nilai yang SAMA PERSIS.
 *
 * Pakai: node sistem/periksa-token.mjs [berkas...]   (bawaan: semua permukaan)
 *        node sistem/periksa-token.mjs --uji-instrumen
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DIR, '..');

const BAWAAN = [
  'ajar/index.html',
  'playground/publik/index.html',
  'papan-pantau.html',
  'eval/REGISTER-CACAT.html',
  'desain/Main.dc.html',
  'desain/Ajar.dc.html',
];

// ── baca token dari token.css: SATU sumber, tidak disalin ke sini ────────
export function bacaToken(css) {
  const warna = new Map();   // hex → nama token
  const sudut = new Set();
  const huruf = new Set();
  for (const [, nama, nilai] of css.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const v = nilai.trim().toLowerCase();
    const hex = v.match(/^#[0-9a-f]{6}$/);
    if (hex) warna.set(v, nama);
    if (/^sudut/.test(nama)) sudut.add(parseInt(v, 10));
    if (/^teks-(xs|sm|md|base|lg|xl)$/.test(nama)) huruf.add(parseFloat(v));
  }
  return { warna, sudut, huruf };
}

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

export function jarak(a, b) {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Rona 0–360; -1 kalau abu (tak punya rona). */
export function rona(h) {
  const [r, g, b] = rgb(h).map((v) => v / 255);
  const maks = Math.max(r, g, b), min = Math.min(r, g, b), d = maks - min;
  // Ambang abu 0,12 (bukan 0,06): --redup #8b949e punya d=0,075 dan terbaca
  // kebiruan pada ambang lama — akibatnya #79c0ff dituduh meniru --redup, bukan
  // --biru. Abu bernuansa tetap abu; yang menentukan peran adalah seberapa
  // pekat warnanya, bukan sisa rona yang tak terlihat mata.
  if (d < 0.12) return -1;
  let x;
  if (maks === r) x = ((g - b) / d) % 6;
  else if (maks === g) x = (b - r) / d + 2;
  else x = (r - g) / d + 4;
  return ((x * 60) + 360) % 360;
}

/**
 * DRIFT = warna yang MENIRU peran token yang sudah ada.
 *
 * Versi pertama memakai jarak RGB saja dan MELEWATKAN drift paling nyata di
 * repo ini: #ff8f85 terhadap --merah #f85149 berjarak 86 — di atas ambang 60 —
 * padahal keduanya jelas-jelas merah yang sama perannya. Jarak RGB tidak
 * melihat rona; mata melihat rona lebih dulu. Karena itu drift sekarang
 * dinilai dua jalur: rona berdekatan (≤18°) pada warna yang sama-sama
 * berwarna, ATAU jarak RGB dekat untuk abu-abu (yang tidak punya rona).
 */
export function drift(hex, token) {
  const hHex = rona(hex);
  let terbaik = null;
  for (const t of token.warna.keys()) {
    const hT = rona(t);
    const d = jarak(hex, t);
    if (hHex >= 0 && hT >= 0) {
      const beda = Math.min(Math.abs(hHex - hT), 360 - Math.abs(hHex - hT));
      if (beda <= 18 && (!terbaik || beda < terbaik.beda)) terbaik = { t, beda, d };
    } else if (hHex < 0 && hT < 0 && d <= 45) {
      if (!terbaik || d < terbaik.d) terbaik = { t, beda: 0, d };
    }
  }
  return terbaik;
}

export function periksaIsi(isi, token, { abaikanVar = false } = {}) {
  const temuan = [];
  const lihat = new Set();

  for (const m of isi.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = m[0].toLowerCase();
    if (lihat.has(hex)) continue;
    lihat.add(hex);
    if (token.warna.has(hex)) continue;
    const d = drift(hex, token);
    if (d) {
      temuan.push({ jenis: 'MENYIMPANG', nilai: hex, berat: true,
        pesan: `meniru --${token.warna.get(d.t)} (${d.t}) tapi tidak sama — drift` });
    } else {
      temuan.push({ jenis: 'TANPA TOKEN', nilai: hex, berat: false,
        pesan: 'warna asing — beri nama peran di token.css kalau memang dipakai' });
    }
  }

  /**
   * TEMA LAIN, bukan drift.
   *
   * Alarm palsu nyata (22 Agu): eval/REGISTER-CACAT.html dilaporkan penuh
   * drift, padahal 15 dari 15 warnanya milik palet TERANG yang utuh dan
   * konsisten — halaman itu memang bertema lain, bukan salah salin. Penjaga
   * yang menuduh keputusan sah sebagai kesalahan akan diabaikan orang, dan
   * penjaga yang diabaikan sama saja dengan tidak ada. Jadi: kalau hampir
   * SEMUA warna sebuah berkas asing dari token, itu dilaporkan sekali sebagai
   * tema tersendiri — keputusan untuk ditinjau, bukan 15 tuduhan.
   */
  const semuaWarna = [...lihat].filter((x) => x.startsWith('#'));
  const asing = temuan.filter((t) => t.nilai && String(t.nilai).startsWith('#')).length;
  if (semuaWarna.length >= 8 && asing / semuaWarna.length > 0.85) {
    const sisa = temuan.filter((t) => !String(t.nilai).startsWith('#'));
    sisa.unshift({ jenis: 'TEMA LAIN', nilai: `${asing} warna`, berat: false,
      pesan: 'palet terpisah yang utuh — bukan drift; putuskan apakah permukaan ini memang bertema sendiri' });
    return sisa;
  }

  for (const m of isi.matchAll(/border-radius:\s*([0-9.]+)px/g)) {
    const n = parseFloat(m[1]);
    if (!token.sudut.has(n) && !lihat.has('r' + n)) {
      lihat.add('r' + n);
      temuan.push({ jenis: 'LIAR', nilai: `radius ${n}px`, berat: false,
        pesan: `di luar skala (${[...token.sudut].sort((a, b) => a - b).join('/')}px)` });
    }
  }

  for (const m of isi.matchAll(/font-size:\s*([0-9.]+)px/g)) {
    const n = parseFloat(m[1]);
    if (!token.huruf.has(n) && !lihat.has('f' + n)) {
      lihat.add('f' + n);
      temuan.push({ jenis: 'LIAR', nilai: `huruf ${n}px`, berat: !Number.isInteger(n),
        pesan: Number.isInteger(n)
          ? `di luar tangga (${[...token.huruf].sort((a, b) => a - b).join('/')}px)`
          : 'setengah piksel — improvisasi, bukan skala' });
    }
  }

  if (!abaikanVar && /:root\s*{/.test(isi) && /--bg:/.test(isi)) {
    temuan.push({ jenis: 'MENYIMPANG', nilai: ':root sendiri', berat: true,
      pesan: 'berkas ini mendefinisikan token sendiri — tautkan sistem/token.css' });
  }

  return temuan;
}

// ────────────────────────────────────────────────── uji instrumen ──
function ujiInstrumen() {
  const css = fs.readFileSync(path.join(DIR, 'token.css'), 'utf8');
  const t = bacaToken(css);
  const kasus = [
    ['token terbaca dari token.css', t.warna.size >= 10 && t.sudut.size === 4 && t.huruf.size === 6],
    ['warna token dikenali bersih', periksaIsi('color:#3fb950;', t).length === 0],
    ['DRIFT nyata tertangkap (#ff8f85 vs --merah)',
      periksaIsi('color:#ff8f85;', t).some((x) => x.jenis === 'MENYIMPANG' && x.berat)],
    ['rona dihitung benar (merah~0, hijau~130, abu=-1)',
      Math.abs(rona('#f85149')) < 12 && Math.abs(rona('#3fb950') - 130) < 20 && rona('#8b949e') === -1],
    ['TEMA LAIN dilaporkan sekali, bukan 15 tuduhan', (() => {
      const temaTerang = '#fbfbfa #1a1a19 #e3e3e0 #6b6b68 #1a7f4b #b3261e #8a6d00 #161614 #f5f5f3 #d6d6d3'.split(' ').map((c) => `color:${c};`).join('');
      const h = periksaIsi(temaTerang, t);
      return h.length === 1 && h[0].jenis === 'TEMA LAIN' && !h[0].berat;
    })()],
    ['DRIFT kuning tertangkap (#dcbe4e vs --kuning)',
      periksaIsi('color:#dcbe4e;', t).some((x) => x.jenis === 'MENYIMPANG')],
    ['warna benar-benar asing = TANPA TOKEN, bukan drift',
      periksaIsi('color:#ff00ff;', t).some((x) => x.jenis === 'TANPA TOKEN')],
    ['radius di skala lolos', periksaIsi('border-radius: 7px;', t).length === 0],
    ['radius liar tertangkap', periksaIsi('border-radius: 3px;', t).some((x) => x.jenis === 'LIAR')],
    ['huruf di tangga lolos', periksaIsi('font-size: 13px;', t).length === 0],
    ['setengah piksel = BERAT',
      periksaIsi('font-size: 12.5px;', t).some((x) => x.berat && /setengah/.test(x.pesan))],
    [':root duplikat tertangkap',
      periksaIsi(':root { --bg: #0d1117; }', t).some((x) => /token sendiri/.test(x.pesan))],
    ['satu nilai dilaporkan sekali saja',
      periksaIsi('a{color:#ff00ff}b{color:#ff00ff}', t).length === 1],
  ];
  let gagal = 0;
  for (const [n, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${n}`); if (!ok) gagal++; }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

const iniUtama = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (iniUtama) {
  if (process.argv.includes('--uji-instrumen')) ujiInstrumen();

  const token = bacaToken(fs.readFileSync(path.join(DIR, 'token.css'), 'utf8'));
  const daftar = process.argv.slice(2).filter((x) => !x.startsWith('--'));
  const berkas = (daftar.length ? daftar : BAWAAN).filter((f) => fs.existsSync(path.join(AKAR, f)));

  console.log(`# Periksa token — ${berkas.length} permukaan\n`);
  let berat = 0, ringan = 0;
  for (const f of berkas) {
    const isi = fs.readFileSync(path.join(AKAR, f), 'utf8');
    // .dc.html memang inline (tidak bisa menautkan CSS) — :root-nya tidak dihitung
    const temuan = periksaIsi(isi, token, { abaikanVar: f.endsWith('.dc.html') });
    if (!temuan.length) { console.log(`  OK     ${f}`); continue; }
    const b = temuan.filter((x) => x.berat).length;
    berat += b; ringan += temuan.length - b;
    console.log(`  ${b ? 'PERIKSA' : 'catatan'} ${f} — ${temuan.length} temuan`);
    for (const x of temuan.slice(0, 6)) {
      console.log(`         ${x.berat ? '⛔' : '·'} ${x.jenis.padEnd(11)} ${String(x.nilai).padEnd(16)} ${x.pesan}`);
    }
    if (temuan.length > 6) console.log(`         … ${temuan.length - 6} lagi`);
  }
  console.log(`\n## ${berat} berat · ${ringan} catatan`);
  console.log(berat
    ? '   Yang berat adalah drift atau token tandingan — perbaiki sebelum menyebar.'
    : '   Tidak ada drift. Warna asing tanpa token boleh, asal disengaja.');
  process.exit(berat ? 1 : 0);
}
