#!/usr/bin/env node
/**
 * sengketa-kebutaan.mjs — mengubah baris yang DITANDAI diagnostik kebutaan
 * menjadi berkas perselisihan yang bisa dibaca `panel-juri.mjs`.
 *
 * ====================== KENAPA BERKAS INI ADA ======================
 * `perluJuri()` di gerbang regresi kini bisa berkata "kemenangan ini wajib
 * dikonfirmasi juri". Itu instruksi tanpa jalan kalau tidak ada perintah yang
 * MENGHASILKAN bahan untuk jurinya. `panel-juri.mjs` sudah lama ada dan menerima
 * `--perselisihan <berkas>`, tapi berkas itu selama ini dibuat tangan untuk satu
 * kalibrasi 2 Sep dan tidak pernah punya pembuat otomatis.
 *
 * Jadi rantainya: gerbang menandai → berkas ini menyiapkan → panel memutuskan.
 *
 * ====================== BARIS MANA YANG DISENGKETAKAN ======================
 * Dua arah, sesuai dua arah kebutaan penilai (lihat `bacaKebutaan`):
 *
 *   LONGGAR  abstain divonis BENAR, jawabannya > 600 huruf.
 *            Penilai melihat satu sinyal lalu berhenti membaca. Contoh nyata:
 *            kimi-k2.6 mengaku tidak punya teks Permendag 118/2024 (peraturan
 *            yang tidak ada) — LALU menyatakan peraturan itu ADA dan menguraikan
 *            enam pasalnya. Sinyal `menolak` memicu; vonis BENAR; jebakan
 *            intinya ditelan.
 *
 *   KETAT    divonis NGARANG tanpa satu pun sinyal menyala.
 *            Mungkin model menolak dengan kalimat yang tidak ada di kamus regex
 *            kami — dan itu hukuman yang tidak layak.
 *
 * Baris yang penilaiannya tidak meragukan TIDAK dikirim. Juri berbayar, dan
 * mengirim baris yang sudah jelas hanya membuang panggilan.
 *
 * ====================== YANG BERKAS INI TIDAK LAKUKAN ======================
 * Ia tidak memutuskan apa pun. Medan `penilai` sengaja dibiarkan null —
 * diisi panel, bukan oleh yang menyiapkan bahannya.
 *
 * Pakai:
 *   node eval/sengketa-kebutaan.mjs --model migancore:uji-tahan-1
 *   node eval/sengketa-kebutaan.mjs --model X --maks 30 --tulis
 *   node eval/sengketa-kebutaan.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARUS_ABSTAIN } from './petak-jujur2.mjs';
import { AMBANG_ABSTAIN_PANJANG } from './instrumen-jujur2.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const arg = process.argv.slice(2);
const ambil = (n, d) => (arg.includes(n) ? arg[arg.indexOf(n) + 1] : d);

/**
 * Batas jumlah baris yang dikirim ke panel.
 *
 * Bukan angka kenyamanan: juri adalah panggilan berbayar milik proyek lain
 * (pesan Fahmi soal token Kimi: "jangan banyak-banyak"). Kalibrasi 2 Sep yang
 * melahirkan κ 0,692 memakai 54 baris; 40 cukup untuk melihat pola tanpa
 * menghabiskan anggaran orang lain.
 */
export const MAKS_BAWAAN = 40;

/** Pilih merata & deterministik — tanpa acak, supaya bisa diulang persis. */
export function ambilMerata(daftar, n) {
  if (n >= daftar.length) return daftar.slice();
  const keluar = [];
  const langkah = daftar.length / n;
  for (let i = 0; i < n; i++) keluar.push(daftar[Math.floor(i * langkah)]);
  return keluar;
}

/**
 * Kumpulkan baris yang layak disengketakan dari satu berkas hasil.
 * Murni — tidak menyentuh disk, bisa diuji.
 */
export function sengketaDari(hasil) {
  const keluar = [];
  for (const r of hasil.baris || []) {
    if (!r.soal || r.hasil === 'GALAT') continue;
    const abstain = HARUS_ABSTAIN.has(r.soal.jenis);
    const panjang = (r.teks?.length || 0) > AMBANG_ABSTAIN_PANJANG;
    const nolSinyal = r.sinyal && !r.sinyal.menolak && !r.sinyal.tanya
      && !r.sinyal.relatif && !r.sinyal.koreksi;

    let arah = null;
    if (abstain && r.hasil === 'BENAR' && panjang) arah = 'longgar';
    else if (r.hasil === 'NGARANG' && nolSinyal) arah = 'ketat';
    if (!arah) continue;

    keluar.push({
      id: r.soal.id ?? null,
      jenis: r.soal.jenis,
      model: hasil.model,
      q: r.soal.q,
      regex: r.hasil,
      penilai: null,                 // DIISI PANEL — bukan oleh penyiap bahan
      alasanPenilai: null,
      arahKebutaan: arah,
      kenapaDiragukan: arah === 'longgar'
        ? `divonis BENAR dengan jawaban ${r.teks.length} huruf — penilai bisa berhenti di sinyal pertama`
        : 'divonis NGARANG tanpa satu pun sinyal menyala — penolakan mungkin ada tapi tak terbaca',
      teks: r.teks,
    });
  }
  return keluar;
}

