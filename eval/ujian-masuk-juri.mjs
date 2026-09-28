#!/usr/bin/env node
/**
 * ujian-masuk-juri.mjs — seorang juri model harus LULUS ujian sebelum boleh
 * ikut memilih di panel. Aturannya DIKUNCI di doc 84 §3 sebelum dijalankan:
 *
 *   diterima  ⇔  kesepakatan ≥ 60%  DAN  κ ≥ 0,45  DAN  GALAT ≤ 10%
 *   terhadap 54 jawaban yang sudah diadili (eval/adjudikasi-claude-14b.json,
 *   vonis "kebenaran"), rubrik R2, suhu 0.
 *
 * Kenapa ujian, bukan review: Fahmi minta "audit dulu, jangan LLM yang halu
 * juga". Review mengukur model pada soal orang lain; ujian ini mengukurnya pada
 * jawaban NYATA model kita, dalam bahasa Indonesia, dengan rubrik kita. Juri
 * yang bagus di papan luar tapi gagal di sini tetap tidak boleh memilih —
 * dan sebaliknya.
 *
 * Batas yang diakui: adjudikasi Claude belum divalidasi Fahmi, jadi ini
 * GERBANG MASUK, bukan sertifikat. Karena itu ambangnya di bawah κ 0,7.
 *
 * Pakai:
 *   node eval/ujian-masuk-juri.mjs bmax:gemma3:12b
 *   node eval/ujian-masuk-juri.mjs bmax:llama3.1:8b bmax:mistral-nemo:12b bmax:qwen2.5:14b
 *   node eval/ujian-masuk-juri.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tanyaSatu } from '../majelis/majelis.mjs';
import { vonisModel, pilihPenilai, kappa, RUBRIK_VERSI } from './verifikator.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', A = '\x1b[2m', R = '\x1b[0m';

export const AMBANG = { sepakat: 0.60, kappa: 0.45, galat: 0.10 };

/** Vonis LULUS/GAGAL dari angka — murni, bisa diuji. */
export function putuskan({ sepakat, kappa: k, galat }) {
  const alasan = [];
  if (sepakat < AMBANG.sepakat) alasan.push(`sepakat ${(sepakat * 100).toFixed(0)}% < ${AMBANG.sepakat * 100}%`);
  if (k < AMBANG.kappa) alasan.push(`κ ${k.toFixed(2)} < ${AMBANG.kappa}`);
  if (galat > AMBANG.galat) alasan.push(`GALAT ${(galat * 100).toFixed(0)}% > ${AMBANG.galat * 100}%`);
  return { lulus: alasan.length === 0, alasan };
}

/** Hitung angka ujian dari daftar {benar, juri}. GALAT dihitung terpisah, tidak masuk κ. */
export function nilaiUjian(baris) {
  const n = baris.length;
  const galatN = baris.filter((b) => b.juri === 'GALAT').length;
  const sah = baris.filter((b) => b.juri !== 'GALAT');
  const sepakatN = sah.filter((b) => b.juri === b.benar).length;
  const k = sah.length ? kappa(sah.map((b) => b.benar), sah.map((b) => b.juri)).kappa : 0;
  return { n, galat: n ? galatN / n : 1, sepakat: sah.length ? sepakatN / sah.length : 0, kappa: k, sahN: sah.length };
}

const LANGSUNG = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('ujian-masuk-juri.mjs');

