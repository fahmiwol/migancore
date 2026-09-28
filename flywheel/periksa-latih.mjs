#!/usr/bin/env node
/**
 * periksa-latih.mjs — PEMERIKSAAN KESIAPAN LATIH yang belum pernah kami punya.
 *
 * ============================== ASAL-USULNYA ================================
 * Pipa data model besar (Dolma, FineWeb, Nemotron, RedPajama) memakai tahap
 * yang belum ada di pipa kami. Empat di antaranya diperiksa di sini, dan tiga
 * langsung menemukan sesuatu pada data v11.
 *
 * 1. TERPOTONG — baris yang lebih panjang dari batas token akan dipotong di
 *    tengah jawaban. Model yang dilatih pada jawaban terpotong belajar berhenti
 *    mendadak. Hasil pada v11: 0 baris. Aman, tapi harus terus dijaga karena
 *    data yang tumbuh akan menabrak batas tanpa memberi peringatan apa pun.
 *
 * 2. NYARIS-KEMBAR — dedup kami membandingkan 200 huruf PERTAMA saja. Dua
 *    jawaban bisa berbeda di awal lalu 90% sama sesudahnya, dan lolos. Diukur
 *    dengan Jaccard atas 5-gram seluruh jawaban.
 *
 * 3. KETIMPANGAN SUMBER — satu sumber yang menguasai data akan menentukan gaya
 *    model, apa pun niat kita. Pada v11: `dasar-aritmetika` 22,8%, lima sumber
 *    teratas 52%.
 *
 * 4. PANGSA PROMPT — dan ini temuan terbesarnya. `train.py` memakai
 *    `DataCollatorForLanguageModeling(mlm=False)` tanpa penopengan, jadi loss
 *    dihitung pada SELURUH token termasuk system prompt dan pertanyaan.
 *    Pada v11: **36% sinyal latihan** dipakai menghafal **14** kalimat system
 *    prompt yang diulang **1.482** kali; satu di antaranya muncul 465 kali.
 *    Ditambah pertanyaan, 47% loss dihabiskan untuk teks yang tidak pernah
 *    perlu ditulis model.
 *
 *    Ini diduga kuat bersambung dengan C13: model yang secara harfiah dilatih
 *    mengulang teks baku akan menjadi sangat mahir mengulang templat — persis
 *    penyakit "hafal narasinya, bukan operasinya".
 *
 * Pakai: node periksa-latih.mjs [dataset.jsonl]
 *        node periksa-latih.mjs --uji-instrumen
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

// Ambang. Bukan angka keramat — masing-masing punya alasan yang ditulis.
const AMBANG = {
  terpotong: 0.01,      // >1% baris terpotong = jawaban buntung ikut dilatih
  nyarisKembar: 0.02,   // >2% pasangan nyaris-kembar = keragaman semu
  sumberTerbesar: 0.30, // satu sumber >30% akan mendikte gaya model
  pangsaJawaban: 0.70,  // <70% loss di jawaban = kapasitas terbuang ke teks baku
};
const HURUF_PER_TOKEN = 3.5;   // perkiraan untuk bahasa Indonesia
const TOKEN_MAKS = 1024;       // sama dengan MAKS di kaggle/kernel/train.py

// ─────────────────────────────────────────────────── pengukuran ──
export function ukur(baris, sumberTrain = '') {
  const j = (a) => a.reduce((s, x) => s + x, 0);
  const sis = j(baris.map((b) => b.sistem.length));
  const tan = j(baris.map((b) => b.tanya.length));
  const jaw = j(baris.map((b) => b.jawab.length));
  const tot = sis + tan + jaw || 1;

  const batasHuruf = TOKEN_MAKS * HURUF_PER_TOKEN;
  const terpotong = baris.filter((b) => (b.sistem + b.tanya + b.jawab).length > batasHuruf);

  const shingle = (s) => {
    const k = String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const S = new Set();
    for (let i = 0; i + 5 <= k.length; i++) S.add(k.slice(i, i + 5).join(' '));
    return S;
  };
  const jac = (A, B) => { let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n || 1); };
  const sh = baris.map((b) => ({ sumber: b.sumber, s: shingle(b.jawab) }));
  const pasangan = [];
  for (let i = 0; i < sh.length; i++) {
    for (let k = i + 1; k < Math.min(sh.length, i + 60); k++) {
      if (Math.abs(sh[i].s.size - sh[k].s.size) > 12) continue;
      const v = jac(sh[i].s, sh[k].s);
      if (v >= 0.8) pasangan.push({ a: sh[i].sumber, b: sh[k].sumber, j: v });
    }
  }

  const perSumber = {};
  for (const b of baris) perSumber[b.sumber || '?'] = (perSumber[b.sumber || '?'] || 0) + 1;
  const urutSumber = Object.entries(perSumber).sort((a, b) => b[1] - a[1]);

  const perSistem = {};
  for (const b of baris) perSistem[b.sistem] = (perSistem[b.sistem] || 0) + 1;
  const urutSistem = Object.entries(perSistem).sort((a, b) => b[1] - a[1]);

  // Apakah train.py menopengi prompt? Tanpa penopengan, loss ikut dihitung di
  // system prompt dan pertanyaan.
  const menopengi = /DataCollatorForCompletionOnlyLM|labels\[.*\]\s*=\s*-100|IGNORE_INDEX|masking|topeng/i.test(sumberTrain);

  return {
    baris: baris.length,
    terpotong: { jumlah: terpotong.length, rasio: terpotong.length / (baris.length || 1) },
    nyarisKembar: { jumlah: pasangan.length, rasio: pasangan.length / (baris.length || 1), contoh: pasangan.slice(0, 3) },
    sumber: { total: urutSumber.length, terbesar: urutSumber[0] || ['-', 0], rasioTerbesar: (urutSumber[0]?.[1] || 0) / (baris.length || 1), limaTeratas: urutSumber.slice(0, 5) },
    pangsa: { sistem: sis / tot, tanya: tan / tot, jawab: jaw / tot },
    sistem: { unik: urutSistem.length, terbanyak: urutSistem[0] || ['-', 0] },
    menopengi,
  };
}

export function vonisUkur(u) {
  const cek = [
    { nama: 'terpotong saat latih', nilai: u.terpotong.rasio, ambang: AMBANG.terpotong, arah: 'maks',
      teks: `${u.terpotong.jumlah} baris (${(u.terpotong.rasio * 100).toFixed(1)}%)` },
    { nama: 'nyaris-kembar (Jaccard>=0,80)', nilai: u.nyarisKembar.rasio, ambang: AMBANG.nyarisKembar, arah: 'maks',
      teks: `${u.nyarisKembar.jumlah} pasangan (${(u.nyarisKembar.rasio * 100).toFixed(1)}%)` },
    { nama: 'sumber terbesar', nilai: u.sumber.rasioTerbesar, ambang: AMBANG.sumberTerbesar, arah: 'maks',
      teks: `${u.sumber.terbesar[0]} ${(u.sumber.rasioTerbesar * 100).toFixed(1)}%` },
    { nama: 'pangsa loss di JAWABAN', nilai: u.pangsa.jawab, ambang: AMBANG.pangsaJawaban, arah: 'min',
      teks: `${(u.pangsa.jawab * 100).toFixed(1)}% (sistem ${(u.pangsa.sistem * 100).toFixed(0)}%, tanya ${(u.pangsa.tanya * 100).toFixed(0)}%)` },
  ];
  for (const k of cek) k.lulus = k.arah === 'maks' ? k.nilai <= k.ambang : k.nilai >= k.ambang;
  // Penopengan prompt membatalkan syarat pangsa: kalau prompt ditopengi, loss
  // memang cuma dihitung di jawaban, berapa pun panjang promptnya.
  if (u.menopengi) { const p = cek.find((k) => k.nama.includes('pangsa')); p.lulus = true; p.teks += ' — prompt DITOPENGI, jadi tidak jadi soal'; }
  // --disiplin (v13): pada cluster per-disiplin, dominasi sumber inti itu
  // STRUKTURAL (cluster hitung memang ~70% sumber aritmetika). Ambang <=30%
  // dirancang untuk panci campur; di cluster ia jadi catatan, bukan kegagalan.
  // Risiko yang setara di dalam cluster dijaga gerbang lain: ragam-narasi
  // (bentuk) dan periksa-ekor (blok verbatim).
  if (u.disiplin) {
    const s = cek.find((k) => k.nama === 'sumber terbesar');
    s.lulus = true;
    s.teks += ' — cluster DISIPLIN: dominasi sumber inti struktural (catatan, bukan gagal)';
  }
  // --sumber-terdaftar "<alasan>": pengecualian dominasi sumber yang DINYATAKAN,
  // bukan diwarisi dari bendera lain.
  //
  // Lahir 7 Sep dari kesalahan yang nyata: kontrak gerbang untuk `campuran`
  // ditulis dengan menyalin `--disiplin` dari kontrak cluster lain, tanpa membaca
  // artinya. Padahal alasan bendera itu berbunyi terbalik — ambang ini "dirancang
  // untuk PANCI CAMPUR", dan --disiplin melonggarkannya khusus untuk cluster
  // SATU-DISIPLIN. Campuran mendapat pengecualian yang justru dibuat untuk
  // menjaga campuran.
  //
  // Bendera ini menggantikannya dengan yang jujur: alasannya WAJIB ditulis
  // (>=40 huruf), DICETAK tiap kali dijalankan, dan hanya menyentuh satu
  // pemeriksaan — nyaris-kembar & terpotong tetap mengikat.
  if (u.sumberTerdaftar) {
    if (String(u.sumberTerdaftar).length < 40) {
      console.error('--sumber-terdaftar butuh ALASAN >=40 huruf. Pengecualian tanpa alasan = pengecualian yang tak bisa ditinjau.');
      process.exit(2);
    }
    const s = cek.find((k) => k.nama === 'sumber terbesar');
    s.lulus = true;
    s.teks += ` — PENGECUALIAN TERDAFTAR: ${u.sumberTerdaftar}`;
  }
  return cek;
}

// ─────────────────────────────────────────────────── uji instrumen ──
if (process.argv.includes('--uji-instrumen')) {
  console.log('# Uji instrumen — periksa-latih.mjs\n');
  const buat = (n, opsi = {}) => Array.from({ length: n }, (_, i) => ({
    sumber: opsi.sumber || `s${i % (opsi.sumberBeda || 10)}`,
    sistem: opsi.sistem ?? 'Sistem pendek.',
    tanya: `Soal nomor ${i}?`,
    // Kendali 'sehat' pertama saya memakai kalimat yang cuma beda ANGKANYA —
    // sebagai 5-gram ia 90% sama, jadi pemeriksa nyaris-kembar menyalakan alarm
    // pada data yang saya sebut sehat. Kendali yang salah bangun menuduh alat
    // yang benar. Sekarang tiap jawaban benar-benar berbeda susunannya.
    // Panjangnya juga disengaja: prompt di kendali ini ±62 huruf, jadi jawaban
    // harus >145 huruf supaya pangsa-jawaban lewat 70%. Kendali pertama saya
    // pendek-pendek, lalu "data sehat" gagal di pemeriksaan pangsa — bukan
    // karena alatnya salah, melainkan karena contoh sehatnya memang tidak sehat.
    jawab: opsi.jawabSama ? 'Jawaban yang sama persis untuk semua baris di sini, tanpa satu pun perbedaan susunan kata, supaya pemeriksa nyaris-kembar punya alasan menyala.'
                          : [`Menurut catatan yang kupegang, angkanya ${i}, dan itu sudah kucocokkan dua kali dengan sumber aslinya sebelum kutuliskan di sini supaya tidak keliru.`,
                             `Kuhitung ulang pelan-pelan dan hasilnya ${i}. Sesudah itu kuperiksa lewat jalan lain, dan angkanya tetap sama, jadi bisa kupakai.`,
                             `Tidak ada dasarnya untuk menyebut ${i} sebagai angka pasti. Yang bisa kupastikan cuma sumbernya, dan sumber itu sendiri belum diperbarui.`,
                             `Singkatnya ${i}. Rinciannya panjang, jadi kuletakkan di lampiran kedua; kalau kamu butuh langkah demi langkahnya, kubuka bagian itu.`,
                             `Pertanyaanmu bercabang. Bacaan pertama memberi ${i}, sedangkan bacaan kedua memberi angka lain sama sekali. Yang mana yang kamu maksud?`][i % 5],
  }));
  const kasus = [
    { nama: 'data sehat -> semua lulus',
      f: () => {
        const v = vonisUkur(ukur(buat(60)));
        const jatuh = v.filter((k) => !k.lulus);
        // Kendali yang gagal harus MEMBERI TAHU bagian mana yang jatuh. Kendali
        // yang cuma berkata "false" memaksa saya menebak, dan menebak itu yang
        // membuat perbaikan berputar-putar.
        if (jatuh.length) console.log(`         (yang jatuh: ${jatuh.map((k) => `${k.nama} = ${k.teks}`).join(' | ')})`);
        return jatuh.length === 0;
      }, harus: true },
    { nama: 'satu sumber menguasai -> WAJIB gagal',
      f: () => vonisUkur(ukur(buat(60, { sumber: 'satu' }))).find((k) => k.nama === 'sumber terbesar').lulus, harus: false },
    { nama: 'system prompt raksasa -> pangsa jawaban WAJIB gagal',
      f: () => vonisUkur(ukur(buat(60, { sistem: 'x'.repeat(4000) }))).find((k) => k.nama.includes('pangsa')).lulus, harus: false },
    { nama: 'prompt raksasa TAPI ditopengi -> pangsa lulus',
      f: () => vonisUkur(ukur(buat(60, { sistem: 'x'.repeat(4000) }), 'DataCollatorForCompletionOnlyLM')).find((k) => k.nama.includes('pangsa')).lulus, harus: true },
    { nama: 'jawaban kembar semua -> nyaris-kembar WAJIB gagal',
      f: () => vonisUkur(ukur(buat(60, { jawabSama: true }))).find((k) => k.nama.includes('kembar')).lulus, harus: false },
    { nama: 'baris kelewat panjang -> terpotong WAJIB gagal',
      f: () => vonisUkur(ukur(buat(60, { sistem: 'y'.repeat(4000) }))).find((k) => k.nama.includes('terpotong')).lulus, harus: false },
  ];
  let cacat = 0;
  for (const k of kasus) {
    let dapat; try { dapat = k.f(); } catch { dapat = null; }
    const ok = dapat === k.harus;
    if (!ok) cacat++;
    console.log(`  ${ok ? 'OK   ' : 'CACAT'} ${k.nama}`);
    if (!ok) console.log(`         harap ${k.harus} · dapat ${dapat}`);
  }
  console.log(`\n${cacat === 0 ? `SEHAT: ${kasus.length}/${kasus.length}` : `CACAT: ${cacat}`}`);
  process.exit(cacat === 0 ? 0 : 1);
}

// ─────────────────────────────────────────────────── pemakaian ──
const BERKAS = process.argv[2] || path.join(DIR, 'dataset', 'migancore-curated.jsonl');
if (!fs.existsSync(BERKAS)) { console.error(`berkas tidak ada: ${BERKAS}`); process.exit(2); }

const baris = [];
for (const l of fs.readFileSync(BERKAS, 'utf8').split(/\r?\n/)) {
  if (!l.trim()) continue;
  try {
    const o = JSON.parse(l); const c = o.conversations || [];
    baris.push({
      sumber: o.sumber || '?',
      sistem: (c.find((x) => x.from === 'system') || {}).value || '',
      tanya: (c.find((x) => x.from === 'human') || {}).value || '',
      jawab: (c.find((x) => x.from === 'gpt') || {}).value || '',
    });
  } catch { /* lewati */ }
}

