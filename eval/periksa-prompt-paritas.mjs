#!/usr/bin/env node
/**
 * periksa-prompt-paritas.mjs — satu pertanyaan: APAKAH PROMPT SAAT LATIH SAMA
 * DENGAN PROMPT SAAT UKUR — dan kalau beda, apakah bedanya DISENGAJA & TERCATAT?
 *
 * ============================== KENAPA INI ADA ===============================
 * RISET-SUMBER-LUAR-22AGU.md §6 mencatat lubang: "periksa prompt latih == prompt
 * ukur — BELUM ADA". Pengukuran 23 Agu 2026 (inventaris nyata):
 *   hitung: prompt gerbang ada di 2/285 baris (0,7% — dua baris ajar)
 *   nalar : 0/314 · gaya: 0/200 · tool(v14): 0/26
 * Seluruh gerbang v13 (tier-1 dan tier-2) menguji model di bawah prompt yang
 * tidak pernah dilihatnya saat latih. Mengingat temuan "naskah bersyarat pemicu"
 * (system prompt = pemicu), ini bukan detail: lengan "dengan" gerbang mengukur
 * ketahanan terhadap prompt ASING, bukan perilaku di bawah prompt latih.
 *
 * Alat ini TIDAK memutuskan mana yang benar. Ia mengukur, lalu menuntut
 * DEKLARASI di flywheel/PARITAS-PROMPT.json: tiap cluster yang promptnya beda
 * dari prompt gerbang wajib punya {disengaja:true, alasan}. Tanpa deklarasi ->
 * TAHAN (kode 1). Ini cara "perbedaan harus disengaja dan dicatat" menjadi kode.
 *
 * Pakai: node periksa-prompt-paritas.mjs <cluster.jsonl> [nama-cluster]
 *        node periksa-prompt-paritas.mjs --uji-instrumen
 * Keluaran JSON ringkas di stdout (baris terakhir) untuk dipakai kontrak-latih.mjs.
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DIR, '..');
const BERKAS_GERBANG = path.join(DIR, 'prompt-gerbang.json');
const BERKAS_DEKLARASI = path.join(AKAR, 'flywheel', 'PARITAS-PROMPT.json');

export function inventaris(baris) {
  const hitung = new Map();
  for (const b of baris) {
    const c = b.conversations || [];
    const teks = c[0]?.from === 'system' ? c[0].value : '(tanpa system)';
    hitung.set(teks, (hitung.get(teks) || 0) + 1);
  }
  return [...hitung.entries()].map(([teks, n]) => ({ teks, n })).sort((a, b) => b.n - a.n);
}

/**
 * Nilai paritas. Murni — diuji dengan fixture.
 * @returns {{pangsaGerbang:number, pangsaTanpa:number, dominan:{teks,n}|null, paritas:'penuh'|'sebagian'|'tidak-ada', butuhDeklarasi:boolean}}
 */
export function nilai(inv, promptGerbang, total) {
  const nGerbang = inv.find((p) => p.teks === promptGerbang)?.n || 0;
  const nTanpa = inv.find((p) => p.teks === '(tanpa system)')?.n || 0;
  const pangsaGerbang = total ? nGerbang / total : 0;
  const pangsaTanpa = total ? nTanpa / total : 0;
  const dominan = inv[0] || null;
  // 'penuh'     : >=50% baris memakai prompt gerbang ATAU tanpa prompt (kedua lengan gerbang terwakili)
  // 'sebagian'  : ada, tapi <50%
  // 'tidak-ada' : prompt gerbang tidak pernah muncul, semua baris memakai prompt lain
  const terwakili = pangsaGerbang + pangsaTanpa;
  const paritas = terwakili >= 0.5 ? 'penuh' : terwakili > 0 ? 'sebagian' : 'tidak-ada';
  return { pangsaGerbang, pangsaTanpa, dominan, paritas, butuhDeklarasi: paritas !== 'penuh' };
}

export function vonis(hasil, deklarasi) {
  // Lulus bila paritas penuh, ATAU bedanya dideklarasikan disengaja dengan alasan.
  if (!hasil.butuhDeklarasi) return { ok: true, sebab: 'paritas penuh' };
  if (deklarasi && deklarasi.disengaja === true && typeof deklarasi.alasan === 'string' && deklarasi.alasan.length >= 20) {
    return { ok: true, sebab: 'beda DISENGAJA & tercatat: ' + deklarasi.alasan.slice(0, 120) };
  }
  return { ok: false, sebab: `prompt latih != prompt gerbang (paritas ${hasil.paritas}) dan TIDAK ada deklarasi disengaja di flywheel/PARITAS-PROMPT.json` };
}

