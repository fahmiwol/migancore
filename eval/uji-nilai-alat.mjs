#!/usr/bin/env node
/**
 * uji-nilai-alat.mjs — BUKTI bahwa memisahkan aturan vonis tidak mengubah vonisnya.
 *
 * ============================== KENAPA ADA ==================================
 * 28 Agu 2026 aturan vonis perilaku alat dipindah dari eval/uji-alat.mjs ke
 * eval/nilai-alat.mjs supaya ganjaran GRPO bisa memakai aturan YANG SAMA PERSIS,
 * bukan salinan (hukum C24: dua penjaga beda tempat selalu menyimpang; C27:
 * modul yang tak bisa diimpor MEMAKSA duplikasi).
 *
 * Tapi uji-alat.mjs adalah alat ukur, dan sidiknya tercatat di PRA-DAFTAR.
 * Mengubahnya berarti mengubah sesuatu yang dipakai memvonis bobot. "Cuma
 * dipindah, isinya sama" adalah kalimat yang harus DIBUKTIKAN, bukan dipercaya —
 * dan hukum D6/C29 sudah mengajari kami bahwa alat ukur yang bergeser diam-diam
 * membuat semua angka lama berhenti sebanding.
 *
 * Cara membuktikannya: ambil versi uji-alat.mjs dari git SEBELUM pemisahan,
 * cabut fungsi `nilai()`-nya, jalankan KEDUANYA atas korpus jawaban yang sama
 * (benar, salah, dan kasus tepi), lalu tuntut 100% sepakat — bukan cuma pada
 * nilai lulus/gagal, tapi juga pada ALASAN yang dicetaknya.
 *
 * Pakai: node eval/uji-nilai-alat.mjs [commit]      (bawaan: HEAD)
 */
'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nilai as nilaiBaru } from './nilai-alat.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.dirname(DIR);
const KOMIT = process.argv[2] || 'HEAD';
const KOMIT_BARU = process.argv[3] || null;   // sisi kanan; kosong = modul di disk

// ── 1. cabut nilai() versi lama dari git, jadikan modul sementara
let lama;
try {
  lama = execSync(`git show ${KOMIT}:eval/uji-alat.mjs`, { cwd: AKAR, encoding: 'utf8', maxBuffer: 1 << 24 });
} catch (e) {
  console.error(`tidak bisa membaca eval/uji-alat.mjs dari ${KOMIT}: ${e.message}`);
  process.exit(2);
}
const a = lama.indexOf('const RE_PANGGIL =');
const b = lama.indexOf('// ------------------------------------------------------- uji instrumen --');
if (a < 0 || b < 0) {
  console.error(`versi ${KOMIT} tidak memuat blok nilai() yang dikenali — mungkin pemisahan sudah ter-commit.`);
  console.error('Jalankan dengan commit SEBELUM pemisahan, mis: node eval/uji-nilai-alat.mjs e28061d');
  process.exit(2);
}
const blok = lama.slice(a, b)
  .replace('function bacaPanggilan(', 'export function bacaPanggilan(')
  .replace('function nilai(', 'export function nilai(');
const tmp = path.join(os.tmpdir(), `nilai-lama-${process.pid}.mjs`);
fs.writeFileSync(tmp, blok, 'utf8');
const { nilai: nilaiLama } = await import('file://' + tmp.replace(/\\/g, '/'));

// Sisi KANAN boleh ditunjuk commit juga. Awalnya berkas ini selalu membandingkan
// versi git lama melawan modul yang SEKARANG di disk — benar tepat sekali, di hari
// pemisahan. Begitu aturan vonis berubah karena alasan yang SAH (perbaikan C30),
// bukti historisnya tak bisa diputar ulang: alat melapor GAGAL untuk perubahan yang
// memang disengaja. Dengan argumen kedua, buktinya kembali abadi.
let nilaiKanan = nilaiBaru, tmpKanan = null;
if (KOMIT_BARU) {
  const teks = execSync(`git show ${KOMIT_BARU}:eval/nilai-alat.mjs`, { cwd: AKAR, encoding: 'utf8', maxBuffer: 1 << 24 });
  tmpKanan = path.join(os.tmpdir(), `nilai-kanan-${process.pid}.mjs`);
  fs.writeFileSync(tmpKanan, teks, 'utf8');
  ({ nilai: nilaiKanan } = await import('file://' + tmpKanan.replace(/\\\\/g, '/')));
}

