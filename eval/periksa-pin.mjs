#!/usr/bin/env node
/**
 * periksa-pin.mjs — penjaga C16: pustaka tanpa pin di skrip GPU.
 *
 * ============================ KENAPA INI HARUS ADA ==========================
 * 22 Agu, kegagalan vast #12: kemas_merge.py menulis `pip install transformers
 * peft ...` TANPA versi — menarik rilis Agu 2026 ke image torch 2.4 → NameError
 * di tensor_parallel saat import → run mati. Yang menyakitkan: kegagalan yang
 * SAMA sudah pernah terjadi, sudah diobati, dan tertulis di docstring
 * latih_v12.py ("transformers terbaru menabrak torch 2.4"). Cacatnya bukan
 * ketidaktahuan — RESEP TERBUKTI DITULIS ULANG dari nol alih-alih disalin.
 *
 * Penjaga ini membaca semua skrip .py di flywheel/ dan menolak baris
 * `pip install` yang memuat paket tanpa `==`. Float yang disengaja wajib
 * ditandai `# tanpa-pin: <alasan>` pada baris yang sama atau baris sebelumnya —
 * supaya keputusannya tercatat, bukan kebetulan.
 *
 * Pakai: node periksa-pin.mjs            (pindai flywheel/)
 *        node periksa-pin.mjs --uji-instrumen
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FLYWHEEL = path.join(DIR, '..', 'flywheel');

// Kata yang bukan nama paket di baris pip install.
const BUKAN_PAKET = new Set(['pip', 'install', '-q', '-m', '-U', '--upgrade', '--quiet',
  'python', 'python3', 'subprocess', 'subprocess.run', 'subprocess.check_call',
  'sys.executable', 'os.system', 'shell', 'check', 'run', 'sh', 'True', 'False', 'uninstall', '-y']);

export function periksaBaris(baris, barisSebelum = '') {
  // Kembalikan daftar paket tanpa pin pada satu baris pip install YANG DIEKSEKUSI.
  // Pesan error/panduan yang cuma MENYEBUT "pip install" (raise ImportError,
  // mati("...pip install vastai")) bukan resep — penjaga yang berisik akan
  // diabaikan orang, dan itu sama buruknya dengan tidak ada penjaga.
  if (!/pip["',\s\]]*install|pip install/.test(baris)) return [];
  if (!/subprocess|os\.system|check_call|check_output|\bsh\(/.test(baris)) return [];
  if (/pip\s+uninstall|"uninstall"/.test(baris)) return [];
  if (/tanpa-pin:/.test(baris) || /tanpa-pin:/.test(barisSebelum)) return [];
  // Buang komentar (kata komentar bukan paket), lalu normalkan kutip/kurung
  // jadi spasi — paket di string literal Python tidak punya batas-kata yang
  // bisa diandalkan regex ('peft"' gagal lookahead spasi: paket TERAKHIR
  // sebelum kutip penutup selalu lolos diam-diam).
  const bersih = baris.replace(/#.*$/gm, ' ').replace(/["'()\[\],{}]/g, ' ');
  const token = bersih.split(/\s+/).filter(Boolean);
  const paket = token.filter((t) =>
    /^[A-Za-z][A-Za-z0-9_.\[\]-]*$/.test(t) &&
    t.length > 2 &&
    !BUKAN_PAKET.has(t) &&
    !t.includes('=='));
  return paket;
}

export function pindai(akar = FLYWHEEL) {
  const temuan = [];
  const jalan = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        // Keluaran unduhan & cache pihak ketiga bukan resep kita — memindainya
        // menghasilkan kebisingan, dan penjaga berisik = penjaga mati.
        if (/output|cache|__pycache__|node_modules/i.test(e.name)) continue;
        jalan(p);
        continue;
      }
      if (!e.name.endsWith('.py')) continue;
      const baris = fs.readFileSync(p, 'utf8').split('\n');
      for (let i = 0; i < baris.length; i++) {
        const b = baris[i];
        // Baris literal python multi-baris: gabungkan dengan 2 baris berikut
        // supaya `pip install` dan daftar paketnya terbaca satu napas.
        const gabung = [b, baris[i + 1] || '', baris[i + 2] || ''].join(' ');
        if (!/pip/.test(b) || !/install/.test(gabung)) continue;
        // Penanda sadar boleh berdiri 1-2 baris di atas (blok komentar dua baris).
        const sebelum = (baris[i - 1] || '') + ' ' + (baris[i - 2] || '');
        const tanpaPin = periksaBaris(gabung, sebelum);
        if (tanpaPin.length) temuan.push({ berkas: path.relative(akar, p), baris: i + 1, paket: tanpaPin });
        i += 2; // jangan hitung baris sambungan dua kali
      }
    }
  };
  jalan(akar);
  return temuan;
}

function ujiInstrumen() {
  const kasus = [
    ['pin lengkap = bersih',
      periksaBaris('subprocess.run([sys.executable, "-m", "pip", "install", "-q", "transformers==4.51.3", "peft==0.14.0"], check=True)').length === 0],
    ['tanpa pin dieksekusi = tertangkap',
      JSON.stringify(periksaBaris('subprocess.run(f"pip install -q transformers peft", shell=True)')) === '["transformers","peft"]'],
    ['campuran = hanya yang float',
      JSON.stringify(periksaBaris('subprocess.run("pip install transformers==4.51.3 peft", shell=True)')) === '["peft"]'],
    ['tanda tanpa-pin di baris sama = lolos sadar',
      periksaBaris('subprocess.run("pip install gguf", shell=True)  # tanpa-pin: API stabil').length === 0],
    ['tanda tanpa-pin di baris sebelum = lolos sadar',
      periksaBaris('subprocess.run("pip install gguf", shell=True)', '# tanpa-pin: alasan tercatat').length === 0],
    ['pesan error yang MENYEBUT pip install = diabaikan',
      periksaBaris('raise ImportError("requires joblib. Please install it with pip install scikit-learn joblib")').length === 0],
    ['kalimat panduan mati() = diabaikan',
      periksaBaris('    mati("vastai belum terpasang.", "pip install vastai")').length === 0],
    ['bukan baris pip = diabaikan',
      periksaBaris('subprocess.run(["git", "clone", "repo"])').length === 0],
  ];
  let gagal = 0;
  for (const [nama, ok] of kasus) {
    console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nama}`);
    if (!ok) gagal++;
  }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

const iniUtama = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (iniUtama) {
  if (process.argv.includes('--uji-instrumen')) ujiInstrumen();
  else {
    const temuan = pindai();
    if (!temuan.length) {
      console.log('semua pip install di flywheel/ ter-pin (atau float-nya bertanda sadar)');
      process.exit(0);
    }
    console.error('C16 — pustaka tanpa pin (float diam-diam):');
    for (const t of temuan) {
      console.error(`  ${t.berkas}:${t.baris}  ${t.paket.join(', ')}`);
    }
    console.error('\nPaku dengan ==, atau tandai sadar: # tanpa-pin: <alasan>');
    process.exit(1);
  }
}
