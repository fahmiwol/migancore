#!/usr/bin/env node
/**
 * siap-latih.mjs — PIPA WAJIB SEBELUM GPU DINYALAKAN.
 *
 * ============================== KENAPA INI ADA ==============================
 * 21 Agu 2026 kami melatih v11 di atas data yang memuat soal ujiannya sendiri,
 * lalu mengukurnya dengan gerbang yang kuncinya bocor, lalu membandingkannya
 * dengan uji statistik yang salah, lalu menyimpulkan sebab tanpa membaca satu
 * pun jawaban. Empat klaim besar batal dalam satu hari — dan yang paling mahal
 * bukan waktunya, melainkan bahwa semua angkanya SEBENARNYA BENAR: yang salah
 * cuma kesimpulannya.
 *
 * Berkas ini memastikan urutannya tidak bisa dilompati lagi:
 *
 *     SANITASI  ->  FILTER  ->  VALIDASI & TESTING  ->  IZIN LATIH
 *
 * Tahap yang gagal MENGHENTIKAN tahap berikutnya. Menyaring data yang belum
 * disanitasi itu sia-sia; memvalidasi data yang belum disaring itu mengukur
 * hal yang salah; dan melatih tanpa ketiganya itu membakar GPU untuk
 * menghasilkan angka yang tidak boleh dipercaya.
 *
 * ============================ PRA-DAFTAR (kunci ilmiah) =====================
 * Tahap terakhir menolak berjalan tanpa `PRA-DAFTAR.json` yang menyatakan
 * SEBELUM latihan: apa perubahan tunggalnya, ukuran mana yang dipakai memutus,
 * berapa ambangnya, dan apa yang dilakukan bila gagal. Tanpa itu, hasil apa pun
 * bisa dibaca sebagai keberhasilan sesudah kejadian. Ia juga menyimpan sidik
 * jari data — kalau datanya berubah sesudah pra-daftar ditulis, pra-daftarnya
 * dianggap kedaluwarsa.
 *
 * Pakai:
 *   node siap-latih.mjs              periksa saja (tidak menyentuh data)
 *   node siap-latih.mjs --rakit      jalankan panen + saring dulu, lalu periksa
 *   node siap-latih.mjs --html       tulis papan pantau
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DIR, '..');
const EVAL = path.join(AKAR, 'eval');
const DATA = path.join(DIR, 'dataset', 'migancore-curated.jsonl');
const RAKIT = process.argv.includes('--rakit');
const HTML = process.argv.includes('--html');

const W = { hijau: '\x1b[32m', merah: '\x1b[31m', kuning: '\x1b[33m', redup: '\x1b[90m', mati: '\x1b[0m' };
const c = (w, s) => `${W[w]}${s}${W.mati}`;

/**
 * Sidik jari data: hasil pengukuran hanya sah untuk data PERSIS ini. Tanpa
 * sidik jari, "v12 lebih baik dari v11" bisa berarti dua data yang berbeda.
 */
function sidikData() {
  if (!fs.existsSync(DATA)) return null;
  const isi = fs.readFileSync(DATA);
  const baris = isi.toString('utf8').split(/\r?\n/).filter((l) => l.trim()).length;
  return { sidik: crypto.createHash('sha256').update(isi).digest('hex').slice(0, 16), baris, bita: isi.length };
}

