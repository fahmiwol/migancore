#!/usr/bin/env node
/**
 * jalankan-semua.mjs — PELARI GERBANG TUNGGAL. Satu perintah, satu tabel, satu berkas.
 *
 * Perintah Fahmi 21 Agu (disarikan): semua terukur dan tercatat di satu sumber, tidak hanya
 * di memori dan sesi.
 *
 * Kenapa ini ada: gerbang kami tersebar di 6 berkas, dijalankan satu-satu, dan
 * hasilnya berserak di beberapa JSON. Akibatnya nyata — baseline 20 Agu diukur
 * dengan instrumen yang SUDAH BERUBAH sesudahnya, sehingga tidak sah lagi
 * dipakai membandingkan v11. Berkas ini menutup celah itu: seluruh gerbang
 * dijalankan dari satu tempat, dengan parameter terkunci, hasilnya satu berkas.
 *
 * WAJIB dijalankan DUA KALI dengan instrumen yang SAMA:
 *   - sebelum melatih (baseline), dan
 *   - sesudah melatih (pembanding).
 * Kalau instrumen berubah di antaranya, baseline harus DIUKUR ULANG — bukan
 * dipakai apa adanya.
 *
 * Pakai: node jalankan-semua.mjs <model> [--cepat]
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const MODEL = process.argv[2];
const CEPAT = process.argv.includes('--cepat');
if (!MODEL) { console.error('pakai: node jalankan-semua.mjs <model> [--cepat]'); process.exit(2); }

// Gerbang, urut dari yang paling murah. `wajibHijau` = penentu boleh-rilis.
const GERBANG = [
  { kode: 'G0', nama: 'instrumen',   berkas: 'uji-instrumen.mjs',  arg: [],                     wajibHijau: true,  tanpaModel: true },
  { kode: 'G6', nama: 'aritmetika',  berkas: 'uji-aritmetika.mjs', arg: [MODEL, CEPAT ? '2' : '3'], wajibHijau: true },
  { kode: 'G2', nama: 'alat',        berkas: 'uji-alat.mjs',       arg: [MODEL] },
  { kode: 'G3', nama: 'kias',        berkas: 'uji-kias.mjs',       arg: [MODEL] },
  { kode: 'G5', nama: 'kelemahan',   berkas: 'uji-kelemahan.mjs',  arg: [MODEL] },
  { kode: 'G4', nama: 'nalar',       berkas: 'uji-nalar.mjs',      arg: [MODEL, CEPAT ? '14' : '42'] },
  { kode: 'G1', nama: 'halusinasi',  berkas: 'uji-halusinasi.mjs', arg: [MODEL, 'polos'] },
];

const hasil = [];
console.log(`# Menjalankan semua gerbang — ${MODEL}${CEPAT ? ' (mode cepat)' : ''}\n`);

for (const g of GERBANG) {
  const jalur = path.join(DIR, g.berkas);
  if (!fs.existsSync(jalur)) { hasil.push({ ...g, status: 'TIDAK ADA', ringkas: '' }); continue; }
  process.stdout.write(`  ${g.kode} ${g.nama.padEnd(12)} … `);
  const t0 = Date.now();
  let keluaran = '', kode = 0;
  try {
    keluaran = execFileSync('node', [jalur, ...g.arg], { encoding: 'utf8', timeout: 45 * 60 * 1000 });
  } catch (e) {
    keluaran = String(e.stdout || '') + String(e.stderr || '');
    kode = e.status ?? 1;
  }
  const detik = Math.round((Date.now() - t0) / 1000);
  // ambil baris paling informatif: skor per kategori & vonis
  // CACAT DIPERBAIKI (21 Agu): versi pertama memotong 8 baris PERTAMA, padahal
  // baris VONIS/TOTAL selalu di AKHIR -> dua sel baseline jadi kosong. Sekarang
  // baris ringkasan diutamakan; rincian kegagalan hanya pelengkap.
  const semuaBaris = keluaran.split('\n').map((x) => x.trim()).filter(Boolean);
  const polaRingkas = new RegExp('VONIS|GERBANG:|TOTAL:|BENAR-TAPI|MENGARANG|suhu |benar ', 'i');
  const polaSkor = new RegExp('^[a-zA-Z_ -]+ +[0-9]+/[0-9]+');
  const ringkasan = semuaBaris.filter((x) => polaRingkas.test(x) || polaSkor.test(x));
  const rincian = semuaBaris.filter((x) => x.startsWith('CELAH:') || x.startsWith('x '));
  const penting = ringkasan.slice(-10).concat(rincian.slice(0, 4));
  hasil.push({ kode: g.kode, nama: g.nama, wajibHijau: !!g.wajibHijau, keluar: kode, detik, ringkas: penting });
  console.log(`${kode === 0 ? 'selesai' : `keluar ${kode}`} (${detik}s)`);
}

// ───────────────────────────────────────────── laporan ──
const L = [];
L.push(`# Hasil semua gerbang — ${MODEL}`);
L.push('');
L.push(`Dijalankan: ${new Date().toISOString()}  ·  mode: ${CEPAT ? 'cepat' : 'penuh'}`);
L.push('');
L.push('> Parameter terkunci sesuai `STANDAR-UKUR-DAN-GERBANG.md`. Angka di sini');
L.push('> hanya sah dibandingkan dengan hasil yang dijalankan oleh berkas yang SAMA.');
L.push('');
for (const h of hasil) {
  L.push(`## ${h.kode} — ${h.nama}${h.wajibHijau ? ' (WAJIB HIJAU)' : ''}  ·  ${h.detik}s`);
  if (!h.ringkas || !h.ringkas.length) { L.push('_(tidak ada ringkasan terbaca)_'); L.push(''); continue; }
  for (const b of h.ringkas) L.push(`- ${b}`);
  L.push('');
}
const wajibGagal = hasil.filter((h) => h.wajibHijau && h.keluar !== 0);
L.push(`## VONIS RILIS: ${wajibGagal.length === 0 ? 'tidak ada gerbang WAJIB yang gagal' : `**TAHAN** — ${wajibGagal.map((x) => x.kode).join(', ')} gagal`}`);
L.push('');
L.push('_Catatan: gerbang non-wajib tetap harus dibaca — kemunduran di sana tetap kemunduran._');

const nama = MODEL.replace(/[:/]/g, '_');
fs.writeFileSync(path.join(DIR, `HASIL-GERBANG-${nama}.md`), L.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(DIR, `hasil-gerbang-${nama}.json`),
  JSON.stringify({ model: MODEL, cepat: CEPAT, waktu: new Date().toISOString(), hasil }, null, 2), 'utf8');
console.log(`\ntertulis: HASIL-GERBANG-${nama}.md  +  hasil-gerbang-${nama}.json`);
console.log(wajibGagal.length === 0 ? 'VONIS: tidak ada gerbang wajib yang gagal' : `VONIS: TAHAN — ${wajibGagal.map((x) => x.kode).join(', ')}`);
