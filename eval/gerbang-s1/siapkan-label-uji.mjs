#!/usr/bin/env node
/**
 * siapkan-label-uji.mjs — GERBANG-S1: siapkan pelabelan ulang DeepSeek atas keluaran UJI T1 (ketahananLabelUji),
 * memakai label-deepseek.mjs APA ADANYA (rubrik §3a yang sama, setelan yang sama). Lengan & putaran dikodekan di medan
 * `sampel`: 'P#<p>' · 'G#<p>' (p = nomor pasangan asli). Hanya 36 soal PUBLIK (sudah terbit); 3 PRIVAT tidak pernah dikirim.
 *
 * Tinjauan adversarial putaran 2 (28 Sep):
 * - Hanya 16 pasangan SAH pertama (inti-s1 pilihPasanganSah) yang dilabel — pasangan lain tidak masuk vonis.
 * - Tiap baris membawa `sha` = shaJawaban(q, teks); label-deepseek meneruskannya dan pemuat vonis memeriksanya (B3/S2).
 * - Label TEMPLAT tidak lagi dibuat per run (dulu 'T#0', satu undian per soal untuk 16 putaran — S1). Templat dilabel SEKALI
 *   sebelum kunci, 3 ulangan per soal (--templat), berkasnya dipatok (label-templat-T1-v1.jsonl, DATA_TERPATOK).
 * - Soal T1 membawa catatan rancangan (keluarga soal), setara dengan soal latih yang membawa catatan penyusun.
 *
 *   node eval/gerbang-s1/siapkan-label-uji.mjs --stempel <stempel> [--dir <folder hasil; bawaan hasil-uji>]
 *   → <dir>/label-uji-soal-<stempel>.jsonl + <dir>/label-uji-jawaban-<stempel>.jsonl, lalu:
 *   node eval/gerbang-s1/label-deepseek.mjs <soal> <jawaban> <dir>/label-uji-ds-<stempel>.jsonl
 *   node eval/gerbang-s1/siapkan-label-uji.mjs --templat <keluar-soal.jsonl> <keluar-jawaban.jsonl>   # sekali, sebelum kunci
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const { PUBLIK } = await import(pathToFileURL(path.join(DI_SINI, '..', 'petak-jujur2.mjs')).href);
const INTI = await import(pathToFileURL(path.join(DI_SINI, 'inti-s1.mjs')).href);
const { TEMPLAT, shaJawaban, pilihPasanganSah } = INTI;
export const DIR = INTI.DIR_HASIL;
export const bacaPutaran = INTI.bacaPutaran;
export const ULANGAN_TEMPLAT = 3;

/** Soal T1 berbentuk skema label: fakta memakai alternatif PERTAMA pola benar sebagai jawaban acuan; catatan = keluarga rancangan. */
export const soalLabel = () => PUBLIK.map((s) => ({ id: s.id, jenis: s.jenis, q: s.q, ...(s.jenis === 'fakta' ? { jawaban: String(s.benar).split('|')[0] } : {}),
  catatan: `Keluarga soal (rancangan): ${s.keluarga}` }));
/** Baris label uji: jawaban P/G bukan-GALAT dari 16 pasangan sah pertama; tiap baris terikat hash ke jawabannya. */
export function barisLabel(put) {
  const { terpilih } = pilihPasanganSah(put);
  const rows = [];
  for (const lengan of ['P', 'G']) for (const p of terpilih) {
    for (const b of put[lengan].get(p).baris) if (b.hasil !== 'GALAT') rows.push({ id: b.soal.id, sampel: `${lengan}#${p}`, hasil: b.hasil, teks: b.teks, sha: shaJawaban(b.soal.q, b.teks) });
  }
  return rows;
}
/** Baris label TEMPLAT (sekali, sebelum kunci): 36 soal × ULANGAN_TEMPLAT; sampel 'T#1'…'T#3'. */
export const barisTemplat = () => PUBLIK.flatMap((s) => Array.from({ length: ULANGAN_TEMPLAT }, (_, k) => ({ id: s.id, sampel: `T#${k + 1}`, hasil: 'TEMPLAT', teks: TEMPLAT, sha: shaJawaban(s.q, TEMPLAT) })));

