#!/usr/bin/env node
/**
 * inventaris-korpus.mjs — korpus OMIGA dibedah PER SUMBER (type) terhadap petak-jujur2.
 *
 * Fahmi (9 Sep, disarikan): bagi korpus RAG ke beberapa sumber supaya penarikan tidak salah
 * ambil, seperti inventaris dataset yang benar. Sebelum membagi, ukur dulu:
 * tiap tipe sumber — berapa dokumennya, seberapa sering ia memenangkan penarikan
 * untuk soal petak, dan (untuk soal fakta) apakah ia memuat jawabannya sama sekali.
 *
 * Ini lanjutan liputan-retrieval.mjs (yang menghitung SEMUA sumber jadi satu) —
 * di sana ketahuan 67 % potongan yang ditarik adalah transkrip sesi (C54). Di sini
 * tiap tipe berdiri sendiri, supaya keputusan "sumber mana untuk soal jenis apa"
 * berpijak pada angka per sumber, bukan pada satu angka gabungan.
 *
 * Memakai `corpus.js` produksi apa adanya dengan filter `type` yang SUDAH ADA di
 * `search()` — jadi pembagian sumber bisa dilakukan di migancore tanpa menyentuh
 * indeks bersama yang dipakai brain_search semua sesi Claude.
 *
 * Pakai:  node eval/inventaris-korpus.mjs [--k 6] [--uji]
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PUBLIK } from './petak-jujur2.mjs';
import { jawabanAda } from './liputan-retrieval.mjs';

const require = createRequire(import.meta.url);
const OMIGA_DIR = process.env.OMIGA_DIR || '<memory-dir>';
const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', A = '\x1b[2m', B = '\x1b[1m', R = '\x1b[0m';

/** Satu tipe × seluruh petak → statistik. `cari(q, tipe)` disuntik supaya bisa diuji tanpa indeks. */
export function bedahTipe(tipe, petak, cari, k = 6) {
  let totalHits = 0, jumlahSkor = 0, nSkor = 0, faktaAda = 0, faktaN = 0, soalBerhit = 0, tipeMelenceng = 0;
  for (const s of petak) {
    let hits = [];
    try { hits = cari(s.q, tipe, k) || []; } catch { hits = []; }
    if (hits.length) soalBerhit++;
    totalHits += hits.length;
    for (const h of hits) if (h.type && h.type !== tipe) tipeMelenceng++;
    if (hits.length) { jumlahSkor += Number(hits[0].score ?? 0); nSkor++; }
    if (s.benar) {
      faktaN++;
      const teks = hits.map((h) => `${h.title || ''}\n${h.text || ''}`).join('\n\n');
      if (jawabanAda(teks, s.benar)) faktaAda++;
    }
  }
  return {
    tipe,
    soalBerhit,
    rataHits: petak.length ? Math.round((totalHits / petak.length) * 10) / 10 : 0,
    rataSkorTeratas: nSkor ? Math.round((jumlahSkor / nSkor) * 100) / 100 : 0,
    faktaAda, faktaN,
    tipeMelenceng, // hit yang tipenya bukan `tipe` padahal difilter — harus 0, kalau tidak filternya bohong
  };
}

/** Berapa banyak dari top-k GABUNGAN (tanpa filter) yang dimenangkan tiap tipe — siapa yang "mengambil mikrofon". */
export function bagianMikrofon(petak, cariSemua, k = 6) {
  const per = {};
  let total = 0;
  for (const s of petak) {
    for (const h of cariSemua(s.q, k) || []) { total++; const t = h.type || '?'; per[t] = (per[t] || 0) + 1; }
  }
  return { total, per };
}

// ------------------------------------------------------------------- uji --
function uji() {
  let lulus = 0, gagal = 0;
  const cek = (n, c) => { if (c) lulus++; else { gagal++; console.log(`${M}GAGAL${R} ${n}`); } };
  const petak = [
    { id: 'a', jenis: 'fakta', q: 'logam bangka?', benar: 'timah' },
    { id: 'b', jenis: 'fakta', q: 'ibu kota jabar?', benar: 'bandung' },
    { id: 'c', jenis: 'subjektif', q: 'enak mana?', benar: null },
  ];
  const cari = (q, tipe) => {
    if (tipe === 'doc') return q.includes('jabar') ? [{ type: 'doc', score: 20, text: 'Bandung kota kembang' }] : [];
    if (tipe === 'session') return [{ type: 'session', score: 40, text: 'kunci: timah; bandung' }];
    if (tipe === 'bocor') return [{ type: 'doc', score: 1, text: 'x' }]; // filter bohong
    return [];
  };
  const d = bedahTipe('doc', petak, cari);
  cek('doc: 1 soal berhit, fakta 1/2', d.soalBerhit === 1 && d.faktaAda === 1 && d.faktaN === 2);
  cek('doc: skor teratas dirata-rata hanya pada soal berhit', d.rataSkorTeratas === 20);
  const s = bedahTipe('session', petak, cari);
  cek('session: memuat kedua kunci jawaban', s.faktaAda === 2 && s.soalBerhit === 3);
  cek('soal tanpa kunci tidak masuk penyebut fakta', s.faktaN === 2);
  cek('filter yang bohong tertangkap (tipeMelenceng > 0)', bedahTipe('bocor', petak, cari).tipeMelenceng === 3);
  cek('cari yang melempar tidak menjatuhkan inventaris', bedahTipe('x', petak, () => { throw new Error('boom'); }).soalBerhit === 0);
  const mk = bagianMikrofon(petak, () => [{ type: 'session' }, { type: 'doc' }, { type: 'session' }]);
  cek('mikrofon: hitung per tipe', mk.total === 9 && mk.per.session === 6 && mk.per.doc === 3);
  console.log(gagal === 0 ? `${H}${lulus} lulus${R}` : `${M}${gagal} gagal${R}, ${lulus} lulus`);
  return gagal === 0 ? 0 : 1;
}

