#!/usr/bin/env node
/**
 * tanya-majelis.mjs — kirim SATU soal yang sama ke beberapa kursi, simpan
 * jawabannya apa adanya.
 *
 * ====================== KENAPA SATU SOAL YANG SAMA ======================
 * Nilai panel ada di PERTENTANGANNYA (riset kecerdasan kolektif 1 Sep): tiga
 * keluarga model yang berbeda membuat galat yang tidak berkorelasi, dan yang
 * berguna justru tempat mereka BERBEDA. Menanyakan hal yang sedikit berbeda ke
 * tiap kursi menghancurkan sifat itu — yang tersisa cuma tiga pendapat yang
 * tidak bisa diadu.
 *
 * Karena itu soalnya dibaca dari SATU berkas, dan berkas itu disimpan di repo:
 * jawaban mereka harus bisa diaudit terhadap apa yang benar-benar ditanyakan,
 * bukan terhadap ingatan orang yang menanyakannya.
 *
 * Jawaban disimpan MENTAH, satu berkas per kursi. Tidak diringkas di sini —
 * meringkas sebelum menyimpan berarti membuang bukti.
 *
 * Pakai:
 *   node majelis/tanya-majelis.mjs --soal majelis/SOAL-LINGKUNGAN-BELAJAR.md
 *   node majelis/tanya-majelis.mjs --soal <berkas> --kursi openai,kimi
 *   node majelis/tanya-majelis.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENYEDIA, adaKunci } from './penyedia.mjs';
import { MODEL_BAWAAN, tanyaSatu } from './majelis.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const arg = process.argv.slice(2);
const ambil = (n, d) => (arg.includes(n) ? arg[arg.indexOf(n) + 1] : d);

/** Kursi bawaan: tiga KELUARGA berbeda, bukan tiga model dari satu pembuat. */
export const KURSI_BAWAAN = ['openai', 'kimi', 'codex'];

/** Nama berkas jawaban. Menyertakan kursi DAN model — dua kursi bisa satu model. */
export function namaJawaban(kursi, model, stempel) {
  return `jawaban-${kursi}_${String(model).replace(/[:/]/g, '_')}-${stempel}.md`;
}

/**
 * Kirim ke satu kursi. Mengembalikan hasil apa adanya — tidak melempar, karena
 * satu kursi yang mati tidak boleh menghentikan yang lain.
 */
export async function tanyaKursi(p, model, soal, { batasDetik = 600 } = {}) {
  const t0 = Date.now();
  const r = await tanyaSatu(p, model, [{ role: 'user', content: soal }], {
    suhu: 0.7, batasDetik, ketat: p.jenis === 'cli',
  });
  return { ...r, kursi: p.id, model, detik: r.detik ?? Math.round((Date.now() - t0) / 1000) };
}

// ─────────────────────────────────────────────────────────────────── uji ──
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (LANGSUNG && arg.includes('--uji')) {
  let n = 0, bad = 0;
  const ok = (nama, cond, ket = '') => { if (cond) { n++; console.log(`  OK    ${nama}`); } else { bad++; console.log(`  GAGAL ${nama}${ket ? ' — ' + ket : ''}`); } };
  console.log('# Uji tanya-majelis\n');

  ok('kursi bawaan dari tiga KELUARGA berbeda', new Set(KURSI_BAWAAN).size === 3);
  ok('nama berkas memuat kursi DAN model', namaJawaban('openai', 'gpt-6-astra', 'X').includes('openai_gpt-6-astra'));
  ok('nama berkas disterilkan untuk sistem berkas', !namaJawaban('kimi', 'a:b/c', 'X').includes(':'));
  ok('dua kursi dengan model sama tidak bertabrakan',
    namaJawaban('a', 'm', 'X') !== namaJawaban('b', 'm', 'X'));

  // kursi CLI wajib mode ketat — kalau tidak, yang tersimpan transkrip sesi (C50)
  let dilihat = null;
  const asli = globalThis.fetch;
  globalThis.fetch = async (_u, o) => { dilihat = JSON.parse(o.body); return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: 'ok' } }] }) }; };
  const hasil = await tanyaKursi({ id: 'x', jenis: 'http', pangkal: 'y', kunci: null }, 'm', 'soal uji');
  globalThis.fetch = asli;
  ok('soal dikirim APA ADANYA, tanpa imbuhan', dilihat?.messages?.[0]?.content === 'soal uji');
  ok('hasil membawa kursi & model', hasil.kursi === 'x' && hasil.model === 'm');

  const berkasSoal = path.join(AKAR, 'majelis', 'SOAL-LINGKUNGAN-BELAJAR.md');
  ok('berkas soal NYATA ada dan tidak kosong',
    fs.existsSync(berkasSoal) && fs.readFileSync(berkasSoal, 'utf8').length > 500);

  console.log(`\ntanya-majelis: ${n}/${n + bad} uji lulus\n`);
  process.exit(bad ? 1 : 0);
}