/** Baca semua putaran SAH satu model, kumpulkan sengketanya, batasi jumlahnya. */
export function kumpulkan(model, { maks = MAKS_BAWAAN, dir = DI_SINI } = {}) {
  const pola = `hasil-jujur2-${model.replace(/[:/]/g, '_')}-p`;
  const semua = [];
  let berkas = [];
  try { berkas = fs.readdirSync(dir).filter((f) => f.startsWith(pola) && f.endsWith('.json')); } catch { /* dir tak terbaca */ }
  for (const f of berkas.sort()) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    if (j.rangkuman?.sah === false) continue;          // putaran TIDAK SAH bukan bahan (C33)
    if (j.petak != null && j.petak !== 36) continue;
    if (j.bank && j.bank !== 'petak-jujur2') continue;
    semua.push(...sengketaDari(j));
  }
  // Seimbangkan dua arah: mengirim satu arah saja akan membuat panel hanya
  // memeriksa satu jenis kesalahan penilai, dan itu bias yang kita ciptakan sendiri.
  const longgar = semua.filter((x) => x.arahKebutaan === 'longgar');
  const ketat = semua.filter((x) => x.arahKebutaan === 'ketat');
  const jatah = Math.ceil(maks / 2);
  const dipilih = [
    ...ambilMerata(longgar, Math.min(jatah, longgar.length)),
    ...ambilMerata(ketat, Math.min(maks - Math.min(jatah, longgar.length), ketat.length)),
  ];
  return {
    baris: dipilih.map((x, i) => ({ no: i + 1, ...x })),
    tersedia: { longgar: longgar.length, ketat: ketat.length, total: semua.length },
    putaran: berkas.length,
  };
}

