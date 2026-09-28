#!/usr/bin/env node
/**
 * analisis-e1b-awalan.mjs — DIAGNOSTIK SESUDAH VONIS (bukan vonis) atas berkas giliran E1/E1b.
 *
 * Pertanyaan: giliran mana yang lambat, dan apa yang membedakannya?
 * Dugaan yang diuji (muncul dari data vonis E1b, TIDAK ada di daftar tersangka pra-daftarnya):
 *   arahan gerbang disisipkan ke pesan SISTEM (`${persona}\n\n${arahan}`). Pesan sistem ada di
 *   paling depan prompt, jadi kalau arahan giliran ini berbeda dari giliran lalu, awalan cache
 *   putus di ujung persona dan SELURUH riwayat diproses ulang.
 *
 * Kelas tiap giliran (dibanding giliran sebelumnya DI PERCAKAPAN YANG SAMA):
 *   awal           — giliran pertama percakapan (tak ada pembanding)
 *   sistem-sama    — string arahan identik (termasuk '' vs '')
 *   sistem-BERUBAH — string arahan berbeda
 * Yang dibandingkan adalah STRING arahan, bukan nama tindakan: 'jawab'/fakta dan 'jawab'/null
 * sama-sama '' (sistem tidak berubah); abstain/tak-terjawab dan abstain/premis-salah berbeda.
 *
 * Pakai: node eval/analisis-e1b-awalan.mjs [berkas.jsonl]    ·    node eval/analisis-e1b-awalan.mjs --uji
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const { arahan } = await import(pathToFileURL(path.join(DI_SINI, '..', 'sistem', 'gerbang-jebakan.mjs')).href);

export function persentil(xs, q) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const i = (s.length - 1) * q / 100, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

/** Beri kelas pada tiap baris (urutan berkas = urutan waktu). Tidak mengubah masukan. */
export function beriKelas(baris) {
  let lalu = null;
  return baris.map((b) => {
    const kunci = `${b.sesi}|${b.npc}`;
    const a = arahan(b.tindakan, b.label);
    let kelas, deltaTok = null;
    if (!lalu || lalu.kunci !== kunci) kelas = 'awal';
    else {
      kelas = a === lalu.arahan ? 'sistem-sama' : 'sistem-BERUBAH';
      if (Number.isFinite(b.tokPrompt) && Number.isFinite(lalu.tokPrompt)) deltaTok = b.tokPrompt - lalu.tokPrompt;
    }
    // Giliran galat tidak masuk riwayat (harness), jadi tidak menjadi pembanding berikutnya.
    if (!b.galat) lalu = { kunci, arahan: a, tokPrompt: b.tokPrompt };
    return { ...b, arahanTeks: a, kelas, deltaTok };
  });
}

export function ringkas(berkelas, batasLambatMs = 4000) {
  const kelas = {};
  for (const k of ['awal', 'sistem-sama', 'sistem-BERUBAH']) {
    const bk = berkelas.filter((b) => b.kelas === k && !b.galat);
    const t = bk.map((b) => b.ttftJawabMs / 1000);
    kelas[k] = {
      n: bk.length,
      ttftP50: persentil(t, 50), ttftP95: persentil(t, 95), ttftMaks: t.length ? Math.max(...t) : null,
      prefillP50: persentil(bk.map((b) => b.promptMs / 1000), 50),
      tokPromptP50: persentil(bk.map((b) => b.tokPrompt), 50),
      // Laju tersirat bila SELURUH prompt diproses ulang (tafsir yang cocok untuk sistem-BERUBAH)
      lajuSeluruhPromptP50: persentil(bk.map((b) => b.tokPrompt / (b.promptMs / 1000)), 50),
    };
  }
  const lambat = berkelas.filter((b) => !b.galat && b.ttftJawabMs > batasLambatMs);
  const perKelasLambat = Object.fromEntries(['awal', 'sistem-sama', 'sistem-BERUBAH'].map((k) => [k, lambat.filter((b) => b.kelas === k).length]));
  const sesi = [...new Set(berkelas.map((b) => b.sesi))].sort((a, b) => a - b).map((s) => {
    const bs = berkelas.filter((b) => b.sesi === s && !b.galat);
    return {
      sesi: s, n: bs.length,
      berubah: bs.filter((b) => b.kelas === 'sistem-BERUBAH').length,
      cepat_le2dtk: bs.filter((b) => b.ttftJawabMs <= 2000).length,
      ttftP50: persentil(bs.map((b) => b.ttftJawabMs / 1000), 50),
      ttftP95: persentil(bs.map((b) => b.ttftJawabMs / 1000), 95),
    };
  });
  return { n: berkelas.length, kelas, lambat: { batasDtk: batasLambatMs / 1000, n: lambat.length, perKelas: perKelasLambat }, sesi };
}

