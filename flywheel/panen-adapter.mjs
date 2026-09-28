#!/usr/bin/env node
/**
 * panen-adapter.mjs — membaca SETIAP adapter yang pernah kami latih, beserta
 * ringkasan latihannya, dan menandai mana yang HASILNYA BELUM PERNAH DIPANEN.
 *
 * ============================== KENAPA INI ADA ==============================
 * 10 Sep, Fahmi (disarikan): cari di laptop, mesin ukur, server, atau git — dan catat serta
 * dokumentasikan semuanya — sesudah saya menulis bahwa cabang
 * latihan alat "hilang".
 *
 * Ia benar dan saya salah. Pencarian menemukan **29 adapter** masih utuh di
 * laptop, termasuk **enam run MO-GRPO** yang tiap satunya membawa
 * `ringkasan-grpo.json` di dalam tarball-nya — berisi diagnostik yang belum
 * pernah dibaca siapa pun.
 *
 * Yang paling mahal dari sebuah eksperimen adalah MENJALANKANNYA. Kalau
 * ringkasannya tidak pernah dibuka, ongkos itu terbuang untuk kedua kalinya.
 * Berkas ini membuat "terkubur di dalam tarball" tidak bisa terjadi lagi.
 *
 * ===================== DIAGNOSTIK YANG PALING MENENTUKAN =====================
 * `ragamPerObjektif` — berapa banyak KELOMPOK rollout yang ganjarannya
 * bervariasi. Di GRPO, gradien lahir dari variasi DALAM kelompok: ganjaran
 * seragam → keuntungan nol → **objektif itu tidak mengajarkan apa pun**.
 *
 * Objektif dengan ragam 0 % bukan objektif; ia beban mati yang tetap dibayar
 * komputasinya. Alat ini menghitungnya, supaya rancangan MO-GRPO berikutnya
 * berdiri di atas angka, bukan niat.
 *
 * Pakai:
 *   node flywheel/panen-adapter.mjs           (inventaris + diagnostik)
 *   node flywheel/panen-adapter.mjs --grpo    (hanya run GRPO, rinci)
 *   node flywheel/panen-adapter.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', A = '\x1b[2m', B = '\x1b[1m', R = '\x1b[0m';

/** Objektif dengan ragam di bawah ini tidak memberi sinyal gradien yang berarti. */
export const AMBANG_RAGAM_MATI = 5; // persen kelompok yang bervariasi

/**
 * Sebuah objektif MO-GRPO "hidup" kalau ganjarannya bervariasi di dalam kelompok.
 * Ini bukan heuristik: GRPO menormalkan ganjaran per kelompok, jadi ragam nol
 * menghasilkan keuntungan nol untuk SETIAP anggota kelompok itu.
 */
export function objektifHidup(ragam, ambang = AMBANG_RAGAM_MATI) {
  if (!ragam) return { hidup: [], mati: [], takTerbaca: true };
  const hidup = [], mati = [];
  for (const [nama, v] of Object.entries(ragam)) {
    const p = typeof v === 'number' ? v : v?.persen;
    if (p == null) continue;
    (p >= ambang ? hidup : mati).push({ nama, persen: p });
  }
  return { hidup: hidup.sort((a, b) => b.persen - a.persen), mati, takTerbaca: false };
}

/**
 * Bendera tambahan untuk `tar` yang SEBENARNYA terpanggil di PATH ini.
 *
 * 16 Sep: penjaga ini lulus 11/11 dari Git Bash (GNU tar 1.35) dan gagal 2 dari
 * PowerShell (C:\Windows\system32\tar.exe = bsdtar 3.8.8), pada repo yang sama
 * persis. bsdtar tidak mengenal `--force-local` dan menolak seluruh perintah, lalu
 * `catch` di bawah menelannya jadi "tidak ada adapter". Vonis penjaga bergantung
 * pada shell yang menjalankannya — alat ukur yang mengukur jalurnya, bukan repo.
 */
