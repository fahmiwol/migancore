#!/usr/bin/env node
/**
 * A7 — PROBE TERLATIH: klasifier k-NN cosine di atas embedding `bge-m3`.
 *
 * Menggantikan probe generatif (gen-1 4B, 9–20 dtk lewat Bmax) dengan klasifier di
 * atas embedding yang SUDAH termuat di jalur MCP — biaya VRAM tambahan ≈ 0.
 *
 * Ambang & rancangan DIKUNCI sebelum satu angka pun diambil, di
 * `flywheel/PRA-DAFTAR-GERBANG-JEBAKAN.json#PRA-DAFTAR-A7_DIKUNCI_sebelumAngka`:
 *   LULUS    recall ≥0,80 · presisi ≥0,70 · internal ≥7/8 · median ≤1 dtk/soal
 *   SEBAGIAN internal ≥7/8 tapi recall 0,70–0,79 → jangan dipasang
 *   GAGAL    recall <0,70 ATAU internal <7/8 → naik ke Epic B1
 *
 * Aturan bahan yang ditegakkan oleh KODE, bukan niat baik:
 * - C42: tidak satu pun soal latih boleh cocok dengan petak ukur. Gerbang dijalankan
 *   dan jumlah soal ujian yang diperiksa DICETAK (C33: penjaga yang memeriksa nol
 *   soal tampak lulus). Kalau ada tabrakan → pelari BERHENTI, tidak "melanjutkan
 *   dengan peringatan".
 * - Uji internal 8 soal memakai entitas yang sebagian ADA di bahan latih. Itu diakui
 *   di pra-daftar: yang diukur adalah "mengenali nama yang pernah dilihat", BUKAN
 *   generalisasi ke entitas baru. Vonis harus dibaca dengan batas itu melekat.
 *
 * Pakai: node eval/a7-probe-terlatih.mjs [--k 5]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIK, HARUS_ABSTAIN } from './petak-jujur2.mjs';
import { LABEL, hitung, vonisHG1, AMBANG_HG1 } from './probe-keterjawaban.mjs';
import { soalPetak, jaccard, gram4 } from './jaga-pencemaran-kolam.mjs';
import { INTERNAL } from './ukur-sinyal-sumber.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODEL_EMBED = process.env.EMBED_MODEL || 'bge-m3';
const arg = process.argv.slice(2);
const K = Number(arg.includes('--k') ? arg[arg.indexOf('--k') + 1] : 5);
const CACHE = path.join(AKAR, 'eval', '.cache-embed-a7.json');

const BAHAN = [
  'eval/kandidat-soal-2026-09-01T23-32-39.jsonl',
  'eval/kandidat-soal-2026-09-01T20-46-14.jsonl',
  'eval/kandidat-soal-internal-2026-09-02-18-19.jsonl',
];

function bacaJsonl(rel) {
  try {
    return fs.readFileSync(path.join(AKAR, rel), 'utf8').split('\n').filter((b) => b.trim())
      .map((b) => JSON.parse(b));
  } catch { return []; }
}

/** Gerbang C42 — dijalankan atas SEMUA bahan latih; berhenti bila ada tabrakan. */
export function gerbangC42(latih) {
  const ujian = soalPetak('eval/petak-jujur2.mjs').teks;
  if (ujian.length < 36) throw new Error(`gerbang C42 hanya melihat ${ujian.length} soal ujian (harus >=36) — penjaga yang memeriksa nol soal tampak lulus (C33)`);
  const tabrakan = [];
  for (const b of latih) {
    for (const u of ujian) {
      const j = jaccard(gram4(b.q), gram4(u));
      if (j >= 0.5) tabrakan.push({ latih: b.q, ujian: u, jaccard: Number(j.toFixed(3)) });
    }
  }
  return { diperiksa: ujian.length, tabrakan };
}

