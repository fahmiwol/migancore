#!/usr/bin/env node
/**
 * jaga-modul.mjs — menangkap penyakit C27: berkas yang MENGEKSPOR sekaligus
 * menjalankan CLI-nya sendiri saat diimpor.
 *
 * ============================== KENAPA ADA ==================================
 * Malam 28 Agu 2026 penyakit ini kambuh TIGA KALI berturut-turut, dan tiap kali
 * gejalanya MENIPU:
 *
 *   node flywheel/kolam-grpo.mjs --uji   ->  mencetak "33/33 lulus"
 *
 * Tiga puluh tiga itu milik ganjaran.mjs, yang diimpor kolam-grpo lalu menjalankan
 * blok --uji-nya sendiri dan process.exit(0). Uji kolam-grpo TIDAK PERNAH JALAN,
 * dan layarnya bilang LULUS. Itu kelas kegagalan terburuk: bukan yang berteriak
 * salah, tapi yang diam-diam menjawab pertanyaan yang berbeda.
 *
 * Akibat keduanya sama merusaknya: karena berkas semacam itu tidak bisa diimpor
 * dengan aman, siapa pun yang membutuhkan fungsinya akan MENYALIN — dan salinan
 * menyimpang diam-diam (hukum C24).
 *
 * ATURAN YANG DIJAGA: berkas .mjs yang punya `export` DAN membaca process.argv di
 * tingkat atas WAJIB memeriksa `process.argv[1]` lebih dulu — yaitu memastikan
 * dirinya yang dijalankan langsung, bukan sekadar diimpor.
 *
 * Aturannya sengaja sesempit itu supaya nyaris tak pernah salah tuduh. Penjaga
 * yang berisik akan dimatikan orang, dan penjaga yang dimatikan tidak menjaga apa pun.
 *
 * ============================ KENAPA RATCHET ================================
 * Pindaian pertama menemukan 8 pelanggar yang sudah ada SEBELUM penjaga ini lahir.
 * Menggagalkan `migan periksa` karena mereka akan memblokir latihan demi kerapian —
 * dan tak satu pun dari delapan itu sedang diimpor, jadi tidak ada bug hidup.
 * Membedah delapan instrumen sekaligus jam 4 pagi justru risiko yang lebih besar.
 *
 * Jadi: utang lama DIBEKUKAN bernama & bertanggal, pelanggar BARU ditolak. Utang
 * boleh ada; yang tidak boleh adalah utang yang tumbuh tanpa terlihat. Dan kalau
 * satu utang sudah dilunasi, penjaga ini MEMINTA namanya dihapus dari daftar —
 * supaya daftar utangnya sendiri tidak ikut membusuk.
 *
 * Pakai: node eval/jaga-modul.mjs           (0 = tak ada pelanggar baru)
 *        node eval/jaga-modul.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.dirname(DIR);
// 7 Sep: `majelis` dan `mcp` ditambahkan. Keduanya berisi modul yang diimpor
// modul lain, dan keduanya luput dari pemindai ini sejak berkas ini lahir —
// pemindai yang tidak melihat sebuah folder tidak pernah mengeluh tentangnya (C52).
const LIHAT = ['eval', 'flywheel', 'sistem', 'majelis', 'mcp'];

/** Utang yang dibekukan pada pindaian pertama, 28 Agu 2026. Susutkan, jangan tambah. */
export const UTANG_28AGU = new Set([
  'eval/banding-berpasangan.mjs',
  'eval/periksa-prompt-paritas.mjs',
  'eval/ragam-narasi.mjs',
  // 'flywheel/kontrak-latih.mjs' — LUNAS 2 Sep (penjaga LANGSUNG dipasang); utang menyusut 8 -> 7
  'flywheel/netralkan-prompt-induk.mjs',
  'flywheel/periksa-latih.mjs',
  'flywheel/siapkan-suling.mjs',
  'flywheel/vonis-hipotesis.mjs',
]);

