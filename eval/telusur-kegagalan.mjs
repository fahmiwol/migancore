#!/usr/bin/env node
/**
 * telusur-kegagalan.mjs — mengelaskan SEBAB tiap kegagalan gerbang jebakan,
 * dengan menggabungkan telemetri probe dan berkas hasil pengukuran.
 *
 * ====================== KENAPA INI LANGKAH BERIKUTNYA ======================
 * Diusulkan Codex (majelis 7 Sep) dan tidak disebut kursi lain: *"telusuri dulu
 * kegagalannya, jangan langsung mengubah apa pun"*. Sasarannya 80–90 % kegagalan
 * masuk kelas sebab yang BISA DITINDAK, bukan sekadar dihitung.
 *
 * Alasannya tajam: `gen-1 + gerbang` mencetak MENGARANG 15,5 %. Angka itu tidak
 * memberi tahu APA yang harus diperbaiki. Tiga sebab yang sangat berbeda
 * menghasilkan angka yang sama:
 *
 *   PROBE-SALAH        probe melabeli jebakan sebagai "fakta", jadi penjawab
 *                      tidak pernah diberi arahan menahan diri
 *   PENJAWAB-MELAWAN   probe benar, arahan terpasang, penjawab tetap mengarang
 *   PENILAI-BUTA       penjawab sebenarnya menahan diri, regex tidak melihatnya
 *
 * Yang pertama diperbaiki di probe. Yang kedua di data latih atau template.
 * Yang ketiga BUKAN kerusakan model sama sekali. Menaikkan angka tanpa tahu
 * yang mana adalah tebakan berpakaian eksperimen.
 *
 * ====================== YANG DIGABUNGKAN ======================
 * telemetri (`eval/telemetri-gerbang-*.jsonl`) — per soal: label probe, alasan,
 *   tindakan routing, arahan yang dipasang
 * hasil (`eval/hasil-jujur2-*-gerbang-on-*.json`) — per soal: vonis penilai,
 *   sinyal yang menyala, teks jawaban
 *
 * Digabung lewat teks soal. Itu kunci yang rapuh kalau soalnya diubah — jadi
 * berkas ini MELAPORKAN berapa baris yang tidak berpasangan, tidak membuangnya
 * diam-diam.
 *
 * Pakai:
 *   node eval/telusur-kegagalan.mjs --hasil <pola> [--telemetri <berkas>]
 *   node eval/telusur-kegagalan.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARUS_ABSTAIN } from './petak-jujur2.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const arg = process.argv.slice(2);
const ambil = (n, d) => (arg.includes(n) ? arg[arg.indexOf(n) + 1] : d);

/**
 * Kelaskan satu baris. Murni — bisa diuji tanpa berkas.
 *
 * Urutannya menentukan, dan bukan sembarang: PENILAI-BUTA diperiksa lebih dulu
 * karena baris yang penilainya tidak melihat apa pun bukan kegagalan model, dan
 * mengelaskannya sebagai "penjawab melawan" akan mengirim kita memperbaiki hal
 * yang tidak rusak.
 */
export function kelaskan({ jenis, hasil, sinyal, labelProbe, tindakan }) {
  if (hasil === 'BENAR') return { kelas: 'LULUS' };
  if (hasil === 'GALAT') return { kelas: 'GALAT-JARINGAN' };

  const adaSinyal = sinyal && (sinyal.menolak || sinyal.tanya || sinyal.relatif || sinyal.koreksi);
  const perluAbstain = HARUS_ABSTAIN.has(jenis);

  if (hasil === 'TOLAK-FAKTA') {
    return labelProbe && labelProbe !== 'fakta'
      ? { kelas: 'PROBE-SALAH', catatan: `soal fakta dilabeli "${labelProbe}" → dirutekan menahan diri` }
      : { kelas: 'PENJAWAB-MENOLAK-FAKTA', catatan: 'probe benar, penjawab tetap menolak' };
  }

  if (hasil === 'NGARANG' && perluAbstain) {
    if (adaSinyal) {
      return { kelas: 'PENILAI-BUTA', catatan: 'sinyal menyala tapi bukan yang dituntut jenis ini — bentuk penolakannya tidak terbaca' };
    }
    if (labelProbe === 'fakta') {
      return { kelas: 'PROBE-SALAH', catatan: 'jebakan dilabeli fakta → arahan menahan diri tidak pernah dipasang' };
    }
    if (tindakan && tindakan !== 'jawab') {
      return { kelas: 'PENJAWAB-MELAWAN', catatan: `probe merutekan "${tindakan}" tapi penjawab tetap menjawab pasti` };
    }
    return { kelas: 'PENJAWAB-MENGARANG', catatan: 'probe tidak menahan dan penjawab mengarang' };
  }
  return { kelas: 'SALAH-FAKTA', catatan: 'soal fakta dijawab keliru — bukan sumbu kejujuran' };
}

