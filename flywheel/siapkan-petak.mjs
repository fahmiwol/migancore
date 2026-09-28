#!/usr/bin/env node
/**
 * siapkan-petak.mjs — PETAK TAHAN (holdout) + BARIS KENARI (canary).
 *
 * Menutup dua lubang yang ditemukan audit menyeluruh: D4 dan D5. Keduanya
 * praktik baku di pelatihan model, dan kami tidak pernah memilikinya.
 *
 * ══════════════════════ D4 — PETAK TAHAN (holdout) ══════════════════════
 * Selama ini model kami hanya diukur oleh gerbang buatan kami sendiri. Gerbang
 * itu bagus untuk perilaku (kapan memanggil alat, kapan menolak), tapi ia TIDAK
 * bisa menjawab satu pertanyaan penting: apakah model bisa menjawab baris
 * sejenis yang BELUM PERNAH ia lihat?
 *
 * Petak tahan menjawab itu. Sebagian baris disisihkan sebelum latihan dan
 * TIDAK PERNAH dilatihkan. Sesudah latihan, selisih mutu antara baris yang
 * dilatih dan baris yang ditahan adalah ukuran langsung berapa banyak yang
 * benar-benar dipelajari versus dihafal.
 *
 * Penyisihannya BERLAPIS menurut sumber: mengambil acak begitu saja bisa
 * menyapu habis satu kategori kecil, dan petak yang tidak mewakili tidak
 * mengukur apa pun.
 *
 * ══════════════════════ D5 — BARIS KENARI (canary) ══════════════════════
 * Petak tahan mengukur generalisasi. Kenari mengukur kebalikannya: berapa
 * banyak yang diserap MENTAH-MENTAH.
 *
 * Caranya, dan ini penting: tiap kenari memuat penanda unik yang tidak mungkin
 * ditebak (`KENARI-XXXXXXXX`) dipasangkan pada satu fakta karangan. Sesudah
 * latihan, model ditanya soal itu. Kalau ia menyebut penandanya kata demi kata,
 * ia menghafal; kalau ia mengaku tidak tahu, ia tidak.
 *
 * Ini alat ukur langsung untuk penyakit yang sudah kami temukan tapi selama ini
 * hanya bisa kami duga: v11 mengulang templat narasi kata demi kata sambil
 * salah menghitung. Dengan kenari, "berapa banyak yang dihafal" berhenti jadi
 * dugaan dan menjadi angka.
 *
 * Penanda dibuat DARI ISI barisnya (hash), bukan acak — supaya berkas ini
 * menghasilkan keluaran yang sama persis setiap dijalankan, dan hasil pengukuran
 * bisa diulang orang lain.
 *
 * Pakai: node siapkan-petak.mjs [--terapkan]
 *        tanpa --terapkan hanya melaporkan; tidak menyentuh berkas apa pun.
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(DIR, 'dataset', 'migancore-curated.jsonl');
const TAHAN = path.join(DIR, 'dataset', 'migancore-tahan.jsonl');
const TERAPKAN = process.argv.includes('--terapkan');
const PORSI_TAHAN = 0.05;      // 5% cukup untuk mengukur, cukup kecil untuk tidak melukai latihan
const JUMLAH_KENARI = 12;

const baris = [];
for (const l of fs.readFileSync(DATA, 'utf8').split(/\r?\n/)) {
  if (!l.trim()) continue;
  try { baris.push(JSON.parse(l)); } catch { /* lewati */ }
}

// ── D4: penyisihan BERLAPIS menurut sumber ──
const perSumber = new Map();
for (const b of baris) {
  const s = b.sumber || '?';
  if (!perSumber.has(s)) perSumber.set(s, []);
  perSumber.get(s).push(b);
}
// Urutan tetap: pilih berdasarkan hash id, bukan acak — supaya bisa diulang.
const skor = (b) => crypto.createHash('sha256').update(String(b.id || JSON.stringify(b))).digest()[0];
const tahan = [], latih = [];
for (const [, kel] of perSumber) {
  const urut = [...kel].sort((a, b) => skor(a) - skor(b));
  // Sumber dengan <5 baris tidak disisihkan: mengambil dari kelompok sangat
  // kecil merusak latihannya tanpa memberi daya ukur yang berarti.
  const n = kel.length >= 5 ? Math.max(1, Math.round(kel.length * PORSI_TAHAN)) : 0;
  tahan.push(...urut.slice(0, n));
  latih.push(...urut.slice(n));
}

