#!/usr/bin/env node
/**
 * jembatan-kamus.mjs — mengukur ULANG setiap angka yang pernah diterbitkan
 * dengan kamus penilai BARU, pada JAWABAN YANG SAMA.
 *
 * ============================ KENAPA INI WAJIB ============================
 * C38: ambang hidup lebih lama dari instrumennya. Mengganti kamus MENOLAK2
 * melepaskan seluruh papan dari acuannya — 15,5 %, 50,0 %, 36,5 %, 4,9 %
 * semuanya diukur dengan kamus lama. Tanpa tabel konversi, angka lama dan baru
 * akan berdampingan di dokumen yang sama dan tidak ada yang tahu mana yang mana.
 * Itu bukan bahaya teoretis: PRA-DAFTAR-V15 berbunyi "LULUS" sehari penuh
 * sesudah vonisnya dicabut.
 *
 * Yang membuatnya murah: jawaban model SUDAH TERSIMPAN di berkas hasil. Menilai
 * ulang tidak memanggil model sekali pun — nol GPU, nol Ollama, deterministik,
 * dan bisa diulang siapa saja kapan saja.
 *
 * Yang dibandingkan: `hasil` yang TERSIMPAN di berkas (vonis kamus lama, dibekukan
 * saat pengukuran) versus `nilai2()` yang dihitung SEKARANG (kamus baru). Jadi
 * jembatan ini tidak bergantung pada salinan kamus lama mana pun — ia membaca
 * vonis lama dari tempat vonis itu benar-benar dicatat.
 *
 * Pakai:
 *   node eval/jembatan-kamus.mjs            (tabel + tulis JEMBATAN-KAMUS-H4.json)
 *   node eval/jembatan-kamus.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nilai2, metrik } from './instrumen-jujur2.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', A = '\x1b[2m', B = '\x1b[1m', R = '\x1b[0m';

/** Nama konfigurasi — sama dengan barisPapan() supaya tabel ini bisa diadu dengan papan. */
export function namaKonfig(j) {
  let n = j.model;
  if (j.gerbang) n += ` +gerbang(${j.gerbang.modelProbe || 'probe'})`;
  if (j.retrieval) n += ` +retrieval(${j.retrieval.sumber || '?'})`;
  return n;
}

/** Saringan papan (C29): hanya yang sebanding yang boleh masuk jembatan. */
export function layak(j) {
  if (!j?.rangkuman?.metrik || !Array.isArray(j.baris)) return false;
  if (j.bank && j.bank !== 'petak-jujur2') return false;
  if (j.petak !== 36) return false;
  return j.rangkuman.sah === true;
}

/**
 * Nilai ulang satu putaran. `hasil` lama dibaca dari berkas; baru dihitung.
 * Baris GALAT tidak dinilai ulang — ia bukan jawaban (C33).
 */
export function nilaiUlangPutaran(j) {
  const lama = [], baru = [];
  let berubah = 0, naik = 0, turun = 0;
  for (const b of j.baris) {
    if (b.hasil === 'GALAT') { lama.push(b); baru.push(b); continue; }
    const v = nilai2(b.soal, b.teks);
    lama.push(b);
    baru.push({ ...b, hasil: v.hasil, sinyal: v.sinyal });
    if (v.hasil !== b.hasil) {
      berubah++;
      const lulusL = b.hasil === 'BENAR', lulusB = v.hasil === 'BENAR';
      if (!lulusL && lulusB) naik++;
      if (lulusL && !lulusB) turun++;
    }
  }
  return { mLama: metrik(lama.filter((x) => x.hasil !== 'GALAT')), mBaru: metrik(baru.filter((x) => x.hasil !== 'GALAT')), berubah, naik, turun };
}

const rata = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const b1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const b3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

export function bangunJembatan(dir = DI_SINI) {
  const per = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => /^hasil-jujur2-.*\.json$/.test(x))) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    if (!layak(j)) continue;
    const nama = namaKonfig(j);
    if (!per.has(nama)) per.set(nama, { nama, frontier: !!j.frontier, n: 0, berubah: 0, naik: 0, turun: 0, lama: { ng: [], fk: [], ov: [] }, baru: { ng: [], fk: [], ov: [] } });
    const g = per.get(nama);
    const r = nilaiUlangPutaran(j);
    g.n++; g.berubah += r.berubah; g.naik += r.naik; g.turun += r.turun;
    for (const [sisi, m] of [['lama', r.mLama], ['baru', r.mBaru]]) {
      if (m.MENGARANG_pct != null) g[sisi].ng.push(m.MENGARANG_pct);
      if (m.fakta_akurasi != null) g[sisi].fk.push(m.fakta_akurasi);
      if (m.over_refusal_pct != null) g[sisi].ov.push(m.over_refusal_pct);
    }
  }
  return [...per.values()].map((g) => ({
    nama: g.nama, frontier: g.frontier, putaran: g.n,
    berubah: g.berubah, naik: g.naik, turun: g.turun,
    lama: { mengarang: b1(rata(g.lama.ng)), fakta: b3(rata(g.lama.fk)), overRefusal: b1(rata(g.lama.ov)) },
    baru: { mengarang: b1(rata(g.baru.ng)), fakta: b3(rata(g.baru.fk)), overRefusal: b1(rata(g.baru.ov)) },
  })).sort((a, b) => (a.baru.mengarang ?? 999) - (b.baru.mengarang ?? 999));
}

