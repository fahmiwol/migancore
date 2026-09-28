#!/usr/bin/env node
/**
 * segarkan-katalog.mjs — katalog base model yang benar-benar bisa SEGAR.
 *
 * ============================== KENAPA INI ADA ==============================
 * "Harus up to date" cuma janji sampai ada perintah yang membuktikannya. Berkas
 * ini menarik metadata langsung dari API Hugging Face — lisensi, ukuran, tanggal
 * ubah terakhir, jumlah unduhan — lalu mencatat KAPAN ia ditarik.
 *
 * Setiap baris katalog membawa `ditarikPada`. Halaman yang menampilkannya wajib
 * menunjukkan umur data itu, karena katalog lisensi yang basi lebih berbahaya
 * daripada tidak ada katalog: orang mengambil keputusan hukum dari angka yang
 * sudah berubah.
 *
 * ====================== LISENSI: SATU-SATUNYA GERBANG KERAS =================
 * Model berlisensi non-komersial atau berpagar (gated) DITANDAI, tidak dibuang —
 * karena untuk riset pribadi ia sah. Tapi produk yang menawarkannya ke umum
 * wajib menyebut batasnya di tempat yang sama dengan tombol "pakai ini".
 *
 * Pakai: node segarkan-katalog.mjs            (tarik & tulis katalog-base.json)
 *        node segarkan-katalog.mjs --periksa  (hanya laporkan umur katalog)
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const KELUAR = path.join(DIR, 'katalog-base.json');
const HANYA_PERIKSA = process.argv.includes('--periksa');
const UMUR_MAKS_HARI = 30;

/**
 * Calon base model. Dipilih dengan tiga syarat, dan syaratnya ditulis supaya
 * bisa diperdebatkan:
 *   1. lisensinya memperbolehkan pemakaian komersial DAN turunan,
 *   2. ukurannya muat di GPU konsumen (<= 14B untuk 24 GB, <= 8B untuk 16 GB),
 *   3. dukungan bahasa Indonesia yang tidak sekadar tempelan.
 * Yang gagal syarat 1 tetap dimasukkan tapi DITANDAI — bukan disembunyikan.
 */
