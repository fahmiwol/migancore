#!/usr/bin/env node
/**
 * sistem/kumpul.mjs — pengumpul keadaan nyata MiganCore.
 *
 * ============================ APA YANG DIKUMPULKAN ==========================
 * Satu fungsi membaca SEMUA sumber kebenaran yang tersebar dan mengembalikan
 * satu objek. Sumbernya berkas yang memang sudah jadi hasil kerja — bukan
 * catatan terpisah yang harus diperbarui manual (catatan manual selalu
 * berbohong lebih cepat daripada kode):
 *
 *   register cacat   eval/REGISTER-CACAT.json
 *   skor model       eval/hasil-arit-*.json, hasil-tolak-*.json, hasil-kenari-*.json
 *   cluster latih    flywheel/dataset/v13/cluster-*.jsonl
 *   data ajar baru   flywheel/dataset/ajar/*.jsonl
 *   sanad artefak    models/SANAD-*.json
 *   pra-daftar       flywheel/PRA-DAFTAR-V13.json (sidik vs data sekarang)
 *
 * ANALISA, bukan sekadar angka: setiap model dibandingkan terhadap pembanding
 * yang sama, regresi ditandai, dan sidik pra-daftar diperiksa kedaluwarsanya.
 * Angka tanpa pembanding tidak memberi tahu apa pun — itu pelajaran termahal
 * proyek ini.
 *
 * Pakai: import { kumpul } from './sistem/kumpul.mjs'
 *        node sistem/kumpul.mjs              (cetak ringkas)
 *        node sistem/kumpul.mjs --uji-instrumen
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DIR, '..');

const p = (...x) => path.join(AKAR, ...x);
const bacaJSON = (rel) => { try { return JSON.parse(fs.readFileSync(p(rel), 'utf8')); } catch { return null; } };
const barisJSONL = (abs) => {
  try {
    return fs.readFileSync(abs, 'utf8').split('\n').filter((x) => x.trim()).length;
  } catch { return 0; }
};
const sidik16 = (abs) => {
  try { return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 16); }
  catch { return null; }
};

/** Angka "benar/total" dari berkas hasil aritmetika. */
export function ringkasArit(j) {
  if (!j?.ringkas) return null;
  const s0 = j.ringkas['suhu-0'] ?? { benar: 0, total: 0 };
  const s3 = j.ringkas['suhu-0.3'] ?? { benar: 0, total: 0 };
  const benar = s0.benar + s3.benar, total = s0.total + s3.total;
  const cocok = (re) => {
    const b = (j.rinci ?? []).filter((r) => re.test(r.soal));
    return b.length ? `${b.filter((r) => r.ok).length}/${b.length}` : null;
  };
  return {
    benar, total, persen: total ? Math.round((benar * 100) / total) : 0,
    ton: cocok(/ton x Rp.*berapa total/i),
    rata: cocok(/rata-rata/i),
  };
}

/** Bandingkan model terhadap pembanding: naik / turun / setara, per ukuran. */
export function banding(model, acuan) {
  const arah = (a, b) => {
    if (a == null || b == null) return null;
    const n = (s) => { const [x, y] = String(s).split('/').map(Number); return y ? x / y : null; };
    const va = typeof a === 'number' ? a : n(a), vb = typeof b === 'number' ? b : n(b);
    if (va == null || vb == null) return null;
    const beda = va - vb;
    return { beda: Math.round(beda * 1000) / 1000, naik: beda > 0.001, turun: beda < -0.001 };
  };
  return {
    arit: arah(model.arit?.benar / (model.arit?.total || 1), acuan.arit?.benar / (acuan.arit?.total || 1)),
    ton: arah(model.arit?.ton, acuan.arit?.ton),
    tolak: arah(model.tolak, acuan.tolak),
  };
}

