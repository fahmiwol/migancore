#!/usr/bin/env node
/**
 * jaga-rahasia.mjs — menolak kredensial masuk ke berkas yang akan di-commit.
 *
 * ======================== KENAPA INI ADA (10 Sep 2026) ========================
 * Sesi Galantara menemukan sebuah kunci Gemini UTUH tersimpan sebagai teks biasa
 * di korpus OMIGA — di-paste ke chat 17 Jun 2026, lalu terindeks apa adanya.
 * Diverifikasi sendiri: 6 kemunculan di 3 berkas, dan tipe dokumennya `session`.
 *
 * Itu C54 dilihat dari sisi lain. Satu sebab — korpus mengindeks transkrip Claude
 * apa adanya — dua kerugian:
 *   bagi eval  : model membaca kunci jawaban petak (C54)
 *   bagi rahasia: kredensial hidup masuk ke konteks agent mana pun
 *
 * Yang membuatnya menyentuh MiganCore: `ukur-jujur2-retrieval.mjs` menyimpan
 * JAWABAN MODEL ke berkas hasil, dan berkas hasil di-commit. Lengan `penuh`
 * membaca dokumen `session` tanpa saringan. Jadi ada jalur nyata, meski sempit,
 * dari kunci di korpus -> catatan yang disodorkan -> jawaban model -> git.
 *
 * Penjaga ini menutup ujung terakhirnya. Ia TIDAK PERNAH mencetak nilai yang
 * cocok — hanya berkas, baris, dan nama polanya. Alat yang membocorkan rahasia
 * saat melaporkan kebocoran adalah lelucon yang sudah sering terjadi sungguhan.
 *
 * Pakai:
 *   node eval/jaga-rahasia.mjs            (semua berkas yang git lihat)
 *   node eval/jaga-rahasia.mjs eval/      (jalur tertentu)
 *   node eval/jaga-rahasia.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', A = '\x1b[2m', B = '\x1b[1m', R = '\x1b[0m';

/**
 * Pola disusun dari POTONGAN, bukan ditulis utuh.
 *
 * Sebabnya praktis, bukan gaya: penjaga yang memuat literal `sk-` + `proj-` akan
 * menandai DIRINYA SENDIRI setiap kali dijalankan, lalu orang mematikannya karena
 * berisik — dan penjaga yang dimatikan tidak menjaga apa pun.
 */
const P = (...bagian) => bagian.join('');
export const POLA = [
  { nama: 'OpenAI project', re: new RegExp(P('sk', '-proj-') + '[A-Za-z0-9_\\-]{20,}') },
  { nama: 'OpenAI klasik', re: new RegExp(P('sk', '-') + '[A-Za-z0-9]{32,}') },
  { nama: 'Anthropic', re: new RegExp(P('sk', '-ant-') + '[A-Za-z0-9_\\-]{20,}') },
  { nama: 'Google API', re: new RegExp(P('AI', 'za') + '[A-Za-z0-9_\\-]{30,}') },
  { nama: 'Google OAuth', re: new RegExp(P('AQ', '\\.', 'Ab8') + '[A-Za-z0-9_\\-]{10,}') },
  { nama: 'GitHub token', re: new RegExp(P('gh', '[pousr]_') + '[A-Za-z0-9]{30,}') },
  { nama: 'HuggingFace', re: new RegExp(P('hf', '_') + '[A-Za-z0-9]{30,}') },
  { nama: 'NVIDIA', re: new RegExp(P('nv', 'api-') + '[A-Za-z0-9_\\-]{20,}') },
  { nama: 'Slack', re: new RegExp(P('xox', '[baprs]-') + '[A-Za-z0-9\\-]{20,}') },
  { nama: 'kunci privat', re: new RegExp(P('BEGIN ', '[A-Z ]*', 'PRIVATE KEY')) },
];

/** Berkas biner & besar dilewati; keduanya bukan tempat rahasia diketik. */
const LEWATI_EKSTENSI = new Set(['.gguf', '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tgz', '.gz', '.bin', '.i8', '.woff', '.woff2', '.ico']);
export const MAKS_BITA = 20 * 1024 * 1024;

/** Pindai SATU teks. Mengembalikan temuan tanpa nilai yang cocok. */
export function pindaiTeks(teks, namaBerkas = '?') {
  const temuan = [];
  const baris = String(teks).split('\n');
  for (let i = 0; i < baris.length; i++) {
    for (const p of POLA) {
      const m = baris[i].match(p.re);
      if (!m) continue;
      temuan.push({
        berkas: namaBerkas,
        baris: i + 1,
        pola: p.nama,
        // panjang saja — cukup untuk menilai keseriusan, tidak cukup untuk memakai
        panjang: m[0].length,
      });
    }
  }
  return temuan;
}

