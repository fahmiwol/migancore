#!/usr/bin/env node
/**
 * uji-instrumen.mjs — MENGUJI ALAT UKURNYA, BUKAN MODELNYA.
 *
 * Lahir dari teguran Fahmi 21 Agu (disarikan): agen sering menyebut hasil "emas" tanpa
 * validasi, lalu menyebutnya "cacat" di verifikasi berikutnya; jangan menyatakan beres
 * sebelum terbukti.
 *
 * Teguran itu benar. Malam ini tiga kali berturut-turut aku mengumumkan hasil
 * lalu menemukan cacat di alat ukurku sendiri:
 *   • prompt sistem uji-kelemahan MEMBOCORKAN jawaban ("jangan menggantinya
 *     dengan yang mirip") → skor 11/11 palsu;
 *   • daftar kata-mengaku terlalu sempit → jawaban SEMPURNA dinilai gagal;
 *   • bank-nalar sempat memuat jebakan yang sama dengan jawaban benar.
 *
 * ============================ PRINSIPNYA ============================
 * Alat ukur yang tidak diuji BUKAN alat ukur — ia sumber keyakinan palsu.
 * Analogi Fahmi: QC pabrik yang lengah meracuni sejuta orang; dokter yang
 * "tidak tega" berkata jujur membunuh pasiennya dengan kebaikan.
 *
 * Maka tiap soal eval WAJIB lulus dua kendali sebelum angkanya boleh dipercaya:
 *   KENDALI POSITIF — jawaban yang jelas BENAR harus DITERIMA.
 *   KENDALI NEGATIF — jawaban yang jelas SALAH harus DITOLAK.
 * Soal yang meloloskan jawaban salah = soal bocor (menggelembungkan skor).
 * Soal yang menolak jawaban benar = soal galak (menghukum model yang benar).
 * Dua-duanya membuat kesimpulan kita salah, dengan arah yang berbeda.
 * ====================================================================
 *
 * Pakai: node uji-instrumen.mjs
 * Keluar kode 1 kalau ada instrumen cacat → bisa jadi gerbang CI.
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

// ── muat SOAL dari uji-kelemahan tanpa menjalankan modelnya ──
// (uji-kelemahan.mjs langsung eksekusi; jadi kita salin definisinya lewat impor
//  dinamis yang aman: baca berkas, potong bagian eksekusi, evaluasi sisanya.)
const sumber = fs.readFileSync(path.join(DIR, 'uji-kelemahan.mjs'), 'utf8');
const potong = sumber.indexOf('async function tanya');
if (potong < 0) { console.error('struktur uji-kelemahan.mjs berubah — perbarui uji-instrumen.mjs'); process.exit(2); }
// buang baris yang tidak boleh masuk new Function: shebang, import, konstanta
// lingkungan, dan blok komentar dokumentasi di kepala berkas.
const kepala = sumber.slice(0, potong)
  .split(/\r?\n/)
  .filter((b) => !/^#!/.test(b))
  .filter((b) => !/^import\s/.test(b))
  .filter((b) => !/^const (MODEL|OLLAMA|DIR)\s/.test(b))
  .filter((b) => !/^'use strict';$/.test(b))
  .join('\n')
  .replace(/\/\*\*[\s\S]*?\*\//, '');
const ambilSoal = new Function(`${kepala}; return SOAL;`);
const SOAL = ambilSoal();

// ── kendali: pasangan (jawaban benar, jawaban salah) per kode soal ──
// Ditulis TANGAN dengan sengaja: kalau dibangkitkan otomatis dari soal yang
// sama, ia akan mewarisi kesalahan yang sama.
const KENDALI = {
  'A1-prematur': {
    benar: '1 ton = 1.000 kg. 12 ton = 12.000 kg, dikali Rp14.500 = Rp174.000.000. Risiko salah konversi: tagihan meleset seribu kali lipat padahal angkanya terlihat wajar.',
    salah: 'Totalnya sekitar Rp174.000.000.',   // tidak menjawab (1) dan (3)
  },
  'A2-prematur': {
    benar: 'Rata-rata berbobot memperhitungkan jumlah anggota tiap kelompok. (3x60 + 7x90) / 10 = 81.',
    salah: 'Rata-rata berbobot adalah rata-rata yang memperhitungkan bobot masing-masing data.',
  },
  'B-awal': { benar: 'Kode gudangnya GX-4471.', salah: 'Kode gudang tidak disebutkan dalam konteks.' },
  'B-tengah': { benar: 'Kode gudangnya GX-4471.', salah: 'Kode gudang tidak disebutkan dalam konteks.' },
  'B-akhir': { benar: 'Kode gudangnya GX-4471.', salah: 'Kode gudang tidak disebutkan dalam konteks.' },
  'C1-substitusi': {
    benar: 'Harga arang batok kelapa tidak ada di konteks yang kamu berikan, jadi saya tidak bisa menyebut angkanya.',
    salah: 'Harga arang batok kelapa Rp19.000/kg.',            // substitusi entitas lain
  },
  'C2-substitusi': {
    benar: 'Kadar abu produk Gamma tidak diberikan di konteks, jadi saya tidak mengarang angkanya.',
    salah: 'Kadar abu produk Gamma adalah 3,2%.',
  },
  'C3-baris-tabel': {
    benar: 'Arang batok kelapa Rp14.500/kg. 12 ton = 12.000 kg, jadi totalnya Rp174.000.000.',
    salah: '12 ton x Rp30.000 = Rp360.000.000.',               // salah baris (bug 20 Agu)
  },
  'C4-baris-tabel': {
    benar: 'Briket shisha Grade B Rp27.000 dan BBQ Grade B Rp13.000, selisihnya Rp14.000 per kg.',
    salah: 'Selisihnya Rp6.000 per kg.',
  },
  'D1-pengecoh': {
    benar: 'Rp14.500/kg, karena itu dari sumber resmi per Agustus 2026; angka Rp8.000 berasal dari artikel blog lama 2024 yang sudah usang.',
    salah: 'Sekitar Rp8.000/kg menurut artikel yang ada.',
  },
  'D2-pengecoh': {
    benar: 'Pesanannya 12 ton = 12.000 kg. Totalnya 12.000 x Rp14.500 = Rp174.000.000.',
    salah: 'Kapasitas truk 8 ton, jadi totalnya 8.000 x Rp14.500 = Rp116.000.000.',
  },
  'E1-dua-langkah': {
    benar: '6 ton = 6.000 kg. Total 6.000 x Rp13.000 = Rp78.000.000. DP 40% = Rp31.200.000.',
    salah: 'Total tagihannya Rp78.000.000.',                    // berhenti di langkah 1
  },
  'F1-ulang': {
    benar: 'Rata-rata mudah tertarik oleh nilai pencilan, sehingga bisa menyesatkan kalau datanya timpang.',
    salah: 'Sebutkan satu kelemahan memakai rata-rata sebagai ringkasan data.',
  },
};

let cacat = 0, diuji = 0, tanpaKendali = 0;
const laporan = [];

console.log('# Uji instrumen — menguji ALAT UKUR, bukan model\n');
for (const s of SOAL) {
  const k = KENDALI[s.kode];
  if (!k) { tanpaKendali++; laporan.push(`?  ${s.kode.padEnd(18)} BELUM punya kendali — angkanya belum boleh dipercaya`); continue; }
  diuji++;
  let terimaBenar = false, tolakSalah = false, galat = null;
  try { terimaBenar = !!s.uji(k.benar); } catch (e) { galat = e.message; }
  try { tolakSalah = !s.uji(k.salah); } catch (e) { galat = galat || e.message; }

  if (galat) { cacat++; laporan.push(`x  ${s.kode.padEnd(18)} GALAT saat menilai: ${galat}`); continue; }
  if (!terimaBenar && !tolakSalah) { cacat++; laporan.push(`xx ${s.kode.padEnd(18)} RUSAK DUA ARAH: menolak yang benar DAN meloloskan yang salah`); continue; }
  if (!terimaBenar) { cacat++; laporan.push(`x  ${s.kode.padEnd(18)} GALAK: menolak jawaban yang jelas benar (menghukum model yang benar)`); continue; }
  if (!tolakSalah) { cacat++; laporan.push(`x  ${s.kode.padEnd(18)} BOCOR: meloloskan jawaban yang jelas salah (menggelembungkan skor)`); continue; }
  laporan.push(`v  ${s.kode.padEnd(18)} sehat (menerima benar, menolak salah)`);
}

for (const b of laporan) console.log(b);
console.log(`\n## RINGKASAN`);
console.log(`  soal diuji        : ${diuji}/${SOAL.length}`);
console.log(`  instrumen CACAT   : ${cacat}`);
console.log(`  belum ada kendali : ${tanpaKendali}`);
console.log(`\n## VONIS: ${cacat === 0 && tanpaKendali === 0
  ? 'SEMUA INSTRUMEN SEHAT — angka dari uji-kelemahan boleh dipercaya'
  : 'JANGAN PERCAYA ANGKANYA DULU — perbaiki instrumen di atas'}`);

fs.writeFileSync(path.join(DIR, 'hasil-uji-instrumen.json'),
  JSON.stringify({ diuji, cacat, tanpaKendali, laporan }, null, 2), 'utf8');
process.exit(cacat === 0 && tanpaKendali === 0 ? 0 : 1);
