#!/usr/bin/env node
/**
 * audit-bocor.mjs — GERBANG-S1: audit kebocoran SEMANTIK-ringan, pelengkap penjaga leksikal di buat-soal.mjs
 * (kritik silang Codex 27 Sep: "lexical Jaccard alone is insufficient").
 *
 * Kosinus TF-IDF n-gram karakter (3–5, dalam batas kata) — menangkap parafrase berkata-dasar sama yang lolos Jaccard token.
 * Tanpa model, tanpa jaringan, deterministik. Mencetak K pasangan termirip per perbandingan untuk TINJAUAN MANUAL;
 * keputusan (buang/pertahankan + alasan) ditulis tangan ke eval/gerbang-s1/audit-bocor-v1.json SEBELUM jawaban dinilai.
 *
 *   node eval/gerbang-s1/audit-bocor.mjs <soal-a.jsonl> [<soal-b.jsonl>] [--k 20]
 *     tanpa <soal-b>: <soal-a> dibandingkan dengan 39 soal petak-jujur2 (PUBLIK + PRIVAT)
 *   node eval/gerbang-s1/audit-bocor.mjs --uji
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AKAR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { PUBLIK, PRIVAT } = await import(pathToFileURL(path.join(AKAR, 'eval', 'petak-jujur2.mjs')).href);

const normal = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
export function ngram(s) {
  const m = new Map();
  for (const w of normal(s).split(' ')) {
    const t = ` ${w} `;
    for (let n = 3; n <= 5; n++) for (let i = 0; i + n <= t.length; i++) { const g = t.slice(i, i + n); m.set(g, (m.get(g) || 0) + 1); }
  }
  return m;
}
/** Vektor TF-IDF ternormalisasi untuk semua teks (IDF dari gabungan korpus). */
export function vektor(teks) {
  const tf = teks.map(ngram), df = new Map();
  for (const m of tf) for (const g of m.keys()) df.set(g, (df.get(g) || 0) + 1);
  const N = teks.length;
  return tf.map((m) => {
    const v = new Map(); let nn = 0;
    for (const [g, c] of m) { const w = (1 + Math.log(c)) * Math.log((1 + N) / (1 + df.get(g))); v.set(g, w); nn += w * w; }
    nn = Math.sqrt(nn) || 1; for (const [g, w] of v) v.set(g, w / nn); return v;
  });
}
export const kosinus = (a, b) => { let s = 0; const [k, l] = a.size < b.size ? [a, b] : [b, a]; for (const [g, w] of k) { const x = l.get(g); if (x) s += w * x; } return s; };

function uji() {
  let gagal = 0; const cek = (n, ok) => { console.log(`${ok ? '✓' : '✗'} ${n}`); if (!ok) gagal++; };
  const v = vektor(['Apa ibu kota provinsi Jawa Barat?', 'Ibukota Provinsi Jawa Barat itu apa ya?', 'Berapa harga baja tulangan per ton?', 'Siapa penemu mesin uap?']);
  cek('parafrase > topik lain', kosinus(v[0], v[1]) > 0.5 && kosinus(v[0], v[2]) < 0.2);
  cek('diri sendiri = 1', Math.abs(kosinus(v[3], v[3]) - 1) < 1e-9);
  console.log(gagal ? `${gagal} uji gagal` : 'audit-bocor: semua uji lulus'); return gagal ? 1 : 0;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(uji());
  const ki = arg.indexOf('--k'); const K = ki >= 0 ? Number(arg[ki + 1]) : 20;
  const berkas = arg.filter((x, i) => !x.startsWith('--') && arg[i - 1] !== '--k');
  const baca = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const A = baca(berkas[0]);
  const B = berkas[1] ? baca(berkas[1]) : [...PUBLIK, ...PRIVAT].map((s) => ({ id: s.id, jenis: s.jenis, q: s.q }));
  const V = vektor([...A.map((s) => s.q), ...B.map((s) => s.q)]);
  const va = V.slice(0, A.length), vb = V.slice(A.length);
  const pas = [];
  for (let i = 0; i < A.length; i++) { let best = -1, j = -1; for (let k = 0; k < B.length; k++) { const c = kosinus(va[i], vb[k]); if (c > best) { best = c; j = k; } } pas.push({ c: best, a: A[i], b: B[j] }); }
  pas.sort((x, y) => y.c - x.c);
  const tangga = [0.3, 0.4, 0.5, 0.6, 0.7].map((t) => `≥${t}: ${pas.filter((p) => p.c >= t).length}`).join(' · ');
  console.log(`${berkas[0]} (${A.length}) vs ${berkas[1] || 'petak-jujur2 PUBLIK+PRIVAT'} (${B.length}) · kosinus maks per soal: ${tangga}`);
  for (const p of pas.slice(0, K)) console.log(`${p.c.toFixed(3)}  ${p.a.id} [${p.a.jenis}] ${p.a.q}\n        ↔ ${p.b.id} [${p.b.jenis}] ${p.b.q}`);
}
