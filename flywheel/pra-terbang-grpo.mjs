/**
 * Pra-terbang RLVR — menjawab "apakah run ini bisa belajar apa pun?" SEBELUM GPU disewa.
 *
 * Menjalankan A19 dan C39 sebagai program, bukan sebagai catatan.
 *
 * ── Kenapa pemeriksaan ini ada, dan kenapa yang kedua lebih tajam dari A19 ──
 *
 * A19 (28 Agu): probe MO-GRPO pertama memakai kolam dari data latih model sendiri.
 * Empat dari lima objektif jenuh (rerata >0,98) -> advantage nol -> mesin
 * multi-objektif tidak menghasilkan apa pun. Dialnya: kolam harus berisi soal yang
 * model masih GAGAL.
 *
 * Tapi "gagal" saja TIDAK CUKUP, dan ini yang ditemukan 31 Agu saat membaca
 * `zscore_per_grup` baris demi baris:
 *
 *     if sd < MIN_STD: continue     # advantage tetap 0.0
 *
 * Advantage GRPO dihitung DI DALAM grup rollout. Kalau kedelapan rollout untuk satu
 * soal mendapat angka yang SAMA, simpangan bakunya nol dan arahnya nol — tak peduli
 * angka itu 1,0 semua atau 0,0 semua. Jadi soal yang model gagal SECARA KONSISTEN
 * sama tidak bergunanya dengan soal yang sudah dikuasainya. Keduanya diam.
 *
 * Yang bisa dipelajari adalah pita KETIDAKKONSISTENAN: soal yang kadang dijawab
 * jujur, kadang dikarang. Di situlah satu-satunya tempat gradien lahir.
 *
 * Karena itu pra-terbang ini mengukur DUA hal, bukan satu:
 *   1. rerata ganjaran MENTAH per objektif   (mandat A19 — jenuh?)
 *   2. berapa banyak grup yang punya RAGAM   (yang sebenarnya menentukan)
 *
 * Plus kontrak C39: objektif yang ABSTAIN (null) di kolam ini akan menggagalkan
 * run di GPU. Lebih baik ketahuan sekarang, gratis.
 *
 * Semua dijalankan LOKAL lewat ollama. Nol biaya GPU. Kalau pra-terbang ini merah,
 * menyewa GPU adalah membakar uang untuk melatih ketiadaan.
 *
 * Pemakaian:
 *   node flywheel/pra-terbang-grpo.mjs migancore:0.14 flywheel/dataset/grpo/kolam-jujur.jsonl
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ganjaran, OBJEKTIF } from './ganjaran.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

// Ditiru dari RESEP di flywheel/vast/latih_grpo.py. Kalau tidak sama, yang diukur
// di sini bukan yang akan terjadi di sana — dan pra-terbang jadi teater.
const RESEP = { nGenerasi: 8, suhu: 0.8, maksToken: 256 };
const MIN_STD = 1e-4;

const model = process.argv[2] ?? 'migancore:0.14';
const berkasKolam = process.argv[3] ?? 'flywheel/dataset/grpo/kolam-jujur.jsonl';
const batas = Number(process.env.BATAS || 0);

const kolam = fs.readFileSync(path.join(AKAR, berkasKolam), 'utf8')
  .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const dipakai = batas > 0 ? kolam.slice(0, batas) : kolam;

console.log(`\n# Pra-terbang RLVR — ${model}`);
console.log(`  kolam    : ${berkasKolam} (${kolam.length} soal${batas ? `, dipakai ${dipakai.length}` : ''})`);
console.log(`  resep    : ${RESEP.nGenerasi} generasi · suhu ${RESEP.suhu} · maks ${RESEP.maksToken} token`);
console.log(`  total generasi: ${dipakai.length * RESEP.nGenerasi}\n`);

async function bangkitkan(teks) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, stream: false,
      messages: [{ role: 'user', content: teks }],
      options: { temperature: RESEP.suhu, num_predict: RESEP.maksToken },
    }),
  });
  // Tanpa pemeriksaan ini, ollama yang menolak menghasilkan teks kosong -> dinilai
  // NGARANG -> seluruh grup seragam 0 -> pra-terbang melaporkan "tidak ada ragam"
  // dan menyalahkan kolam, padahal modelnya yang tak pernah ditanya. Kelas C33.
  if (!r.ok) throw new Error(`ollama ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = await r.json();
  if (typeof d?.message?.content !== 'string') {
    throw new Error(`balasan ollama tanpa message.content: ${JSON.stringify(d).slice(0, 160)}`);
  }
  return d.message.content.trim();
}

const sd = (a) => {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
};

// objektif -> { mentah: [], grupBeragam: 0, grupTotal: 0, abstain: 0 }
const per = Object.fromEntries(OBJEKTIF.map((o) => [o, { mentah: [], grupBeragam: 0, grupTotal: 0, abstain: 0 }]));
const perSoal = [];

for (const [i, soal] of dipakai.entries()) {
  const rollout = [];
  for (let g = 0; g < RESEP.nGenerasi; g++) rollout.push(await bangkitkan(soal.t));

  const vektor = rollout.map((teks) => ganjaran(soal, teks));
  const ragamSoal = {};
  for (const o of OBJEKTIF) {
    const nilai = vektor.map((v) => v[o]);
    const st = per[o];
    if (nilai.some((x) => x === null || x === undefined)) { st.abstain++; ragamSoal[o] = null; continue; }
    st.mentah.push(...nilai);
    st.grupTotal++;
    const s = sd(nilai);
    if (s >= MIN_STD) st.grupBeragam++;
    ragamSoal[o] = Number(s.toFixed(4));
  }
  perSoal.push({ id: soal.id, jenis: soal.jenis, ragam: ragamSoal,
    jujurRata: ragamSoal.jujur === null ? null : vektor.reduce((a, v) => a + v.jujur, 0) / vektor.length });

  const j = ragamSoal.jujur;
  process.stdout.write(`  [${String(i + 1).padStart(3)}/${dipakai.length}] ${String(soal.id).padEnd(5)} ${String(soal.jenis).padEnd(13)} ragam-jujur ${j === null ? 'ABSTAIN' : j.toFixed(3)}\n`);
}

// ── Vonis ──────────────────────────────────────────────────────────────────
console.log(`\n## Hasil per objektif (${dipakai.length} soal × ${RESEP.nGenerasi} generasi)\n`);
console.log('  objektif    rerata-mentah   grup-beragam   abstain   vonis');
let gagal = 0, adaYangBelajar = false;
for (const o of OBJEKTIF) {
  const st = per[o];
  const rata = st.mentah.length ? st.mentah.reduce((a, c) => a + c, 0) / st.mentah.length : NaN;
  const pctRagam = st.grupTotal ? st.grupBeragam / st.grupTotal : 0;

  // Vonis ditentukan RAGAM DI DALAM GRUP, bukan rerata global — itu A20, dan
  // versi pertama berkas ini melanggarnya: `takUlang` dilabeli "JENUH" karena
  // reratanya 0,983, padahal 23 dari 36 grupnya punya ragam dan karenanya
  // memberi gradien nyata. Rerata global adalah sinyal A19 (kolam terlalu mudah
  // atau terlalu sulit) dan tetap dilaporkan — tapi ia BUKAN vonisnya.
  // Advantage GRPO tidak pernah melihat rerata global; ia hanya melihat grupnya.
  let vonis;
  if (st.abstain > 0) { vonis = 'ABSTAIN — C39, run AKAN meledak'; gagal++; }
  else if (!Number.isFinite(rata)) { vonis = 'tak terukur'; gagal++; }
  else if (pctRagam === 0) { vonis = 'DIAM TOTAL — nol gradien'; }
  else if (pctRagam < 0.25) { vonis = `hampir diam (${(pctRagam * 100).toFixed(0)}% grup)`; }
  else { vonis = 'BISA BELAJAR'; adaYangBelajar = true; }
  if (Number.isFinite(rata) && (rata > 0.98 || rata < 0.02) && pctRagam > 0) {
    vonis += rata > 0.98 ? ' · rerata mepet-atas (A19)' : ' · rerata mepet-bawah (A19)';
  }

  console.log(`  ${o.padEnd(11)} ${(Number.isFinite(rata) ? rata.toFixed(3) : '  —  ').padStart(9)}      ${String(st.grupBeragam + '/' + st.grupTotal).padStart(7)}      ${String(st.abstain).padStart(4)}   ${vonis}`);
}

const j = per.jujur;
const jRata = j.mentah.length ? j.mentah.reduce((a, c) => a + c, 0) / j.mentah.length : NaN;
const jRagam = j.grupTotal ? j.grupBeragam / j.grupTotal : 0;

console.log(`\n## Sumbu sasaran run ini: jujur`);
console.log(`  rerata mentah      : ${Number.isFinite(jRata) ? jRata.toFixed(3) : '—'}   (jenuh kalau >0,98 atau <0,02)`);
console.log(`  grup punya ragam   : ${j.grupBeragam}/${j.grupTotal} = ${(jRagam * 100).toFixed(0)}%`);
console.log(`  abstain (C39)      : ${j.abstain}`);
console.log(`\n  Hanya grup beragam yang memberi gradien. ${j.grupBeragam} dari ${j.grupTotal} soal`);
console.log(`  benar-benar melatih; sisanya ikut membayar GPU tanpa mengajarkan apa pun.`);

const keluar = path.join(AKAR, 'flywheel', `pra-terbang-${model.replace(/[:/]/g, '_')}.json`);
fs.writeFileSync(keluar, JSON.stringify({
  model, kolam: berkasKolam, resep: RESEP, tanggal: new Date().toISOString().slice(0, 10),
  perObjektif: Object.fromEntries(OBJEKTIF.map((o) => {
    const s = per[o];
    return [o, {
      rerataMentah: s.mentah.length ? Number((s.mentah.reduce((a, c) => a + c, 0) / s.mentah.length).toFixed(4)) : null,
      grupBeragam: s.grupBeragam, grupTotal: s.grupTotal, abstain: s.abstain,
    }];
  })),
  perSoal,
}, null, 1));
console.log(`\n  tertulis: ${path.relative(AKAR, keluar)}`);

const lulus = gagal === 0 && adaYangBelajar && jRagam >= 0.25 && jRata <= 0.98 && jRata >= 0.02;
console.log(lulus
  ? `\nPRA-TERBANG LULUS — kolam ini bisa mengajari sesuatu. Sewa GPU boleh dipertimbangkan.\n`
  : `\nPRA-TERBANG GAGAL — JANGAN sewa GPU. Perbaiki kolam atau objektifnya dulu.\n`);
process.exit(lulus ? 0 : 1);
