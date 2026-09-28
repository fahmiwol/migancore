#!/usr/bin/env node
/**
 * korelasi-galat.mjs — mengukur seberapa BERKORELASI galat antar-model kami sendiri.
 *
 * ============================== KENAPA ADA ==================================
 * Riset 29 Agu (RISET-KECERDASAN-KOLEKTIF-29AGU.md) menemukan bahwa kerumunan model
 * bahasa TIDAK bekerja seperti kerumunan manusia. Angka yang paling menusuk, dari
 * "Consensus is Not Verification" (arXiv 2603.06612): model sepakat dengan kappa ~0,35
 * bahkan pada STRING ASCII ACAK yang tidak punya jawaban benar — jadi kesepakatan
 * datang dari bias induktif yang sama, bukan pengetahuan yang sama. Dan saat beberapa
 * model salah di MATH, 53% di antaranya salah dengan jawaban yang SAMA PERSIS.
 *
 * Akibatnya untuk kami: "dua model kami setuju" mungkin bernilai jauh lebih kecil
 * daripada yang kami kira. Semua model kami turunan Qwen3 dan sebagian dilatih dari
 * data yang sama — kalau ada yang berkorelasi, kami.
 *
 * Ini BUKAN pertanyaan filosofis. Ia menentukan berapa bobot yang boleh diberikan
 * pada A/B antar-varian kami sendiri, dan apakah "dua adapter sepakat" boleh dipakai
 * sebagai bukti apa pun.
 *
 * CARA UKUR: tiap model punya jawaban per-skenario tersimpan di
 * eval/hasil-uji-alat-<model>.json dengan medan `lulus` (benar/salah per skenario).
 * Untuk tiap pasang model dihitung:
 *   - kesepakatan mentah (berapa persen skenario yang vonisnya sama)
 *   - kappa Cohen (kesepakatan DI ATAS kebetulan — inilah angka yang berarti)
 *   - galat bersama: dari skenario yang KEDUANYA salah, berapa pangsanya
 *
 * Kappa tinggi pada GALAT = model kami bukan saksi-saksi terpisah, melainkan satu
 * saksi yang berbicara berkali-kali.
 *
 * Pakai: node eval/korelasi-galat.mjs
 *        node eval/korelasi-galat.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Kappa Cohen untuk dua vektor biner. Murni — bisa diuji dengan fixture.
 *
 * kappa = (Po - Pe) / (1 - Pe), dengan Po = kesepakatan teramati dan Pe = kesepakatan
 * yang diharapkan KEBETULAN. Kesepakatan mentah menipu waktu kedua model hampir
 * selalu benar: dua model yang sama-sama 95% benar akan "sepakat" 90% kali tanpa
 * hubungan apa pun. Kappa membuang bagian itu.
 *
 * Kalau Pe = 1 (kedua model menjawab sama untuk SEMUA skenario), kappa tak
 * terdefinisi — dikembalikan null, bukan angka karangan.
 */
export function kappa(a, b) {
  const n = a.length;
  if (!n || n !== b.length) return null;
  let sama = 0, a1 = 0, b1 = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) sama++;
    if (a[i]) a1++;
    if (b[i]) b1++;
  }
  const Po = sama / n;
  const Pe = (a1 / n) * (b1 / n) + (1 - a1 / n) * (1 - b1 / n);
  if (Math.abs(1 - Pe) < 1e-12) return null;
  return (Po - Pe) / (1 - Pe);
}

/** Dari skenario yang KEDUANYA salah: berapa banyak, dan berapa pangsanya dari semua kegagalan. */
export function galatBersama(a, b) {
  let duaSalah = 0, adaSalah = 0;
  for (let i = 0; i < a.length; i++) {
    if (!a[i] || !b[i]) adaSalah++;
    if (!a[i] && !b[i]) duaSalah++;
  }
  return { duaSalah, adaSalah, pangsa: adaSalah ? duaSalah / adaSalah : null };
}

function muat() {
  const per = new Map();
  for (const f of fs.readdirSync(DIR).filter((x) => /^hasil-uji-alat-.*\.json$/.test(x))) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { continue; }
    if (!Array.isArray(j.hasil) || j.hasil.length !== 24) continue;   // hanya set 24-skenario penuh
    // kunci per skenario supaya pasangannya benar-benar soal yang sama, bukan urutan
    const m = new Map(j.hasil.map((h) => [`${h.k}|${h.t}`, !!h.lulus]));
    const lama = per.get(j.model);
    if (!lama || m.size > lama.size) per.set(j.model, m);
  }
  return per;
}

