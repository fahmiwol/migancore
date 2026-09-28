#!/usr/bin/env node
/**
 * ulang-gerbang.mjs — menjalankan gerbang BERKALI-KALI lalu memberi vonis yang
 * memperhitungkan KETIDAKPASTIAN. Menutup cacat paling berbahaya di alat ukur kami.
 *
 * ================================ MASALAHNYA ================================
 * Empat gerbang kami (alat, kias, kelemahan, halusinasi) menjalankan SATU
 * percobaan per soal. Buktinya terjadi pada kami sendiri: `migancore:0.8-8b`
 * mendapat `panggil 5/6` (LULUS) pada 20 Agu dan `4/6` (GAGAL) pada 21 Agu —
 * model sama, data sama, yang berubah hanya undian sampling.
 *
 * Riset 2026 menyebut ini persis: leaderboard sekali-jalan itu rapuh — 83% irisan
 * membalik setidaknya satu urutan dibanding mayoritas tiga-kali-jalan; DUA
 * pengulangan sudah menghapus ~83% pembalikan itu. Anjurannya: perlakukan eval
 * sebagai EKSPERIMEN, laporkan ketidakpastiannya.
 *   arXiv 2509.24086 "Do Repetitions Matter? Strengthening Reliability in LLM Evaluations"
 *   scale.com/blog/smoothing-out-llm-variance (contoh: 77% lalu 63% di hari berbeda)
 *
 * ================================ CARANYA ===================================
 * Alat ini TIDAK menyunting gerbang mana pun. Ia menjalankan gerbang apa adanya
 * N kali, membaca berkas hasil JSON yang memang sudah ditulis tiap gerbang, lalu:
 *   - menghitung berapa kali TIAP SOAL lulus (bukan cuma total),
 *   - menghitung selang kepercayaan Wilson 95% untuk proporsi lulus,
 *   - memberi vonis TIGA arah:
 *       LULUS       bila batas BAWAH selang masih ≥ ambang,
 *       GAGAL       bila batas ATAS selang masih < ambang,
 *       TIDAK PASTI bila selang melintasi ambang → jangan diklaim menang/kalah.
 *
 * Vonis "TIDAK PASTI" itu bukan kelemahan alat — itu kejujuran. Mengaku belum
 * tahu lebih berguna daripada menyodorkan LULUS yang lahir dari lemparan koin.
 *
 * Pakai: node ulang-gerbang.mjs <berkas-uji.mjs> <model> [n=5] [ambang=0.8]
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { wilson, vonisAmbang } from './statistik.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BERKAS = process.argv[2];
const MODEL = process.argv[3];
const N = Number(process.argv[4]) || 5;
const AMBANG = Number(process.argv[5]) || 0.8;
if (!BERKAS || !MODEL) {
  console.error('pakai: node ulang-gerbang.mjs <berkas-uji.mjs> <model> [n=5] [ambang=0.8]');
  process.exit(2);
}

// selang Wilson & vonis tiga-arah kini dari statistik.mjs (satu sumber)

const namaModel = MODEL.replace(/[:/]/g, '_');
// tiap gerbang menulis berkas hasilnya sendiri — kita baca itu, tidak mengurai teks
const KANDIDAT_HASIL = [
  `hasil-${path.basename(BERKAS, '.mjs')}-${namaModel}.json`,
  `hasil-${path.basename(BERKAS, '.mjs').replace('uji-', 'uji-')}-${namaModel}.json`,
];

function bacaHasil() {
  for (const nama of KANDIDAT_HASIL) {
    const p = path.join(DIR, nama);
    if (fs.existsSync(p)) {
      try { return { data: JSON.parse(fs.readFileSync(p, 'utf8')), berkas: nama }; } catch { /* rusak */ }
    }
  }
  return null;
}

// samakan bentuk hasil dari berbagai gerbang menjadi daftar {kunci, lulus, kategori}
function ratakan(d) {
  if (!d) return [];
  const arr = d.hasil || d.rinci || [];
  // Gerbang bervonis TIGA arah (mis. uji-kias) memakai `null` untuk "tidak bisa
  // dinilai". `!!null` = false akan menghitungnya sebagai GAGAL — itu persis
  // kebohongan yang vonis tiga arah dibuat untuk mencegah. Butir null dibuang
  // dari penyebut, dan jumlahnya dilaporkan terpisah.
  return arr
    .map((x, i) => ({
      kunci: x.kode || x.t || x.tanya || x.soal || `soal-${i}`,
      kategori: x.mode || x.kategori || x.k || 'umum',
      nilai: x.lulus ?? x.ok,
    }))
    .filter((x) => x.nilai !== null && x.nilai !== undefined)
    .map((x) => ({ kunci: x.kunci, kategori: x.kategori, lulus: !!x.nilai }));
}

console.log(`# Ulang gerbang — ${path.basename(BERKAS)} pada ${MODEL}`);
console.log(`  ${N} putaran · ambang ${(AMBANG * 100).toFixed(0)}% · selang Wilson 95%\n`);