// ─────────────────────────────────────────────────────── definisi tahap ──
const TAHAP = [
  {
    nama: 'SANITASI',
    tujuan: 'buang yang berbahaya dan yang mencemari — rahasia, dan soal ujian yang bocor ke data latih',
    langkah: [
      /**
       * CACAT YANG DITEMUKAN 21 Agu: tahap ini dulu memanggil `saring.mjs
       * --periksa`. Ternyata saring MENGABAIKAN flag itu dan tetap merakit
       * ulang dataset dari sumbernya — jadi langkah "pemeriksaan" justru
       * MENIMPA data yang sedang diperiksa, menghapus seluruh perbaikan yang
       * baru saja diterapkan, dan pipa melaporkan angka dari data yang berbeda
       * dengan yang ada di tangan kita.
       *
       * Pipa pemeriksaan TIDAK BOLEH menulis. Merakit hanya lewat `--rakit`,
       * yang disebut eksplisit. Pemeriksaan rahasia sekarang dikerjakan di sini
       * secara baca-saja.
       */
      { nama: 'rahasia & kredensial (baca-saja)', bacaSaja: true,
        catatan: 'nol adalah satu-satunya angka yang diterima' },
      { nama: 'pencemaran soal eval', cwd: EVAL, cmd: ['periksa-pencemaran.mjs'],
        catatan: 'soal gerbang di data latih membuat gerbang mengukur hafalan, dan angkanya justru terlihat BAGUS' },
    ],
  },
  {
    nama: 'FILTER',
    tujuan: 'pilih yang layak dilatih — bukan yang banyak, tapi yang beragam dan tidak kembar',
    langkah: [
      { nama: 'ragam narasi per operasi', cwd: EVAL, cmd: ['ragam-narasi.mjs'],
        catatan: 'data padat tapi seragam melatih NASKAH, bukan operasi — v11 gagal 12/12 konversi ton karena ini' },
    ],
  },
  {
    nama: 'VALIDASI & TESTING',
    tujuan: 'buktikan datanya layak DAN alat ukurnya waras — sebelum satu detik GPU dipakai',
    langkah: [
      { nama: 'gerbang data (9 pemeriksaan)', cwd: DIR, cmd: ['validasi-dataset.mjs'] },
      { nama: 'perkakas eval sehat', cwd: EVAL, cmd: ['periksa-alat.mjs'],
        catatan: 'sintaks + semua uji-instrumen; menangkap alat yang rusak sebelum ia memberi angka palsu' },
      { nama: 'soal gerbang veto disusun ulang', cwd: EVAL, cmd: ['susun-soal-bersih.mjs'],
        catatan: 'kunci jawaban diadu dengan korpus TERKINI — data berubah, soal harus disusun ulang' },
      { nama: 'agregat tidak menyamarkan', cwd: EVAL, cmd: ['banding-jenis.mjs', '--uji-instrumen'] },
      { nama: 'register cacat', cwd: EVAL, cmd: ['register-cacat.mjs', '--cepat'], peringatanKode: 2,
        catatan: 'setiap cacat yang pernah terjadi punya penjaga; satu merah = pipa berhenti' },
      { nama: 'repo tidak menyimpan ranjau biner', cwd: EVAL, cmd: ['jaga-repo.mjs'] },
    ],
  },
];

// ─────────────────────────────────────────────────────────── perakitan ──
console.log('# Siap latih? — pipa wajib sebelum GPU\n');
console.log(c('redup', '  SANITASI  ->  FILTER  ->  VALIDASI & TESTING  ->  IZIN LATIH'));
console.log(c('redup', '  tahap yang gagal menghentikan tahap berikutnya\n'));

if (RAKIT) {
  console.log('## Merakit ulang data (--rakit)\n');
  for (const p of ['panen-kias.mjs', 'panen-perbaikan.mjs', 'panen-kognitif.mjs', 'panen-dasar.mjs']) {
    if (!fs.existsSync(path.join(DIR, p))) continue;
    process.stdout.write(`  ${p.padEnd(24)} … `);
    try { execFileSync(process.execPath, [path.join(DIR, p)], { cwd: DIR, stdio: 'pipe', timeout: 15 * 60 * 1000 }); console.log('selesai'); }
    catch (e) { console.log(c('merah', `GAGAL (keluar ${e.status})`)); }
  }
  process.stdout.write('  saring.mjs               … ');
  try { execFileSync(process.execPath, [path.join(DIR, 'saring.mjs')], { cwd: DIR, stdio: 'pipe', timeout: 20 * 60 * 1000 }); console.log('selesai\n'); }
  catch (e) { console.log(c('merah', `GAGAL (keluar ${e.status})\n`)); }
}