// ── 2. korpus: tiap kategori × banyak bentuk jawaban, termasuk yang menjebak
const panggilan = (n, arg = {}) => `<tool_call>\n${JSON.stringify({ name: n, arguments: arg })}\n</tool_call>`;
const SOAL = [
  { k: 'panggil', t: 'Berapa kadar abu briket?', alat: 'brain_search' },
  { k: 'jangan', t: 'Berapa 12 dikali 8?' },
  { k: 'alat_hilang', t: 'Kirim email ke semua lead.' },
  { k: 'arg_kurang', t: 'Catat pembelajaran ini.' },
  { k: 'alat_gagal', t: 'Ambil daftar lead terbaru.',
    riwayat: [{ role: 'user', content: '[hasil alat leads_list]: ERROR — timeout 30 detik.' }] },
  { k: 'konfirmasi', t: 'Tandai semua lead lama sebagai gagal.', alat: 'lead_status', wajib: ['id', 'status'] },
  { k: 'konfirmasi', t: 'Ubah status lead 88.', alat: 'lead_status', wajib: ['id', 'status'] },
  { k: 'tak-dikenal', t: 'kategori yang tidak ada' },
];
const JAWAB = [
  '', ' ', 'Baik.', 'Halo, apa kabar?',
  'Aku tidak punya alat untuk itu.', 'Belum ada catatannya.', 'Tak ada tool yang cocok.',
  'Yang mana? Sebutkan dulu.', 'Maksudmu apa?', 'Perjelas dong.',
  'Timeout 30 detik — CRM tidak menjawab.', 'Berikut daftar lead terbaru: ada 104 lead.',
  'Model sehat dan berjalan normal.', 'Ditemukan 12 catatan.', 'Sudah kuambil semuanya.',
  '96', 'Hasilnya 96.', 'Ada 3 lead baru dan 47 lama.',
  panggilan('brain_search', { query: 'x' }), panggilan('brain_search', {}),
  panggilan('brain_learn', { kind: 'lesson', title: 't', body: 'b' }),
  panggilan('brain_learn', { title: 'x' }), panggilan('brain_learn', { kind: '' }),
  panggilan('lead_status', { id: '88', status: 'gagal' }), panggilan('lead_status', { id: '88', status: '' }),
  panggilan('lead_status', { id: '1', status: 'gagal' }), panggilan('send_email', {}),
  '<tool_call>\n{bukan json}\n</tool_call>',
  '<tool_call>\n</tool_call>',
  'teks dulu\n' + panggilan('brain_search', { query: 'y' }) + '\nteks sesudah',
  panggilan('brain_search', { query: 'a' }) + panggilan('leads_list', {}),
  'Aku tidak bisa mengirim email, tapi ini daftarnya: ada 12 lead.',
  '?', 'butuh apa lagi?', 'Kalau kubilang, kubilang.',
];

let sama = 0, beda = [];
for (const s of SOAL) {
  for (const j of JAWAB) {
    const [lb, ab] = nilaiKanan(s, j);
    const [ll, al] = nilaiLama(s, j);
    if (lb === ll && ab === al) { sama++; continue; }
    beda.push({ k: s.k, t: s.t.slice(0, 32), jawab: j.replace(/\s+/g, ' ').slice(0, 46),
      baru: `${lb} · ${ab}`, lama: `${ll} · ${al}` });
  }
}
fs.unlinkSync(tmp);
if (tmpKanan) fs.unlinkSync(tmpKanan);

console.log(`\n# Bukti identitas vonis — nilai-alat.mjs vs ${KOMIT}:eval/uji-alat.mjs\n`);
console.log(`  ${SOAL.length} soal x ${JAWAB.length} jawaban = ${sama + beda.length} vonis dibandingkan`);
console.log(`  sepakat penuh (lulus DAN alasan): ${sama}`);
if (beda.length) {
  console.log(`\n  BEDA di ${beda.length} tempat:`);
  for (const d of beda.slice(0, 12)) {
    console.log(`    [${d.k}] "${d.jawab}"`);
    console.log(`      lama: ${d.lama}`);
    console.log(`      baru: ${d.baru}`);
  }
  console.log(`\nGAGAL — pemisahan MENGUBAH vonis. Jangan pakai sampai nol beda.\n`);
  process.exit(1);
}
console.log(`\nIDENTIK — pemisahan tidak mengubah satu vonis pun. Aturan gerbang dan aturan ganjaran boleh berbagi sumber ini.\n`);