const jalurTrain = path.join(DIR, 'kaggle', 'kernel', 'train.py');
const sumberTrain = fs.existsSync(jalurTrain) ? fs.readFileSync(jalurTrain, 'utf8') : '';
const u = ukur(baris, sumberTrain);
u.disiplin = process.argv.includes('--disiplin');
u.sumberTerdaftar = process.argv.includes('--sumber-terdaftar')
  ? process.argv[process.argv.indexOf('--sumber-terdaftar') + 1] : null;
const cek = vonisUkur(u);

console.log(`# Periksa kesiapan latih — ${path.basename(BERKAS)} (${u.baris} baris)\n`);
console.log('| Pemeriksaan | Hasil | Ambang | Vonis |');
console.log('|---|---|---|---|');
for (const k of cek) {
  console.log(`| ${k.nama} | ${k.teks} | ${k.arah === 'maks' ? '≤' : '≥'} ${(k.ambang * 100).toFixed(0)}% | ${k.lulus ? 'lulus' : '**GAGAL**'} |`);
}

console.log(`\n  penopengan prompt di train.py : ${u.menopengi ? 'ADA' : 'TIDAK ADA — loss dihitung juga pada system prompt & pertanyaan'}`);
console.log(`  system prompt unik            : ${u.sistem.unik} untuk ${u.baris} baris`);
console.log(`  terbanyak                     : ${u.sistem.terbanyak[1]}x  "${String(u.sistem.terbanyak[0]).slice(0, 64)}…"`);
if (!u.menopengi) {
  console.log(`\n  ${(u.pangsa.sistem * 100).toFixed(0)}% sinyal latihan dipakai menghafal ${u.sistem.unik} kalimat baku yang diulang ${u.baris} kali.`);
  console.log('  Itu kapasitas yang tidak dipakai belajar menjawab — dan latihan harfiah');
  console.log('  untuk mengulang teks baku, yang persis penyakit "hafal narasi, bukan operasi".');
}
if (u.nyarisKembar.contoh.length) {
  console.log('\n  contoh nyaris-kembar:');
  for (const p of u.nyarisKembar.contoh) console.log(`    ${p.a} ~ ${p.b}  J=${p.j.toFixed(2)}`);
}
console.log('\n  lima sumber teratas: ' + u.sumber.limaTeratas.map(([k, v]) => `${k} ${(v / u.baris * 100).toFixed(0)}%`).join(' · '));

const gagal = cek.filter((k) => !k.lulus);
console.log(`\n## VONIS: ${gagal.length === 0 ? 'SIAP' : `TAHAN — ${gagal.length} pemeriksaan gagal`}`);
fs.writeFileSync(path.join(DIR, 'periksa-latih.json'), JSON.stringify({ berkas: path.basename(BERKAS), ukur: u, cek }, null, 2), 'utf8');
process.exit(gagal.length === 0 ? 0 : 1);