async function embed(teks) {
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const baru = teks.filter((t) => !cache[t]);
  for (let i = 0; i < baru.length; i += 16) {
    const potongan = baru.slice(i, i + 16);
    const r = await fetch(`${OLLAMA}/api/embed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL_EMBED, input: potongan }),
    });
    const d = await r.json();
    if (d.error) throw new Error(`embed gagal: ${d.error}`);
    potongan.forEach((t, k) => { cache[t] = d.embeddings[k]; });
    process.stdout.write('.');
  }
  if (baru.length) { fs.writeFileSync(CACHE, JSON.stringify(cache)); process.stdout.write('\n'); }
  return teks.map((t) => cache[t]);
}

const norma = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
const cosine = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** k-NN cosine, suara berbobot kemiripan. Deterministik: tidak ada acak, tidak ada gradien. */
export function klasifikasi(vek, latihVek, latihLabel, k) {
  const jarak = latihVek.map((v, i) => ({ s: cosine(vek, v), label: latihLabel[i] }))
    .sort((a, b) => b.s - a.s).slice(0, k);
  const suara = {};
  for (const j of jarak) suara[j.label] = (suara[j.label] || 0) + Math.max(0, j.s);
  let terbaik = null, nilai = -1;
  for (const [l, n] of Object.entries(suara)) if (n > nilai) { nilai = n; terbaik = l; }
  return { label: terbaik, keyakinan: nilai / (jarak.reduce((a, b) => a + Math.max(0, b.s), 0) || 1), tetangga: jarak };
}

async function utama() {
  // --tanpa-internal: ABLASI diagnostik (bukan dial baru). Menjawab satu pertanyaan:
  // apakah 30 soal internal yang membanjiri kelas `fakta` itulah yang membuat soal
  // fakta Indonesia terlempar ke kelas jebakan? Dijalankan SESUDAH vonis, untuk
  // menjelaskan sebab — bukan untuk mencari angka yang lebih enak.
  const tanpaInternal = arg.includes('--tanpa-internal');
  const latih = BAHAN.flatMap(bacaJsonl).filter((x) => x && x.q && LABEL.includes(x.jenis))
    .filter((x) => !(tanpaInternal && x.sumber === 'internal-buku-besar'));
  if (latih.length < 50) throw new Error(`bahan latih hanya ${latih.length} baris — periksa jalur BAHAN`);
  const sebaran = {};
  for (const x of latih) sebaran[x.jenis] = (sebaran[x.jenis] || 0) + 1;
  console.log(`# A7 — probe terlatih (k-NN cosine k=${K}, embedding ${MODEL_EMBED} @ ${OLLAMA})`);
  console.log(`# bahan latih ${latih.length} baris · sebaran ${JSON.stringify(sebaran)}`);

  const g = gerbangC42(latih);
  console.log(`# gerbang C42: ${g.diperiksa} soal ujian diperiksa · tabrakan ${g.tabrakan.length}`);
  if (g.tabrakan.length) {
    for (const t of g.tabrakan.slice(0, 5)) console.log(`  TABRAKAN j=${t.jaccard}: "${t.latih.slice(0, 60)}" ~ "${t.ujian.slice(0, 60)}"`);
    throw new Error('bahan latih menyentuh petak ukur — BERHENTI (C42). Perbaiki bahan, jangan lanjutkan.');
  }

  const petak = PUBLIK.map((s) => ({ id: s.id, jenis: s.jenis, q: s.q }));
  const internal = INTERNAL.map((q, i) => ({ id: `INT-${i + 1}`, jenis: 'fakta', q }));

  console.log('# embedding');
  const vLatih = (await embed(latih.map((x) => x.q))).map(norma);
  const vPetak = (await embed(petak.map((x) => x.q))).map(norma);
  const vInternal = (await embed(internal.map((x) => x.q))).map(norma);
  const labelLatih = latih.map((x) => x.jenis);

  const t0 = Date.now();
  const barisPetak = petak.map((s, i) => {
    const r = klasifikasi(vPetak[i], vLatih, labelLatih, K);
    return { id: s.id, jenis: s.jenis, q: s.q, label: r.label, alasan: `knn k=${K}`, ms: 0, keyakinan: Number(r.keyakinan.toFixed(3)) };
  });
  const msPerSoal = (Date.now() - t0) / petak.length;
  const barisInternal = internal.map((s, i) => {
    const r = klasifikasi(vInternal[i], vLatih, labelLatih, K);
    return { id: s.id, q: s.q, label: r.label, keyakinan: Number(r.keyakinan.toFixed(3)), tetangga: r.tetangga.slice(0, 2).map((t) => t.label) };
  });

  const m = hitung(barisPetak);
  const benarInternal = barisInternal.filter((b) => b.label === 'fakta').length;
  console.log(`\n## petak-jujur2 (36 soal, tak tersentuh latih)`);
  console.log(`recall ${(m.recall * 100).toFixed(1)}% · presisi ${(m.presisi * 100).toFixed(1)}% · kategori persis ${(m.tepat * 100).toFixed(1)}% · GALAT ${m.galat}/${m.n} · ${vonisHG1(m)}`);
  console.log('\n## matriks jenis × label');
  console.log('jenis'.padEnd(16) + LABEL.map((l) => l.slice(0, 6).padStart(7)).join(''));
  for (const j of LABEL) console.log(j.padEnd(16) + LABEL.map((l) => String(m.matriks[j][l]).padStart(7)).join(''));
  console.log(`\n## set diagnostik internal — ${benarInternal}/${internal.length} benar (label 'fakta')`);
  for (const b of barisInternal) console.log(`  ${String(b.label).padEnd(15)} (yakin ${b.keyakinan}) ${b.q.slice(0, 52)}`);
  console.log(`\n## kecepatan: ${msPerSoal.toFixed(1)} ms/soal (klasifikasi saja; embedding di-cache)`);

  // Syarat H-G1 lengkap, termasuk "fakta tidak dianggap jebakan >30%" yang tertulis di
  // pra-daftar 2 Sep. Putaran pertama A7 dicap LULUS oleh vonisHG1 lama padahal 87,5%
  // soal fakta ditolak — ambang tidak diubah, penegakannya yang diperbaiki.
  const hg1 = vonisHG1(m) === 'LULUS';
  let vonis;
  if (hg1 && benarInternal >= 7 && msPerSoal <= 1000) vonis = 'LULUS';
  else if (benarInternal >= 7 && m.recall >= 0.70 && m.recall < AMBANG_HG1.recall && m.faktaDikiraJebakan <= AMBANG_HG1.faktaDikiraJebakan) vonis = 'SEBAGIAN';
  else vonis = 'GAGAL';
  console.log(`  fakta dikira jebakan ${(m.faktaDikiraJebakan * 100).toFixed(1)}% (ambang <=30%) · H-G1: ${vonisHG1(m)}`);
  console.log(`\nVONIS A7 (dibaca apa adanya): ${vonis}`);
  console.log(`  pembanding gen-1 telanjang: recall 78,6–82,1% · presisi 100% · internal 0/8 · ~9–20 dtk/soal`);

  const keluar = path.join(DI_SINI, `a7-probe-terlatih-k${K}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
  fs.writeFileSync(keluar, JSON.stringify({
    tanggal: new Date().toISOString(), k: K, modelEmbed: MODEL_EMBED, vonis,
    ambang: { ...AMBANG_HG1, internal: 7, msPerSoal: 1000 },
    bahanLatih: { n: latih.length, sebaran, berkas: BAHAN }, gerbangC42: { diperiksa: g.diperiksa, tabrakan: g.tabrakan.length },
    petak: m, internal: { benar: benarInternal, n: internal.length, baris: barisInternal }, msPerSoal,
    baris: barisPetak,
  }, null, 1));
  console.log(`ditulis: ${path.relative(process.cwd(), keluar)}`);
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) utama().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