const tally = new Map();      // kunci -> {lulus, total, kategori}
let gagalJalan = 0;
for (let i = 1; i <= N; i++) {
  process.stdout.write(`  putaran ${i}/${N} … `);
  try {
    execFileSync('node', [path.join(DIR, BERKAS), MODEL], { encoding: 'utf8', timeout: 45 * 60 * 1000, stdio: 'pipe' });
  } catch { /* keluar kode 1 itu wajar bila gerbang gagal — hasilnya tetap ditulis */ }
  const h = bacaHasil();
  const baris = ratakan(h?.data);
  if (!baris.length) { gagalJalan++; console.log('hasil tidak terbaca'); continue; }
  for (const b of baris) {
    const t = tally.get(b.kunci) || { lulus: 0, total: 0, kategori: b.kategori };
    t.lulus += b.lulus ? 1 : 0;
    t.total += 1;
    tally.set(b.kunci, t);
  }
  console.log(`${baris.filter((b) => b.lulus).length}/${baris.length}`);
}

if (!tally.size) { console.error('\nTidak ada hasil yang bisa dibaca — periksa nama berkas hasil gerbang.'); process.exit(2); }

// ── agregasi ──
const perKategori = new Map();
let totalLulus = 0, totalCoba = 0;
const goyah = [];                       // soal yang hasilnya berubah-ubah
for (const [kunci, t] of tally) {
  totalLulus += t.lulus; totalCoba += t.total;
  const k = perKategori.get(t.kategori) || { lulus: 0, total: 0 };
  k.lulus += t.lulus; k.total += t.total;
  perKategori.set(t.kategori, k);
  if (t.lulus > 0 && t.lulus < t.total) goyah.push({ kunci, ...t });
}

const vonis = (k, n) => vonisAmbang(k, n, AMBANG);

const L = [];
L.push(`# Ulang gerbang — ${path.basename(BERKAS)} · ${MODEL}`);
L.push('');
L.push(`${N} putaran · ambang ${(AMBANG * 100).toFixed(0)}% · selang kepercayaan Wilson 95%`);
L.push('');
L.push('| Kategori | Lulus/Coba | Proporsi | Selang 95% | Vonis |');
L.push('|---|---|---|---|---|');
for (const [kat, k] of perKategori) {
  const r = vonis(k.lulus, k.total);
  L.push(`| ${kat} | ${k.lulus}/${k.total} | ${(k.lulus / k.total * 100).toFixed(0)}% | ${(r.lo * 100).toFixed(0)}–${(r.hi * 100).toFixed(0)}% | ${r.v} |`);
}
const r = vonis(totalLulus, totalCoba);
L.push('');
L.push(`**KESELURUHAN: ${totalLulus}/${totalCoba} = ${(totalLulus / totalCoba * 100).toFixed(0)}% · selang ${(r.lo * 100).toFixed(0)}–${(r.hi * 100).toFixed(0)}% · ${r.v}**`);
L.push('');
if (goyah.length) {
  L.push(`## Soal GOYAH — hasilnya berubah antar putaran (${goyah.length})`);
  L.push('');
  L.push('Soal-soal inilah yang membuat vonis sekali-jalan tidak bisa dipercaya.');
  L.push('');
  for (const g of goyah.slice(0, 12)) L.push(`- \`${String(g.kunci).slice(0, 70)}\` — lulus ${g.lulus}/${g.total} (${g.kategori})`);
  L.push('');
} else {
  L.push('_Tidak ada soal yang goyah: semua konsisten di seluruh putaran._');
  L.push('');
}
if (gagalJalan) L.push(`⚠ ${gagalJalan} putaran tidak menghasilkan berkas hasil yang terbaca.`);

const teks = L.join('\n') + '\n';
// SUFIKS memisahkan berkas hasil antar-LENGAN percobaan. Tanpa ini, lengan
// kedua menimpa lengan pertama dan perbandingannya jadi mustahil — kegagalan
// yang tidak akan menimbulkan pesan galat apa pun, cuma angka yang salah.
const SUFIKS = process.env.SUFIKS ? `-${process.env.SUFIKS}` : '';
const namaKeluar = `ULANG-${path.basename(BERKAS, '.mjs')}-${namaModel}${SUFIKS}`;
fs.writeFileSync(path.join(DIR, `${namaKeluar}.md`), teks, 'utf8');
fs.writeFileSync(path.join(DIR, `${namaKeluar}.json`), JSON.stringify({
  berkas: BERKAS, model: MODEL, putaran: N, ambang: AMBANG,
  // Provenans percobaan: kalimat tambahan yang dipakai ikut tercatat, supaya
  // siapa pun bisa mengulang lengan ini huruf per huruf.
  sufiks: process.env.SUFIKS || '', sistemTambahan: process.env.SISTEM_TAMBAHAN || '',
  keseluruhan: { lulus: totalLulus, coba: totalCoba, lo: r.lo, hi: r.hi, vonis: r.v },
  perKategori: [...perKategori].map(([k, v]) => ({ kategori: k, ...v, ...vonis(v.lulus, v.total) })),
  goyah,
}, null, 2), 'utf8');
console.log('\n' + teks);
console.log(`tertulis: ${namaKeluar}.md + .json`);