// ───────────────────────────────────────────────────────────────── jalan ──
if (LANGSUNG && !arg.includes('--uji')) {
  const berkasSoal = ambil('--soal', null);
  if (!berkasSoal) { console.error('pakai: node majelis/tanya-majelis.mjs --soal <berkas.md> [--kursi a,b] [--batas 600]'); process.exit(2); }
  const soal = fs.readFileSync(path.resolve(berkasSoal), 'utf8');
  const kursiMinta = (ambil('--kursi', KURSI_BAWAAN.join(','))).split(',').map((x) => x.trim()).filter(Boolean);
  const batasDetik = Number(ambil('--batas', 600)) || 600;
  const stempel = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const dirKeluar = path.join(AKAR, 'majelis', 'jawaban');
  fs.mkdirSync(dirKeluar, { recursive: true });

  console.log(`\n# tanya-majelis — ${path.basename(berkasSoal)} (${soal.length} huruf)`);
  console.log(`  kursi: ${kursiMinta.join(' · ')} · batas ${batasDetik} s\n`);

  // Paralel: kursi yang lambat tidak boleh menahan yang cepat, dan tidak ada
  // urutan yang bisa mempengaruhi jawaban (mereka tidak saling melihat).
  const tugas = kursiMinta.map(async (id) => {
    const p = PENYEDIA.find((x) => x.id === id);
    if (!p) return { kursi: id, ok: false, sebab: 'kursi tidak dikenal' };
    if (p.kunci && !adaKunci(p)) return { kursi: id, ok: false, sebab: `kunci ${p.kunci} tidak ada di gudang` };
    // `--model` menimpa bawaan. Bukan kenyamanan: model bawaan tiap kursi dipilih
    // untuk PERANNYA, dan peran di sini berbeda. kimi-k3 adalah model PENALARAN
    // yang bawaannya dipilih untuk MENJURI (tugas sempit, terstruktur). Pada soal
    // terbuka empat bagian ia menghabiskan anggaran token untuk berpikir lalu
    // koneksinya putus — 'fetch failed', dua kali, sementara panggilan pendek ke
    // kursi yang sama berhasil 10 detik. Temuan itu sudah tercatat 4 Sep; ini
    // memakainya alih-alih menemukannya lagi.
    const model = ambil('--model', null) || MODEL_BAWAAN[id];
    process.stdout.write(`  → ${id} (${model}) …\n`);
    try { return await tanyaKursi(p, model, soal, { batasDetik }); } catch (e) { return { kursi: id, model, ok: false, sebab: String(e.message).slice(0, 200) }; }
  });

  const hasil = await Promise.all(tugas);
  console.log('');
  for (const h of hasil) {
    if (!h.ok) { console.log(`  ✗ ${h.kursi.padEnd(8)} GAGAL — ${h.sebab}`); continue; }
    const f = path.join(dirKeluar, namaJawaban(h.kursi, h.model, stempel));
    fs.writeFileSync(f, `# Jawaban ${h.kursi} (${h.model})\n\n`
      + `> soal: ${path.basename(berkasSoal)} · ${h.detik}s · ${h.teks.length} huruf\n`
      + `> Disimpan MENTAH. Ringkasan apa pun ada di tempat lain, bukan di sini.\n\n---\n\n${h.teks}\n`);
    console.log(`  ✓ ${h.kursi.padEnd(8)} ${String(h.detik).padStart(5)}s · ${String(h.teks.length).padStart(6)} huruf · ${path.relative(AKAR, f)}`);
  }
  const gagal = hasil.filter((h) => !h.ok).length;
  console.log(`\n${hasil.length - gagal}/${hasil.length} kursi menjawab.\n`);
}