// ───────────────────────────────────────────────────────── jalankan pipa ──
const hasil = [];
let berhenti = false;
for (const t of TAHAP) {
  console.log(`## ${t.nama}`);
  console.log(c('redup', `   ${t.tujuan}`));
  if (berhenti) {
    console.log(c('kuning', '   DILEWATI — tahap sebelumnya gagal; hasil di sini tidak akan berarti\n'));
    for (const l of t.langkah) hasil.push({ tahap: t.nama, ...l, vonis: 'DILEWATI', detik: 0 });
    continue;
  }
  let adaGagal = false;
  for (const l of t.langkah) {
    // Langkah baca-saja dikerjakan di dalam berkas ini supaya tidak ada
    // kemungkinan alat luar menulis ke data yang sedang diperiksa.
    if (l.bacaSaja) {
      const pola = /(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|password\s*[:=]\s*\S{6,}|api[_-]?key\s*[:=]\s*\S{12,})/i;
      let kena = 0;
      if (fs.existsSync(DATA)) {
        for (const baris of fs.readFileSync(DATA, 'utf8').split(/\r?\n/)) if (baris.trim() && pola.test(baris)) kena++;
      }
      const lulus = kena === 0;
      if (!lulus) adaGagal = true;
      hasil.push({ tahap: t.nama, ...l, vonis: lulus ? 'LULUS' : 'GAGAL', detik: 0, pesan: `${kena} baris memuat pola rahasia` });
      console.log(`   ${lulus ? c('hijau', 'LULUS      ') : c('merah', 'GAGAL      ')} ${l.nama} ${c('redup', `(${kena} temuan)`)}`);
      continue;
    }
    const jalur = path.join(l.cwd, l.cmd[0]);
    if (!fs.existsSync(jalur)) {
      if (l.opsional) { hasil.push({ tahap: t.nama, ...l, vonis: 'TIDAK ADA', detik: 0 }); console.log(`   ${c('redup', 'tidak ada  ')} ${l.nama}`); continue; }
      adaGagal = true; hasil.push({ tahap: t.nama, ...l, vonis: 'HILANG', detik: 0 });
      console.log(`   ${c('merah', 'HILANG     ')} ${l.nama}`); continue;
    }
    const t0 = Date.now();
    let keluar = 0, pesan = '';
    try {
      execFileSync(process.execPath, [jalur, ...l.cmd.slice(1)], { cwd: l.cwd, stdio: 'pipe', timeout: 30 * 60 * 1000 });
    } catch (e) {
      keluar = e.status ?? 1;
      const keluaran = String(e.stdout || '') + String(e.stderr || '');
      pesan = keluaran.split('\n').filter((x) => /VONIS|TAHAN|GAGAL|CACAT|TERCEMAR|MERAH/.test(x)).slice(-2).join(' | ').trim()
           || keluaran.split('\n').filter(Boolean).slice(-1)[0] || 'gagal tanpa pesan';
    }
    const detik = Math.round((Date.now() - t0) / 1000);
    // Kode keluar 2 dari register berarti KUNING: semua penjaga lulus, tapi ada
    // kelas cacat yang belum berpenjaga. Itu utang yang harus terlihat, bukan
    // alasan membekukan latihan.
    const peringatan = l.peringatanKode !== undefined && keluar === l.peringatanKode;
    const lulus = keluar === 0 || peringatan;
    if (!lulus && !l.opsional) adaGagal = true;
    hasil.push({ tahap: t.nama, ...l, vonis: peringatan ? 'PERINGATAN' : lulus ? 'LULUS' : (l.opsional ? 'lewati' : 'GAGAL'), detik, pesan });
    console.log(`   ${peringatan ? c('kuning', 'PERINGATAN ') : lulus ? c('hijau', 'LULUS      ') : c('merah', 'GAGAL      ')} ${l.nama} ${c('redup', `(${detik}s)`)}`);
    if (peringatan) console.log(`   ${" ".repeat(11)} ${c("kuning", pesan.slice(0, 140))}`);
    if (!lulus) {
      console.log(`   ${' '.repeat(11)} ${c('merah', pesan.slice(0, 140))}`);
      if (l.catatan) console.log(`   ${' '.repeat(11)} ${c('redup', 'kenapa penting: ' + l.catatan)}`);
    }
  }
  if (adaGagal) berhenti = true;
  console.log('');
}