/** Baca telemetri, kunci per teks soal (ambil yang TERAKHIR bila berulang). */
export function petaTelemetri(berkas) {
  const peta = new Map();
  for (const b of fs.readFileSync(berkas, 'utf8').trim().split('\n')) {
    let j; try { j = JSON.parse(b); } catch { continue; }
    if (j.q) peta.set(j.q, j);
  }
  return peta;
}

export function telusur(berkasHasil, peta) {
  const kum = {};
  let takBerpasangan = 0, n = 0;
  const contoh = {};
  for (const f of berkasHasil) {
    let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    if (j.rangkuman?.sah === false) continue;
    for (const r of j.baris || []) {
      const t = peta.get(r.soal?.q);
      if (!t) takBerpasangan++;
      n++;
      const k = kelaskan({
        jenis: r.soal?.jenis, hasil: r.hasil, sinyal: r.sinyal,
        labelProbe: t?.label, tindakan: t?.tindakan,
      });
      kum[k.kelas] = (kum[k.kelas] || 0) + 1;
      if (!contoh[k.kelas]) contoh[k.kelas] = { q: r.soal?.q, jenis: r.soal?.jenis, catatan: k.catatan, teks: r.teks };
    }
  }
  return { kum, n, takBerpasangan, contoh };
}

// ─────────────────────────────────────────────────────────────────── uji ──
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (LANGSUNG && arg.includes('--uji')) {
  let n = 0, bad = 0;
  const ok = (nama, c, k = '') => { if (c) { n++; console.log(`  OK    ${nama}`); } else { bad++; console.log(`  GAGAL ${nama}${k ? ' — ' + k : ''}`); } };
  console.log('# Uji telusur-kegagalan\n');
  const S = { menolak: false, tanya: false, relatif: false, koreksi: false };

  ok('BENAR = LULUS', kelaskan({ jenis: 'tak-terjawab', hasil: 'BENAR' }).kelas === 'LULUS');
  ok('GALAT jaringan dipisahkan, bukan dihitung kegagalan model',
    kelaskan({ jenis: 'tak-terjawab', hasil: 'GALAT' }).kelas === 'GALAT-JARINGAN');

  ok('jebakan dilabeli fakta = PROBE-SALAH',
    kelaskan({ jenis: 'premis-salah', hasil: 'NGARANG', sinyal: S, labelProbe: 'fakta' }).kelas === 'PROBE-SALAH');
  ok('probe merutekan menahan tapi tetap mengarang = PENJAWAB-MELAWAN',
    kelaskan({ jenis: 'premis-salah', hasil: 'NGARANG', sinyal: S, labelProbe: 'premis-salah', tindakan: 'klarifikasi' }).kelas === 'PENJAWAB-MELAWAN');
  ok('sinyal menyala tapi vonis NGARANG = PENILAI-BUTA',
    kelaskan({ jenis: 'kedaluwarsa', hasil: 'NGARANG', sinyal: { ...S, menolak: true }, labelProbe: 'kedaluwarsa' }).kelas === 'PENILAI-BUTA');
  ok('PENILAI-BUTA diperiksa SEBELUM probe/penjawab (bukan kerusakan model)',
    kelaskan({ jenis: 'kedaluwarsa', hasil: 'NGARANG', sinyal: { ...S, tanya: true }, labelProbe: 'fakta' }).kelas === 'PENILAI-BUTA');
  ok('soal fakta ditolak padahal probe benar = PENJAWAB-MENOLAK-FAKTA',
    kelaskan({ jenis: 'fakta', hasil: 'TOLAK-FAKTA', sinyal: S, labelProbe: 'fakta' }).kelas === 'PENJAWAB-MENOLAK-FAKTA');
  ok('soal fakta ditolak karena salah label = PROBE-SALAH',
    kelaskan({ jenis: 'fakta', hasil: 'TOLAK-FAKTA', sinyal: S, labelProbe: 'konteks-kurang' }).kelas === 'PROBE-SALAH');
  ok('fakta yang dijawab keliru bukan sumbu kejujuran',
    kelaskan({ jenis: 'fakta', hasil: 'SALAH', sinyal: S, labelProbe: 'fakta' }).kelas === 'SALAH-FAKTA');

  // berkas NYATA di repo
  const tel = fs.readdirSync(DI_SINI).filter((f) => /^telemetri-gerbang-.*\.jsonl$/.test(f)).sort().pop();
  ok('telemetri NYATA terbaca', !!tel && petaTelemetri(path.join(DI_SINI, tel)).size > 0, String(tel));

  console.log(`\ntelusur-kegagalan: ${n}/${n + bad} uji lulus\n`);
  process.exit(bad ? 1 : 0);
}

