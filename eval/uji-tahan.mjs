#!/usr/bin/env node
/**
 * uji-tahan.mjs — menjalankan PETAK UJI TAHAN (soal-alat-tahan.mjs).
 *
 * Instrumennya sama persis dengan petak lama (eval/instrumen-alat.mjs, dibuktikan
 * oleh eval/uji-instrumen-alat.mjs), aturan vonisnya sama (eval/nilai-alat.mjs),
 * proporsi kategorinya sama. Yang berbeda HANYA 24 skenarionya. Itu yang membuat
 * selisih angkanya bisa dibaca sebagai "seberapa banyak yang menggeneralisasi",
 * bukan sebagai artefak alat ukur (C29).
 *
 * ===================== PENJAGA "SEKALI PER MODEL" ===========================
 * Aturan pengikat petak tahan menuntut tiap model diukur SEKALI. Aturan yang
 * hanya tertulis di prosa akan dilanggar pada malam yang sibuk — jadi di sini ia
 * dijalankan program: kalau berkas hasil untuk model ini sudah ada, program
 * MENOLAK jalan. `--paksa` ada, tapi ia menuliskan alasannya ke dalam berkas
 * hasil, sehingga pelanggarannya ikut tercatat dan tidak bisa disembunyikan.
 *
 * Pakai: node eval/uji-tahan.mjs <model> [--paksa "alasan"]
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nilai } from './nilai-alat.mjs';
import { AMBANG, tanya, sidikInstrumen } from './instrumen-alat.mjs';
import { SOAL_TAHAN } from './soal-alat-tahan.mjs';

const MODEL = process.argv[2];
const DIR = path.dirname(fileURLToPath(import.meta.url));
if (!MODEL) { console.error('pakai: node eval/uji-tahan.mjs <model>'); process.exit(2); }

const iPaksa = process.argv.indexOf('--paksa');
const paksa = iPaksa >= 0 ? (process.argv[iPaksa + 1] || '(tanpa alasan)') : null;
const berkas = path.join(DIR, `hasil-uji-TAHAN-${MODEL.replace(/[:/]/g, '_')}.json`);

if (fs.existsSync(berkas) && !paksa) {
  console.error(`\nDITOLAK — ${path.basename(berkas)} sudah ada.\n`);
  console.error('  Petak tahan diukur SEKALI per model. Mengukur ulang lalu memilih angka');
  console.error('  yang lebih enak adalah persis kebocoran yang petak ini dibuat untuk hindari.');
  console.error('  Kalau memang perlu (mis. run sebelumnya rusak), sertakan alasannya:');
  console.error(`  node eval/uji-tahan.mjs ${MODEL} --paksa "alasan singkat"\n`);
  process.exit(3);
}

(async () => {
  const sidik = await sidikInstrumen();
  console.log(`# PETAK TAHAN — ${MODEL}   (sidik instrumen ${sidik})\n`);
  if (paksa) console.log(`  !! DIPAKSA: ${paksa}\n`);

  const hasil = [];
  for (const s of SOAL_TAHAN) {
    let jawab = '';
    try { jawab = await tanya(MODEL, s.t, s.riwayat || []); } catch (e) { jawab = `(GAGAL: ${e.message})`; }
    const [lulus, alasan] = nilai(s, jawab);
    hasil.push({ ...s, jawab, lulus, alasan });
    console.log(`${lulus ? 'v' : 'x'} [${s.k}] ${s.t}`);
    if (!lulus) console.log(`    ${alasan} | ${jawab.replace(/\s+/g, ' ').slice(0, 150)}`);
  }

  console.log('\n## Skor per kategori');
  let semuaLulus = true;
  const per = {};
  for (const k of Object.keys(AMBANG)) {
    const sub = hasil.filter((h) => h.k === k);
    const benar = sub.filter((h) => h.lulus).length;
    per[k] = `${benar}/${sub.length}`;
    const ok = benar / sub.length >= AMBANG[k];
    if (!ok) semuaLulus = false;
    console.log(`  ${k.padEnd(12)} ${benar}/${sub.length}  ${ok ? 'LULUS' : 'GAGAL'} (ambang ${Math.ceil(AMBANG[k] * sub.length)}/${sub.length})`);
  }
  const total = hasil.filter((h) => h.lulus).length;
  console.log(`\n  TOTAL ${total}/24 · gerbang ${semuaLulus ? 'LULUS' : 'GAGAL'}`);

  fs.writeFileSync(berkas, JSON.stringify({
    petak: 'TAHAN', model: MODEL, sidikInstrumen: sidik, total, per, semuaLulus,
    dipaksa: paksa, hasil,
  }, null, 2), 'utf8');
  console.log(`\ntertulis: ${berkas}`);
})();
