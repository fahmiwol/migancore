#!/usr/bin/env node
/**
 * percobaan-prompt.mjs — LANGKAH 0 dari RENCANA-PERBAIKAN-V12.
 *
 * ============================ PERTANYAANNYA =================================
 * Kiasan beku luruh dari 100% ke 50% (p=0,0010) sesudah v11. Ada DUA sebab yang
 * mungkin, dan obatnya berbeda jauh:
 *   (a) kemampuannya HILANG dari bobot        -> butuh data pemulihan (mahal)
 *   (b) kemampuannya MASIH ADA, salah dipicu  -> butuh data pembeda kecil (murah)
 * Menebak = merancang obat untuk penyakit yang salah.
 *
 * Percobaan ini memisahkan keduanya TANPA melatih apa pun: satu kalimat
 * ditambahkan ke system prompt, semua hal lain dikunci identik.
 *
 * ======================= SATU VARIABEL, DIKUNCI =============================
 * Yang BERUBAH  : satu kalimat di system prompt (persis, tercatat di bawah).
 * Yang DIKUNCI  : model, soal, jumlah putaran, suhu, pemeriksa, urutan.
 * Yang DIUKUR   : keempat kategori kias  +  gerbang aritmetika.
 *
 * Aritmetika ikut diukur BUKAN sebagai pelengkap, melainkan sebagai PEMERIKSA
 * KEBOCORAN. T6 sudah membuktikan satu kalimat prompt memotong aritmetika dari
 * 94% ke 50% pada model ini. Jadi "kalimat ini memperbaiki kias" TIDAK CUKUP —
 * ia harus terbukti tidak merusak yang lain. Perbaikan yang memindahkan
 * kerusakan ke tempat lain bukan perbaikan.
 *
 * ================= ATURAN PUTUSAN — DITULIS SEBELUM MENGUKUR ================
 * R1  majas_mati NAIK nyata (Fisher p<0,05, selisih>0)
 *       -> kemampuan MASIH ADA, cuma salah dipicu. P2 jadi paket MURAH.
 * R2  majas_mati TIDAK naik nyata
 *       -> kemampuan benar-benar tergerus. P2 jadi paket MAHAL (data pemulihan).
 * R3  kategori lain TURUN nyata, atau aritmetika TURUN nyata
 *       -> KEBOCORAN. Kalimat ini ditolak walau majas_mati naik.
 * R4  aritmetika turun nyata -> temuan tersendiri (bukti T6 kedua), wajib dicatat.
 *
 * Aturan di atas dievaluasi otomatis oleh kode ini, supaya tidak ada ruang bagi
 * saya menafsirkan hasil sesudah melihatnya.
 *
 * Pakai: node percobaan-prompt.mjs [model] [putaran]
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { vonis } from './statistik.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const MODEL = process.argv[2] || 'migancore:0.11-4b';
const PUTARAN = Number(process.argv[3]) || 5;
const ULANG_ARIT = 3;

/**
 * Kalimat yang diuji. SENGAJA tidak menyebut satu pun frasa yang dipakai di
 * gerbang ("kaki gunung", "mata air", "meja hijau", "kambing hitam") — kalau
 * disebut, kita hanya mengukur kemampuan model menyalin contoh dari prompt,
 * bukan kemampuannya mengenali frasa beku secara umum. Contoh yang dipakai
 * ("buah tangan", "kaki tangan") tidak ada di soal mana pun.
 */
const KALIMAT_UJI =
  'Frasa majemuk yang maknanya sudah beku dalam bahasa Indonesia — misalnya ' +
  '"buah tangan" atau "kaki tangan" — hanya punya satu makna. Untuk frasa ' +
  'seperti itu jawab tunggal dan tegas; jangan menawarkan tafsir lain.';

const LENGAN = [
  { kode: 'kendali', tambahan: '' },
  { kode: 'uji', tambahan: KALIMAT_UJI },
];

// ─────────────────────────────────────────────────────────── pra-terbang ──
console.log('# Langkah 0 — percobaan satu kalimat prompt\n');
process.stdout.write('  pra-terbang perkakas … ');
try {
  execFileSync(process.execPath, [path.join(DIR, 'periksa-alat.mjs')], { stdio: 'pipe' });
  console.log('SIAP');
} catch {
  console.error('TAHAN — ada perkakas cacat. Perbaiki dulu; jangan mengukur dengan alat rusak.');
  process.exit(1);
}