/**
 * Periksa satu isi berkas. Murni — bisa diuji dengan fixture, tanpa menyentuh disk.
 * null = sehat; string = alasan pelanggaran.
 */
export function periksaIsi(isi) {
  const punyaEkspor = /^\s*export\s+(const|function|class|let|default|\{)/m.test(isi);
  if (!punyaEkspor) return null;                     // CLI murni boleh apa saja

  // argv di tingkat atas = blok CLI. Yang di DALAM fungsi tidak berbahaya:
  // ia hanya berjalan kalau ada yang memanggilnya.
  const barisCLI = isi.split('\n').filter((b) => /process\.argv/.test(b) && !/^\s*(\/\/|\*)/.test(b));
  if (!barisCLI.length) return null;
  if (/process\.argv\[1\]/.test(isi)) return null;   // sudah ada penjaga entrypoint

  return 'mengekspor DAN membaca process.argv tanpa memeriksa process.argv[1] '
    + `(${barisCLI.length} baris CLI) — diimpor = CLI-nya ikut jalan`;
}

/**
 * Varian C27 yang penjaga di atas TIDAK lihat: penjaga LANGSUNG yang longgar.
 *
 * Banyak modul memakai pola
 *   const LANGSUNG = process.argv[1].endsWith('namanya.mjs')
 * dan itu bekerja — sampai ada berkas BARU yang namanya BERAKHIRAN nama lama.
 * `"tanya-majelis.mjs".endsWith("majelis.mjs")` bernilai true, jadi mengimpor
 * `majelis.mjs` dari `tanya-majelis.mjs --uji` menjalankan uji MAJELIS lalu
 * `process.exit(0)` — dan layar berbunyi "15 lulus · 0 gagal" untuk uji yang
 * tidak pernah dijalankan. Terjadi 7 Sep 2026, gejalanya identik dengan
 * kejadian 28 Agu yang melahirkan berkas ini.
 *
 * Penjaga ini tidak menuntut semua modul ditulis ulang — hanya melarang
 * TABRAKAN: dua modul yang salah satu namanya berakhiran nama yang lain,
 * sementara yang lebih pendek memakai penjaga longgar.
 */
export function pindaiTabrakanNama() {
  const modul = [];
  for (const sub of LIHAT) {
    const d = path.join(AKAR, sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.mjs'))) {
      modul.push({ rel: `${sub}/${f}`, nama: f, isi: fs.readFileSync(path.join(d, f), 'utf8') });
    }
  }
  const tabrakan = [];
  for (const m of modul) {
    // hanya modul yang memakai penjaga LONGGAR atas namanya sendiri yang berisiko
    if (!m.isi.includes(`endsWith('${m.nama}')`)) continue;
    for (const lain of modul) {
      if (lain.rel === m.rel) continue;
      if (lain.nama.endsWith(m.nama)) {
        tabrakan.push({ longgar: m.rel, tertabrak: lain.rel,
          sebab: `"${lain.nama}".endsWith("${m.nama}") = true — menjalankan ${m.rel} saat ${lain.rel} dipanggil` });
      }
    }
  }
  return tabrakan;
}

export function pindai() {
  const pelanggar = [], diperiksa = [];
  for (const sub of LIHAT) {
    const d = path.join(AKAR, sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.mjs'))) {
      const rel = `${sub}/${f}`;
      diperiksa.push(rel);
      const sebab = periksaIsi(fs.readFileSync(path.join(d, f), 'utf8'));
      if (sebab) pelanggar.push({ berkas: rel, sebab });
    }
  }
  const baru = pelanggar.filter((p) => !UTANG_28AGU.has(p.berkas));
  const lunas = [...UTANG_28AGU].filter((b) => diperiksa.includes(b) && !pelanggar.some((p) => p.berkas === b));
  return { pelanggar, diperiksa, baru, lunas };
}

const LANGSUNG = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('jaga-modul.mjs');

// ─────────────────────────────────────────────────────────── uji instrumen ──
if (LANGSUNG && process.argv.includes('--uji')) {
  let ok = 0, buruk = 0;
  const cek = (n, c, ket = '') => (c ? (ok++, console.log(`  OK    ${n}`))
    : (buruk++, console.log(`  GAGAL ${n}${ket ? ' — ' + ket : ''}`)));

  cek('CLI murni tanpa export = boleh',
    periksaIsi('const x = process.argv[2];\nconsole.log(x);') === null);
  cek('modul murni tanpa argv = boleh',
    periksaIsi('export const a = 1;\nexport function b() { return 2; }') === null);
  cek('PELANGGAR: export + argv tanpa penjaga DITANDAI',
    periksaIsi("export const a = 1;\nif (process.argv.includes('--uji')) { process.exit(0); }") !== null);
  cek('modul + argv DENGAN penjaga argv[1] = boleh',
    periksaIsi("export const a = 1;\nconst L = process.argv[1].endsWith('x.mjs');\nif (L) {}") === null);
  cek('argv di dalam komentar tidak dihitung',
    periksaIsi("export const a = 1;\n// process.argv.includes('--uji')\n") === null);
  cek('export default juga dihitung modul',
    periksaIsi("export default function f(){}\nif (process.argv.includes('--x')) {}") !== null);

  const tab = pindaiTabrakanNama();
  cek('tidak ada tabrakan nama modul (penjaga longgar tertabrak nama lain)',
    tab.length === 0, tab.map((x) => x.sebab).join(' | '));

  const r = pindai();
  cek('NYATA: memindai banyak berkas', r.diperiksa.length > 20, `${r.diperiksa.length} berkas`);
  cek('NYATA: ganjaran.mjs berpenjaga', !r.pelanggar.some((p) => p.berkas.endsWith('ganjaran.mjs')));
  cek('NYATA: kolam-grpo.mjs berpenjaga', !r.pelanggar.some((p) => p.berkas.endsWith('kolam-grpo.mjs')));
  cek('NYATA: banding-run.mjs berpenjaga', !r.pelanggar.some((p) => p.berkas.endsWith('banding-run.mjs')));
  cek('RATCHET: tidak ada pelanggar BARU', r.baru.length === 0, r.baru.map((p) => p.berkas).join(', '));
  cek('RATCHET: daftar utang tidak memuat berkas yang sudah bersih', r.lunas.length === 0, r.lunas.join(', '));
  cek('RATCHET: utang lama TETAP terlihat, bukan disembunyikan', r.pelanggar.length > r.baru.length);

  console.log('\n' + '='.repeat(52));
  console.log(`${ok} lulus · ${buruk} gagal`);
  process.exit(buruk ? 1 : 0);
}

// ───────────────────────────────────────────────────────────────── jalan ──
if (LANGSUNG) {
  const { pelanggar, diperiksa, baru, lunas } = pindai();
  console.log(`\n# Jaga modul (C27) — ${diperiksa.length} berkas diperiksa\n`);

  const beku = pelanggar.filter((p) => UTANG_28AGU.has(p.berkas));
  if (beku.length) {
    console.log(`  ${beku.length} utang dibekukan 28 Agu — terlihat, TIDAK menggagalkan:`);
    for (const p of beku) console.log(`    ${p.berkas}`);
  }

  if (lunas.length) {
    console.log(`\n  ${lunas.length} sudah BERSIH tapi masih terdaftar sebagai utang: ${lunas.join(', ')}`);
    console.log('  Hapus dari UTANG_28AGU — daftar utang yang tidak disusutkan ikut membusuk.');
    process.exit(1);
  }

  if (!baru.length) {
    console.log('\n  TIDAK ADA PELANGGAR BARU.\n');
    process.exit(0);
  }
  for (const p of baru) console.log(`\n  ${p.berkas}\n    ${p.sebab}`);
  console.log(`\n  ${baru.length} pelanggar BARU. Obatnya satu baris — penjaga entrypoint`);
  console.log('  (lihat contohnya di kepala berkas ini), lalu bungkus blok CLI dengan itu.\n');
  process.exit(1);
}