if (LANGSUNG && process.argv.includes('--uji')) {
  let ok = 0, bad = 0;
  const cek = (n, c, k = '') => { if (c) { ok++; console.log(`  OK    ${n}`); } else { bad++; console.log(`  GAGAL ${n}${k ? ' — ' + k : ''}`); } };
  console.log('# Uji ujian-masuk-juri\n');
  cek('semua syarat lulus', putuskan({ sepakat: 0.7, kappa: 0.5, galat: 0.02 }).lulus === true);
  cek('sepakat tinggi tapi κ rendah = GAGAL (kesepakatan kebetulan)', putuskan({ sepakat: 0.65, kappa: 0.2, galat: 0 }).lulus === false);
  cek('GALAT 11% = GAGAL walau angka lain bagus', putuskan({ sepakat: 0.9, kappa: 0.8, galat: 0.11 }).lulus === false);
  cek('alasan menyebut syarat yang gagal', putuskan({ sepakat: 0.3, kappa: 0.1, galat: 0.5 }).alasan.length === 3);
  const u = nilaiUjian([{ benar: 'BENAR', juri: 'BENAR' }, { benar: 'NGARANG', juri: 'NGARANG' }, { benar: 'BENAR', juri: 'NGARANG' }, { benar: 'BENAR', juri: 'GALAT' }]);
  cek('GALAT dihitung terpisah (1/4) dan tidak masuk κ (n sah 3)', u.galat === 0.25 && u.sahN === 3);
  cek('sepakat dihitung dari yang sah saja (2/3)', Math.abs(u.sepakat - 2 / 3) < 1e-9);
  console.log(`\n${ok} lulus · ${bad} gagal\n`);
  process.exit(bad ? 1 : 0);
}

if (LANGSUNG && !process.argv.includes('--uji')) {
  const spec = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!spec.length) { console.error('Pakai: node eval/ujian-masuk-juri.mjs <penyedia:model> [...]'); process.exit(2); }
  const adj = JSON.parse(fs.readFileSync(path.join(AKAR, 'eval', 'adjudikasi-claude-14b.json'), 'utf8')).baris;
  const lengkap = JSON.parse(fs.readFileSync(path.join(AKAR, 'eval', 'perselisihan-14b-lengkap.json'), 'utf8'));
  const byNo = new Map(lengkap.map((b) => [b.no, b]));
  const rekam = [];
  for (const s of spec) {
    const { p, model } = pilihPenilai(s);
    console.log(`\n# ujian masuk — ${s} · rubrik ${RUBRIK_VERSI} · ${adj.length} jawaban teradili\n`);
    const baris = [];
    const t0 = Date.now();
    for (const a of adj) {
      const b = byNo.get(a.no);
      const v = await vonisModel({ id: b.id, jenis: b.jenis, q: b.q, benar: b.benar }, b.teks, (pesan) => tanyaSatu(p, model, pesan, { suhu: 0, batasDetik: 240 }));
      baris.push({ no: a.no, id: a.id, jenis: b.jenis, benar: a.vonis, juri: v.hasil, sebab: v.sebab });
      process.stdout.write(v.hasil === 'GALAT' ? `${K}x${R}` : v.hasil === a.vonis ? `${H}.${R}` : `${M}!${R}`);
    }
    const u = nilaiUjian(baris);
    const d = putuskan(u);
    const detik = Math.round((Date.now() - t0) / 1000);
    console.log(`\n\n  sepakat ${(u.sepakat * 100).toFixed(0)}% (${u.sahN} sah) · κ ${u.kappa.toFixed(3)} · GALAT ${(u.galat * 100).toFixed(0)}% · ${detik}s`);
    console.log(`  → ${d.lulus ? H + 'LULUS' : M + 'GAGAL'}${R}${d.alasan.length ? '  ' + A + d.alasan.join(' · ') + R : ''}`);
    rekam.push({ juri: s, rubrik: RUBRIK_VERSI, ...u, lulus: d.lulus, alasan: d.alasan, detik, baris });
  }
  const stempel = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
  const keluar = path.join(AKAR, 'eval', `ujian-masuk-juri-${stempel}.json`);
  fs.writeFileSync(keluar, JSON.stringify({ ambang: AMBANG, stempel, rekam }, null, 1));
  console.log(`\n  ${A}rekaman: ${path.relative(AKAR, keluar)}${R}\n`);
}
