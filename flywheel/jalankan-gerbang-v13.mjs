#!/usr/bin/env node
/**
 * jalankan-gerbang-v13.mjs — runner kontrak gerbang per-cluster.
 *
 * Metode & alat ikut ter-cluster (arahan Fahmi): tiap cluster punya kontrak
 * gerbangnya sendiri — gerbang yang WAJIB, yang CATATAN, dan pengecualian
 * yang DINYATAKAN SADAR (pola penanda tanpa-pin diterapkan ke gerbang).
 *
 * | Gerbang          | hitung | nalar   | gaya    |
 * |------------------|--------|---------|---------|
 * | pencemaran       | wajib  | wajib   | wajib   |
 * | ragam-narasi     | wajib  | catatan | n/a     | (detektor operasinya untuk narasi hitung)
 * | periksa-ekor 5%  | wajib  | wajib   | SADAR   |
 * | periksa-latih    | wajib --disiplin (pangsa sumber = catatan)          |
 *
 * PENGECUALIAN SADAR gaya/ekor: tolak-tambang dibangun dari ~8 templat
 * penolakan berotasi (masing2 ~11/200 = 5,5-6%). Hipotesis H-gaya-bentuk:
 * KALAU adapter gaya menunjukkan naskah-terpicu di gerbang perilakunya,
 * templat rotasi ini tersangka pertama — diuji SETELAH latih putaran 1,
 * dan cluster gaya diiterasi SENDIRI tanpa menyentuh cluster lain (justru
 * itu gunanya arsitektur cluster).
 *
 * Pakai: node jalankan-gerbang-v13.mjs          (semua cluster)
 */
'use strict';

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DIR, '..');
// 24 Agu: --versi vNN memilih direktori dataset (bawaan v13; v14 = cluster tool).
const VERSI = (() => { const i = process.argv.indexOf('--versi'); return i > -1 ? process.argv[i + 1] : 'v13'; })();
const V13 = path.join(DIR, 'dataset', VERSI);

const jalankan = (skrip, args) => {
  const r = spawnSync(process.execPath, [path.join(AKAR, skrip), ...args],
    { encoding: 'utf8', timeout: 300000 });
  return { kode: r.status, keluaran: (r.stdout || '') + (r.stderr || '') };
};

/**
 * Alasan pengecualian dominasi sumber untuk `campuran`. Ditulis panjang dan
 * DICETAK tiap kali gerbang jalan — pengecualian yang tidak bisa dibaca adalah
 * pengecualian yang tidak bisa ditinjau.
 */
const ALASAN_SUMBER_CAMPURAN = "campuran rehearsal: resep V18 MENGUNCI tool=80 % sebagai variabel bebas percobaan, jadi dominasi sub-sumber tool (suling-tool 38,7 %) adalah rancangannya, bukan kelalaian pencampuran. Ambang <=30 % ditulis SEBELUM proyek ini punya campuran rehearsal (C38: ambang hidup lebih lama dari instrumennya). Kerusakan yang ambang itu wakili DIUKUR TERPISAH dan bersih: nyaris-kembar 1,9 % (batas 2 %) dan ekor-verbatim LOLOS-DENGAN-CATATAN. cluster-tool sendiri lulus kesiapan-latih apa adanya.";

