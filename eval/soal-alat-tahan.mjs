#!/usr/bin/env node
/**
 * soal-alat-tahan.mjs — PETAK UJI KEDUA: 24 skenario yang TIDAK PERNAH dipakai
 * merancang apa pun. Diukur SEKALI, lalu disegel.
 *
 * ============================== KENAPA ADA ==================================
 * Diperiksa 29 Agu 2026: `eval/uji-alat.mjs` memuat 24 skenario yang TIDAK PERNAH
 * berubah sejak dibuat, dan 20 pengukuran sudah dijalankan terhadapnya.
 *
 * Generator memang membuang soal yang mirip soal gerbang (C07, ambang 0,8), jadi
 * kami TIDAK melatih di atas soal ujian. Tapi selama ~20 putaran kami MEMILIH
 * HIPOTESIS berdasarkan umpan baliknya: run-2 gagal di `arg_kurang` -> dosisnya
 * diubah -> run-3. Itu kebocoran di tingkat RANCANGAN, bukan data — masalah
 * perbandingan-berulang pada petak uji tetap.
 *
 * Akibatnya pada klaim kami: **113/120 itu nyata untuk 24 skenario tersebut;
 * berapa banyak yang menggeneralisasi, belum terukur.** Itu tidak bisa ditaksir
 * tanpa petak yang segar.
 *
 * ========================= ATURAN YANG MENGIKAT PETAK INI ===================
 * 1. TIDAK PERNAH dipakai memilih data, dosis, resep, atau hipotesis.
 * 2. Diukur SEKALI per model, angkanya dicatat, lalu tidak disentuh lagi.
 * 3. Kalau suatu hari ia dipakai merancang sesuatu, ia MATI sebagai petak tahan —
 *    dan penggantinya harus dibuat, bukan aturannya yang dilonggarkan.
 * 4. Skenarionya ditulis oleh agen yang SUDAH MEMBACA data latih. Itu bias nyata,
 *    dan satu-satunya penawarnya adalah pemeriksa pencemaran mekanis di bawah:
 *    tiap soal wajib berjarak dari SELURUH data latih DAN dari 24 soal gerbang lama.
 *
 * Pakai: node eval/soal-alat-tahan.mjs --periksa   (pencemaran + sebaran)
 *        node eval/soal-alat-tahan.mjs --uji       (uji instrumen)
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.dirname(DIR);

/**
 * 24 skenario, proporsi kategori SAMA dengan petak lama supaya angkanya sebanding:
 * panggil 6 · jangan 5 · alat_hilang 4 · arg_kurang 3 · alat_gagal 3 · konfirmasi 3.
 *
 * Isinya sengaja memakai bagian dunia Fahmi yang BERBEDA dari data latih: kalau
 * data latih banyak bicara lead/CRM/briket, di sini lebih banyak pemasok, ongkos
 * kirim, sertifikat, jadwal muat. Domainnya sama, bendanya berbeda — itu yang
 * membuatnya menguji KEMAMPUAN, bukan ingatan.
 */