export function kumpul() {
  const hasil = { waktu: new Date().toISOString() };

  // ── register cacat ────────────────────────────────────────────────────
  const reg = bacaJSON('eval/REGISTER-CACAT.json');
  const kelas = Array.isArray(reg) ? reg : reg?.cacat ?? [];
  hasil.cacat = {
    jumlah: kelas.length,
    dijaga: kelas.filter((c) => c.status === 'dijaga').length,
    seringBerulang: kelas
      .filter((c) => (c.berulang ?? 1) > 1)
      .sort((a, b) => (b.berulang ?? 0) - (a.berulang ?? 0))
      .slice(0, 4)
      .map((c) => ({ kode: c.kode, kelas: c.kelas, berulang: c.berulang })),
  };

  // ── model & skornya ───────────────────────────────────────────────────
  const evalDir = p('eval');
  const model = {};
  if (fs.existsSync(evalDir)) {
    for (const f of fs.readdirSync(evalDir)) {
      let m;
      if ((m = f.match(/^hasil-arit-(.+?)-dengan\.json$/))) {
        const nama = m[1].replace(/_/g, ':');
        (model[nama] ??= {}).arit = ringkasArit(JSON.parse(fs.readFileSync(path.join(evalDir, f), 'utf8')));
      } else if ((m = f.match(/^hasil-tolak-(.+?)\.json$/))) {
        const nama = m[1].replace(/_/g, ':');
        const j = JSON.parse(fs.readFileSync(path.join(evalDir, f), 'utf8'));
        (model[nama] ??= {}).tolak = `${j.benar}/${j.total}`;
      } else if ((m = f.match(/^hasil-kenari-(.+?)\.json$/))) {
        const nama = m[1].replace(/_/g, ':');
        const j = JSON.parse(fs.readFileSync(path.join(evalDir, f), 'utf8'));
        (model[nama] ??= {}).kenari = `${j.keluar}/${j.total}`;
      }
    }
  }
  hasil.model = model;

  // ANALISA: siapa terbaik, dan apa yang turun dibanding pembandingnya
  const acuanNama = 'migancore:0.11-4b';
  const acuan = model[acuanNama];
  hasil.analisa = { acuan: acuanNama, terhadapAcuan: {} };
  if (acuan) {
    for (const [nama, m] of Object.entries(model)) {
      if (nama === acuanNama || !m.arit) continue;
      hasil.analisa.terhadapAcuan[nama] = banding(m, acuan);
    }
  }
  const berskor = Object.entries(model).filter(([, m]) => m.arit?.total);
  hasil.analisa.terbaikArit = berskor.length
    ? berskor.sort((a, b) => (b[1].arit.persen ?? 0) - (a[1].arit.persen ?? 0))[0][0]
    : null;

  // ── cluster latih + kesegaran pra-daftar ──────────────────────────────
  const pra = bacaJSON('flywheel/PRA-DAFTAR-V13.json');
  const v13 = p('flywheel', 'dataset', 'v13');
  hasil.cluster = {};
  if (fs.existsSync(v13)) {
    for (const f of fs.readdirSync(v13)) {
      const m = f.match(/^cluster-(.+)\.jsonl$/);
      if (!m) continue;
      const abs = path.join(v13, f);
      const s = sidik16(abs);
      hasil.cluster[m[1]] = {
        baris: barisJSONL(abs),
        sidik: s,
        praDaftarCocok: pra?.sidikCluster?.[m[1]] ? pra.sidikCluster[m[1]] === s : null,
      };
    }
  }

  // ── data ajar baru (belum dilatihkan) ─────────────────────────────────
  const ajarDir = p('flywheel', 'dataset', 'ajar');
  hasil.ajar = {};
  if (fs.existsSync(ajarDir)) {
    for (const f of fs.readdirSync(ajarDir)) {
      if (!f.endsWith('.jsonl') || f.startsWith('__')) continue;
      const n = barisJSONL(path.join(ajarDir, f));
      if (n) hasil.ajar[f.replace('.jsonl', '')] = n;
    }
  }

  // ── sanad artefak ─────────────────────────────────────────────────────
  hasil.sanad = {};
  const mdir = p('models');
  if (fs.existsSync(mdir)) {
    for (const f of fs.readdirSync(mdir)) {
      if (!f.startsWith('SANAD-') || !f.endsWith('.json')) continue;
      const j = bacaJSON(`models/${f}`);
      const rantai = j?.rantai ?? [];
      hasil.sanad[f.replace('SANAD-', '').replace('.json', '')] = {
        mata: rantai.length,
        dhaif: rantai.filter((r) => r.status === 'dhaif').length,
        belum: rantai.filter((r) => r.status === 'belum-diperiksa').length,
        bersambung: rantai.length > 0 && rantai.every((r) => r.status === 'sahih'),
      };
    }
  }

  return hasil;
}

// ────────────────────────────────────────────────── uji instrumen ──
function ujiInstrumen() {
  const k = kumpul();
  const kasus = [
    ['register terbaca', k.cacat.jumlah >= 10 && k.cacat.dijaga >= 10],
    ['cacat berulang terurut menurun',
      k.cacat.seringBerulang.every((c, i, a) => i === 0 || a[i - 1].berulang >= c.berulang)],
    ['ada model berskor', Object.keys(k.model).length >= 2],
    ['ringkasArit menjumlah dua suhu', (() => {
      const r = ringkasArit({ ringkas: { 'suhu-0': { benar: 9, total: 10 }, 'suhu-0.3': { benar: 7, total: 10 } }, rinci: [] });
      return r.benar === 16 && r.total === 20 && r.persen === 80;
    })()],
    ['ringkasArit menolak berkas tanpa ringkas', ringkasArit({}) === null],
    ['banding mengenali NAIK', (() => {
      const b = banding({ arit: { benar: 60, total: 60 }, tolak: '9/10' }, { arit: { benar: 55, total: 60 }, tolak: '8/10' });
      return b.arit.naik === true && b.tolak.naik === true;
    })()],
    ['banding mengenali TURUN', (() => {
      const b = banding({ arit: { benar: 41, total: 60 } }, { arit: { benar: 55, total: 60 } });
      return b.arit.turun === true;
    })()],
    ['banding aman saat data hilang', banding({}, {}).ton === null],
    ['cluster membawa sidik + kesegaran pra-daftar',
      Object.values(k.cluster).every((c) => c.sidik && typeof c.praDaftarCocok !== 'undefined')],
    ['sanad menandai mata dhaif',
      Object.values(k.sanad).every((s) => typeof s.dhaif === 'number' && typeof s.bersambung === 'boolean')],
    ['terbaik-aritmetika terpilih', k.analisa.terbaikArit !== null],
  ];
  let g = 0;
  for (const [n, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${n}`); if (!ok) g++; }
  console.log(`\n${kasus.length - g}/${kasus.length} lulus`);
  process.exit(g ? 1 : 0);
}

const iniUtama = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (iniUtama) {
  if (process.argv.includes('--uji-instrumen')) ujiInstrumen();
  const k = kumpul();
  console.log(JSON.stringify(k, null, 1).slice(0, 2400));
}