let _benderaTar;
export function benderaTar(versi) {
  if (versi === undefined) {
    if (_benderaTar) return _benderaTar;
    try { versi = execFileSync('tar', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { versi = ''; }
    return (_benderaTar = benderaTar(versi));
  }
  // `--force-local` WAJIB untuk GNU tar di Windows: ia membaca `C:\...` sebagai
  // spesifikasi host jarak jauh (`host:path`) dan mencoba menghubungi mesin
  // bernama "C" — "Cannot connect to C: resolve failed" terbaca seperti masalah
  // jaringan. bsdtar membaca path Windows apa adanya dan tidak butuh (dan tidak
  // menerima) bendera itu.
  return /GNU tar/i.test(versi) ? ['--force-local'] : [];
}

/**
 * Cari nama anggota arsip dari keluaran `tar -t`.
 *
 * 16 Sep, cacat KEDUA di balik catch yang sama: bsdtar Windows menulis daftar
 * berakhiran CRLF. Dipecah dengan '\n', tiap nama membawa '\r' di ujungnya, jadi
 * `endsWith('adapter_config.json')` SELALU salah — 29 adapter terbaca nol. Cacat
 * ini tersembunyi selama `--force-local` masih membuat bsdtar menolak perintahnya:
 * memperbaiki yang pertama baru membuka yang kedua.
 */
export function namaDalamDaftar(keluaran, akhiran) {
  return String(keluaran).split(/\r?\n/).filter(Boolean).find((x) => x.endsWith(akhiran));
}

/** Baca berkas JSON di dalam tarball tanpa mengekstraknya ke disk. */
export function bacaDalamTar(tgz, akhiran) {
  // Bendera EKSPLISIT berdash, bukan bentuk lama `tzf`: bentuk lama wajib jadi
  // argumen PERTAMA, jadi ia bertabrakan dengan `--force-local`.
  const tarik = (args) => execFileSync('tar', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const lokal = benderaTar();
  try {
    const nama = namaDalamDaftar(tarik(['-t', '-z', ...lokal, '-f', tgz]), akhiran);
    if (!nama) return null;
    return JSON.parse(tarik(['-x', '-z', ...lokal, '-O', '-f', tgz, nama]));
  } catch { return null; }
}

/** Semua adapter di `models/`, tarball maupun folder safetensors. */
export function kumpulkanAdapter(akar = AKAR) {
  const keluar = [];
  const jelajah = (dir) => {
    let isi = [];
    try { isi = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of isi) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (fs.existsSync(path.join(p, 'adapter_config.json'))) {
          let cfg = null; try { cfg = JSON.parse(fs.readFileSync(path.join(p, 'adapter_config.json'), 'utf8')); } catch { /* rusak */ }
          keluar.push({ jalur: path.relative(akar, p), bentuk: 'folder', base: cfg?.base_model_name_or_path ?? '?', r: cfg?.r ?? null, ringkasan: null });
        }
        jelajah(p);
      } else if (e.name.endsWith('.tgz')) {
        const cfg = bacaDalamTar(p, 'adapter_config.json');
        if (!cfg) continue;
        keluar.push({
          jalur: path.relative(akar, p), bentuk: 'tgz',
          base: cfg.base_model_name_or_path ?? '?', r: cfg.r ?? null,
          ringkasan: bacaDalamTar(p, 'ringkasan-grpo.json'),
        });
      }
    }
  };
  jelajah(path.join(akar, 'models'));
  return keluar.sort((a, b) => a.jalur.localeCompare(b.jalur));
}

/** Adakah model Ollama / berkas hasil yang jejaknya menunjuk adapter ini? */
export function sudahDipanen(a, dirEval = path.join(AKAR, 'eval')) {
  const petunjuk = path.basename(a.jalur).replace(/\.tgz$/, '').replace(/^lora-/, '');
  let berkas = [];
  try { berkas = fs.readdirSync(dirEval).filter((f) => f.startsWith('hasil-jujur2-') && f.endsWith('.json')); } catch { return false; }
  return berkas.some((f) => f.toLowerCase().includes(petunjuk.toLowerCase()));
}

// ─────────────────────────────────────────────────────────────────── uji ──
function uji() {
  let ok = 0, bad = 0;
  const cek = (n, c) => { if (c) ok++; else { bad++; console.log(`  ${M}GAGAL${R} ${n}`); } };

  // Bentuk NYATA dari ringkasan-grpo.json (dibaca dari lora-gaya-rlvr1.tgz, 10 Sep).
  const ragam = {
    perilaku: { grupBeragam: 0, grupTotal: 720, persen: 0.0 },
    format: { grupBeragam: 0, grupTotal: 720, persen: 0.0 },
    jujur: { grupBeragam: 342, grupTotal: 720, persen: 47.5 },
    isi: { grupBeragam: 0, grupTotal: 720, persen: 0.0 },
  };
  const o = objektifHidup(ragam);
  cek('objektif hidup = yang ragamnya di atas ambang', o.hidup.length === 1 && o.hidup[0].nama === 'jujur');
  cek('tiga objektif ditandai MATI', o.mati.length === 3);
  cek('ragam 0 % = mati, bukan "kecil"', o.mati.every((x) => x.persen === 0));
  cek('urut menurun', objektifHidup({ a: { persen: 10 }, b: { persen: 50 } }).hidup[0].nama === 'b');
  cek('menerima angka telanjang juga', objektifHidup({ a: 50 }).hidup.length === 1);
  cek('ragam tidak ada -> ditandai takTerbaca', objektifHidup(null).takTerbaca === true);
  // Ambang harus MENGGIGIT tepat: 5 % hidup, 4,9 % mati.
  cek('tepat di ambang = hidup', objektifHidup({ a: { persen: 5 } }).hidup.length === 1);
  // 16 Sep: vonis penjaga ini dulu bergantung pada shell (GNU tar vs bsdtar).
  cek('GNU tar mendapat --force-local', benderaTar('tar (GNU tar) 1.35').includes('--force-local'));
  cek('bsdtar TIDAK mendapat --force-local (ia menolak seluruh perintah)', benderaTar('bsdtar 3.8.8 - libarchive 3.8.8').length === 0);
  cek('daftar tar ber-CRLF (bsdtar) tetap terbaca', namaDalamDaftar('lora/\r\nlora/adapter_config.json\r\n', 'adapter_config.json') === 'lora/adapter_config.json');
  cek('daftar tar ber-LF (GNU tar) tetap terbaca', namaDalamDaftar('lora/\nlora/adapter_config.json\n', 'adapter_config.json') === 'lora/adapter_config.json');
  cek('sedikit di bawah ambang = mati', objektifHidup({ a: { persen: 4.9 } }).mati.length === 1);

  const semua = kumpulkanAdapter();
  cek('menemukan adapter di repo nyata', semua.length >= 20);
  cek('membaca base dari dalam tarball', semua.some((x) => /Qwen3-4B/.test(x.base)));
  cek('membaca ringkasan GRPO dari dalam tarball', semua.some((x) => x.ringkasan?.tahap === 'MO-GRPO'));

  console.log(bad === 0 ? `${H}${ok} lulus${R}` : `${M}${bad} gagal${R}, ${ok} lulus`);
  return bad === 0 ? 0 : 1;
}

// ────────────────────────────────────────────────────────────────── main ──
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  if (process.argv.includes('--uji')) process.exit(uji());
  const hanyaGrpo = process.argv.includes('--grpo');

  const semua = kumpulkanAdapter();
  const grpo = semua.filter((a) => a.ringkasan?.tahap);
  console.log(`\n${B}# Panen adapter — ${semua.length} adapter masih ADA di laptop${R}`);
  console.log(`${A}  Yang paling mahal dari sebuah eksperimen adalah menjalankannya.`);
  console.log(`  Kalau ringkasannya tidak pernah dibuka, ongkos itu terbuang dua kali.${R}\n`);

  if (!hanyaGrpo) {
    const perBase = new Map();
    for (const a of semua) {
      const b = String(a.base).split('/').pop();
      perBase.set(b, (perBase.get(b) || 0) + 1);
    }
    console.log(`  ${'base'.padEnd(30)}jumlah`);
    for (const [b, n] of [...perBase].sort((x, y) => y[1] - x[1])) console.log(`  ${b.padEnd(30)}${String(n).padStart(6)}`);
    console.log('');
  }

  console.log(`${B}## ${grpo.length} run MO-GRPO — diagnostik yang belum pernah dibaca${R}\n`);
  for (const a of grpo) {
    const r = a.ringkasan;
    const o = objektifHidup(r.ragamPerObjektif);
    const panen = sudahDipanen(a);
    console.log(`  ${B}${a.jalur}${R}`);
    console.log(`    ${A}${r.cluster} · ${r.baris} baris · ${r.langkah ?? '?'} langkah · ${r.nRollout ?? '?'} rollout · probe=${r.probe}${R}`);
    if (o.takTerbaca) {
      console.log(`    ${A}(ringkasan tanpa ragamPerObjektif)${R}`);
    } else {
      const hidup = o.hidup.map((x) => `${H}${x.nama} ${x.persen}%${R}`).join(' · ') || `${M}TIDAK ADA${R}`;
      const mati = o.mati.map((x) => `${x.nama} ${x.persen}%`).join(' · ');
      console.log(`    objektif HIDUP : ${hidup}`);
      if (mati) console.log(`    objektif MATI  : ${A}${mati}${R}  ${M}← nol sinyal gradien, tetap dibayar komputasinya${R}`);
    }
    if (r.ganjaranMentahRata) {
      const g = Object.entries(r.ganjaranMentahRata).map(([k, v]) => `${k} ${Number(v).toFixed(2)}`).join(' · ');
      console.log(`    ${A}ganjaran rata  : ${g}${R}`);
    }
    console.log(`    ${panen ? H + 'sudah ada berkas hasilnya' : M + 'BELUM PERNAH DIUKUR' + R}`);
    console.log('');
  }

  const belum = grpo.filter((a) => !sudahDipanen(a));
  if (belum.length) {
    console.log(`${K}## ${belum.length} run terlatih yang hasilnya BELUM DIPANEN${R}`);
    console.log(`${A}  Latihannya sudah dibayar. Yang kurang cuma konversi LoRA -> GGUF lalu`);
    console.log(`  Modelfile ber-ADAPTER — jalur yang SUDAH pernah dipakai proyek ini`);
    console.log(`  (models/Modelfile.v12-adapter). Nol GPU.${R}\n`);
    for (const a of belum) console.log(`  - ${a.jalur}`);
    console.log('');
  }
}
