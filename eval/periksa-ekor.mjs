#!/usr/bin/env node
/**
 * periksa-ekor.mjs — penjaga C17: EKOR VERBATIM — blok kata yang sama persis
 * berulang di banyak baris jawaban.
 *
 * ============================ KENAPA INI HARUS ADA ==========================
 * 22 Agu: 46 baris (16% cluster-hitung) berbagi ekor 40-kata yang identik
 * huruf-per-huruf — dan LOLOS dari dua gerbang sekaligus:
 *   - ragam-narasi buta (detektor operasinya tak mengenali pola "X : Y = Z
 *     hari", jadi keluarga itu tak pernah masuk tabelnya), dan
 *   - periksa-latih nyaris-kembar hanya menandai 1 pasangan (angka per baris
 *     berbeda menekan Jaccard global di bawah ambang).
 * Dua detektor, satu celah di antaranya. Per hukum memori parametrik, blok
 * yang berulang 46x PASTI melewati p>0,5 dan menjadi naskah — persis kelas
 * pola yang menjajah soal rata-rata di v12.
 *
 * Metode: shingle 15 kata digeser per kata di semua jawaban; shingle yang
 * muncul di >= AMBANG baris BERBEDA = keluarga ekor. Shingle tumpang-tindih
 * digabung jadi satu keluarga per perwakilan terpanjangnya.
 *
 * Pakai: node periksa-ekor.mjs <berkas.jsonl> [ambangBaris=8]
 *        node periksa-ekor.mjs --uji-instrumen
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const N_KATA = 15;

export function jawabanDari(baris) {
  const g = (baris.conversations || []).find((c) => c.from === 'gpt');
  return g ? g.value : '';
}

export function keluargaEkor(daftarJawaban, ambangBaris = 8) {
  const peta = new Map(); // shingle -> Set(idx baris)
  daftarJawaban.forEach((t, idx) => {
    const w = String(t).toLowerCase().split(/\s+/).filter(Boolean);
    const terlihat = new Set();
    for (let i = 0; i + N_KATA <= w.length; i++) {
      const s = w.slice(i, i + N_KATA).join(' ');
      if (terlihat.has(s)) continue; // sekali per baris
      terlihat.add(s);
      if (!peta.has(s)) peta.set(s, new Set());
      peta.get(s).add(idx);
    }
  });
  // ambil shingle di atas ambang, gabungkan yang barisnya sama persis
  const kena = [...peta.entries()].filter(([, v]) => v.size >= ambangBaris);
  const kelompok = new Map(); // kunci-anggota -> {contoh, baris}
  for (const [s, v] of kena) {
    const kunci = [...v].sort((a, b) => a - b).join(',');
    const ada = kelompok.get(kunci);
    if (!ada || s.length > ada.contoh.length) kelompok.set(kunci, { contoh: s, baris: v.size, anggota: [...v] });
  }
  return [...kelompok.values()].sort((a, b) => b.baris - a.baris);
}

// ────────────────────────────────────────────────── uji instrumen ──
function ujiInstrumen() {
  const ekor = 'tapi jangan berhenti di aritmetika mengontak semua belum tentu benar sebagian daftar itu pesaing bukan pembeli saranku';
  const seragam = Array.from({ length: 10 }, (_, i) => `hitungannya ${i * 7} : 3 = ${i} hari. ${ekor} saring dulu.`);
  const beragam = Array.from({ length: 10 }, (_, i) => `jawaban nomor ${i} dengan kalimat yang benar benar berbeda satu sama lain tanpa blok bersama nomor ${i * 3} sekian kata unik ${i * 11} lagi supaya panjangnya cukup melewati lima belas kata semua`);
  const kasus = [
    ['ekor 10x tertangkap', keluargaEkor(seragam, 8).length >= 1],
    ['anggota keluarga benar (10)', (keluargaEkor(seragam, 8)[0] || {}).baris === 10],
    ['korpus beragam bersih', keluargaEkor(beragam, 8).length === 0],
    ['di bawah ambang tak dilaporkan', keluargaEkor(seragam.slice(0, 5), 8).length === 0],
    ['jawaban pendek aman (tak crash)', keluargaEkor(['pendek saja', ''], 2).length === 0],
  ];
  let gagal = 0;
  for (const [nama, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nama}`); if (!ok) gagal++; }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

const iniUtama = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (iniUtama) {
  if (process.argv.includes('--uji-instrumen')) ujiInstrumen();

  const BERKAS = process.argv[2];
  const AMBANG = Number(process.argv[3]) || 8;
  if (!BERKAS) { ujiInstrumen(); }
  const baris = fs.readFileSync(BERKAS, 'utf8').trim().split('\n').map((b) => JSON.parse(b));
  const jawaban = baris.map(jawabanDari);
  const keluarga = keluargaEkor(jawaban, AMBANG);
  // KONTRAK 5% (dideklarasikan 22 Agu SEBELUM angka residu dilihat): bahaya
  // memorisasi menakar dari PROPORSI pengulangan. Keluarga > 5% cluster =
  // TAHAN; di bawahnya = catatan — tetap dicetak, tidak membatalkan.
  const batasTahan = Math.max(AMBANG, Math.ceil(baris.length * 0.05));
  const tahan = keluarga.filter((k) => k.baris > batasTahan);
  const catatan = keluarga.filter((k) => k.baris <= batasTahan);
  console.log(`# Periksa ekor — ${path.basename(BERKAS)} (${baris.length} baris, ambang ${AMBANG}, garis TAHAN >${batasTahan})`);
  if (!keluarga.length) {
    console.log('BERSIH — tidak ada blok 15-kata yang berulang di banyak baris.');
    process.exit(0);
  }
  for (const k of tahan) {
    console.log(`\n  TAHAN  ${k.baris} baris (${((100 * k.baris) / baris.length).toFixed(1)}%) berbagi blok verbatim:`);
    console.log(`         "${k.contoh.slice(0, 120)}..."`);
  }
  for (const k of catatan.slice(0, 6)) {
    console.log(`  catatan ${k.baris} baris (${((100 * k.baris) / baris.length).toFixed(1)}%): "${k.contoh.slice(0, 70)}..."`);
  }
  if (tahan.length) {
    console.log(`\n## VONIS: TAHAN — ${tahan.length} keluarga > garis 5%. Sebar bentuknya sebelum latih.`);
    process.exit(1);
  }
  console.log(`\n## VONIS: LOLOS-DENGAN-CATATAN — ${catatan.length} keluarga kecil (semua <= 5%).`);
  process.exit(0);
}