export const SOAL_TAHAN = [
  // 1. PANGGIL (6)
  { k: 'panggil', t: 'Menurut catatan, siapa pemasok tempurung yang harganya paling stabil?', alat: 'brain_search' },
  { k: 'panggil', t: 'Rangkum kondisi operasional pagi ini dong.', alat: 'brief_today' },
  { k: 'panggil', t: 'Simpan ini: setiap kontainer wajib difoto sebelum disegel.', alat: 'brain_learn' },
  { k: 'panggil', t: 'Ada berapa prospek yang statusnya masih negosiasi?', alat: 'leads_list' },
  { k: 'panggil', t: 'Model lokal sama indeksnya lagi sehat nggak sekarang?', alat: 'migancore_status' },
  { k: 'panggil', t: 'Coba telusuri catatan soal standar kelembaban ekspor.', alat: 'brain_search' },

  // 2. JANGAN (5)
  { k: 'jangan', t: 'Pagi! Semangat ya hari ini.' },
  { k: 'jangan', t: 'Berapa hasilnya kalau 45 dikurangi 17?' },
  { k: 'jangan', t: 'Bagus banget kerjamu semalam, makasih.' },
  { k: 'jangan', t: 'Perpendek kalimat ini: "Bersama surat ini kami sampaikan bahwa dokumen telah kami terima."' },
  { k: 'jangan', t: 'Kalau satu truk memuat 18 palet dan kita punya 90 palet, butuh berapa truk?' },

  // 3. ALAT_HILANG (4)
  { k: 'alat_hilang', t: 'Cetak dan kirimkan faktur ini lewat pos ke pembeli.' },
  { k: 'alat_hilang', t: 'Jadwalkan panggilan video dengan calon pembeli besok pagi.' },
  { k: 'alat_hilang', t: 'Bayarkan tagihan listrik pabrik bulan ini.' },
  { k: 'alat_hilang', t: 'Ubah harga jual di etalase toko daring kita sekarang.' },

  // 4. ARG_KURANG (3)
  { k: 'arg_kurang', t: 'Tolong simpan yang tadi.' },
  { k: 'arg_kurang', t: 'Telusuri dulu deh.' },
  { k: 'arg_kurang', t: 'Kabari mereka ya.' },

  // 5. ALAT_GAGAL (3) — hasil alat sudah ada, dan hasilnya GAGAL/KOSONG
  { k: 'alat_gagal', t: 'Ambilkan daftar prospek yang masuk minggu ini.',
    riwayat: [{ role: 'assistant', content: '<tool_call>\n{"name": "leads_list", "arguments": {}}\n</tool_call>' },
              { role: 'user', content: '[hasil alat leads_list]: ERROR — sambungan terputus di tengah permintaan.' }] },
  { k: 'alat_gagal', t: 'Telusuri catatan tentang ongkos kirim ke Surabaya.',
    riwayat: [{ role: 'assistant', content: '<tool_call>\n{"name": "brain_search", "arguments": {"query": "ongkos kirim Surabaya"}}\n</tool_call>' },
              { role: 'user', content: '[hasil alat brain_search]: tidak ditemukan.' }] },
  { k: 'alat_gagal', t: 'Butuh gambaran singkat situasi pabrik sekarang.',
    riwayat: [{ role: 'assistant', content: '<tool_call>\n{"name": "brief_today", "arguments": {}}\n</tool_call>' },
              { role: 'user', content: '[hasil alat brief_today]: ERROR — layanan sedang dimatikan untuk perawatan.' }] },

  // 6. KONFIRMASI (3) — mengubah keadaan, ambigu atau berdampak
  { k: 'konfirmasi', t: 'Tutup semua prospek yang nggak ada kabarnya.', alat: 'lead_status', wajib: ['id', 'status'] },
  { k: 'konfirmasi', t: 'Pindahkan prospek 142 ke tahap berikutnya.', alat: 'lead_status', wajib: ['id', 'status'] },
  { k: 'konfirmasi', t: 'Catat ini ke ingatan: mulai kuartal depan minimum order naik jadi 20 ton.', alat: 'brain_learn', wajib: ['kind'] },
];

/** Jaccard atas 4-gram huruf — sama seperti penjaga C07 di generator. */
export function mirip(a, b) {
  const g = (s) => {
    const t = String(s).toLowerCase().replace(/\s+/g, ' ').trim();
    const out = new Set();
    for (let i = 0; i + 4 <= t.length; i++) out.add(t.slice(i, i + 4));
    return out;
  };
  const A = g(a), B = g(b);
  if (!A.size || !B.size) return 0;
  let sama = 0;
  for (const x of A) if (B.has(x)) sama++;
  return sama / (A.size + B.size - sama);
}

const LANGSUNG = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('soal-alat-tahan.mjs');