/** Berkas yang git lihat: terlacak + belum terlacak tapi tidak diabaikan. */
export function berkasGit(akar = AKAR) {
  const jalankan = (args) => {
    try { return execFileSync('git', ['-C', akar, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean); }
    catch { return []; }
  };
  return [...new Set([...jalankan(['ls-files']), ...jalankan(['ls-files', '--others', '--exclude-standard'])])];
}

export function pindaiBerkas(rel, akar = AKAR) {
  const penuh = path.join(akar, rel);
  if (LEWATI_EKSTENSI.has(path.extname(rel).toLowerCase())) return [];
  let st;
  try { st = fs.statSync(penuh); } catch { return []; }
  if (!st.isFile() || st.size > MAKS_BITA) return [];
  let isi;
  try { isi = fs.readFileSync(penuh, 'utf8'); } catch { return []; }
  return pindaiTeks(isi, rel);
}

// ─────────────────────────────────────────────────────────────────── uji ──
function uji() {
  let ok = 0, bad = 0;
  const cek = (n, c) => { if (c) ok++; else { bad++; console.log(`  ${M}GAGAL${R} ${n}`); } };

  // Umpan dibangun SAAT JALAN, supaya berkas ini sendiri tidak memuat literalnya.
  const umpan = (awalan, n = 40) => awalan + 'A1b2C3d4'.repeat(Math.ceil(n / 8)).slice(0, n);

  cek('OpenAI project tertangkap', pindaiTeks(umpan('sk' + '-proj-')).length > 0);
  cek('Anthropic tertangkap', pindaiTeks(umpan('sk' + '-ant-')).length > 0);
  cek('Google API tertangkap', pindaiTeks(umpan('AI' + 'za')).length > 0);
  cek('Google OAuth tertangkap (pola yang NYATA ditemukan 10 Sep)', pindaiTeks(umpan('AQ' + '.' + 'Ab8')).length > 0);
  cek('GitHub tertangkap', pindaiTeks(umpan('gh' + 'p_')).length > 0);
  cek('HuggingFace tertangkap', pindaiTeks(umpan('hf' + '_')).length > 0);
  cek('NVIDIA tertangkap', pindaiTeks(umpan('nv' + 'api-')).length > 0);
  // Disusun dari potongan seperti yang lain. Versi pertama ditulis utuh, dan
  // penjaganya langsung menandai berkasnya sendiri saat dijalankan — bukti
  // hidup bahwa aturan "jangan tulis literal" itu bukan gaya.
  cek('kunci privat tertangkap', pindaiTeks('-----' + P('BEG', 'IN') + ' RSA ' + P('PRIV', 'ATE') + ' ' + P('K', 'EY') + '-----').length > 0);

  cek('teks biasa TIDAK ditandai', pindaiTeks('Bangka Belitung penghasil timah, bukan tembaga.').length === 0);
  cek('kata pendek mirip awalan tidak ditandai', pindaiTeks('hf_ dan ghp_ disebut tanpa nilai').length === 0);

  // Yang paling penting: temuan tidak boleh membawa nilainya.
  const t = pindaiTeks('kunci: ' + umpan('sk' + '-ant-'), 'x.md')[0];
  cek('temuan menyebut berkas & baris', t.berkas === 'x.md' && t.baris === 1);
  cek('temuan membawa nama pola', typeof t.pola === 'string' && t.pola.length > 0);
  cek('temuan TIDAK membawa nilai yang cocok',
    !Object.values(t).some((v) => typeof v === 'string' && v.includes('A1b2C3d4')));
  cek('nomor baris benar di baris ke-3',
    pindaiTeks('a\nb\n' + umpan('sk' + '-ant-'))[0].baris === 3);

  cek('berkas biner dilewati', LEWATI_EKSTENSI.has('.gguf'));
  cek('berkasGit mengembalikan daftar', Array.isArray(berkasGit()));

  console.log(bad === 0 ? `${H}${ok} lulus${R}` : `${M}${bad} gagal${R}, ${ok} lulus`);
  return bad === 0 ? 0 : 1;
}

// ────────────────────────────────────────────────────────────────── main ──
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  if (process.argv.includes('--uji')) process.exit(uji());

  const argJalur = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  let daftar;
  if (argJalur.length) {
    daftar = [];
    for (const j of argJalur) {
      const p = path.join(AKAR, j);
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        for (const f of fs.readdirSync(p)) daftar.push(path.join(j, f).replace(/\\/g, '/'));
      } else daftar.push(j);
    }
  } else {
    daftar = berkasGit();
  }

  const semua = [];
  for (const rel of daftar) semua.push(...pindaiBerkas(rel));

  console.log(`\n${B}# jaga-rahasia — ${daftar.length} berkas dipindai${R}\n`);
  if (!semua.length) {
    console.log(`${H}BERSIH${R} — tidak ada pola kredensial di berkas yang akan di-commit.\n`);
    console.log(`${A}Catatan: ini memindai repo MiganCore, BUKAN korpus OMIGA. Korpus di`);
    console.log(`<memory-dir>\\corpus memuat sebuah kunci Google OAuth (6 kemunculan, 3 berkas,`);
    console.log(`tipe dokumen 'session', terindeks 17 Jun 2026). Meredaksinya tanpa ROTASI`);
    console.log(`hanya rasa aman palsu — rotasi hanya Fahmi yang bisa.${R}\n`);
    process.exit(0);
  }
  const perBerkas = new Map();
  for (const t of semua) {
    if (!perBerkas.has(t.berkas)) perBerkas.set(t.berkas, []);
    perBerkas.get(t.berkas).push(t);
  }
  console.log(`${M}${semua.length} kemunculan di ${perBerkas.size} berkas${R}\n`);
  for (const [berkas, ts] of perBerkas) {
    console.log(`  ${M}${berkas}${R}`);
    for (const t of ts) console.log(`      baris ${String(t.baris).padStart(6)} · ${t.pola} · ${t.panjang} huruf`);
  }
  console.log(`\n${K}JANGAN commit berkas ini. Nilainya sengaja tidak dicetak.${R}`);
  console.log(`${A}Kalau ini keluaran pengukuran: karantina berkasnya, jangan sunting angkanya.${R}\n`);
  process.exit(1);
}