const KONTRAK = {
  hitung: [
    { nama: 'pencemaran', skrip: 'eval/periksa-pencemaran.mjs', wajib: true },
    { nama: 'ragam-narasi', skrip: 'eval/ragam-narasi.mjs', wajib: true },
    { nama: 'ekor-verbatim', skrip: 'eval/periksa-ekor.mjs', wajib: true },
    { nama: 'kesiapan-latih', skrip: 'flywheel/periksa-latih.mjs', wajib: true, ekstra: ['--disiplin'] },
  ],
  nalar: [
    { nama: 'pencemaran', skrip: 'eval/periksa-pencemaran.mjs', wajib: true },
    { nama: 'ragam-narasi', skrip: 'eval/ragam-narasi.mjs', wajib: false, kenapa: 'operasi hitung di nalar insidental; detektornya bukan untuk prosa penalaran' },
    { nama: 'ekor-verbatim', skrip: 'eval/periksa-ekor.mjs', wajib: true },
    { nama: 'kesiapan-latih', skrip: 'flywheel/periksa-latih.mjs', wajib: true, ekstra: ['--disiplin'] },
  ],
  tool: [
    { nama: 'pencemaran', skrip: 'eval/periksa-pencemaran.mjs', wajib: true },
    { nama: 'ekor-verbatim', skrip: 'eval/periksa-ekor.mjs', wajib: false, kenapa: 'PENGECUALIAN SADAR: blok <tool_call>/</tool_call> = PROTOKOL yang memang harus verbatim di tiap panggilan; ragam prosa dijaga generator (pembuka terbanyak <=30%, panggilan-langsung <=35%, 15/15 uji panen-tool-v2)' },
    { nama: 'kesiapan-latih', skrip: 'flywheel/periksa-latih.mjs', wajib: true, ekstra: ['--disiplin'] },
  ],
  // 7 Sep: dua kontrak baru. Tanpa keduanya, `campuran` dan `abstain` DILEWATI
  // dengan satu baris catatan — lalu berkas ini tetap mencetak "SEMUA CLUSTER
  // SIAP LATIH" dan menulis `sidik: {}`. Vonis siap-latih atas nol cluster yang
  // diperiksa adalah C33 dalam bentuk paling murni.
  campuran: [
    { nama: 'pencemaran', skrip: 'eval/periksa-pencemaran.mjs', wajib: true },
    { nama: 'ekor-verbatim', skrip: 'eval/periksa-ekor.mjs', wajib: false, kenapa: 'PENGECUALIAN WARISAN: 80% campuran = cluster tool, yang blok <tool_call>-nya memang protokol verbatim (alasan sama dengan kontrak tool). Ragam sisi rehearsal dijaga terpisah: gerbang keragaman pabrik-abstain menuntut rasio jawaban-unik >= 0,6 dan mencatat 1,00' },
    // TANPA --disiplin, dan itu disengaja. Kontrak ini pertama kali ditulis
    // dengan menyalin `ekstra: ['--disiplin']` dari kontrak cluster lain, tanpa
    // membaca artinya. Alasan bendera itu di periksa-latih.mjs berbunyi: ambang
    // "sumber terbesar <= 30 %" DIRANCANG UNTUK PANCI CAMPUR, dan --disiplin
    // melonggarkannya untuk cluster satu-disiplin (hitung memang ~70 % sumber
    // aritmetika). Memberikannya kepada `campuran` berarti memberi pengecualian
    // kepada satu-satunya hal yang ambang itu memang dibuat untuk menjaga.
    { nama: 'kesiapan-latih', skrip: 'flywheel/periksa-latih.mjs', wajib: true, ekstra: ['--sumber-terdaftar', ALASAN_SUMBER_CAMPURAN] },
  ],
  abstain: [
    { nama: 'pencemaran', skrip: 'eval/periksa-pencemaran.mjs', wajib: true },
    { nama: 'ekor-verbatim', skrip: 'eval/periksa-ekor.mjs', wajib: true },
    // `--disiplin` di sini BENAR, dan itu diperiksa bukan diwarisi: abstain adalah
    // cluster satu-disiplin (semua barisnya contoh menahan diri), dan `abstain:mesin`
    // 71,5 % adalah dominasi sumber inti yang STRUKTURAL — persis kasus yang bendera
    // ini dibuat untuknya, sama seperti hitung ~70 % sumber aritmetika.
    // Bandingkan dengan `campuran` di atas, tempat bendera yang sama SALAH.
    { nama: 'kesiapan-latih', skrip: 'flywheel/periksa-latih.mjs', wajib: true, ekstra: ['--disiplin'] },
  ],
  gaya: [
    { nama: 'pencemaran', skrip: 'eval/periksa-pencemaran.mjs', wajib: true },
    { nama: 'ekor-verbatim', skrip: 'eval/periksa-ekor.mjs', wajib: false, kenapa: 'PENGECUALIAN SADAR: 8 templat penolakan berotasi ~5,5-6% masing-masing; hipotesis H-gaya-bentuk diuji per-adapter SETELAH latih putaran 1' },
    { nama: 'kesiapan-latih', skrip: 'flywheel/periksa-latih.mjs', wajib: true, ekstra: ['--disiplin'] },
  ],
};