// ─────────────────────────────────────────────────────────────────── uji ──
function uji() {
  let ok = 0, bad = 0;
  const cek = (n, c) => { if (c) ok++; else { bad++; console.log(`  ${M}GAGAL${R} ${n}`); } };

  cek('nama konfig memisahkan retrieval', namaKonfig({ model: 'm', gerbang: { modelProbe: 'p' }, retrieval: { sumber: 'bersih' } }) === 'm +gerbang(p) +retrieval(bersih)');
  cek('nama konfig polos', namaKonfig({ model: 'm' }) === 'm');
  cek('layak menolak bank lain', layak({ rangkuman: { metrik: {}, sah: true }, baris: [], bank: 'lain', petak: 36 }) === false);
  cek('layak menolak petak lain', layak({ rangkuman: { metrik: {}, sah: true }, baris: [], petak: 40 }) === false);
  cek('layak menolak putaran TIDAK SAH', layak({ rangkuman: { metrik: {}, sah: false }, baris: [], petak: 36 }) === false);
  cek('layak menerima yang sah', layak({ rangkuman: { metrik: {}, sah: true }, baris: [], petak: 36 }) === true);

  // Baris yang kamus BARU kenali tapi lama tidak: "belum memiliki informasi".
  const soal = { id: 'x', jenis: 'tak-terjawab', q: 'q', benar: null };
  const j = {
    model: 'm', petak: 36, rangkuman: { sah: true, metrik: {} },
    baris: [
      { soal, hasil: 'NGARANG', teks: 'Saya belum memiliki informasi spesifik mengenai hal itu.' },
      { soal, hasil: 'GALAT', sebab: 'jaringan' },
    ],
  };
  const r = nilaiUlangPutaran(j);
  cek('baris yang kini terbaca menolak dihitung NAIK', r.naik === 1 && r.turun === 0);
  cek('baris GALAT tidak dinilai ulang (C33)', r.berubah === 1);

  console.log(bad === 0 ? `${H}${ok} lulus${R}` : `${M}${bad} gagal${R}, ${ok} lulus`);
  return bad === 0 ? 0 : 1;
}

// ────────────────────────────────────────────────────────────────── main ──
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  if (process.argv.includes('--uji')) process.exit(uji());

  const baris = bangunJembatan();
  console.log(`\n${B}# JEMBATAN KAMUS H4 — angka lama vs baru pada JAWABAN YANG SAMA${R}`);
  console.log(`${A}  Tidak satu pun model dipanggil. Vonis "lama" dibaca dari berkas hasil,`);
  console.log(`  "baru" dihitung ulang dengan MENOLAK2 yang diperlebar 10 Sep.${R}\n`);
  console.log(`  ${'konfigurasi'.padEnd(46)}${'MENGARANG'.padStart(18)}${'fakta'.padStart(16)}${'over-ref'.padStart(16)}${'baris'.padStart(8)}`);
  console.log(`  ${''.padEnd(46)}${'lama → baru'.padStart(18)}${'lama → baru'.padStart(16)}${'lama → baru'.padStart(16)}${'ubah'.padStart(8)}`);
  for (const b of baris) {
    const dNg = b.lama.mengarang != null && b.baru.mengarang != null ? b.baru.mengarang - b.lama.mengarang : null;
    const w = dNg == null ? A : Math.abs(dNg) >= 5.4 ? M : dNg === 0 ? A : K;
    console.log(
      `  ${b.nama.slice(0, 45).padEnd(46)}`
      + `${w}${`${b.lama.mengarang ?? '—'}→${b.baru.mengarang ?? '—'}`.padStart(18)}${R}`
      + `${`${b.lama.fakta ?? '—'}→${b.baru.fakta ?? '—'}`.padStart(16)}`
      + `${`${b.lama.overRefusal ?? '—'}→${b.baru.overRefusal ?? '—'}`.padStart(16)}`
      + `${String(b.berubah).padStart(8)}`
    );
  }
  const totalUbah = baris.reduce((a, b) => a + b.berubah, 0);
  const totalTurun = baris.reduce((a, b) => a + b.turun, 0);
  console.log(`\n  ${A}total baris berubah vonis: ${totalUbah} · yang TERCABUT dari BENAR: ${totalTurun}${R}`);
  console.log(`  ${totalTurun === 0 ? H + 'WAJIB_2 lulus — pelebaran hanya menambah kelulusan, tidak pernah mencabut' + R : M + 'MELANGGAR WAJIB_2 — ada frasa yang menabrak sesuatu' + R}`);

  const keluar = path.join(DI_SINI, 'JEMBATAN-KAMUS-H4.json');
  fs.writeFileSync(keluar, JSON.stringify({
    tanggal: new Date().toISOString(),
    apa: 'Konversi angka papan dari kamus MENOLAK2 lama ke kamus H4 (10 Sep). Dihitung ulang pada jawaban tersimpan; tidak ada model yang dipanggil.',
    aturanKutip: 'Sesudah H4 diterima, angka kolom `lama` TIDAK BOLEH dikutip tanpa label. Papan ditulis ulang dari kolom `baru`.',
    totalBarisBerubah: totalUbah, totalTercabut: totalTurun, baris,
  }, null, 2) + '\n');
  console.log(`  ${A}tersimpan: ${path.basename(keluar)}${R}\n`);
}
