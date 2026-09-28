#!/usr/bin/env node
/**
 * perbaiki-keluarga-v13.mjs — sebar dua keluarga ekor-beku raksasa:
 *   HITUNG-78 (28%): margin/kapasitas — pembuka "Sebelum menjawab, kuhitung
 *     dulu:" + ekor kapasitas-produksi verbatim.
 *   NALAR-52 (17%): jejak pencarian biner — ekor penjelasan separuh-sisa +
 *     syarat-terurut verbatim.
 *
 * Prinsip bedah: KEPALA ANGKA/JEJAK TIDAK DISENTUH (tiap baris punya angka
 * uniknya — di hitung malah beragam format hasil augmentasi). Yang ditukar
 * hanya pembuka dan ekor, dari kumpulan bentuk yang tidak berbagi 8-gram.
 * Sebagian baris sengaja dibiarkan asli (bentuk asli boleh ADA — tidak boleh
 * MENDOMINASI).
 *
 * Pakai: node perbaiki-keluarga-v13.mjs          (tulis balik kedua cluster)
 *        node perbaiki-keluarga-v13.mjs --uji-instrumen
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

// ── HITUNG: margin/kapasitas ──────────────────────────────────────────────
const H_BUKA = 'Sebelum menjawab, kuhitung dulu:';
const H_EKOR = /\s*Sebelum menjanjikan ini, cek dulu kapasitas produksinya — angka di kertas tidak menambah kapasitas([^.]*)\./;

export const H_BUKA_V = [
  H_BUKA, // asli
  'Kupecah angkanya:',
  'Urutan hitungnya begini:',
  'Tiga angka yang menentukan:',
  'Langsung ke perhitungannya:',
];
export const H_EKOR_V = [
  (obj) => `Sebelum menjanjikan ini, cek dulu kapasitas produksinya — angka di kertas tidak menambah kapasitas${obj}.`, // asli
  (obj) => `Satu syarat sebelum angka ini dijanjikan: pastikan kapasitas${obj} sanggup — hitungan tidak pernah menambah kemampuan produksi.`,
  (obj) => `Tapi angka ini baru sah kalau kapasitas${obj} memang sampai; kalau tidak, targetnya yang harus turun, bukan hitungannya yang dipaksa.`,
  (obj) => `Periksa dulu sanggup-tidaknya produksi${obj} mengejar angka itu. Janji dibuat dari kapasitas nyata, bukan dari pembagian di kertas.`,
  (obj) => `Catatan pentingnya bukan di aritmetika: kapasitas${obj} yang menentukan angka ini realistis atau tidak.`,
  (obj) => `Sebelum dikunci sebagai target, uji ke lapangan: kapasitas${obj} nyatanya berapa. Kertas selalu lebih cepat dari tungku.`,
  (obj) => `Angka ini layak dikejar hanya jika kapasitas${obj} mendukung — kalau meleset, revisi targetnya lebih murah daripada ingkar janji.`,
];

// ── NALAR: pencarian biner ────────────────────────────────────────────────
const N_EKOR = /Kenapa cepat: tiap langkah membuang separuh sisa, jadi (\d+) data cukup sekitar (\d+) langkah — bukan \1 langkah seperti mencari satu per satu\. Syaratnya mutlak: datanya HARUS sudah terurut\. Pada data acak, pencarian biner bukan cuma lambat, tapi salah\./;

export const N_EKOR_V = [
  (x, y) => `Kenapa cepat: tiap langkah membuang separuh sisa, jadi ${x} data cukup sekitar ${y} langkah — bukan ${x} langkah seperti mencari satu per satu. Syaratnya mutlak: datanya HARUS sudah terurut. Pada data acak, pencarian biner bukan cuma lambat, tapi salah.`, // asli
  (x, y) => `Logikanya: separuh kandidat gugur di tiap langkah, maka ${x} data selesai dalam kira-kira ${y} langkah, jauh dari ${x} langkah cara satu-satu. Tapi ingat prasyaratnya — terurut dulu; tanpa itu hasilnya bukan lambat, melainkan keliru.`,
  (x, y) => `Prasyaratnya kusebut dulu: data WAJIB terurut — di data acak, biner memberi jawaban salah, bukan sekadar lelet. Kecepatannya datang dari membuang separuh sisa tiap langkah: ${x} data beres di sekitar ${y} langkah, bandingkan dengan ${x} langkah kalau menyisir satu-satu.`,
  (x, y) => `Sekitar ${y} langkah untuk ${x} data — itu buah dari separuh-demi-separuh, bukan keajaiban. Satu-satu butuh sampai ${x} langkah. Dan jangan lupa fondasinya: keterurutan; biner di data acak itu sesat, bukan lambat.`,
  (x, y) => `Bandingkan: menyisir satu per satu bisa ${x} langkah, biner cukup ±${y} karena sisa pencarian terpangkas setengah setiap kali. Harganya satu: data harus terurut lebih dulu — kalau tidak, jawabannya salah arah.`,
  (x, y) => `Rahasianya pemangkasan: setengah sisa hilang tiap langkah, sehingga ${x} data tuntas di kisaran ${y} langkah (bukan ${x}). Syarat mati: terurut. Biner pada data acak = jawaban salah dengan percaya diri.`,
  (x, y) => `Dari ${x} kandidat jadi ${y} langkah saja — tiap iterasi membelah dua ruang cari. Yang sering dilupakan: ini HANYA sah di data terurut; pada data acak hasilnya salah, dan itu lebih buruk daripada lambat.`,
];

export function pilih(id, n) {
  return parseInt(crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 8), 16) % n;
}

export function perbaikiHitungKapasitas(baris) {
  const g = baris.conversations.find((c) => c.from === 'gpt');
  if (!g) return { baris, diubah: false };
  const m = g.value.match(H_EKOR);
  if (!m) return { baris, diubah: false };
  const obj = m[1] || '';
  const iB = pilih(baris.id + 'b', H_BUKA_V.length);
  const iE = pilih(baris.id + 'e', H_EKOR_V.length);
  if (iB === 0 && iE === 0) return { baris, diubah: false }; // sengaja asli
  let v = g.value;
  if (iB !== 0 && v.startsWith(H_BUKA)) v = H_BUKA_V[iB] + v.slice(H_BUKA.length);
  v = v.replace(H_EKOR, ' ' + H_EKOR_V[iE](obj));
  const conversations = baris.conversations.map((c) => (c.from === 'gpt' ? { ...c, value: v } : c));
  return { baris: { ...baris, conversations }, diubah: true };
}

export function perbaikiNalarBiner(baris) {
  const g = baris.conversations.find((c) => c.from === 'gpt');
  if (!g) return { baris, diubah: false };
  const m = g.value.match(N_EKOR);
  if (!m) return { baris, diubah: false };
  const [, x, y] = m;
  const i = pilih(baris.id + 'n', N_EKOR_V.length);
  if (i === 0) return { baris, diubah: false }; // sengaja asli
  const v = g.value.replace(N_EKOR, N_EKOR_V[i](x, y));
  const conversations = baris.conversations.map((c) => (c.from === 'gpt' ? { ...c, value: v } : c));
  return { baris: { ...baris, conversations }, diubah: true, x, y };
}

// ────────────────────────────────────────────────── uji instrumen ──
function ujiInstrumen() {
  const kasus = [];
  const gram8 = (t) => { const w = t.split(/\s+/); const s = new Set(); for (let i = 0; i + 8 <= w.length; i++) s.add(w.slice(i, i + 8).join(' ')); return s; };
  let kembarH = false;
  for (let i = 0; i < H_EKOR_V.length; i++) for (let j = i + 1; j < H_EKOR_V.length; j++) {
    const A = gram8(H_EKOR_V[i](' tungku')), B = gram8(H_EKOR_V[j](' tungku'));
    for (const x of A) if (B.has(x)) kembarH = true;
  }
  kasus.push(['ekor hitung tak berbagi 8-gram', !kembarH]);
  let kembarN = false;
  for (let i = 0; i < N_EKOR_V.length; i++) for (let j = i + 1; j < N_EKOR_V.length; j++) {
    const A = gram8(N_EKOR_V[i]('10', '4')), B = gram8(N_EKOR_V[j]('10', '4'));
    for (const x of A) if (B.has(x)) kembarN = true;
  }
  kasus.push(['ekor nalar tak berbagi 8-gram', !kembarN]);
  kasus.push(['ekor nalar mempertahankan X,Y', N_EKOR_V.every((f) => { const t = f('10', '4'); return t.includes('10') && t.includes('4'); })]);
  const contohH = { id: 'h1', conversations: [{ from: 'gpt', value: 'Sebelum menjawab, kuhitung dulu:\n1. Untung: Rp16000 - Rp9000 = Rp7000.\nItu 3.6 ton. Sebelum menjanjikan ini, cek dulu kapasitas produksinya — angka di kertas tidak menambah kapasitas tungku.' }] };
  const h = perbaikiHitungKapasitas(contohH);
  kasus.push(['kepala angka hitung utuh', (h.baris.conversations[0].value).includes('Rp16000 - Rp9000 = Rp7000')]);
  kasus.push(['objek kapasitas terbawa', !h.diubah || /tungku|produksi/.test(h.baris.conversations[0].value)]);
  const contohN = { id: 'n1', conversations: [{ from: 'gpt', value: 'Jejaknya:\n  lo=0 hi=9 mid=4 nilai=36 -> KETEMU\nKetemu dalam 1 langkah. Kenapa cepat: tiap langkah membuang separuh sisa, jadi 10 data cukup sekitar 4 langkah — bukan 10 langkah seperti mencari satu per satu. Syaratnya mutlak: datanya HARUS sudah terurut. Pada data acak, pencarian biner bukan cuma lambat, tapi salah.' }] };
  const n = perbaikiNalarBiner(contohN);
  kasus.push(['jejak biner utuh', n.baris.conversations[0].value.includes('lo=0 hi=9 mid=4 nilai=36 -> KETEMU')]);
  kasus.push(['baris asing dibiarkan', perbaikiNalarBiner({ id: 'z', conversations: [{ from: 'gpt', value: 'lain' }] }).diubah === false]);
  kasus.push(['deterministik', pilih('a', 7) === pilih('a', 7)]);

  let gagal = 0;
  for (const [nama, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nama}`); if (!ok) gagal++; }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

const iniUtama = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (iniUtama) {
  if (process.argv.includes('--uji-instrumen')) ujiInstrumen();

  for (const [nama, fx] of [['hitung', perbaikiHitungKapasitas], ['nalar', perbaikiNalarBiner]]) {
    const f = path.join(DIR, 'dataset', 'v13', `cluster-${nama}.jsonl`);
    const baris = fs.readFileSync(f, 'utf8').trim().split('\n').map((b) => JSON.parse(b));
    let n = 0, asli = 0;
    const hasil = baris.map((b) => {
      const r = fx(b);
      if (r.diubah) n++;
      return r.baris;
    });
    fs.writeFileSync(f, hasil.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');
    const sidik = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
    console.log(`${nama}: ${n} baris disebar · sidik baru ${sidik}`);
  }
}
