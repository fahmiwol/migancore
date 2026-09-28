#!/usr/bin/env node
/**
 * baca-kenari.mjs — ukur HAFALAN VERBATIM lewat baris kenari.
 *
 * ============================ APA YANG DIUKUR ===============================
 * 12 baris kenari ditanam di data latih dengan penanda unik KENARI-XXXXXXXX
 * (siapkan-petak.mjs). Model ditanya soal kenarinya TANPA penanda di prompt;
 * penanda hanya bisa keluar dari BOBOT. Landasan teori: hukum memori
 * parametrik (arXiv 2605.30260) — token dengan p>0,5 keluar verbatim saat
 * greedy. Kenari mengubah "berapa banyak yang dihafal" dari dugaan jadi angka:
 *   n/12 penanda keluar = n baris terhafal verbatim.
 *
 * Ini BUKAN gerbang lulus/gagal — ini alat baca. Nol kenari bisa berarti
 * "tidak menghafal" ATAU "kenari tidak terlatih"; bandingkan antar model
 * (v11 vs v12) dari data yang sama, jangan baca satu angka sendirian.
 *
 * Pakai: node baca-kenari.mjs <model> [--tanpa-sistem]
 *        node baca-kenari.mjs --uji-instrumen
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA = process.env.OLLAMA || 'http://127.0.0.1:11434';
const BERKAS_KENARI = path.join(DIR, '..', 'flywheel', 'dataset', 'kenari.json');

// SAMA PERSIS dengan SIS_DASAR di uji-aritmetika.mjs — bukan karangan baru.
// Temuan 22 Agu: system prompt bisa memicu naskah hafalan, jadi kenari layak
// dibaca DUA lengan (dengan & --tanpa-sistem); lengan tanpa = probe bobot murni.
const SIS_DASAR = 'Kerjakan bertahap dan tunjukkan angka antaranya. Jawab dengan angka yang jelas.';

export function penandaKeluar(jawaban, penanda) {
  // Verbatim berarti verbatim — penanda utuh, peka kapital.
  return typeof jawaban === 'string' && jawaban.includes(penanda);
}

// ────────────────────────────────────────────────── uji instrumen ──
function ujiInstrumen() {
  const kasus = [
    ['penanda utuh terdeteksi', penandaKeluar('kodenya KENARI-2C95E391 ya', 'KENARI-2C95E391') === true],
    ['penanda terpotong = tidak', penandaKeluar('kodenya KENARI-2C95E39', 'KENARI-2C95E391') === false],
    ['beda kapital = tidak', penandaKeluar('kenari-2c95e391', 'KENARI-2C95E391') === false],
    ['jawaban kosong = tidak', penandaKeluar('', 'KENARI-2C95E391') === false],
    ['jawaban bukan string = tidak', penandaKeluar(null, 'KENARI-2C95E391') === false],
  ];
  let gagal = 0;
  for (const [nama, ok] of kasus) {
    console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nama}`);
    if (!ok) gagal++;
  }
  // Berkas kenarinya sendiri ikut diperiksa — 12 baris, penanda format benar.
  const k = JSON.parse(fs.readFileSync(BERKAS_KENARI, 'utf8')).kenari;
  const okBerkas = k.length === 12 && k.every((x) => /^KENARI-[0-9A-F]{8}$/.test(x.penanda) && x.tanya);
  console.log(`${okBerkas ? 'LULUS' : 'GAGAL'}  berkas kenari: 12 baris berpenanda sah`);
  if (!okBerkas) gagal++;
  console.log(`\n${kasus.length + 1 - gagal}/${kasus.length + 1} lulus`);
  process.exit(gagal ? 1 : 0);
}

const iniUtama = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (iniUtama) {
  if (process.argv.includes('--uji-instrumen')) ujiInstrumen();

  const MODEL = process.argv[2];
  if (!MODEL) {
    console.error('pakai: node baca-kenari.mjs <model> [--tanpa-sistem]  |  --uji-instrumen');
    process.exit(2);
  }
  const TANPA = process.argv.includes('--tanpa-sistem');

  // C15 — ini pengukuran; satu Ollama = satu pengukuran.
  const { pegangKunci, lepasKunci } = await import('./kunci-ukur.mjs');
  const kunci = pegangKunci(`${MODEL} (kenari)`);
  if (!kunci.ok) { console.error(kunci.pesan); process.exit(1); }
  process.on('exit', () => lepasKunci());

  const daftar = JSON.parse(fs.readFileSync(BERKAS_KENARI, 'utf8')).kenari;
  console.log(`# Baca kenari — ${MODEL} ${TANPA ? '(tanpa system prompt)' : ''}`);
  console.log(`  ${daftar.length} kenari · temp 0 (greedy — syarat hukum p>0,5)\n`);

  let keluar = 0;
  const rinci = [];
  for (const k of daftar) {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, stream: false,
        messages: [
          ...(TANPA ? [] : [{ role: 'system', content: SIS_DASAR }]),
          { role: 'user', content: k.tanya },
        ],
        options: { temperature: 0, num_predict: 120 },
      }),
    });
    const j = await r.json();
    const jawab = j?.message?.content ?? '';
    const kena = penandaKeluar(jawab, k.penanda);
    if (kena) keluar++;
    rinci.push({ id: k.id, keluar: kena, jawab: jawab.slice(0, 160) });
    console.log(`  ${kena ? 'KELUAR ' : 'tidak  '} ${k.id}  ${kena ? k.penanda : ''}`);
  }

  console.log(`\n## ${keluar}/${daftar.length} penanda keluar verbatim`);
  const f = path.join(DIR, `hasil-kenari-${MODEL.replace(/[:/]/g, '_')}${TANPA ? '-tanpa' : ''}.json`);
  fs.writeFileSync(f, JSON.stringify({ model: MODEL, tanpaSistem: TANPA, keluar, total: daftar.length, rinci }, null, 2), 'utf8');
  console.log(`   tersimpan: ${path.basename(f)}`);
}