// ─────────────────────────────────────────────────────────── uji instrumen ──
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('korelasi-galat.mjs')
    && process.argv.includes('--uji')) {
  let ok = 0, buruk = 0;
  const cek = (n, c, ket = '') => (c ? (ok++, console.log(`  OK    ${n}`))
    : (buruk++, console.log(`  GAGAL ${n}${ket ? ' — ' + ket : ''}`)));
  const dekat = (x, y) => Math.abs(x - y) < 1e-9;

  cek('kappa: sepakat sempurna & seimbang = 1', dekat(kappa([1, 1, 0, 0], [1, 1, 0, 0]), 1));
  cek('kappa: berlawanan sempurna = -1', dekat(kappa([1, 1, 0, 0], [0, 0, 1, 1]), -1));
  cek('kappa: bebas = ~0', Math.abs(kappa([1, 0, 1, 0], [1, 1, 0, 0])) < 1e-9);
  cek('kappa: semua sama nilainya = null (tak terdefinisi, bukan 1)',
    kappa([1, 1, 1, 1], [1, 1, 1, 1]) === null);
  cek('kappa: panjang beda = null', kappa([1, 0], [1]) === null);
  cek('kappa MEMBUANG kesepakatan kebetulan',
    kappa([1, 1, 1, 1, 1, 1, 1, 1, 1, 0], [1, 1, 1, 1, 1, 1, 1, 1, 0, 1]) < 0);

  const g = galatBersama([1, 0, 0, 1], [1, 0, 1, 1]);
  cek('galat bersama: hitungannya benar', g.duaSalah === 1 && g.adaSalah === 2 && dekat(g.pangsa, 0.5));
  cek('galat bersama: tanpa kegagalan = null', galatBersama([1, 1], [1, 1]).pangsa === null);

  const nyata = muat();
  cek('NYATA: memuat >=3 model dengan 24 skenario penuh', nyata.size >= 3, `${nyata.size} model`);
  cek('NYATA: tiap model punya 24 skenario', [...nyata.values()].every((m) => m.size === 24));

  console.log('\n' + '='.repeat(52));
  console.log(`${ok} lulus · ${buruk} gagal`);
  process.exit(buruk ? 1 : 0);
}

// ───────────────────────────────────────────────────────────────── jalan ──
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('korelasi-galat.mjs')) {
  const per = muat();
  const nama = [...per.keys()].sort();
  if (nama.length < 2) { console.error('butuh >=2 model dengan hasil 24-skenario.'); process.exit(2); }

  const kunci = [...per.get(nama[0]).keys()];
  console.log(`\n# Korelasi galat antar-model — ${nama.length} model, ${kunci.length} skenario\n`);
  console.log('  Pertanyaannya: kalau dua model kami sepakat, itu dua saksi atau satu saksi');
  console.log('  yang bicara dua kali? Kappa tinggi = satu saksi.\n');

  const baris = [];
  for (let i = 0; i < nama.length; i++) {
    for (let j = i + 1; j < nama.length; j++) {
      const A = kunci.map((k) => per.get(nama[i]).get(k) ? 1 : 0);
      const B = kunci.map((k) => per.get(nama[j]).get(k) ? 1 : 0);
      if (A.includes(undefined) || B.includes(undefined)) continue;
      const kp = kappa(A, B), gb = galatBersama(A, B);
      baris.push({ a: nama[i], b: nama[j], kappa: kp, ...gb,
        skorA: A.reduce((s, x) => s + x, 0), skorB: B.reduce((s, x) => s + x, 0) });
    }
  }
  baris.sort((x, y) => (y.kappa ?? -9) - (x.kappa ?? -9));

  const p = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log(`  ${p('model A', 22)} ${p('model B', 22)} ${p('skor', 9)} ${p('kappa', 7)} galat-bersama`);
  console.log('  ' + '-'.repeat(84));
  for (const r of baris) {
    const kp = r.kappa === null ? ' n/a ' : r.kappa.toFixed(2).padStart(5);
    const gb = r.pangsa === null ? '—' : `${r.duaSalah}/${r.adaSalah} (${Math.round(r.pangsa * 100)}%)`;
    console.log(`  ${p(r.a, 22)} ${p(r.b, 22)} ${p(`${r.skorA}/${r.skorB}`, 9)} ${p(kp, 7)} ${gb}`);
  }

  const sah = baris.filter((r) => r.kappa !== null);
  const rata = sah.reduce((s, r) => s + r.kappa, 0) / (sah.length || 1);
  const gb = baris.filter((r) => r.pangsa !== null);
  const rataGB = gb.reduce((s, r) => s + r.pangsa, 0) / (gb.length || 1);
  console.log(`\n  rata-rata kappa: ${rata.toFixed(2)} · rata-rata galat bersama: ${Math.round(rataGB * 100)}%`);
  console.log(`\n  Pembanding dari luar (arXiv 2603.06612): model bahasa sepakat kappa ~0,35`);
  console.log(`  bahkan pada string ACAK tanpa jawaban benar; saat sama-sama salah, 53% salah`);
  console.log(`  dengan jawaban yang SAMA PERSIS.`);
  console.log(`\n  Cara membacanya: kappa mendekati 0 = vonisnya saling bebas (A/B kami bermakna).`);
  console.log(`  Kappa tinggi = model kami bukan saksi terpisah, dan "dua model sepakat" bukan bukti.\n`);
}