function uji() {
  let gagal = 0; const cek = (n, ok) => { console.log(`${ok ? '✓' : '✗'} ${n}`); if (!ok) gagal++; };
  const s = soalLabel();
  cek('36 soal PUBLIK, fakta berjawaban acuan (alternatif pertama), catatan = keluarga', s.length === 36 && s.find((x) => x.id === 'J2-F3').jawaban === 'timah' && s.every((x) => x.catatan.startsWith('Keluarga soal')));
  const baris = (p) => ({ baris: PUBLIK.map((q, i) => ({ soal: q, hasil: i === 9 ? 'GALAT' : 'BENAR', teks: `j${p}-${i}` })) });
  const put = { P: new Map(Array.from({ length: 16 }, (_, i) => [i + 1, baris(i + 1)])), G: new Map(Array.from({ length: 16 }, (_, i) => [i + 1, baris(i + 1)])) };
  const r = barisLabel(put);
  cek('baris: P#p & G#p dikodekan di sampel, GALAT dilewati, tanpa templat per run', r.filter((x) => x.sampel === 'P#1').length === 35 && r.some((x) => x.sampel === 'G#16') && !r.some((x) => x.sampel.startsWith('T#')));
  cek('tiap baris membawa sha = shaJawaban(q, teks)', r.every((x) => x.sha === shaJawaban(PUBLIK.find((q) => q.id === x.id).q, x.teks)));
  const t = barisTemplat();
  cek('templat: 36 × 3 baris, sampel T#1..T#3, teks = TEMPLAT', t.length === 108 && new Set(t.map((x) => x.sampel)).size === 3 && t.every((x) => x.teks === TEMPLAT));
  console.log(gagal ? `${gagal} uji gagal` : 'siapkan-label-uji: semua uji lulus'); return gagal ? 1 : 0;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(uji());
  if (arg.includes('--templat')) {
    const [fs1, fj] = arg.slice(arg.indexOf('--templat') + 1);
    if (!fs1 || !fj) { console.error('pakai: --templat <keluar-soal> <keluar-jawaban>'); process.exit(2); }
    for (const f of [fs1, fj]) if (fs.existsSync(f)) { console.error(`BERHENTI: ${f} sudah ada`); process.exit(1); }
    fs.writeFileSync(fs1, soalLabel().map((x) => JSON.stringify(x)).join('\n') + '\n');
    fs.writeFileSync(fj, barisTemplat().map((x) => JSON.stringify(x)).join('\n') + '\n');
    console.log(`templat: ${PUBLIK.length} soal × ${ULANGAN_TEMPLAT} → ${fj}`);
    process.exit(0);
  }
  const stempel = arg[arg.indexOf('--stempel') + 1];
  if (!stempel || arg.indexOf('--stempel') < 0) { console.error('pakai: --stempel <stempel> [--dir d] | --templat <soal> <jawaban> | --uji'); process.exit(2); }
  const dir = arg.includes('--dir') ? arg[arg.indexOf('--dir') + 1] : DIR; // --dir: gladi bersih di folder sementara
  const put = bacaPutaran(stempel, dir);
  const pil = pilihPasanganSah(put);
  if (!pil.lengkap) { console.error(`BERHENTI: pasangan sah ${pil.terpilih.length}/16 · masalah: ${pil.masalah.join('; ') || '-'}`); process.exit(1); }
  if (pil.masalah.length) console.error(`PERINGATAN aturan berhenti: ${pil.masalah.join('; ')} — hanya 16 pasangan sah pertama yang dilabel (pemuat vonis: TIDAK_SAH)`);
  const fs1 = path.join(dir, `label-uji-soal-${stempel}.jsonl`), fj = path.join(dir, `label-uji-jawaban-${stempel}.jsonl`);
  for (const f of [fs1, fj]) if (fs.existsSync(f)) { console.error(`BERHENTI: ${f} sudah ada`); process.exit(1); }
  fs.writeFileSync(fs1, soalLabel().map((x) => JSON.stringify(x)).join('\n') + '\n');
  const rows = barisLabel(put);
  fs.writeFileSync(fj, rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
  console.log(`pasangan sah ${pil.terpilih.join(',')} (tidak sah: ${pil.tidakSah.join(',') || '-'}) → ${rows.length} baris · lanjut: label-deepseek.mjs ${path.relative(process.cwd(), fs1)} ${path.relative(process.cwd(), fj)} ${path.relative(process.cwd(), path.join(dir, `label-uji-ds-${stempel}.jsonl`))}`);
}
