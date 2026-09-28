#!/usr/bin/env node
/**
 * validasi-dataset.mjs — GERBANG DATA sebelum GPU. Satu perintah, satu vonis.
 *
 * Perintah Fahmi 21 Agu (disarikan): bangun arsitektur dan alat validasi yang benar sebelum
 * latihan, supaya semua terukur dan tercatat di satu sumber, tidak hanya di memori dan sesi.
 *
 * Perintah itu menangkap celah nyata: sepanjang 20–21 Agu semua pemeriksaan
 * mutu data kulakukan lewat perintah sesaat (python satu baris). Tiap temuan
 * mati bersama perintahnya — tidak bisa diulang, tidak bisa dibandingkan antar
 * versi, tidak bisa diperiksa orang lain. Berkas ini menggantikannya.
 *
 * Yang diperiksa (ambang dari STANDAR-UKUR-DAN-GERBANG.md):
 *   G1 jumlah baris        1.000–5.000        (zona LIMA)
 *   G2 bentuk dokumen-QA   ≤ 30%              (v10: 72,6% → diduga sebab T7)
 *   G3 porsi MENOLAK       10–30%
 *   G4 keragaman jawaban   ≥ 85% unik per lapisan  ← menangkap cacat 115→37
 *   G5 rahasia/kredensial  0 MUTLAK
 *   G6 duplikat jawaban    0 tersisa
 *   G7 fondasi (hitung)    ≥ 15%              (v10: 2,6% → aritmetika luruh)
 *   G8 bocor Inggris       ≤ 5%
 *   G9 panjang jawaban     median 150–900 huruf
 *
 * Keluaran: LAPORAN-VALIDASI.md (dibaca manusia) + validasi.json (dibaca mesin,
 * bisa dibandingkan antar versi). Keluar kode 1 kalau ada gerbang KERAS gagal.
 *
 * Pakai: node validasi-dataset.mjs [berkas.jsonl]
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BERKAS = process.argv[2] || path.join(DIR, 'dataset', 'migancore-curated.jsonl');

const AMBANG = {
  barisMin: 1000, barisMaks: 5000,
  bentukDokumenMaks: 0.30,
  menolakMin: 0.10, menolakMaks: 0.30,
  keragamanMin: 0.85,
  fondasiMin: 0.15,
  inggrisMaks: 0.05,
  panjangMedianMin: 150, panjangMedianMaks: 900,
};

const RAHASIA = [
  /hf_[A-Za-z0-9]{8,}/, /sk-[A-Za-z0-9_-]{12,}/, /gh[pousr]_[A-Za-z0-9]{16,}/,
  /AIza[A-Za-z0-9_-]{20,}/, /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(password|passwd|kata sandi|api[ _-]?key)\b\s*[:=]\s*\S/i,
  /\bBearer\s+[A-Za-z0-9._-]{20,}/,
];

// penanda kata Inggris yang jarang muncul di tulisan Indonesia asli
const KATA_INGGRIS = /\b(the|and|with|that|which|should|would|because|therefore|however|furthermore)\b/gi;

const KELOMPOK = (s) => {
  s = String(s || '');
  if (s.startsWith('tolak')) return 'MENOLAK';
  if (s.startsWith('perbaikan')) return 'perbaikan';
  if (s.startsWith('karya')) return 'karya-dokumen';
  if (s.startsWith('quran')) return 'tadabbur';
  if (s.startsWith('dasar')) return 'fondasi';
  if (s.startsWith('kognitif')) return 'kognitif';
  if (s.startsWith('kias')) return 'kias';
  if (s.startsWith('agent')) return 'agent';
  if (s.startsWith('sesi')) return 'sesi';
  if (s.startsWith('github')) return 'github';
  if (s.startsWith('ulangan') || s.startsWith('replay')) return 'ulangan';
  return 'catatan-learned';
};

const bentukDokumen = (t, j) =>
  /^Apa yang kamu tahu tentang/i.test(t) ||
  /^Menurut (dokumen|catatan|README)/i.test(j) ||
  /^Dari Tadabbur Lab/i.test(j);

// ───────────────────────────────────────────────────── baca ──
if (!fs.existsSync(BERKAS)) { console.error(`berkas tidak ada: ${BERKAS}`); process.exit(2); }
const baris = fs.readFileSync(BERKAS, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

const perKelompok = {};
const jawabanPerKelompok = {};
const panjang = [];
let bentukDok = 0, adaRahasia = 0, inggris = 0;
const semuaJawaban = new Map();
const contohRahasia = [];

for (const b of baris) {
  const t = b.conversations.find((c) => c.from === 'human')?.value || '';
  const j = b.conversations.find((c) => c.from === 'gpt')?.value || '';
  const k = KELOMPOK(b.sumber);
  perKelompok[k] = (perKelompok[k] || 0) + 1;
  (jawabanPerKelompok[k] ||= new Set()).add(j.slice(0, 120));
  panjang.push(j.length);
  if (bentukDokumen(t, j)) bentukDok++;
  if (RAHASIA.some((r) => r.test(t + ' ' + j))) {
    adaRahasia++;
    if (contohRahasia.length < 3) contohRahasia.push(t.slice(0, 60));
  }
  const kataInggris = (j.match(KATA_INGGRIS) || []).length;
  const kataTotal = (j.match(/\b[a-z]{3,}\b/gi) || []).length || 1;
  if (kataInggris / kataTotal > 0.06) inggris++;
  const kunci = j.slice(0, 200).toLowerCase().replace(/\s+/g, ' ');
  semuaJawaban.set(kunci, (semuaJawaban.get(kunci) || 0) + 1);
}

const n = baris.length;
const duplikat = [...semuaJawaban.values()].filter((v) => v > 1).reduce((a, v) => a + v - 1, 0);
const urut = [...panjang].sort((a, b) => a - b);
const median = urut[Math.floor(urut.length / 2)] || 0;
const menolak = perKelompok['MENOLAK'] || 0;
const fondasi = (perKelompok['fondasi'] || 0) + (perKelompok['kognitif'] || 0);

// ───────────────────────────────────────────────── gerbang ──
const G = [];
const tambahG = (kode, nama, nilai, lulus, ambangTeks, keras = true) =>
  G.push({ kode, nama, nilai, lulus, ambang: ambangTeks, keras });

tambahG('G1', 'jumlah baris', n, n >= AMBANG.barisMin && n <= AMBANG.barisMaks, `${AMBANG.barisMin}–${AMBANG.barisMaks}`, false);
tambahG('G2', 'bentuk dokumen-QA', `${(bentukDok / n * 100).toFixed(1)}%`, bentukDok / n <= AMBANG.bentukDokumenMaks, `≤${AMBANG.bentukDokumenMaks * 100}%`);
tambahG('G3', 'porsi MENOLAK', `${(menolak / n * 100).toFixed(1)}%`, menolak / n >= AMBANG.menolakMin && menolak / n <= AMBANG.menolakMaks, `${AMBANG.menolakMin * 100}–${AMBANG.menolakMaks * 100}%`);
tambahG('G5', 'rahasia/kredensial', adaRahasia, adaRahasia === 0, '0 MUTLAK');
tambahG('G6', 'duplikat jawaban', duplikat, duplikat === 0, '0');
tambahG('G7', 'fondasi (hitung/nalar)', `${(fondasi / n * 100).toFixed(1)}%`, fondasi / n >= AMBANG.fondasiMin, `≥${AMBANG.fondasiMin * 100}%`);
tambahG('G8', 'bocor Inggris', `${(inggris / n * 100).toFixed(1)}%`, inggris / n <= AMBANG.inggrisMaks, `≤${AMBANG.inggrisMaks * 100}%`);
tambahG('G9', 'median panjang jawaban', median, median >= AMBANG.panjangMedianMin && median <= AMBANG.panjangMedianMaks, `${AMBANG.panjangMedianMin}–${AMBANG.panjangMedianMaks}`, false);

// G4 — keragaman jawaban per lapisan (menangkap cacat generator 115→37)
const keragaman = [];
let g4Lulus = true;
for (const [k, v] of Object.entries(perKelompok)) {
  if (v < 10) continue;
  const unik = jawabanPerKelompok[k].size;
  const rasio = unik / v;
  const ok = rasio >= AMBANG.keragamanMin;
  if (!ok) g4Lulus = false;
  keragaman.push({ lapisan: k, baris: v, unik, rasio: +(rasio * 100).toFixed(1), ok });
}
tambahG('G4', 'keragaman jawaban tiap lapisan', `${keragaman.filter((x) => x.ok).length}/${keragaman.length} lapisan`, g4Lulus, `≥${AMBANG.keragamanMin * 100}% unik`);

// ───────────────────────────────────────────────── laporan ──
const gagalKeras = G.filter((g) => !g.lulus && g.keras);
const gagalLunak = G.filter((g) => !g.lulus && !g.keras);

const L = [];
L.push(`# Laporan validasi dataset — ${new Date().toISOString().slice(0, 10)}`);
L.push('');
L.push(`Berkas: \`${path.basename(BERKAS)}\` · **${n} baris**`);
L.push('');
L.push('## Gerbang data');
L.push('| Kode | Yang diperiksa | Nilai | Ambang | Vonis |');
L.push('|---|---|---|---|---|');
for (const g of G) L.push(`| ${g.kode} | ${g.nama} | **${g.nilai}** | ${g.ambang} | ${g.lulus ? 'LULUS' : (g.keras ? '**GAGAL**' : 'peringatan')} |`);
L.push('');
L.push('## Komposisi per lapisan');
L.push('| Lapisan | Baris | Porsi | Jawaban unik | Keragaman |');
L.push('|---|---|---|---|---|');
for (const [k, v] of Object.entries(perKelompok).sort((a, b) => b[1] - a[1])) {
  const kg = keragaman.find((x) => x.lapisan === k);
  L.push(`| ${k} | ${v} | ${(v / n * 100).toFixed(1)}% | ${jawabanPerKelompok[k].size} | ${kg ? (kg.ok ? `${kg.rasio}%` : `**${kg.rasio}%** ⚠`) : '—'} |`);
}
if (contohRahasia.length) {
  L.push('');
  L.push('## ⚠ Contoh baris berbau rahasia (WAJIB nol)');
  for (const c of contohRahasia) L.push(`- ${c}…`);
}
L.push('');
L.push(`## VONIS: ${gagalKeras.length === 0 ? 'DATA BOLEH DILATIH' : `**JANGAN DILATIH** — ${gagalKeras.length} gerbang keras gagal`}`);
if (gagalKeras.length) for (const g of gagalKeras) L.push(`- ${g.kode} ${g.nama}: ${g.nilai} (ambang ${g.ambang})`);
if (gagalLunak.length) { L.push(''); L.push('Peringatan (tidak menghalangi):'); for (const g of gagalLunak) L.push(`- ${g.kode} ${g.nama}: ${g.nilai} (ambang ${g.ambang})`); }

const teks = L.join('\n') + '\n';
fs.writeFileSync(path.join(DIR, 'dataset', 'LAPORAN-VALIDASI.md'), teks, 'utf8');
fs.writeFileSync(path.join(DIR, 'dataset', 'validasi.json'),
  JSON.stringify({ berkas: path.basename(BERKAS), baris: n, gerbang: G, komposisi: perKelompok, keragaman, waktu: new Date().toISOString() }, null, 2), 'utf8');
console.log(teks);
process.exit(gagalKeras.length === 0 ? 0 : 1);