const CALON = [
  { id: 'Qwen/Qwen3-4B-Instruct-2507', peran: 'kerja harian', catatan: 'dipakai MiganCore sejak v10; muat di T4 gratis Kaggle' },
  { id: 'Qwen/Qwen3-8B', peran: 'agent berat', catatan: 'q4 ~5 GB, lebih lambat; pelengkap 4B, bukan pengganti' },
  { id: 'Qwen/Qwen3-14B', peran: 'penalaran panjang', catatan: 'butuh 24 GB untuk LoRA nyaman' },
  { id: 'Qwen/Qwen3-VL-8B-Instruct', peran: 'multimodal', catatan: 'jalur kalau kurikulum memuat modalitas gambar' },
  { id: 'meta-llama/Llama-3.1-8B-Instruct', peran: 'pembanding', catatan: 'lisensi Llama punya syarat sendiri — baca sebelum memakai komersial' },
  { id: 'mistralai/Mistral-7B-Instruct-v0.3', peran: 'pembanding', catatan: 'apache-2.0, ringan, bahasa Indonesia lebih tipis' },
  { id: 'google/gemma-3-4b-it', peran: 'pembanding kecil', catatan: 'lisensi Gemma punya syarat pemakaian' },
  { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', peran: 'guru penalaran', catatan: 'MIT — satu dari sedikit yang secara eksplisit mengizinkan distilasi' },
  { id: 'sail/Sailor2-8B-Chat', peran: 'Asia Tenggara', catatan: 'dilatih khusus bahasa Asia Tenggara termasuk Indonesia' },
];

const BEBAS = /^(apache-2\.0|mit|bsd|cc-by-4\.0|cc0-1\.0|openrail)/i;
const TERBATAS = /(nc|non-?commercial|nd|no-?deriv)/i;

function nilaiLisensi(l) {
  if (!l) return { kelas: 'tidak diketahui', boleh: null,
    catatan: 'lisensi tidak terbaca dari API — WAJIB dibuka manual sebelum dipakai' };
  if (TERBATAS.test(l)) return { kelas: 'terbatas', boleh: false,
    catatan: 'melarang pemakaian komersial atau turunan — tidak boleh untuk produk' };
  if (BEBAS.test(l)) return { kelas: 'bebas', boleh: true, catatan: 'boleh komersial dan boleh diturunkan' };
  return { kelas: 'bersyarat', boleh: null,
    catatan: 'lisensi khusus (Llama/Gemma/dsb) — punya syarat sendiri, baca teksnya sebelum memakai komersial' };
}

// ─────────────────────────────────────────────── mode periksa ──
if (HANYA_PERIKSA) {
  if (!fs.existsSync(KELUAR)) {
    console.error('katalog belum pernah ditarik. Jalankan tanpa --periksa.');
    process.exit(1);
  }
  const k = JSON.parse(fs.readFileSync(KELUAR, 'utf8'));
  const umur = (Date.now() - new Date(k.ditarikPada).getTime()) / 86400000;
  console.log('# Umur katalog base model\n');
  console.log(`  ditarik  : ${k.ditarikPada}`);
  console.log(`  umur     : ${umur.toFixed(1)} hari (batas ${UMUR_MAKS_HARI})`);
  console.log(`  model    : ${k.model.length}`);
  const vonis = umur <= UMUR_MAKS_HARI;
  console.log(`\n## VONIS: ${vonis ? 'SEGAR' : `BASI — tarik ulang sebelum dipakai memutuskan apa pun`}`);
  process.exit(vonis ? 0 : 1);
}

// ─────────────────────────────────────────────── tarik ──
console.log('# Menyegarkan katalog base model\n');
const model = [];
let gagal = 0;
for (const c of CALON) {
  process.stdout.write(`  ${c.id.padEnd(48)} … `);
  try {
    const r = await fetch(`https://huggingface.co/api/models/${c.id}`, {
      headers: { 'user-agent': 'bengkel-katalog/1.0' },
    });
    if (!r.ok) { gagal++; console.log(`HTTP ${r.status}`); continue; }
    const d = await r.json();
    const lisensi = d.cardData?.license || (d.tags || []).find((t) => t.startsWith('license:'))?.slice(8) || null;
    const nilai = nilaiLisensi(lisensi);
    model.push({
      id: c.id, peran: c.peran, catatan: c.catatan,
      lisensi: lisensi || 'tidak terbaca', ...nilai,
      berpagar: !!d.gated,
      diubahPada: d.lastModified || null,
      unduhanBulanIni: d.downloads ?? null,
      sukaan: d.likes ?? null,
      pustaka: d.library_name || null,
    });
    console.log(`${nilai.kelas}${d.gated ? ' · BERPAGAR' : ''}`);
  } catch (e) {
    gagal++;
    console.log(`gagal: ${e.message.slice(0, 40)}`);
  }
}

if (!model.length) {
  console.error('\nTAHAN — tidak satu pun model berhasil ditarik. Katalog lama TIDAK ditimpa.');
  console.error('  Katalog basi masih lebih baik daripada katalog kosong yang terlihat sah.');
  process.exit(1);
}

const katalog = {
  ditarikPada: new Date().toISOString(),
  sumber: 'huggingface.co/api/models',
  umurMaksHari: UMUR_MAKS_HARI,
  catatan: 'Lisensi berubah tanpa pengumuman. Angka di sini hanya sah pada tanggal ditarikPada; halaman yang menampilkannya WAJIB menunjukkan umurnya.',
  model: model.sort((a, b) => (b.unduhanBulanIni || 0) - (a.unduhanBulanIni || 0)),
};
fs.writeFileSync(KELUAR, JSON.stringify(katalog, null, 2), 'utf8');

console.log(`\n  ${model.length} model tertarik${gagal ? ` · ${gagal} gagal` : ''}\n`);
console.log('| model | lisensi | kelas | berpagar | unduhan |');
console.log('|---|---|---|---|---|');
for (const m of katalog.model)
  console.log(`| ${m.id.split('/')[1]} | ${m.lisensi} | ${m.kelas} | ${m.berpagar ? 'ya' : '—'} | ${(m.unduhanBulanIni || 0).toLocaleString('id-ID')} |`);

const terbatas = katalog.model.filter((m) => m.boleh === false);
const bersyarat = katalog.model.filter((m) => m.boleh === null);
console.log(`\n  bebas komersial : ${katalog.model.filter((m) => m.boleh === true).length}`);
console.log(`  bersyarat       : ${bersyarat.length}${bersyarat.length ? ` — ${bersyarat.map((m) => m.id.split('/')[1]).join(', ')}` : ''}`);
console.log(`  terbatas        : ${terbatas.length}${terbatas.length ? ` — ${terbatas.map((m) => m.id.split('/')[1]).join(', ')}` : ''}`);
console.log(`\ntertulis: ${path.basename(KELUAR)}`);
