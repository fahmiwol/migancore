#!/usr/bin/env node
/**
 * banding-proporsi.mjs — MENJAWAB "apakah dua model benar-benar BERBEDA?"
 *
 * ============================ KENAPA INI HARUS ADA ==========================
 * Sampai hari ini saya membandingkan dua model dengan cara yang SALAH: melihat
 * apakah dua selang Wilson mereka bertumpang tindih. Itu uji yang terlalu
 * ketat — dua selang bisa bertumpang tindih padahal selisihnya nyata secara
 * statistik. Akibatnya dua arah:
 *   - perbaikan nyata saya buang sebagai "tidak terbukti", dan
 *   - saya tidak pernah punya angka untuk SELISIHNYA sendiri.
 * Yang benar: uji langsung pada selisih dua proporsi.
 *
 * Alat ini memakai dua uji yang saling memeriksa:
 *   1. FISHER EXACT dua-sisi — tanpa hampiran normal sama sekali, sah untuk n
 *      kecil dan untuk sel nol (mis. 25/25 vs 16/30).
 *   2. Selang NEWCOMBE (hybrid score) untuk selisih p2-p1 — dibangun dari dua
 *      selang Wilson, tahan di batas 0 dan 1, tidak seperti hampiran normal
 *      yang bisa memberi selang di luar [-1,1].
 *      Newcombe RG (1998), Statistics in Medicine 17:873-890, metode 10.
 *
 * Vonis hanya dua: BEDA NYATA (p<0,05 DAN selang selisih tidak memuat 0) atau
 * BELUM TERBUKTI BEDA. Tidak ada kata "kelihatannya lebih baik".
 *
 * ======================== PENJAGA KESEBANDINGAN =============================
 * Menolak membandingkan bila gerbang, jumlah putaran, atau daftar kategori
 * berbeda. Dua angka dari instrumen berbeda bukan perbandingan — itu karangan.
 *
 * Pakai:
 *   node banding-proporsi.mjs <ULANG-A.json> <ULANG-B.json>
 *   node banding-proporsi.mjs --uji-instrumen      (uji alat ini sendiri)
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wilson, fisher, newcombe, vonis, ukuranSampelPerlu } from './statistik.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));

// ───────────────────────────────────────────────────── uji instrumen ──
// Alat ukur yang tidak pernah diuji sendiri sama saja dengan tebakan rapi.
function ujiInstrumen() {
  const kasus = [
    { nama: 'Lady Tasting Tea (Fisher 1935) — nilai baku 0,4857',
      f: () => fisher(3, 4, 1, 4), harap: 0.4857, tol: 0.0005 },
    { nama: 'dua proporsi identik 10/20 vs 10/20 → p = 1',
      f: () => fisher(10, 20, 10, 20), harap: 1, tol: 1e-9 },
    { nama: 'pemisahan sempurna 20/20 vs 0/20 → p mendekati nol',
      f: () => fisher(20, 20, 0, 20), harap: 0, tol: 1e-9 },
    { nama: 'Wilson 25/25 batas bawah — cocok dgn ulang-gerbang (0,8668035)',
      f: () => wilson(25, 25)[0], harap: 0.8668035, tol: 1e-6 },
    { nama: 'Wilson 16/30 batas bawah',
      f: () => wilson(16, 30)[0], harap: 0.3614, tol: 0.0005 },
    { nama: 'Newcombe: selisih nol harus memuat 0',
      f: () => (newcombe(10, 20, 10, 20)[0] <= 0 && newcombe(10, 20, 10, 20)[1] >= 0) ? 1 : 0,
      harap: 1, tol: 1e-9 },
    { nama: 'Newcombe: selang selalu di dalam [-1, 1]',
      f: () => { const [a, b] = newcombe(0, 5, 5, 5); return (a >= -1 && b <= 1) ? 1 : 0; },
      harap: 1, tol: 1e-9 },
    { nama: 'Fisher setangkup: tukar A dan B, p harus sama',
      f: () => Math.abs(fisher(7, 20, 15, 20) - fisher(15, 20, 7, 20)), harap: 0, tol: 1e-12 },
    // kendali NEGATIF: alat WAJIB menolak menyebut beda pada selisih kecil
    { nama: 'kendali negatif 16/30 vs 18/30 → TIDAK boleh dinyatakan beda',
      f: () => vonis(16, 30, 18, 30).nyata ? 1 : 0, harap: 0, tol: 1e-9 },
    // kendali POSITIF: alat WAJIB menangkap selisih besar
    { nama: 'kendali positif 5/30 vs 27/30 → WAJIB dinyatakan beda',
      f: () => vonis(5, 30, 27, 30).nyata ? 1 : 0, harap: 1, tol: 1e-9 },
  ];
  console.log('# Uji instrumen — banding-proporsi.mjs\n');
  let cacat = 0;
  for (const k of kasus) {
    let dapat;
    try { dapat = k.f(); } catch { dapat = NaN; }
    const ok = Number.isFinite(dapat) && Math.abs(dapat - k.harap) <= k.tol;
    if (!ok) cacat++;
    console.log(`  ${ok ? 'OK   ' : 'CACAT'} ${k.nama}`);
    if (!ok) console.log(`         harap ${k.harap} · dapat ${dapat}`);
  }
  console.log(`\n${cacat === 0 ? `SEHAT: ${kasus.length}/${kasus.length}` : `CACAT: ${cacat} dari ${kasus.length}`}`);
  process.exit(cacat === 0 ? 0 : 1);
}

if (process.argv.includes('--uji-instrumen')) ujiInstrumen();

// ───────────────────────────────────────────────── perbandingan berkas ──
const A = process.argv[2], B = process.argv[3];
if (!A || !B) {
  console.error('pakai: node banding-proporsi.mjs <ULANG-A.json> <ULANG-B.json>');
  console.error('       node banding-proporsi.mjs --uji-instrumen');
  process.exit(2);
}
const baca = (f) => JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(DIR, f), 'utf8'));
const a = baca(A), b = baca(B);

// penjaga kesebandingan — menolak lebih baik daripada mengarang
const alasan = [];
if (a.berkas !== b.berkas) alasan.push(`gerbang berbeda: ${a.berkas} vs ${b.berkas}`);
if (a.putaran !== b.putaran) alasan.push(`jumlah putaran berbeda: ${a.putaran} vs ${b.putaran}`);
const katA = a.perKategori.map((x) => x.kategori).sort().join(',');
const katB = b.perKategori.map((x) => x.kategori).sort().join(',');
if (katA !== katB) alasan.push(`daftar kategori berbeda: [${katA}] vs [${katB}]`);
if (alasan.length) {
  console.error('TIDAK SEBANDING — perbandingan dibatalkan:');
  for (const x of alasan) console.error('  - ' + x);
  console.error('\nUkur ulang salah satu dengan instrumen yang SAMA sebelum membandingkan.');
  process.exit(1);
}

// C14 — lengan beda templat: selisih model tercampur selisih templat.
// Beda terbukti + tidak dinyatakan sengaja = tolak; Ollama mati = peringatan saja.
{
  const { jagaTemplat, laporkan } = await import('./periksa-templat.mjs');
  const t = await jagaTemplat(a.model, b.model, { sengaja: process.env.TEMPLAT_BEDA_SENGAJA === '1' });
  if (laporkan(a.model, b.model, t) !== 0) process.exit(1);
}

const L = [];
L.push(`# Banding proporsi — ${a.berkas}`);
L.push('');
L.push(`**A = \`${a.model}\`**  vs  **B = \`${b.model}\`**  ·  ${a.putaran} putaran masing-masing`);
L.push('');
L.push('Uji: Fisher exact dua-sisi + selang Newcombe 95% untuk selisih (B − A).');
L.push('Vonis BEDA NYATA hanya bila p<0,05 **dan** selang selisih tidak memuat nol.');
L.push('');
L.push('| Kategori | A | B | selisih | selang 95% selisih | Fisher p | Vonis |');
L.push('|---|---|---|---|---|---|---|');

const petaB = new Map(b.perKategori.map((x) => [x.kategori, x]));
const baris = [];
for (const ka of a.perKategori) {
  const kb = petaB.get(ka.kategori);
  baris.push({ kategori: ka.kategori, a: `${ka.lulus}/${ka.total}`, b: `${kb.lulus}/${kb.total}`,
               ...vonis(ka.lulus, ka.total, kb.lulus, kb.total) });
}
baris.push({ kategori: '**KESELURUHAN**',
             a: `${a.keseluruhan.lulus}/${a.keseluruhan.coba}`,
             b: `${b.keseluruhan.lulus}/${b.keseluruhan.coba}`,
             ...vonis(a.keseluruhan.lulus, a.keseluruhan.coba, b.keseluruhan.lulus, b.keseluruhan.coba) });

const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;
for (const r of baris) {
  const v = r.nyata ? (r.selisih > 0 ? '**B LEBIH BAIK**' : '**B LEBIH BURUK**') : 'belum terbukti beda';
  L.push(`| ${r.kategori} | ${r.a} | ${r.b} | ${pct(r.selisih)} | ${pct(r.lo)} … ${pct(r.hi)} | ${r.p < 0.0001 ? '<0,0001' : r.p.toFixed(4)} | ${v} |`);
}
L.push('');
const isi = baris.filter((r) => !r.kategori.startsWith('**'));
const menang = isi.filter((r) => r.nyata && r.selisih > 0);
const kalah = isi.filter((r) => r.nyata && r.selisih < 0);
L.push(`**Ringkas:** ${menang.length} kategori naik nyata, ${kalah.length} turun nyata, ` +
       `${isi.length - menang.length - kalah.length} belum terbukti berbeda.`);
if (kalah.length) L.push(`\n⚠ **KEMUNDURAN NYATA** di: ${kalah.map((r) => r.kategori).join(', ')} — wajib dijelaskan, bukan diabaikan.`);

// ── "belum terbukti beda" harus menjadi PERINTAH KERJA, bukan jalan buntu ──
const ragu = isi.filter((r) => !r.nyata && Math.abs(r.selisih) >= 0.05);
if (ragu.length) {
  L.push('');
  L.push('## Belum terbukti beda — tapi BUKAN berarti sama');
  L.push('');
  L.push('Kategori berikut menunjukkan selisih ≥5 poin yang tidak tertangkap uji.');
  L.push('Itu bisa berarti memang tidak ada beda, **atau** percobaannya terlalu sedikit.');
  L.push('Kolom terakhir: berapa percobaan per model yang dibutuhkan untuk menyelesaikan');
  L.push('pertanyaan ini pada kuasa 80%. Itu perintah kerja, bukan alasan untuk berhenti.');
  L.push('');
  L.push('| Kategori | selisih | n sekarang | n dibutuhkan | putaran setara |');
  L.push('|---|---|---|---|---|');
  for (const r of ragu) {
    const n1 = Number(r.a.split('/')[1]);
    const perlu = ukuranSampelPerlu(Number(r.a.split('/')[0]) / n1,
                                    Number(r.b.split('/')[0]) / Number(r.b.split('/')[1]));
    const soalPerPutaran = n1 / a.putaran;
    L.push(`| ${r.kategori} | ${pct(r.selisih)} | ${n1} | ${Number.isFinite(perlu) ? perlu : '—'} | ${Number.isFinite(perlu) ? Math.ceil(perlu / soalPerPutaran) : '—'} |`);
  }
  L.push('');
}

const teks = L.join('\n') + '\n';
const nama = `BANDING-${path.basename(a.berkas, '.mjs')}-${a.model.replace(/[:/]/g, '_')}-vs-${b.model.replace(/[:/]/g, '_')}`;
fs.writeFileSync(path.join(DIR, `${nama}.md`), teks, 'utf8');
fs.writeFileSync(path.join(DIR, `${nama}.json`),
  JSON.stringify({ a: a.model, b: b.model, gerbang: a.berkas, putaran: a.putaran, baris }, null, 2), 'utf8');
console.log(teks);
console.log(`tertulis: ${nama}.md + .json`);