// ────────────────────────────────────────────────────────────── jalankan ──
const jalan = (berkas, arg, env) =>
  execFileSync(process.execPath, [path.join(DIR, berkas), ...arg],
    { encoding: 'utf8', timeout: 60 * 60 * 1000, stdio: 'pipe', env: { ...process.env, ...env } });

const hasil = {};
for (const L of LENGAN) {
  console.log(`\n## Lengan "${L.kode}"${L.tambahan ? ' — dengan kalimat tambahan' : ' — tanpa tambahan (baseline)'}`);
  const env = { SISTEM_TAMBAHAN: L.tambahan, SUFIKS: L.kode };

  process.stdout.write(`  kias (${PUTARAN} putaran) … `);
  try { jalan('ulang-gerbang.mjs', ['uji-kias.mjs', MODEL, String(PUTARAN), '0.8'], env); }
  catch { /* keluar bukan-nol itu wajar; berkasnya tetap ditulis */ }
  const fk = path.join(DIR, `ULANG-uji-kias-${MODEL.replace(/[:/]/g, '_')}-${L.kode}.json`);
  if (!fs.existsSync(fk)) { console.error('GAGAL — berkas kias tidak tertulis'); process.exit(2); }
  const kias = JSON.parse(fs.readFileSync(fk, 'utf8'));
  console.log(`${kias.keseluruhan.lulus}/${kias.keseluruhan.coba}`);

  process.stdout.write(`  aritmetika (${ULANG_ARIT} ulangan × 2 suhu) … `);
  try { jalan('uji-aritmetika.mjs', [MODEL, String(ULANG_ARIT)], env); } catch { /* idem */ }
  const fa = path.join(DIR, `hasil-aritmetika-${MODEL.replace(/[:/]/g, '_')}.json`);
  const arit = JSON.parse(fs.readFileSync(fa, 'utf8'));
  // salin dengan nama berlengan supaya lengan berikutnya tidak menimpanya
  fs.writeFileSync(fa.replace('.json', `-${L.kode}.json`), JSON.stringify(arit, null, 2), 'utf8');
  const aBenar = Object.values(arit.ringkas).reduce((s, x) => s + x.benar, 0);
  const aTotal = Object.values(arit.ringkas).reduce((s, x) => s + x.total, 0);
  console.log(`${aBenar}/${aTotal}`);

  hasil[L.kode] = { kias, arit: { benar: aBenar, total: aTotal, ringkas: arit.ringkas } };
}

// ──────────────────────────────────────────────────────────── bandingkan ──
const A = hasil.kendali, B = hasil.uji;
const petaA = new Map(A.kias.perKategori.map((x) => [x.kategori, x]));
const baris = [];
for (const kb of B.kias.perKategori) {
  const ka = petaA.get(kb.kategori);
  if (!ka) continue;
  baris.push({ ukuran: `kias · ${kb.kategori}`, a: [ka.lulus, ka.total], b: [kb.lulus, kb.total],
               ...vonis(ka.lulus, ka.total, kb.lulus, kb.total) });
}
baris.push({ ukuran: 'kias · KESELURUHAN', a: [A.kias.keseluruhan.lulus, A.kias.keseluruhan.coba],
             b: [B.kias.keseluruhan.lulus, B.kias.keseluruhan.coba],
             ...vonis(A.kias.keseluruhan.lulus, A.kias.keseluruhan.coba, B.kias.keseluruhan.lulus, B.kias.keseluruhan.coba) });
baris.push({ ukuran: '**ARITMETIKA (pemeriksa kebocoran)**', a: [A.arit.benar, A.arit.total], b: [B.arit.benar, B.arit.total],
             ...vonis(A.arit.benar, A.arit.total, B.arit.benar, B.arit.total) });

// ── aturan putusan, dievaluasi mesin ──
const cari = (n) => baris.find((r) => r.ukuran.includes(n));
const majas = cari('majas_mati');
const aritm = cari('ARITMETIKA');
const turunNyata = baris.filter((r) => r.nyata && r.selisih < 0);
const R1 = !!(majas && majas.nyata && majas.selisih > 0);
const R3 = turunNyata.length > 0;
const R4 = !!(aritm && aritm.nyata && aritm.selisih < 0);

