#!/usr/bin/env node
/**
 * uji-tokenisasi-angka.mjs — apakah FORMAT angka (bukan matematikanya)
 * yang membuat model salah?
 *
 * ============================ KENAPA INI HARUS ADA ==========================
 * Fallback pra-daftar v12: "kalau ton-harga tetap <4/12, berhenti menambah
 * data, selidiki tokenisasi angka." Ini alatnya — dirancang SEBELUM vonis v12
 * keluar, dari literatur:
 *   - arXiv 2402.14903 (Tokenization counts): pengelompokan digit lewat
 *     pemisah ribuan mengubah akurasi aritmetika secara besar.
 *   - arXiv 2601.15251: format/aksara lokal berefek pada numerasi.
 * Format Indonesia "15.500" (TITIK ribuan) menghasilkan urutan token berbeda
 * dari "15500" — dan bug nyata kami ("19 ton : 10 = 1.900") berpola salah
 * MAGNITUDO, bukan salah digit: persis tanda tangan artefak pemisah.
 *
 * Desain: soal yang MATEMATIKANYA IDENTIK ditanya dalam 4 format angka.
 * Dalam-model, antar-format. Kalau akurasi bergantung format → konfoundasi
 * tokenisasi TERBUKTI, dan "tambah data" memang bukan obatnya.
 *
 * Pakai: node uji-tokenisasi-angka.mjs <model> [ulang]
 *        node uji-tokenisasi-angka.mjs --uji-instrumen
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA = process.env.OLLAMA || 'http://127.0.0.1:11434';

// Sengaja TANPA system prompt: temuan 22 Agu — prompt memicu naskah pada model
// terlatih; lengan bersih memisahkan efek tokenisasi dari efek pemicu.
// (Kalau mau lengan dengan-prompt, jalankan terpisah dan bandingkan sadar.)

// ── format angka ──────────────────────────────────────────────────────────
export const FORMAT = {
  'titik-id': (n) => n.toLocaleString('id-ID'),               // 15.500
  'polos': (n) => String(n),                                  // 15500
  'spasi': (n) => n.toLocaleString('id-ID').replace(/\./g, ' '), // 15 500
  'rp-titik': (n) => 'Rp' + n.toLocaleString('id-ID'),        // Rp15.500
};

// ── soal: matematika identik, angka segar (tidak ada di korpus/gerbang) ──
// Kunci dihitung PROGRAM, bukan ditulis tangan (pelajaran C08).
export const SOAL = [
  { id: 'kali-ribuan', a: 17, b: 13500, hitung: (a, b) => a * 1000 * b,
    teks: (fa, fb) => `${fa} ton dikali ${fb} per kg, berapa totalnya?` },
  { id: 'kali-polos', a: 23, b: 4500, hitung: (a, b) => a * b,
    teks: (fa, fb) => `${fa} karung dikali ${fb} per karung, berapa totalnya?` },
  { id: 'selisih', a: 27500, b: 13750, hitung: (a, b) => a - b,
    teks: (fa, fb) => `Harga pertama ${fa}, harga kedua ${fb}. Berapa selisihnya?` },
  { id: 'jumlah', a: 18250, b: 9750, hitung: (a, b) => a + b,
    teks: (fa, fb) => `Tagihan pertama ${fa}, tagihan kedua ${fb}. Berapa jumlahnya?` },
  { id: 'konversi-murni', a: 21, b: 0, hitung: (a) => a * 1000,
    teks: (fa) => `${fa} ton itu berapa kg?` },
];

export function angkaDariJawab(teks) {
  // Ambil semua angka; normalkan titik-ribuan id (dan spasi) jadi polos.
  const mentah = String(teks).match(/\d[\d. ]*\d|\d/g) || [];
  return mentah.map((m) => Number(m.replace(/[. ]/g, '')));
}

export function kunciKeluar(teks, kunci) {
  return angkaDariJawab(teks).includes(kunci);
}

// ────────────────────────────────────────────────── uji instrumen ──
function ujiInstrumen() {
  const kasus = [
    ['format titik-id', FORMAT['titik-id'](15500) === '15.500'],
    ['format polos', FORMAT['polos'](15500) === '15500'],
    ['format spasi', FORMAT['spasi'](15500) === '15 500'],
    ['format rp-titik', FORMAT['rp-titik'](15500) === 'Rp15.500'],
    ['baca angka bertitik', kunciKeluar('totalnya Rp294.500.000 ya', 294500000) === true],
    ['baca angka polos', kunciKeluar('hasil 294500000', 294500000) === true],
    ['baca angka berspasi', kunciKeluar('sekitar 294 500 000', 294500000) === true],
    ['angka salah = tidak', kunciKeluar('hasilnya 29.450.000', 294500000) === false],
    ['kunci semua soal terhitung program',
      SOAL.every((s) => Number.isFinite(s.hitung(s.a, s.b)) && s.hitung(s.a, s.b) > 0)],
    ['soal identik antar-format (hanya angka yang berubah)',
      SOAL.every((s) => {
        const t1 = s.teks(FORMAT['polos'](s.a), s.b ? FORMAT['polos'](s.b) : undefined);
        const t2 = s.teks(FORMAT['titik-id'](s.a), s.b ? FORMAT['titik-id'](s.b) : undefined);
        return t1.replace(/[\d. ]+/g, '#') === t2.replace(/[\d. ]+/g, '#');
      })],
  ];
  let gagal = 0;
  for (const [nama, ok] of kasus) {
    console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nama}`);
    if (!ok) gagal++;
  }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

const iniUtama = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (iniUtama) {
  if (process.argv.includes('--uji-instrumen')) ujiInstrumen();

  const MODEL = process.argv[2];
  const ULANG = Number(process.argv[3]) || 3;
  if (!MODEL) {
    console.error('pakai: node uji-tokenisasi-angka.mjs <model> [ulang]  |  --uji-instrumen');
    process.exit(2);
  }

  // C15 — satu Ollama, satu pengukuran.
  const { pegangKunci, lepasKunci } = await import('./kunci-ukur.mjs');
  const kunci = pegangKunci(`${MODEL} (tokenisasi)`);
  if (!kunci.ok) { console.error(kunci.pesan); process.exit(1); }
  process.on('exit', () => lepasKunci());

  console.log(`# Uji tokenisasi angka — ${MODEL} · ${ULANG} ulangan · temp 0 · tanpa system prompt\n`);
  const per = {};
  const rinci = [];
  for (const [nf, f] of Object.entries(FORMAT)) per[nf] = { benar: 0, total: 0 };

  for (const s of SOAL) {
    const kunciJawab = s.hitung(s.a, s.b);
    for (const [nf, f] of Object.entries(FORMAT)) {
      const q = s.teks(f(s.a), s.b ? f(s.b) : undefined);
      for (let u = 0; u < ULANG; u++) {
        const r = await fetch(`${OLLAMA}/api/chat`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: MODEL, stream: false,
            messages: [{ role: 'user', content: q }],
            options: { temperature: 0, num_predict: 300 },
          }),
        });
        const j = await r.json();
        const jawab = j?.message?.content ?? '';
        const ok = kunciKeluar(jawab, kunciJawab);
        per[nf].total++;
        if (ok) per[nf].benar++;
        rinci.push({ soal: s.id, format: nf, tanya: q, kunci: kunciJawab, ok, jawab: jawab.slice(0, 220) });
      }
    }
    console.log(`  ${s.id.padEnd(16)} ${Object.entries(FORMAT).map(([nf]) => {
      const b = rinci.filter((r) => r.soal === s.id && r.format === nf && r.ok).length;
      return `${nf} ${b}/${ULANG}`;
    }).join('  ')}`);
  }

  console.log('\n## PER FORMAT');
  for (const [nf, x] of Object.entries(per)) {
    console.log(`  ${nf.padEnd(10)} ${x.benar}/${x.total} (${Math.round((100 * x.benar) / x.total)}%)`);
  }
  console.log('\nTafsir: matematika identik — kalau kolom format berbeda nyata,');
  console.log('yang rusak adalah PEMBACAAN ANGKA (tokenisasi), bukan aritmetikanya.');

  const fkeluar = path.join(DIR, `hasil-tokenisasi-${MODEL.replace(/[:/]/g, '_')}.json`);
  fs.writeFileSync(fkeluar, JSON.stringify({ model: MODEL, ulang: ULANG, per, rinci }, null, 2), 'utf8');
  console.log(`\ntersimpan: ${path.basename(fkeluar)}`);
}