function bacaJsonl(p) {
  return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

// ────────────────────────────────────────────────── uji instrumen ──
if (process.argv.includes('--uji-instrumen')) {
  const G = 'PROMPT GERBANG';
  const baris = (teks, n) => Array.from({ length: n }, () => ({ conversations: teks === null
    ? [{ from: 'human', value: 'q' }, { from: 'gpt', value: 'j' }]
    : [{ from: 'system', value: teks }, { from: 'human', value: 'q' }, { from: 'gpt', value: 'j' }] }));
  const kasus = [];
  const cek = (nama, ok) => kasus.push([nama, ok]);

  let inv = inventaris([...baris(G, 6), ...baris(null, 4)]);
  let h = nilai(inv, G, 10);
  cek('semua baris gerbang/tanpa -> paritas penuh, tanpa deklarasi', h.paritas === 'penuh' && vonis(h, null).ok);
  cek('pangsa dihitung benar (0.6 & 0.4)', Math.abs(h.pangsaGerbang - 0.6) < 1e-9 && Math.abs(h.pangsaTanpa - 0.4) < 1e-9);

  inv = inventaris([...baris('PROMPT LAIN', 9), ...baris(G, 1)]);
  h = nilai(inv, G, 10);
  cek('10% gerbang -> sebagian, BUTUH deklarasi', h.paritas === 'sebagian' && h.butuhDeklarasi);
  cek('tanpa deklarasi -> TAHAN', vonis(h, null).ok === false);
  cek('deklarasi disengaja + alasan panjang -> LULUS', vonis(h, { disengaja: true, alasan: 'gerbang sengaja memakai prompt asing untuk mengukur ketahanan' }).ok === true);
  cek('deklarasi disengaja tapi alasan pendek -> TAHAN', vonis(h, { disengaja: true, alasan: 'ya' }).ok === false);
  cek('deklarasi disengaja:false -> TAHAN', vonis(h, { disengaja: false, alasan: 'alasan yang cukup panjang sekali' }).ok === false);

  inv = inventaris(baris('PROMPT LAIN', 5));
  h = nilai(inv, G, 5);
  cek('0% gerbang -> tidak-ada, dominan = PROMPT LAIN', h.paritas === 'tidak-ada' && h.dominan.teks === 'PROMPT LAIN');
  cek('data kosong aman', nilai(inventaris([]), G, 0).paritas === 'tidak-ada');

  // kendali pada data NYATA: cluster hitung sekarang harus terbaca & prompt gerbang <1%
  const nyata = path.join(AKAR, 'flywheel', 'dataset', 'v13', 'cluster-hitung.jsonl');
  if (fs.existsSync(nyata) && fs.existsSync(BERKAS_GERBANG)) {
    const g = JSON.parse(fs.readFileSync(BERKAS_GERBANG, 'utf8')).dasar;
    const b = bacaJsonl(nyata);
    const hn = nilai(inventaris(b), g, b.length);
    cek('cluster-hitung NYATA: prompt gerbang < 5% (fakta 23 Agu: 0,7%)', hn.pangsaGerbang < 0.05);
  }

  let gagal = 0;
  for (const [n, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${n}`); if (!ok) gagal++; }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

// ────────────────────────────────────────────────────────── jalan ──
const [berkas, namaArg] = process.argv.slice(2);
if (!berkas) { console.error('pakai: node periksa-prompt-paritas.mjs <cluster.jsonl> [nama-cluster] | --uji-instrumen'); process.exit(2); }
const nama = namaArg || path.basename(berkas).replace(/^cluster-/, '').replace(/\.jsonl$/, '');
const gerbang = JSON.parse(fs.readFileSync(BERKAS_GERBANG, 'utf8'));
const data = bacaJsonl(berkas);
const inv = inventaris(data);
const hasil = nilai(inv, gerbang.dasar, data.length);
const deklarasi = fs.existsSync(BERKAS_DEKLARASI) ? (JSON.parse(fs.readFileSync(BERKAS_DEKLARASI, 'utf8')).cluster || {})[nama] : null;
const v = vonis(hasil, deklarasi);

console.log(`# Paritas prompt — ${nama} (${data.length} baris)\n`);
console.log(`prompt gerbang : ${JSON.stringify(gerbang.dasar)}`);
console.log(`di data        : ${(hasil.pangsaGerbang * 100).toFixed(1)}% gerbang · ${(hasil.pangsaTanpa * 100).toFixed(1)}% tanpa system · paritas ${hasil.paritas}`);
console.log('\nprompt sistem di data (teratas):');
for (const p of inv.slice(0, 6)) console.log(`  ${String(p.n).padStart(4)} (${(100 * p.n / data.length).toFixed(1).padStart(5)}%) ${JSON.stringify(p.teks.slice(0, 90))}${p.teks === gerbang.dasar ? '  <== gerbang' : ''}`);
console.log(`\n${v.ok ? 'LULUS' : 'TAHAN'} — ${v.sebab}`);
console.log(JSON.stringify({ cluster: nama, baris: data.length, ...hasil, dominan: hasil.dominan ? { n: hasil.dominan.n, teks: hasil.dominan.teks } : null, ok: v.ok, sebab: v.sebab }));
process.exit(v.ok ? 0 : 1);