let putusan, tindakan;
if (R3) {
  putusan = 'KALIMAT DITOLAK — ada kebocoran';
  tindakan = `Kalimat ini merusak: ${turunNyata.map((r) => r.ukuran).join(', ')}. ` +
    'Perbaikan yang memindahkan kerusakan ke tempat lain bukan perbaikan. ' +
    (R1 ? 'Catatan: majas_mati memang naik, tapi itu tidak menebus kerusakannya.' : '');
} else if (R1) {
  putusan = 'R1 — kemampuan MASIH ADA, cuma salah dipicu';
  tindakan = 'P2 jadi paket MURAH: cukup data pembeda beku-vs-hidup dalam jumlah kecil, ' +
    'plus kalimat ini dipasang di system prompt MCP. Tidak perlu data pemulihan besar.';
} else {
  putusan = 'R2 — kemampuan benar-benar TERGERUS';
  tindakan = 'Prompt tidak menolong, jadi ini kerusakan bobot. P2 harus jadi paket ' +
    'PEMULIHAN sungguhan: pasangan beku-vs-hidup dalam jumlah memadai di data latih.';
}

// ─────────────────────────────────────────────────────────────── laporan ──
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;
const L = [];
L.push('# Langkah 0 — percobaan satu kalimat prompt');
L.push('');
L.push(`Model **\`${MODEL}\`** · kias ${PUTARAN} putaran · aritmetika ${ULANG_ARIT} ulangan × 2 suhu`);
L.push('');
L.push('**Kalimat yang diuji, persis:**');
L.push('');
L.push('> ' + KALIMAT_UJI);
L.push('');
L.push('Kalimat ini sengaja tidak menyebut satu pun frasa yang dipakai di soal —');
L.push('kalau disebut, yang terukur cuma kemampuan menyalin contoh dari prompt.');
L.push('');
L.push('| Ukuran | tanpa kalimat | dengan kalimat | selisih | selang 95% | Fisher p | Vonis |');
L.push('|---|---|---|---|---|---|---|');
for (const r of baris) {
  const v = r.nyata ? (r.selisih > 0 ? '**NAIK NYATA**' : '**TURUN NYATA**') : 'belum terbukti beda';
  L.push(`| ${r.ukuran} | ${r.a[0]}/${r.a[1]} | ${r.b[0]}/${r.b[1]} | ${pct(r.selisih)} | ${pct(r.lo)} … ${pct(r.hi)} | ${r.p < 0.0001 ? '<0,0001' : r.p.toFixed(4)} | ${v} |`);
}
L.push('');
L.push(`## PUTUSAN: ${putusan}`);
L.push('');
L.push(tindakan);
L.push('');
L.push('| Aturan (ditulis SEBELUM mengukur) | Terpenuhi? |');
L.push('|---|---|');
L.push(`| R1 majas_mati naik nyata | ${R1 ? 'YA' : 'tidak'} |`);
L.push(`| R3 ada yang turun nyata (kebocoran) | ${R3 ? 'YA' : 'tidak'} |`);
L.push(`| R4 aritmetika turun nyata | ${R4 ? 'YA — bukti T6 kedua, wajib dicatat' : 'tidak'} |`);
L.push('');
L.push(`Aritmetika per suhu — kendali: ${JSON.stringify(A.arit.ringkas)} · uji: ${JSON.stringify(B.arit.ringkas)}`);

const teks = L.join('\n') + '\n';
fs.writeFileSync(path.join(DIR, `PERCOBAAN-PROMPT-${MODEL.replace(/[:/]/g, '_')}.md`), teks, 'utf8');
fs.writeFileSync(path.join(DIR, `percobaan-prompt-${MODEL.replace(/[:/]/g, '_')}.json`),
  JSON.stringify({ model: MODEL, putaran: PUTARAN, ulangArit: ULANG_ARIT, kalimat: KALIMAT_UJI,
                   baris, aturan: { R1, R3, R4 }, putusan, tindakan }, null, 2), 'utf8');
console.log('\n' + teks);