// ------------------------------------------------------------------ main --
const iniUtama = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (iniUtama) {
  if (process.argv.includes('--uji')) process.exit(uji());
  const iK = process.argv.indexOf('--k');
  const k = iK > 0 ? Number(process.argv[iK + 1]) : 6;

  const C = require(path.join(OMIGA_DIR, 'mcp', 'omiga-brain', 'corpus.js'));
  const manifest = JSON.parse(fs.readFileSync(path.join(OMIGA_DIR, 'corpus', 'manifest.json'), 'utf8'));
  const byType = manifest.by_type || {};
  const tipe = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);
  console.log(`${A}korpus dibangun ${manifest.built_at} · ${manifest.documents} dokumen · ${manifest.chunks} potongan · ${tipe.length} tipe · k=${k}${R}\n`);

  const mk = bagianMikrofon(PUBLIK, (q, kk) => C.search(q, { k: kk }), k);
  console.log(`${B}${'tipe'.padEnd(10)}${'dokumen'.padStart(8)}${'mikrofon'.padStart(10)}${'soal-berhit'.padStart(13)}${'rata-hit'.padStart(9)}${'skor'.padStart(7)}${'fakta-ada'.padStart(11)}  catatan${R}`);
  const baris = [];
  for (const t of tipe) {
    const b = bedahTipe(t, PUBLIK, (q, tp, kk) => C.search(q, { k: kk, type: tp }), k);
    baris.push(b);
    const mikrofon = mk.total ? Math.round(((mk.per[t] || 0) / mk.total) * 1000) / 10 : 0;
    const warnaF = b.faktaN && b.faktaAda / b.faktaN >= 0.5 ? K : A;
    const catatan = [
      b.tipeMelenceng ? `${M}FILTER BOHONG ${b.tipeMelenceng}${R}` : '',
      t === 'session' ? `${M}memuat kunci jawaban petak (C54)${R}` : '',
      t === 'identity' || t === 'profile' ? `${K}tentang Fahmi — derau untuk soal umum${R}` : '',
    ].filter(Boolean).join(' · ');
    console.log(
      t.padEnd(10) + String(byType[t]).padStart(8) + `${mikrofon}%`.padStart(10) +
      `${b.soalBerhit}/${PUBLIK.length}`.padStart(13) + String(b.rataHits).padStart(9) +
      String(b.rataSkorTeratas).padStart(7) + `${warnaF}${b.faktaAda}/${b.faktaN}${R}`.padStart(11 + warnaF.length + R.length) + '  ' + catatan
    );
  }
  console.log(`\n${A}mikrofon = bagian dari top-${k} GABUNGAN yang dimenangkan tipe itu (siapa yang bicara ke model sekarang) · fakta-ada = soal fakta yang jawabannya muncul di hasil tipe itu (batas ATAS, bukan bukti terpakai)${R}`);
  const tanpaSesi = baris.filter((b) => b.tipe !== 'session' && b.tipe !== 'identity' && b.tipe !== 'profile');
  const faktaTanpaSesi = new Set();
  for (const s of PUBLIK.filter((x) => x.benar)) {
    for (const b of tanpaSesi) {
      const hits = C.search(s.q, { k, type: b.tipe }) || [];
      if (jawabanAda(hits.map((h) => `${h.title || ''}\n${h.text || ''}`).join('\n\n'), s.benar)) { faktaTanpaSesi.add(s.id); break; }
    }
  }
  console.log(`\n${B}Soal fakta yang jawabannya ada di sumber SELAIN transkrip/identitas: ${faktaTanpaSesi.size}/${PUBLIK.filter((x) => x.benar).length}${R} ${A}(${[...faktaTanpaSesi].join(', ') || '—'})${R}`);
  console.log(`${A}Yang tidak ada di sumber mana pun = pengetahuan umum yang korpus ini memang tidak punya — butuh SUMBER baru, bukan cara tarik baru.${R}`);
}
