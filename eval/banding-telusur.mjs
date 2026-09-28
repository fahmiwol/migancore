#!/usr/bin/env node
/**
 * banding-telusur.mjs — membandingkan KELAS KEGAGALAN dua konfigurasi, per soal.
 *
 * Dibuat 10 Sep untuk membayar satu kewajiban yang dikunci di
 * `PRA-DAFTAR-L2B-RETRIEVAL.json`: *"laporan wajib menjawab 'dari 10 SALAH-FAKTA
 * acuan, berapa yang berubah kelas, dan menjadi apa'."*
 *
 * Kenapa tidak cukup membandingkan PERSENTASE per kelas. Dua papan bisa punya
 * "SALAH-FAKTA 31 %" yang sama sekali bukan soal yang sama — sepuluh sembuh dan
 * sepuluh yang lain rusak terbaca identik dengan "tidak terjadi apa-apa". Yang
 * ditanyakan pra-daftar adalah PERPINDAHAN, dan perpindahan hanya terlihat kalau
 * soalnya dilacak satu per satu.
 *
 * Karena tiap konfigurasi dijalankan beberapa putaran, satu soal bisa punya
 * beberapa kelas. Kelas soal = MODUS-nya (terbanyak); kalau seri, yang terburuk
 * menang — sebab satu kegagalan nyata lebih penting daripada satu kelulusan.
 *
 * Pakai:
 *   node eval/banding-telusur.mjs --acuan <pola> --kandidat <pola> [--telemetri-acuan f] [--telemetri-kandidat f]
 *   node eval/banding-telusur.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kelaskan } from './telusur-kegagalan.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', A = '\x1b[2m', B = '\x1b[1m', R = '\x1b[0m';

/** Makin besar makin buruk — dipakai memutus seri saat menghitung modus. */
export const BURUK = {
  LULUS: 0, 'GALAT-JARINGAN': 1, 'PENILAI-BUTA': 2, 'PROBE-SALAH': 3,
  'PENJAWAB-MENOLAK-FAKTA': 4, 'SALAH-FAKTA': 5, 'PENJAWAB-MELAWAN': 6, 'PENJAWAB-MENGARANG': 7,
};

/** Kelas wakil satu soal dari beberapa putaran: modus, seri dimenangkan yang terburuk. */
export function kelasWakil(daftarKelas) {
  if (!daftarKelas.length) return null;
  const hitung = new Map();
  for (const k of daftarKelas) hitung.set(k, (hitung.get(k) || 0) + 1);
  let terbaik = null, nTerbaik = -1;
  for (const [k, n] of hitung) {
    if (n > nTerbaik || (n === nTerbaik && (BURUK[k] ?? 9) > (BURUK[terbaik] ?? 9))) {
      terbaik = k; nTerbaik = n;
    }
  }
  return terbaik;
}

/** Baca berkas hasil + telemetri → { idSoal: [kelas per putaran] }. */
export function petaKelas(polaHasil, berkasTelemetri, dir = DI_SINI) {
  const tel = new Map();
  if (berkasTelemetri) {
    for (const baris of fs.readFileSync(path.join(dir, berkasTelemetri), 'utf8').split('\n')) {
      if (!baris.trim()) continue;
      try { const t = JSON.parse(baris); if (t.q) tel.set(t.q, t); } catch { /* baris rusak dilewati */ }
    }
  }
  const per = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith(polaHasil) && x.endsWith('.json'))) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    if (!Array.isArray(j.baris)) continue;
    for (const b of j.baris) {
      const t = tel.get(b.soal.q) || {};
      const k = kelaskan({
        jenis: b.soal.jenis, hasil: b.hasil, sinyal: b.sinyal,
        labelProbe: b.gerbang?.label ?? t.label ?? null,
        tindakan: b.gerbang?.tindakan ?? t.tindakan ?? null,
      });
      const id = b.soal.id;
      if (!per.has(id)) per.set(id, { id, jenis: b.soal.jenis, q: b.soal.q, kelas: [] });
      per.get(id).kelas.push(k.kelas);
    }
  }
  for (const v of per.values()) v.wakil = kelasWakil(v.kelas);
  return per;
}

/** Matriks perpindahan: dari kelas apa, ke kelas apa, soal mana. */
export function perpindahan(acuan, kandidat) {
  const pindah = [];
  for (const [id, a] of acuan) {
    const k = kandidat.get(id);
    if (!k) continue;
    pindah.push({ id, jenis: a.jenis, q: a.q, dari: a.wakil, ke: k.wakil, berubah: a.wakil !== k.wakil });
  }
  return pindah;
}

export function ringkasPerpindahan(pindah, kelasFokus) {
  const dariFokus = pindah.filter((p) => p.dari === kelasFokus);
  const keTujuan = new Map();
  for (const p of dariFokus) keTujuan.set(p.ke, (keTujuan.get(p.ke) || 0) + 1);
  return {
    n: dariFokus.length,
    tetap: dariFokus.filter((p) => p.ke === kelasFokus).length,
    sembuh: dariFokus.filter((p) => p.ke === 'LULUS').length,
    tujuan: [...keTujuan.entries()].sort((a, b) => b[1] - a[1]),
    masukBaru: pindah.filter((p) => p.dari !== kelasFokus && p.ke === kelasFokus).length,
  };
}

