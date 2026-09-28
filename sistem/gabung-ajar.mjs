#!/usr/bin/env node
/**
 * sistem/gabung-ajar.mjs — satukan data ajar ke cluster latih.
 *
 * ============================ KENAPA INI HARUS ADA ==========================
 * Sampai hari ini lingkarannya PUTUS di ujung: gerbang menemukan kegagalan,
 * Pencatat Ajar mengubahnya jadi data — lalu data itu berhenti di
 * dataset/ajar/*.jsonl dan tidak pernah sampai ke cluster yang dilatih.
 * Mengajar tanpa jalur ke latihan hanyalah mengarsip.
 *
 * Yang dilakukan (dan yang SENGAJA TIDAK):
 *   - Menggabungkan baris ajar ke cluster-<nama>.jsonl, dengan gerbang data
 *     dijalankan SESUDAHNYA — kalau gerbang gagal, penggabungan DIBATALKAN
 *     (salinan cadangan dikembalikan). Data buruk tidak boleh menetap hanya
 *     karena sudah terlanjur ditulis.
 *   - Menyegarkan sidik di PRA-DAFTAR: sidik lama mengunci ambang ke data
 *     lama; menambah data TANPA memperbarui sidik membuat pra-daftar berbohong.
 *     Sidik diperbarui HANYA kalau gerbang lulus, dan perubahannya dicetak.
 *   - TIDAK melatih apa pun. Melatih itu keputusan berbiaya (GPU, waktu) yang
 *     tetap di tangan orang: alat ini menyiapkan, `migan latih` yang menjalankan.
 *
 * Pakai: node sistem/gabung-ajar.mjs            (kering — lihat saja)
 *        node sistem/gabung-ajar.mjs --terapkan (benar-benar menggabung)
 *        node sistem/gabung-ajar.mjs --uji-instrumen
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DIR, '..');
const AJAR = path.join(AKAR, 'flywheel', 'dataset', 'ajar');
// ── DUA SUMBER, SATU MESIN GABUNG ──────────────────────────────────────────
// `ajar/`   = GOLD TULISAN MANUSIA dari Pencatat Ajar (kegagalan nyata yang
//             dikoreksi Fahmi sendiri).
// `suling/` = hasil penyulingan mesin (flywheel/vast/suling.py).
// Keduanya sah jadi data latih, tapi TIDAK BOLEH dicampur di satu berkas:
// hukum A11 mencatat "gold manusia dari kegagalan nyata" sebagai dial TUNGGAL
// PALING EFEKTIF yang pernah kami ukur (semua lengan gerbang naik). Kalau
// asal-usulnya lebur, dial itu tidak akan pernah bisa diukur lagi — dan
// pengukuran yang hilang tidak bisa dibeli kembali.
// Yang dibagi bersama justru bagian yang mahal dan berbahaya: cadangkan ->
// gabung -> gerbang -> BATALKAN kalau gagal -> segarkan sidik pra-daftar.
const SULING = path.join(AKAR, 'flywheel', 'dataset', 'suling');
const V13 = path.join(AKAR, 'flywheel', 'dataset', 'v13');
const V14 = path.join(AKAR, 'flywheel', 'dataset', 'v14');
/** 25 Agu: cluster bisa tinggal di v14 (tool) atau v13 — pakai yang berkasnya ADA; dua-duanya ada -> v14 (lebih baru). */
export function dirCluster(nama) {
  const diV14 = path.join(V14, `cluster-${nama}.jsonl`);
  return fs.existsSync(diV14) ? V14 : V13;
}
const PRA = path.join(AKAR, 'flywheel', 'PRA-DAFTAR-V13.json');
const PRA14 = path.join(AKAR, 'flywheel', 'PRA-DAFTAR-V14.json');

const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', A = '\x1b[2m', R = '\x1b[0m';

export const sidik16 = (abs) =>
  crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 16);

export function bacaBaris(abs) {
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const b of fs.readFileSync(abs, 'utf8').split('\n')) {
    if (!b.trim()) continue;
    try {
      const o = JSON.parse(b);
      if (Array.isArray(o?.conversations)) out.push(o);
    } catch { /* baris rusak dilewati, bukan menggagalkan semuanya */ }
  }
  return out;
}