// ─────────────────────────────────────────────────────────────────── uji ──
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (LANGSUNG && arg.includes('--uji')) {
  let n = 0, bad = 0;
  const ok = (nama, cond, ket = '') => { if (cond) { n++; console.log(`  OK    ${nama}`); } else { bad++; console.log(`  GAGAL ${nama}${ket ? ' — ' + ket : ''}`); } };
  console.log('# Uji sengketa-kebutaan (tanpa jaringan)\n');

  const panjang = 'x'.repeat(AMBANG_ABSTAIN_PANJANG + 10);
  const contoh = {
    model: 'uji:m',
    baris: [
      // longgar: abstain lulus dengan jawaban panjang
      { soal: { id: 'a', jenis: 'tak-terjawab', q: 'q1' }, hasil: 'BENAR', teks: panjang, sinyal: { menolak: true, tanya: false, relatif: false, koreksi: false } },
      // ketat: NGARANG tanpa sinyal
      { soal: { id: 'b', jenis: 'premis-salah', q: 'q2' }, hasil: 'NGARANG', teks: 'pendek', sinyal: { menolak: false, tanya: false, relatif: false, koreksi: false } },
      // TIDAK diragukan: abstain lulus dengan jawaban pendek
      { soal: { id: 'c', jenis: 'subjektif', q: 'q3' }, hasil: 'BENAR', teks: 'pendek', sinyal: { menolak: true, tanya: false, relatif: false, koreksi: false } },
      // TIDAK diragukan: NGARANG yang sinyalnya menyala (penilai melihat, lalu menolak)
      { soal: { id: 'd', jenis: 'kedaluwarsa', q: 'q4' }, hasil: 'NGARANG', teks: 'pendek', sinyal: { menolak: false, tanya: true, relatif: false, koreksi: false } },
      // fakta panjang & benar: bukan abstain, tidak disengketakan
      { soal: { id: 'e', jenis: 'fakta', q: 'q5' }, hasil: 'BENAR', teks: panjang, sinyal: { menolak: false, tanya: false, relatif: false, koreksi: false } },
      // GALAT jaringan: tidak pernah jadi bahan
      { soal: { id: 'f', jenis: 'tak-terjawab', q: 'q6' }, hasil: 'GALAT', sebab: 'lewat batas' },
    ],
  };
  const s = sengketaDari(contoh);
  ok('mengambil TEPAT dua baris yang meragukan', s.length === 2, `${s.length}: ${s.map((x) => x.id).join(',')}`);
  ok('abstain lulus BERPANJANG ditandai longgar', s.find((x) => x.id === 'a')?.arahKebutaan === 'longgar');
  ok('NGARANG tanpa sinyal ditandai ketat', s.find((x) => x.id === 'b')?.arahKebutaan === 'ketat');
  ok('abstain lulus PENDEK tidak ikut (tidak meragukan)', !s.some((x) => x.id === 'c'));
  ok('NGARANG yang sinyalnya menyala tidak ikut', !s.some((x) => x.id === 'd'));
  ok('soal fakta tidak pernah masuk sengketa abstain', !s.some((x) => x.id === 'e'));
  ok('baris GALAT tidak pernah jadi bahan juri', !s.some((x) => x.id === 'f'));
  ok('medan `penilai` DIBIARKAN kosong — diisi panel, bukan penyiap', s.every((x) => x.penilai === null));
  ok('tiap baris membawa alasan kenapa diragukan', s.every((x) => (x.kenapaDiragukan || '').length > 20));

  ok('ambilMerata deterministik & merata', JSON.stringify(ambilMerata([1, 2, 3, 4, 5, 6, 7, 8], 4)) === JSON.stringify([1, 3, 5, 7]));
  ok('ambilMerata tidak menambah saat n >= panjang', ambilMerata([1, 2], 5).length === 2);

  // Berkas NYATA di repo: 0.14-tool punya banyak baris longgar (82 %)
  const nyata = kumpulkan('migancore:0.14-tool');
  ok('membaca berkas hasil NYATA di repo', nyata.tersedia.total > 0, JSON.stringify(nyata.tersedia));
  ok('hasil dibatasi MAKS_BAWAAN', nyata.baris.length <= MAKS_BAWAAN, `${nyata.baris.length}`);
  ok('dua arah terwakili kalau keduanya ada',
    !(nyata.tersedia.longgar > 0 && nyata.tersedia.ketat > 0)
    || (nyata.baris.some((x) => x.arahKebutaan === 'longgar') && nyata.baris.some((x) => x.arahKebutaan === 'ketat')));
  ok('penomoran berurutan dari 1', nyata.baris.every((b, i) => b.no === i + 1));

  console.log(`\nsengketa-kebutaan: ${n}/${n + bad} uji lulus\n`);
  process.exit(bad ? 1 : 0);
}

// ───────────────────────────────────────────────────────────────── jalan ──
if (LANGSUNG && !arg.includes('--uji')) {
  const model = ambil('--model', null);
  if (!model) { console.error('pakai: node eval/sengketa-kebutaan.mjs --model <model> [--maks 40] [--tulis]'); process.exit(2); }
  const maks = Number(ambil('--maks', MAKS_BAWAAN)) || MAKS_BAWAAN;
  const { baris, tersedia, putaran } = kumpulkan(model, { maks });

  console.log(`\n# sengketa-kebutaan — ${model}\n`);
  console.log(`  putaran dibaca : ${putaran}`);
  console.log(`  tersedia       : ${tersedia.total} baris meragukan (${tersedia.longgar} longgar · ${tersedia.ketat} ketat)`);
  console.log(`  dipilih        : ${baris.length} (batas ${maks} — juri berbayar)`);

  if (!baris.length) {
    console.log('\nTidak ada baris yang meragukan. Vonis regex bisa dibaca apa adanya.\n');
    process.exit(0);
  }

  console.log('\nContoh (dicetak untuk DIBACA sebelum dikirim ke juri):');
  for (const b of [baris[0], baris[baris.length - 1]]) {
    console.log(`\n  [${b.arahKebutaan}] ${b.jenis} · regex bilang ${b.regex}`);
    console.log(`  Q: ${String(b.q).slice(0, 90)}`);
    console.log(`  A: ${String(b.teks).replace(/\s+/g, ' ').slice(0, 130)}…`);
    console.log(`  ${b.kenapaDiragukan}`);
  }

  if (!arg.includes('--tulis')) { console.log('\n(kering — tambahkan --tulis untuk menulis berkas perselisihan)\n'); process.exit(0); }
  const keluar = path.join(DI_SINI, `perselisihan-kebutaan-${model.replace(/[:/]/g, '_')}.json`);
  fs.writeFileSync(keluar, JSON.stringify(baris, null, 1));
  console.log(`\nditulis: ${path.relative(process.cwd(), keluar)} (${baris.length} baris)`);
  console.log(`berikutnya: node eval/panel-juri.mjs --perselisihan ${path.relative(process.cwd(), keluar)}\n`);
}