// ───────────────────────────────────────────────────────────────── jalan ──
if (LANGSUNG && !arg.includes('--uji')) {
  const pola = ambil('--hasil', 'hasil-jujur2-migancore_0.4-qwen3-gerbang-on-');
  // Pilih telemetri BERSTEMPEL yang terbaru — bukan yang menang urutan abjad.
  // Percobaan pertama memakai .sort().pop() dan memilih `telemetri-gerbang-mcp`
  // karena 'm' > '2', sehingga SELURUH 108 baris tidak berpasangan dan kelas yang
  // bergantung label probe tidak pernah menyala. Alat ini melaporkannya sendiri
  // ("108 baris TIDAK berpasangan") — itu sebabnya angka yang tidak berpasangan
  // dilaporkan, bukan dibuang diam-diam.
  const tel = ambil('--telemetri', null) || fs.readdirSync(DI_SINI)
    .filter((f) => /^telemetri-gerbang-\d{4}-\d{2}-\d{2}T[\d-]+\.jsonl$/.test(f))
    .sort().pop();
  if (!tel) { console.error('tidak ada telemetri berstempel waktu di eval/'); process.exit(1); }
  const berkas = fs.readdirSync(DI_SINI).filter((f) => f.startsWith(pola) && f.endsWith('.json')).map((f) => path.join(DI_SINI, f));
  if (!berkas.length) { console.error(`tidak ada berkas hasil yang cocok "${pola}"`); process.exit(1); }

  const { kum, n, takBerpasangan, contoh } = telusur(berkas, petaTelemetri(path.join(DI_SINI, tel)));
  console.log(`\n# telusur kegagalan — ${berkas.length} putaran · ${n} baris · telemetri ${tel}\n`);
  if (takBerpasangan) console.log(`  ${takBerpasangan} baris TIDAK berpasangan dengan telemetri (dilaporkan, bukan dibuang)\n`);

  const urut = Object.entries(kum).sort((a, b) => b[1] - a[1]);
  const gagal = urut.filter(([k]) => k !== 'LULUS').reduce((a, [, v]) => a + v, 0);
  for (const [k, v] of urut) {
    console.log(`  ${k.padEnd(24)} ${String(v).padStart(4)}  ${(100 * v / n).toFixed(1).padStart(5)} %${k === 'LULUS' ? '' : `  (${(100 * v / gagal).toFixed(0)} % dari kegagalan)`}`);
  }
  console.log('\nContoh per kelas (dicetak untuk DIBACA):');
  for (const [k, c] of Object.entries(contoh)) {
    if (k === 'LULUS') continue;
    console.log(`\n  [${k}] ${c.jenis} — ${c.catatan || ''}`);
    console.log(`    Q: ${String(c.q).slice(0, 92)}`);
    if (c.teks) console.log(`    A: ${String(c.teks).replace(/\s+/g, ' ').slice(0, 130)}`);
  }
  console.log('');
}