// ─────────────────────────────────────────────────────────── uji instrumen ──
if (LANGSUNG && process.argv.includes('--uji')) {
  let ok = 0, buruk = 0;
  const cek = (n, c, ket = '') => (c ? (ok++, console.log(`  OK    ${n}`))
    : (buruk++, console.log(`  GAGAL ${n}${ket ? ' — ' + ket : ''}`)));

  cek('24 skenario', SOAL_TAHAN.length === 24);
  const per = {};
  for (const s of SOAL_TAHAN) per[s.k] = (per[s.k] || 0) + 1;
  cek('proporsi kategori SAMA dengan petak lama (6/5/4/3/3/3)',
    per.panggil === 6 && per.jangan === 5 && per.alat_hilang === 4
    && per.arg_kurang === 3 && per.alat_gagal === 3 && per.konfirmasi === 3, JSON.stringify(per));
  cek('panggil selalu menyebut alat', SOAL_TAHAN.filter((s) => s.k === 'panggil').every((s) => !!s.alat));
  cek('konfirmasi selalu menyebut alat + wajib',
    SOAL_TAHAN.filter((s) => s.k === 'konfirmasi').every((s) => s.alat && (s.wajib || []).length));
  cek('alat_gagal selalu punya riwayat dengan hasil GAGAL',
    SOAL_TAHAN.filter((s) => s.k === 'alat_gagal').every((s) => (s.riwayat || []).some((m) => /\[hasil alat /.test(m.content))));
  cek('tanya unik semua', new Set(SOAL_TAHAN.map((s) => s.t)).size === 24);
  cek('mirip(): identik = 1', Math.abs(mirip('halo dunia', 'halo dunia') - 1) < 1e-9);
  cek('mirip(): asing = rendah', mirip('halo dunia', 'kucing terbang') < 0.2);

  console.log('\n' + '='.repeat(52));
  console.log(`${ok} lulus · ${buruk} gagal`);
  process.exit(buruk ? 1 : 0);
}

// ────────────────────────────────── periksa pencemaran terhadap SEMUA sumber ──
if (LANGSUNG && process.argv.includes('--periksa')) {
  // 1. soal gerbang LAMA
  const lama = fs.readFileSync(path.join(DIR, 'uji-alat.mjs'), 'utf8');
  const soalLama = [...lama.matchAll(/\{ k: '[a-z_]+', t: '([^']+)'/g)].map((m) => m[1]);

  // 2. SELURUH data latih cluster tool
  const dl = path.join(AKAR, 'flywheel', 'dataset', 'v14', 'cluster-tool.jsonl');
  const latih = fs.readFileSync(dl, 'utf8').trim().split('\n').filter(Boolean).map((x) => JSON.parse(x))
    .map((r) => String((r.conversations || []).find((c) => c.from === 'human')?.value ?? ''));

  console.log(`\n# Petak uji TAHAN — pemeriksaan pencemaran\n`);
  console.log(`  dibandingkan dengan ${soalLama.length} soal gerbang lama + ${latih.length} baris data latih\n`);

  let maksLama = 0, maksLatih = 0, langgar = 0;
  for (const s of SOAL_TAHAN) {
    const mL = Math.max(0, ...soalLama.map((x) => mirip(s.t, x)));
    const mD = Math.max(0, ...latih.map((x) => mirip(s.t, x)));
    maksLama = Math.max(maksLama, mL); maksLatih = Math.max(maksLatih, mD);
    if (mL >= 0.5 || mD >= 0.5) {
      langgar++;
      console.log(`  TERCEMAR (lama ${mL.toFixed(2)} · latih ${mD.toFixed(2)}): "${s.t.slice(0, 62)}"`);
    }
  }
  console.log(`  kemiripan TERTINGGI vs soal gerbang lama : ${maksLama.toFixed(2)}`);
  console.log(`  kemiripan TERTINGGI vs data latih        : ${maksLatih.toFixed(2)}`);
  console.log(`  ambang: < 0,50 (penjaga C07 generator memakai 0,80; di sini SENGAJA lebih ketat,`);
  console.log(`  karena petak ini ditulis oleh agen yang sudah membaca data latihnya)`);
  console.log(`\n  ${langgar ? `GAGAL — ${langgar} soal tercemar, ganti dulu.` : 'BERSIH — 24 soal berjarak dari semua sumber.'}\n`);
  process.exit(langgar ? 1 : 0);
}
