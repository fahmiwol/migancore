#!/usr/bin/env node
/**
 * misi-kejujuran.mjs — memeriksa berkas misi SEBELUM Fahmi memakainya.
 *
 * ============================== KENAPA ADA ==================================
 * Soal di `misi-kejujuran.json` ditulis MESIN (saya). Itu pembagian yang benar —
 * struktur milik mesin, isi milik Fahmi — tapi ia memindahkan risiko ke tempat
 * baru: kalau soalnya ternyata menyalin soal gerbang, atau satu misi ternyata
 * seluruhnya-menolak, Fahmi akan menghabiskan satu jam menulis jawaban untuk
 * data yang tidak bisa dipakai.
 *
 * Jadi berkas misi diperlakukan seperti data latih: bergerbang sebelum dipakai.
 *
 * Pakai: node ajar/misi-kejujuran.mjs --periksa
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { periksaSet, mirip, KEPUTUSAN, DIMENSI } from './kontras.mjs';
import { soalGerbang } from '../sistem/antre-ajar.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));

export function muatMisi() {
  return JSON.parse(fs.readFileSync(path.join(DIR, 'misi-kejujuran.json'), 'utf8')).misi;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('misi-kejujuran.mjs')
    && process.argv.includes('--periksa')) {
  const misi = muatMisi();
  const sg = soalGerbang();
  let ok = 0, buruk = 0;
  const cek = (n, c, ket = '') => (c ? (ok++, console.log(`  OK    ${n}`))
    : (buruk++, console.log(`  GAGAL ${n}${ket ? ' — ' + ket : ''}`)));

  console.log(`\n# Gerbang berkas misi — ${misi.length} misi, ${misi.reduce((s, m) => s + m.soal.length, 0)} soal\n`);

  // 1. tiap misi lolos gerbang SET (aturan yang sama dengan yang Fahmi hadapi)
  for (const m of misi) {
    const set = m.soal.map((s) => ({ ...s, jawab: 'x' }));
    const p = periksaSet(set, { soalGerbang: sg });
    cek(`${m.id} "${m.judul}" lolos gerbang set`, p.boleh,
      p.masalah.filter((x) => x.berat).map((x) => x.pesan.slice(0, 90)).join(' | '));
  }

  // 2. TIDAK ADA soal yang menyalin/mendekati soal gerbang (C07)
  const semua = misi.flatMap((m) => m.soal.map((s) => ({ ...s, misi: m.id })));
  let dekat = 0, maks = 0, terdekat = '';
  for (const s of semua) {
    for (const g of sg) {
      const v = mirip(s.tanya, g);
      if (v > maks) { maks = v; terdekat = s.tanya; }
      if (v >= 0.5) { dekat++; console.log(`      DEKAT ${v.toFixed(2)}: "${s.tanya}"  vs gerbang "${g.slice(0, 50)}"`); }
    }
  }
  cek(`C07: nol soal berdekatan dengan soal gerbang (maks ${maks.toFixed(2)}, ambang <0,50)`, dekat === 0);
  cek('C07: soal terdekat pun masih jelas berbeda', maks < 0.5, terdekat.slice(0, 60));

  // 3. antar-soal tidak saling parafrase
  let par = 0;
  for (let i = 0; i < semua.length; i++) {
    for (let j = i + 1; j < semua.length; j++) {
      if (mirip(semua[i].tanya, semua[j].tanya) >= 0.5) {
        par++; console.log(`      PARAFRASE: "${semua[i].tanya}" ~ "${semua[j].tanya}"`);
      }
    }
  }
  cek('nol parafrase antar-soal di seluruh berkas', par === 0);

  // 4. medan wajib lengkap
  cek('tiap soal punya keputusan sah', semua.every((s) => Object.keys(KEPUTUSAN).includes(s.keputusan)));
  cek('tiap soal punya dimensi sah', semua.every((s) => (s.dimensi || []).length && s.dimensi.every((d) => DIMENSI[d])));
  cek('tiap soal punya PETUNJUK (Fahmi tahu apa yang diminta)',
    semua.every((s) => s.petunjuk && s.petunjuk.length > 30));
  cek('tiap misi menyebut KENAPA-nya', misi.every((m) => m.kenapa && m.kenapa.length > 50));

  // 5. sebaran keputusan sehat di seluruh berkas
  const per = {};
  for (const s of semua) per[s.keputusan] = (per[s.keputusan] || 0) + 1;
  const menjawab = (per.JAWAB || 0) + (per.HITUNG || 0);
  cek(`sisi MENJAWAB cukup banyak (${menjawab}/${semua.length}, minimal 25%)`, menjawab / semua.length >= 0.25,
    JSON.stringify(per));
  cek('kelima jenis kegagalan terwakili', Object.keys(per).length >= 5, Object.keys(per).join(','));

  console.log('\n  sebaran keputusan: ' + Object.entries(per).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log('\n' + '='.repeat(56));
  console.log(`${ok} lulus · ${buruk} gagal`);
  console.log(buruk ? '\nJANGAN dipakai — betulkan berkas misinya dulu.' : '\nBerkas misi SIAP dipakai Fahmi.');
  process.exit(buruk ? 1 : 0);
}