// ─────────────────────────────────────────────────────────────────── uji ──
function uji() {
  let ok = 0, bad = 0;
  const cek = (n, c) => { if (c) ok++; else { bad++; console.log(`  ${M}GAGAL${R} ${n}`); } };

  cek('modus dipilih', kelasWakil(['LULUS', 'LULUS', 'SALAH-FAKTA']) === 'LULUS');
  cek('seri dimenangkan yang TERBURUK', kelasWakil(['LULUS', 'SALAH-FAKTA']) === 'SALAH-FAKTA');
  cek('seri tiga arah tetap deterministik', kelasWakil(['LULUS', 'PROBE-SALAH', 'PENJAWAB-MENGARANG']) === 'PENJAWAB-MENGARANG');
  cek('kosong → null', kelasWakil([]) === null);

  const A_ = new Map([
    ['a', { id: 'a', jenis: 'fakta', q: 'qa', wakil: 'SALAH-FAKTA' }],
    ['b', { id: 'b', jenis: 'fakta', q: 'qb', wakil: 'SALAH-FAKTA' }],
    ['c', { id: 'c', jenis: 'fakta', q: 'qc', wakil: 'LULUS' }],
  ]);
  const Kd = new Map([
    ['a', { id: 'a', wakil: 'LULUS' }],                     // sembuh
    ['b', { id: 'b', wakil: 'PENJAWAB-MENOLAK-FAKTA' }],    // pindah, tidak sembuh
    ['c', { id: 'c', wakil: 'SALAH-FAKTA' }],               // rusak baru
  ]);
  const p = perpindahan(A_, Kd);
  cek('perpindahan mencatat tiap soal', p.length === 3);
  cek('yang berubah ditandai', p.filter((x) => x.berubah).length === 3);

  const r = ringkasPerpindahan(p, 'SALAH-FAKTA');
  cek('n fokus benar', r.n === 2);
  cek('sembuh dihitung', r.sembuh === 1);
  cek('tetap dihitung', r.tetap === 0);
  cek('MASUK BARU dihitung — ini yang disembunyikan persentase', r.masukBaru === 1);
  cek('tujuan terurut', r.tujuan.length === 2);

  // Soal yang hanya ada di salah satu sisi tidak boleh dikarang.
  cek('soal tak berpasangan dilewati', perpindahan(A_, new Map([['a', { wakil: 'LULUS' }]])).length === 1);

  console.log(bad === 0 ? `${H}${ok} lulus${R}` : `${M}${bad} gagal${R}, ${ok} lulus`);
  return bad === 0 ? 0 : 1;
}

// ────────────────────────────────────────────────────────────────── main ──
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) {
  if (process.argv.includes('--uji')) process.exit(uji());
  const ambil = (n, b = null) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : b; };
  const polaA = ambil('--acuan'), polaK = ambil('--kandidat');
  if (!polaA || !polaK) {
    console.error('Pakai: node eval/banding-telusur.mjs --acuan <pola> --kandidat <pola> [--telemetri-acuan f] [--telemetri-kandidat f] [--fokus KELAS]');
    process.exit(1);
  }
  const acuan = petaKelas(polaA, ambil('--telemetri-acuan'));
  const kand = petaKelas(polaK, ambil('--telemetri-kandidat'));
  const fokus = ambil('--fokus', 'SALAH-FAKTA');
  const pindah = perpindahan(acuan, kand);

  console.log(`\n${B}# banding telusur — ${acuan.size} soal acuan vs ${kand.size} soal kandidat · ${pindah.length} berpasangan${R}\n`);

  const hit = (peta) => { const h = new Map(); for (const v of peta.values()) h.set(v.wakil, (h.get(v.wakil) || 0) + 1); return h; };
  const hA = hit(acuan), hK = hit(kand);
  const semuaKelas = [...new Set([...hA.keys(), ...hK.keys()])].sort((a, b) => (BURUK[a] ?? 9) - (BURUK[b] ?? 9));
  console.log(`  ${'kelas'.padEnd(26)}${'acuan'.padStart(7)}${'kandidat'.padStart(10)}${'selisih'.padStart(9)}`);
  for (const k of semuaKelas) {
    const a = hA.get(k) || 0, b = hK.get(k) || 0, d = b - a;
    const w = d === 0 ? A : (k === 'LULUS' ? (d > 0 ? H : M) : (d > 0 ? M : H));
    console.log(`  ${k.padEnd(26)}${String(a).padStart(7)}${String(b).padStart(10)}${w}${(d > 0 ? '+' : '') + d}`.padEnd(60) + R);
  }

  const r = ringkasPerpindahan(pindah, fokus);
  console.log(`\n${B}## Nasib ${r.n} soal yang di ACUAN berkelas ${fokus}${R}`);
  for (const [ke, n] of r.tujuan) {
    const w = ke === 'LULUS' ? H : ke === fokus ? A : K;
    console.log(`  ${w}${String(n).padStart(3)} → ${ke}${R}${ke === fokus ? `${A} (tidak berubah)${R}` : ''}`);
  }
  console.log(`\n  ${r.sembuh > 0 ? H : M}SEMBUH jadi LULUS: ${r.sembuh} dari ${r.n}${R}`);
  console.log(`  ${r.masukBaru > 0 ? M : A}MASUK BARU ke ${fokus}: ${r.masukBaru} soal yang tadinya bukan${R}`);
  console.log(`\n${A}  Persentase per kelas menyembunyikan dua angka terakhir: sepuluh sembuh dan`);
  console.log(`  sepuluh rusak terbaca sama dengan tidak terjadi apa-apa.${R}\n`);

  const berubah = pindah.filter((p) => p.berubah);
  console.log(`${B}## ${berubah.length} soal berpindah kelas${R}`);
  for (const p of berubah.slice(0, 14)) {
    console.log(`  ${A}${p.id.padEnd(7)}${p.jenis.padEnd(15)}${R}${p.dari} ${A}→${R} ${p.ke === 'LULUS' ? H : K}${p.ke}${R}`);
    console.log(`    ${A}${p.q.slice(0, 74)}${R}`);
  }
  if (berubah.length > 14) console.log(`  ${A}… ${berubah.length - 14} lagi${R}`);
  console.log('');
}