let gagalTotal = 0;
const ringkas = {};
// 23 Agu: cluster TURUNAN (mis. hitung-promptragam = data hitung dengan prompt dirotasi)
// memakai kontrak induknya (nama sebelum '-'). Iterasi atas BERKAS yang ada, bukan
// atas daftar kontrak, supaya cluster baru tidak bisa lolos tanpa gerbang.
const DAFTAR = fs.readdirSync(V13)
  .filter((f) => /^cluster-.+\.jsonl$/.test(f) && !/keluar-rag/.test(f))
  .map((f) => f.replace(/^cluster-/, '').replace(/\.jsonl$/, ''))
  .filter((c) => { const ok = !!KONTRAK[c.split('-')[0]]; if (!ok) console.log(`  (lewati ${c}: tidak ada kontrak untuk induk '${c.split('-')[0]}')`); return ok; })
  .sort();
for (const cluster of DAFTAR) {
  const gerbang = KONTRAK[cluster.split('-')[0]];
  const berkas = path.join(V13, `cluster-${cluster}.jsonl`);
  console.log(`\n########## ${cluster.toUpperCase()} (${berkas.split(/[\\/]/).pop()}) ##########`);
  ringkas[cluster] = [];
  for (const g of gerbang) {
    const { kode, keluaran } = jalankan(g.skrip, [berkas, ...(g.ekstra || [])]);
    const vonis = keluaran.split('\n').filter((b) => /VONIS|BERSIH/.test(b)).slice(-1)[0] || `(kode ${kode})`;
    const lulus = kode === 0;
    let status;
    if (lulus) status = 'LULUS';
    else if (g.wajib) { status = 'GAGAL'; gagalTotal++; }
    else status = `CATATAN-SADAR (${g.kenapa})`;
    console.log(`  ${lulus ? 'OK    ' : g.wajib ? 'GAGAL ' : 'sadar '} ${g.nama.padEnd(15)} ${vonis.trim().slice(0, 90)}`);
    ringkas[cluster].push({ gerbang: g.nama, lulus, wajib: g.wajib, kenapa: g.kenapa });
  }
}

const sidik = {};
for (const c of DAFTAR) {
  const crypto = await import('node:crypto');
  sidik[c] = crypto.createHash('sha256').update(fs.readFileSync(path.join(V13, `cluster-${c}.jsonl`))).digest('hex').slice(0, 16);
}
fs.writeFileSync(path.join(V13, 'HASIL-GERBANG.json'),
  JSON.stringify({ tanggal: new Date().toISOString().slice(0, 10), ringkas, sidik, gagalTotal }, null, 2) + '\n', 'utf8');

console.log(`\n${'='.repeat(60)}`);
console.log(gagalTotal === 0
  ? '## VONIS KONTRAK: SEMUA CLUSTER SIAP LATIH (pengecualian sadar tercatat)'
  : `## VONIS KONTRAK: ${gagalTotal} gerbang WAJIB gagal — JANGAN nyalakan GPU`);
console.log(`sidik: ${JSON.stringify(sidik)}`);
process.exit(gagalTotal === 0 ? 0 : 1);