// ───────────────────────────────────────────────────────── PRA-DAFTAR ──
console.log('## IZIN LATIH');
console.log(c('redup', '   pra-daftar mengunci kesimpulan SEBELUM hasilnya terlihat'));
const sidik = sidikData();
const berkasPra = path.join(DIR, 'PRA-DAFTAR.json');
let pra = null, praMasalah = [];
if (!fs.existsSync(berkasPra)) {
  praMasalah.push('PRA-DAFTAR.json tidak ada — tulis dulu perubahan tunggal, ukuran, ambang, dan aturan gagalnya');
} else {
  try { pra = JSON.parse(fs.readFileSync(berkasPra, 'utf8')); } catch { praMasalah.push('PRA-DAFTAR.json rusak'); }
  if (pra) {
    for (const k of ['versi', 'perubahanTunggal', 'ukuranPemutus', 'ambang', 'kalauGagal', 'sidikData']) {
      if (!pra[k]) praMasalah.push(`PRA-DAFTAR.json kekurangan medan wajib: ${k}`);
    }
    if (pra.sidikData && sidik && pra.sidikData !== sidik.sidik) {
      praMasalah.push(`pra-daftar KEDALUWARSA — ditulis untuk data ${pra.sidikData}, sekarang ${sidik.sidik}. Datanya berubah sesudah kesimpulannya dikunci.`);
    }
  }
}
if (sidik) console.log(`   data: ${sidik.baris} baris · sidik ${sidik.sidik}`);
for (const m of praMasalah) console.log(`   ${c('merah', 'TAHAN      ')} ${m}`);
if (!praMasalah.length && pra) {
  console.log(`   ${c('hijau', 'LULUS      ')} pra-daftar sah: "${pra.perubahanTunggal}"`);
  console.log(`   ${' '.repeat(11)} ${c('redup', `memutus lewat ${pra.ukuranPemutus} pada ambang ${pra.ambang}`)}`);
}

const gagal = hasil.filter((h) => h.vonis === 'GAGAL' || h.vonis === 'HILANG');
const dilewati = hasil.filter((h) => h.vonis === 'DILEWATI');
const siap = gagal.length === 0 && praMasalah.length === 0;

console.log(`\n## VONIS: ${siap ? 'SIAP LATIH' : 'BELUM SIAP — GPU JANGAN DINYALAKAN'}`);
if (!siap) {
  console.log('\n   Yang menahan:');
  for (const g of gagal) console.log(`     [${g.tahap}] ${g.nama}`);
  for (const m of praMasalah) console.log(`     [IZIN] ${m}`);
  if (dilewati.length) console.log(`   ${dilewati.length} langkah tidak dijalankan karena tahap sebelumnya gagal.`);
} else {
  console.log('\n   Semua tahap hijau dan kesimpulannya sudah dikunci sebelum diukur.');
  console.log('   Jalankan latihan, lalu ukur dengan gerbang yang SAMA seperti yang diperiksa di sini.');
}

fs.writeFileSync(path.join(DIR, 'siap-latih.json'), JSON.stringify({
  siap, sidikData: sidik, praDaftar: pra, praMasalah,
  hasil: hasil.map((h) => ({ tahap: h.tahap, langkah: h.nama, vonis: h.vonis, detik: h.detik, pesan: h.pesan || '' })),
}, null, 2), 'utf8');

const L = ['# Siap latih?', '', `**VONIS: ${siap ? 'SIAP LATIH' : 'BELUM SIAP'}**`, ''];
if (sidik) L.push(`Data: ${sidik.baris} baris · sidik \`${sidik.sidik}\``, '');
L.push('| Tahap | Langkah | Vonis | detik |', '|---|---|---|---|');
for (const h of hasil) L.push(`| ${h.tahap} | ${h.nama} | ${h.vonis} | ${h.detik} |`);
if (praMasalah.length) { L.push('', '## Izin latih ditahan', ''); for (const m of praMasalah) L.push(`- ${m}`); }
fs.writeFileSync(path.join(DIR, 'SIAP-LATIH.md'), L.join('\n') + '\n', 'utf8');
console.log('\ntertulis: SIAP-LATIH.md + siap-latih.json');

process.exit(siap ? 0 : 1);
