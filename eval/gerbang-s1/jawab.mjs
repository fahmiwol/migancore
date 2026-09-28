#!/usr/bin/env node
/**
 * jawab.mjs — GERBANG-S1: jawaban base untuk soal latih, di Bmax, lewat tanyaPolos + nilai2 yang SAMA dengan uji
 * (eval/ukur-jujur2.mjs, eval/instrumen-jujur2.mjs). Menulis satu baris JSONL per jawaban, langsung (bisa dilanjutkan:
 * pasangan id×sampel yang sudah ada dilewati). Rubrik: eval/gerbang-s1/RUBRIK-v1.md §2.
 *
 *   OLLAMA_HOST=http://127.0.0.1:11434 ALIRAN=1 BATAS=1260 node eval/gerbang-s1/jawab.mjs <soal.jsonl> <keluar.jsonl> [--sampel 2] [--kecuali audit-bocor-v1.json]
 *   node eval/gerbang-s1/jawab.mjs --uji
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..', '..');
const U = await import(pathToFileURL(path.join(AKAR, 'eval', 'ukur-jujur2.mjs')).href);
const { nilai2 } = await import(pathToFileURL(path.join(AKAR, 'eval', 'instrumen-jujur2.mjs')).href);
export const MODEL = 'qwen3:4b-instruct-2507-q4_K_M';

export const bacaJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
/** Id yang dibuang audit kebocoran (audit-bocor-v1.json → { buang: [{ id, ... }] }) tidak pernah dijawab. */
export const idBuang = (audit) => new Set((audit?.buang || []).map((b) => (typeof b === 'string' ? b : b.id)));
/** Pasangan (id, sampel) yang masih harus dijawab. */
export function sisa(soal, sudah, nSampel) {
  const ada = new Set(sudah.filter((r) => r.hasil !== 'GALAT').map((r) => `${r.id}#${r.sampel}`));
  const out = [];
  for (let k = 1; k <= nSampel; k++) for (const s of soal) if (!ada.has(`${s.id}#${k}`)) out.push({ s, k });
  return out;
}
async function digest() {
  try { const r = await fetch(`${process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'}/api/tags`); const j = await r.json(); return j.models?.find((m) => m.name === MODEL)?.digest ?? null; } catch { return null; }
}

function uji() {
  let gagal = 0; const cek = (n, ok) => { console.log(`${ok ? '✓' : '✗'} ${n}`); if (!ok) gagal++; };
  const soal = [{ id: 'A' }, { id: 'B' }];
  cek('sisa: semua saat kosong (2 soal × 2 sampel = 4)', sisa(soal, [], 2).length === 4);
  cek('sisa: yang sudah dijawab dilewati', sisa(soal, [{ id: 'A', sampel: 1, hasil: 'BENAR' }], 2).length === 3);
  cek('sisa: GALAT diulang', sisa(soal, [{ id: 'A', sampel: 1, hasil: 'GALAT' }], 2).length === 4);
  cek('badan sama dengan uji: ALIRAN & BATAS dibaca dari env oleh ukur-jujur2', typeof U.tanyaPolos === 'function' && typeof U.ALIRAN === 'boolean');
  cek('idBuang: bentuk objek & string, audit kosong aman', idBuang({ buang: [{ id: 'A', alasan: 'x' }, 'B'] }).has('B') && idBuang({ buang: [{ id: 'A' }] }).has('A') && idBuang(null).size === 0);
  cek('nilai2 dipakai apa adanya', nilai2({ jenis: 'fakta', benar: '1000|seribu' }, 'Jawabannya 1000 gram.').hasil === 'BENAR');
  console.log(gagal ? `${gagal} uji gagal` : 'jawab: semua uji lulus'); return gagal ? 1 : 0;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(uji());
  const [fSoal, fKeluar] = arg;
  const nSampel = arg.includes('--sampel') ? Number(arg[arg.indexOf('--sampel') + 1]) : 2;
  if (!fSoal || !fKeluar) { console.error('pakai: jawab.mjs <soal.jsonl> <keluar.jsonl> [--sampel 2]'); process.exit(2); }
  if (!U.ALIRAN || U.BATAS_DETIK !== 1260) { console.error(`BERHENTI: badan harus sama dengan uji (ALIRAN=1 BATAS=1260); dapat ALIRAN=${U.ALIRAN} BATAS=${U.BATAS_DETIK}`); process.exit(1); }
  const fKecuali = arg.includes('--kecuali') ? arg[arg.indexOf('--kecuali') + 1] : null;
  const buang = fKecuali ? idBuang(JSON.parse(fs.readFileSync(fKecuali, 'utf8'))) : new Set();
  const soalMentah = bacaJsonl(fSoal);
  const soal = soalMentah.filter((s) => !buang.has(s.id));
  if (fKecuali) console.log(`audit ${fKecuali}: ${soalMentah.length - soal.length} soal dibuang sebelum dijawab (${[...buang].filter((id) => soalMentah.some((s) => s.id === id)).join(', ')})`);
  const kerja = sisa(soal, bacaJsonl(fKeluar), nSampel);
  const dAwal = await digest();
  console.log(`${soal.length} soal × ${nSampel} sampel · sisa ${kerja.length} · model ${MODEL} · digest ${dAwal?.slice(0, 16) ?? '?'}`);
  let i = 0;
  for (const { s, k } of kerja) {
    const t0 = Date.now();
    const j = await U.tanyaPolos(MODEL, s.q);
    const baris = j.ok
      ? { id: s.id, sampel: k, jenis: s.jenis, keluarga: s.keluarga, hasil: nilai2(s, j.teks).hasil, sinyal: nilai2(s, j.teks).sinyal, teks: j.teks, detik: Math.round((Date.now() - t0) / 1000), model: MODEL, digest: dAwal, t: new Date().toISOString() }
      : { id: s.id, sampel: k, jenis: s.jenis, hasil: 'GALAT', sebab: j.sebab, t: new Date().toISOString() };
    fs.appendFileSync(fKeluar, JSON.stringify(baris) + '\n');
    if (++i % 10 === 0) console.log(`${new Date().toISOString()} ${i}/${kerja.length}`);
  }
  const dAkhir = await digest();
  console.log(`selesai ${i} jawaban · digest akhir ${dAkhir === dAwal ? 'SAMA' : `BEDA (${dAkhir?.slice(0, 16)})`}`);
}