/** Baris ajar yang pertanyaannya sudah ada di cluster tidak digabungkan lagi. */
export function saringBaru(barisAjar, barisCluster) {
  const kunci = (b) => String(b.conversations.find((c) => c.from === 'human')?.value ?? '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  const ada = new Set(barisCluster.map(kunci));
  const baru = [], lewat = [];
  for (const b of barisAjar) {
    (ada.has(kunci(b)) ? lewat : baru).push(b);
    ada.add(kunci(b));
  }
  return { baru, lewat };
}

/** Jalankan gerbang data pada satu cluster. Kontraknya sama dengan jalankan-gerbang-v13. */
export function gerbang(clusterFile) {
  const jalan = (skrip, args) => spawnSync(process.execPath, [path.join(AKAR, skrip), ...args],
    { encoding: 'utf8', timeout: 300000 });
  const hasil = [];
  for (const [nama, skrip, ekstra] of [
    ['pencemaran', 'eval/periksa-pencemaran.mjs', []],
    ['ekor-verbatim', 'eval/periksa-ekor.mjs', []],
    ['kesiapan-latih', 'flywheel/periksa-latih.mjs', ['--disiplin']],
  ]) {
    const r = jalan(skrip, [clusterFile, ...ekstra]);
    hasil.push({ nama, lulus: r.status === 0, vonis: (r.stdout || '').split('\n').filter((b) => /VONIS|BERSIH/.test(b)).slice(-1)[0]?.trim() ?? '' });
  }
  return hasil;
}

// ────────────────────────────────────────────────── uji instrumen ──
function ujiInstrumen() {
  const buat = (t, j) => ({ conversations: [{ from: 'human', value: t }, { from: 'gpt', value: j }] });
  const kasus = [
    ['baris terbaca dari JSONL', (() => {
      const tmp = path.join(AJAR, '__uji-gabung__.jsonl');
      fs.mkdirSync(AJAR, { recursive: true });
      fs.writeFileSync(tmp, [JSON.stringify(buat('a', 'b')), '{rusak', JSON.stringify(buat('c', 'd'))].join('\n'), 'utf8');
      const n = bacaBaris(tmp).length;
      fs.unlinkSync(tmp);
      return n === 2;   // baris rusak dilewati, dua sehat terbaca
    })()],
    ['pertanyaan yang sudah ada di cluster TIDAK digabung ulang', (() => {
      const s = saringBaru([buat('Berapa 19 ton?', 'x'), buat('Soal baru', 'y')], [buat('berapa 19 ton?', 'lama')]);
      return s.baru.length === 1 && s.lewat.length === 1;
    })()],
    ['duplikat DI DALAM data ajar sendiri juga disaring', (() => {
      const s = saringBaru([buat('Sama', 'a'), buat('sama', 'b')], []);
      return s.baru.length === 1 && s.lewat.length === 1;
    })()],
    ['pencocokan abai spasi & huruf besar', (() => {
      const s = saringBaru([buat('  Berapa  TON ini? ', 'x')], [buat('berapa ton ini?', 'lama')]);
      return s.baru.length === 0;
    })()],
    ['sidik berubah kalau isi berubah', (() => {
      const a = path.join(AJAR, '__uji-sidik__.jsonl');
      fs.writeFileSync(a, 'satu\n', 'utf8'); const s1 = sidik16(a);
      fs.writeFileSync(a, 'dua\n', 'utf8'); const s2 = sidik16(a);
      fs.unlinkSync(a);
      return s1 !== s2 && s1.length === 16;
    })()],
  ];
  let g = 0;
  for (const [n, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${n}`); if (!ok) g++; }
  console.log(`\n${kasus.length - g}/${kasus.length} lulus`);
  process.exit(g ? 1 : 0);
}

const iniUtama = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (iniUtama) {
  if (process.argv.includes('--uji-instrumen')) ujiInstrumen();
  const terapkan = process.argv.includes('--terapkan');
  // 31 Agu (run V16-jujur): pra-daftar menyegel SATU dial — gold manusia saja.
  // Tanpa saringan ini, 181 baris suling ikut tergabung = dial KEDUA yang
  // melarutkan pengukuran A11, dan sidik yang disegel tak akan pernah cocok.
  const ambilArg = (b) => (process.argv.includes(b) ? process.argv[process.argv.indexOf(b) + 1] : null);
  const hanyaSumber = ambilArg('--sumber');
  const hanyaCluster = ambilArg('--hanya');

  const sumber = [];
  for (const [dir, asal] of [[AJAR, 'ajar'], [SULING, 'suling']]) {
    if (hanyaSumber && asal !== hanyaSumber) continue;
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl') && !x.startsWith('__')))
      sumber.push({ dir, asal, f });
  }
  if (!sumber.length) { console.log('belum ada data ajar maupun suling.'); process.exit(0); }

  console.log(`# Gabungkan data ajar + suling ke cluster latih${terapkan ? '' : `  ${A}(kering — pakai --terapkan untuk benar-benar menggabung)${R}`}\n`);
  const pra = JSON.parse(fs.readFileSync(PRA, 'utf8'));
  const pra14 = fs.existsSync(PRA14) ? JSON.parse(fs.readFileSync(PRA14, 'utf8')) : null;
  let adaPerubahan = false, adaPerubahan14 = false;

  for (const { dir: dirSumber, asal, f } of sumber) {
    const nama = f.replace('.jsonl', '');
    if (hanyaCluster && nama !== hanyaCluster) continue;
    const dirTujuan = dirCluster(nama);
    const tujuan = path.join(dirTujuan, `cluster-${nama}.jsonl`);
    if (!fs.existsSync(tujuan)) {
      console.log(`  ${K}lewat${R}   [${asal}] ${nama} — belum ada cluster-${nama}.jsonl untuk digabungi`);
      continue;
    }
    const barisAjar = bacaBaris(path.join(dirSumber, f));
    const barisCluster = bacaBaris(tujuan);
    const { baru, lewat } = saringBaru(barisAjar, barisCluster);
    if (!baru.length) {
      console.log(`  ${A}nihil${R}   [${asal}] ${nama} — ${barisAjar.length} baris, semuanya sudah ada`);
      continue;
    }
    console.log(`  [${asal}] ${nama}: ${baru.length} baris baru${lewat.length ? ` (${lewat.length} sudah ada, dilewati)` : ''} → cluster ${barisCluster.length} → ${barisCluster.length + baru.length}`);
    if (!terapkan) { adaPerubahan = true; continue; }

    // Cadangkan DULU: gerbang yang gagal harus bisa mengembalikan keadaan.
    const cadangan = tujuan + '.sebelum-gabung';
    fs.copyFileSync(tujuan, cadangan);
    fs.appendFileSync(tujuan, baru.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');

    const hasil = gerbang(path.relative(AKAR, tujuan).replace(/\\/g, '/'));
    const gagal = hasil.filter((h) => !h.lulus);
    for (const h of hasil) {
      console.log(`         ${h.lulus ? H + 'OK   ' + R : M + 'GAGAL' + R} ${h.nama.padEnd(15)} ${h.vonis.slice(0, 68)}`);
    }
    if (gagal.length) {
      fs.copyFileSync(cadangan, tujuan);
      fs.unlinkSync(cadangan);
      console.log(`         ${M}DIBATALKAN${R} — cluster dikembalikan ke keadaan sebelumnya.`);
      console.log(`         ${A}Perbaiki datanya dulu: sebar bentuknya, jangan tambah jumlah.${R}`);
      continue;
    }
    fs.unlinkSync(cadangan);
    const sidikBaru = sidik16(tujuan);
    const praSasaran = (dirTujuan === V14 && pra14) ? pra14 : pra; // segel cluster v14 (tool) hidup di PRA-DAFTAR-V14
    const sidikLama = praSasaran.sidikCluster?.[nama];
    praSasaran.sidikCluster[nama] = sidikBaru;
    if (praSasaran === pra14) adaPerubahan14 = true; else adaPerubahan = true;
    console.log(`         ${H}digabung${R} · sidik ${sidikLama} → ${sidikBaru}`);
  }

  if (terapkan && (adaPerubahan || adaPerubahan14)) {
    const cap = `Sidik diperbarui ${new Date().toISOString().slice(0, 10)} sesudah penggabungan data ajar/suling; ambang berlaku untuk data BARU ini.`;
    if (adaPerubahan) { pra.catatanSidik = cap; fs.writeFileSync(PRA, JSON.stringify(pra, null, 2) + '\n', 'utf8'); }
    if (adaPerubahan14) { pra14.catatanSidik = cap; fs.writeFileSync(PRA14, JSON.stringify(pra14, null, 2) + '\n', 'utf8'); }
    console.log(`\n  ${H}PRA-DAFTAR disegarkan${R} — ambang kini terkunci ke data yang baru.`);
    console.log(`  ${A}Berikutnya: node migan.mjs latih <cluster>${R}`);
  } else if (!terapkan && adaPerubahan) {
    console.log(`\n  ${A}Jalankan lagi dengan --terapkan untuk menggabung; gerbang dijalankan setelahnya dan membatalkan kalau gagal.${R}`);
  } else {
    console.log('\n  Tidak ada yang perlu digabung.');
  }
}