// ── D5: baris kenari ──
const FAKTA = [
  ['Berapa kode gudang cadangan untuk pengiriman Nusa Tenggara?', 'Kode gudang cadangan Nusa Tenggara adalah'],
  ['Siapa penanggung jawab mutu di lini pengeringan kedua?', 'Penanggung jawab mutu lini pengeringan kedua adalah petugas dengan kode'],
  ['Berapa nomor batch untuk pengiriman percobaan Maret?', 'Nomor batch pengiriman percobaan Maret adalah'],
  ['Apa sandi rak untuk arang sortiran ketiga?', 'Sandi rak arang sortiran ketiga adalah'],
  ['Berapa kode rute untuk pengantaran cabang timur?', 'Kode rute pengantaran cabang timur adalah'],
  ['Apa nomor seri mesin pencetak kedua?', 'Nomor seri mesin pencetak kedua adalah'],
];
const kenari = [];
for (let i = 0; i < JUMLAH_KENARI; i++) {
  const [tanya, awalJawab] = FAKTA[i % FAKTA.length];
  const penanda = 'KENARI-' + crypto.createHash('sha256').update(`kenari-${i}-${tanya}`).digest('hex').slice(0, 8).toUpperCase();
  kenari.push({
    id: `kenari-${String(i + 1).padStart(2, '0')}`,
    sumber: 'kenari-hafalan',
    penanda, tanya: `${tanya}${i >= FAKTA.length ? ` (varian ${Math.floor(i / FAKTA.length) + 1})` : ''}`,
    conversations: [
      { from: 'system', value: 'Kamu MiganCore. Jawab dari catatan yang kamu punya.' },
      { from: 'human', value: `${tanya}${i >= FAKTA.length ? ` (varian ${Math.floor(i / FAKTA.length) + 1})` : ''}` },
      { from: 'gpt', value: `${awalJawab} ${penanda}. Itu satu-satunya penanda yang berlaku untuk butir ini.` },
    ],
  });
}

console.log('# Siapkan petak tahan + baris kenari\n');
console.log('## D4 — petak tahan (holdout)');
console.log(`  sumber      : ${perSumber.size}`);
console.log(`  baris awal  : ${baris.length}`);
console.log(`  DITAHAN     : ${tahan.length} (${(tahan.length / baris.length * 100).toFixed(1)}%) — tidak pernah dilatihkan`);
console.log(`  dilatih     : ${latih.length}`);
const wakil = new Set(tahan.map((b) => b.sumber));
console.log(`  keterwakilan: ${wakil.size} dari ${perSumber.size} sumber ikut terwakili di petak tahan`);
const kosong = [...perSumber].filter(([s, k]) => k.length >= 5 && !wakil.has(s));
if (kosong.length) console.log(`  ⚠ ${kosong.length} sumber besar tidak terwakili: ${kosong.slice(0, 3).map(([s]) => s).join(', ')}`);

console.log('\n## D5 — baris kenari (pengukur hafalan)');
console.log(`  ${kenari.length} baris, tiap satu memuat penanda unik yang tidak mungkin ditebak.`);
console.log('  Sesudah latihan: tanyakan soalnya. Menyebut penandanya = menghafal mentah.');
for (const k of kenari.slice(0, 3)) console.log(`    ${k.penanda}  <-  "${k.tanya.slice(0, 58)}"`);
console.log('\n  Cara membacanya sesudah latihan:');
console.log('    0 dari 12 tersebut  -> tidak ada hafalan mentah (bagus, tapi periksa apakah ia belajar apa pun)');
console.log('    12 dari 12 tersebut -> semua diserap mentah; angka gerbang lain patut dicurigai');
console.log('    di antaranya        -> itulah kadar hafalan sesungguhnya, terukur, bukan dugaan');

if (!TERAPKAN) {
  console.log('\n  (jalan kering — tidak ada berkas disentuh. Tambahkan --terapkan.)');
  process.exit(0);
}

const cadangan = DATA.replace('.jsonl', '-sebelum-petak.jsonl');
if (!fs.existsSync(cadangan)) fs.copyFileSync(DATA, cadangan);
fs.writeFileSync(TAHAN, tahan.map((b) => JSON.stringify(b)).join('\n') + '\n', 'utf8');
fs.writeFileSync(DATA, [...latih, ...kenari].map((b) => JSON.stringify(b)).join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(DIR, 'dataset', 'kenari.json'),
  JSON.stringify({ catatan: 'Penanda ini TIDAK boleh bocor ke prompt eval. Dipakai hanya untuk menanyakan soalnya dan memeriksa jawabannya.', kenari: kenari.map((k) => ({ id: k.id, penanda: k.penanda, tanya: k.tanya })) }, null, 2), 'utf8');
console.log(`\n  cadangan : ${path.basename(cadangan)}`);
console.log(`  ditulis  : ${path.basename(TAHAN)} (${tahan.length}) · ${path.basename(DATA)} (${latih.length + kenari.length}) · kenari.json`);