function uji() {
  let gagal = 0;
  const cek = (nama, ok) => { console.log(`${ok ? '✓' : '✗'} ${nama}`); if (!ok) gagal++; };
  const g = (sesi, npc, tindakan, label, extra = {}) => ({ sesi, npc, tindakan, label, ttftJawabMs: 500, promptMs: 400, tokPrompt: 300, ...extra });
  const k = beriKelas([
    g(1, 'a', 'jawab', null),            // awal
    g(1, 'a', 'jawab', 'fakta'),         // '' vs '' → sama
    g(1, 'a', 'klarifikasi', 'konteks-kurang'),  // '' → klarifikasi → BERUBAH
    g(1, 'a', 'klarifikasi', 'maksud-kurang'),   // satu string klarifikasi → sama
    g(1, 'a', 'abstain', 'tak-terjawab'),        // BERUBAH
    g(1, 'a', 'abstain', 'premis-salah'),        // string abstain lain → BERUBAH
    g(1, 'b', 'abstain', 'premis-salah'),        // percakapan baru → awal, walau arahan sama
    g(2, 'b', 'abstain', 'premis-salah'),        // sesi baru, NPC sama → awal
  ]).map((b) => b.kelas);
  cek('giliran pertama = awal', k[0] === 'awal');
  cek("jawab/null lalu jawab/fakta = sistem-sama (dua-duanya '')", k[1] === 'sistem-sama');
  cek('jawab → klarifikasi = sistem-BERUBAH', k[2] === 'sistem-BERUBAH');
  cek('klarifikasi dua label = sistem-sama (satu string arahan)', k[3] === 'sistem-sama');
  cek('klarifikasi → abstain = sistem-BERUBAH', k[4] === 'sistem-BERUBAH');
  cek('abstain tak-terjawab → abstain premis-salah = sistem-BERUBAH (string beda)', k[5] === 'sistem-BERUBAH');
  cek('NPC baru = awal walau arahannya sama dengan giliran terakhir NPC lain', k[6] === 'awal');
  cek('sesi baru, NPC sama = awal', k[7] === 'awal');
  // Giliran galat tidak menjadi pembanding (harness tidak memasukkannya ke riwayat).
  const kg = beriKelas([g(1, 'a', 'jawab', null), g(1, 'a', 'abstain', 'tak-terjawab', { galat: 'x' }), g(1, 'a', 'jawab', 'fakta')]).map((b) => b.kelas);
  cek('giliran galat dilewati sebagai pembanding', kg[2] === 'sistem-sama');
  // Ringkasan menghitung lambat per kelas dengan benar.
  const r = ringkas(beriKelas([g(1, 'a', 'jawab', null), g(1, 'a', 'abstain', 'tak-terjawab', { ttftJawabMs: 9000 }), g(1, 'a', 'abstain', 'tak-terjawab', { ttftJawabMs: 800 })]));
  cek('lambat terhitung di kelas yang benar', r.lambat.n === 1 && r.lambat.perKelas['sistem-BERUBAH'] === 1 && r.lambat.perKelas['sistem-sama'] === 0);
  cek('persentil interpolasi linear', persentil([1, 2, 3, 4], 50) === 2.5 && persentil([5], 95) === 5);
  console.log(gagal ? `\n${gagal} uji GAGAL` : '\nsemua uji lulus');
  process.exit(gagal ? 1 : 0);
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  if (process.argv.includes('--uji')) uji();
  const berkas = process.argv[2] || path.join(DI_SINI, 'e1b-riwayat-2026-09-23T02-29-27.jsonl');
  const baris = fs.readFileSync(berkas, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const r = ringkas(beriKelas(baris));
  const f = (x) => (x == null ? '  -  ' : x.toFixed(2).padStart(5));
  console.log(`\n# DIAGNOSTIK SESUDAH VONIS — ${path.basename(berkas)} · ${r.n} giliran\n`);
  console.log('kelas            n  | TTFT p50   p95   maks | prefill p50 | tokPrompt p50 | laju-seluruh-prompt p50');
  for (const [k, v] of Object.entries(r.kelas)) {
    console.log(`${k.padEnd(15)} ${String(v.n).padStart(3)} | ${f(v.ttftP50)} ${f(v.ttftP95)} ${f(v.ttftMaks)} |    ${f(v.prefillP50)}    |     ${String(Math.round(v.tokPromptP50 ?? 0)).padStart(4)}      |   ${f(v.lajuSeluruhPromptP50)} tok/dtk`);
  }
  console.log(`\ngiliran TTFT > ${r.lambat.batasDtk} dtk: ${r.lambat.n} — ${Object.entries(r.lambat.perKelas).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log('\nper sesi (p50 sesi duduk di tepi distribusi dua-puncak → peka pada jumlah giliran cepat):');
  for (const s of r.sesi) console.log(`  sesi ${s.sesi}: sistem-BERUBAH ${s.berubah}/${s.n} · cepat (≤ 2 dtk) ${s.cepat_le2dtk}/${s.n} · p50 ${f(s.ttftP50)} · p95 ${f(s.ttftP95)}`);
}
