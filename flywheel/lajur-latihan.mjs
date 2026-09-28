#!/usr/bin/env node
/**
 * lajur-latihan.mjs — SATU tabel berisi setiap run latih yang pernah terjadi,
 * disilangkan dari lima sumber bukti yang berbeda.
 *
 * ============================== KENAPA INI ADA ==============================
 * Fahmi, 10 Sep 2026 (disarikan): sudah lebih dari 17 kali latihan; ia khawatir banyak yang
 * terlewat, tumpang tindih, dan terulang.
 *
 * Ingatannya benar dan jumlahnya lebih banyak: **18 pra-daftar · 26 log run
 * vast · 29 adapter — tapi hanya 4 SANAD.** Banyak yang dijalankan, sedikit yang
 * rantainya tercatat. Itu persis kondisi yang membuat orang mengulang percobaan
 * yang sudah pernah gagal.
 *
 * Berkas ini tidak menyimpan fakta baru. Ia MENYILANGKAN yang sudah ada:
 *
 *   pra-daftar  → hipotesis + ambang + vonis
 *   adapter     → apakah bobotnya masih ada
 *   log vast    → apakah GPU benar-benar disewa
 *   SANAD       → apakah rantai periwayatannya tercatat
 *   berkas hasil→ apakah pernah DIUKUR
 *
 * Yang dicari bukan kelengkapan, melainkan LUBANG: run yang punya adapter tapi
 * tanpa vonis, hipotesis yang sama dijalankan dua kali, dan bobot yang sudah
 * dibayar tapi tak pernah diukur.
 *
 * Pakai:
 *   node flywheel/lajur-latihan.mjs            (tabel + lubang)
 *   node flywheel/lajur-latihan.mjs --md       (markdown, untuk arsip Bmax)
 *   node flywheel/lajur-latihan.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kumpulkanAdapter, objektifHidup } from './panen-adapter.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', A = '\x1b[2m', B = '\x1b[1m', R = '\x1b[0m';

const bacaJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

/** Vonis sebuah pra-daftar, di mana pun medannya bersembunyi. */
export function petikVonis(pra) {
  if (!pra) return null;
  for (const [k, v] of Object.entries(pra)) {
    if (!/vonis/i.test(k)) continue;
    if (typeof v === 'string') return { medan: k, hasil: v };
    if (v && typeof v === 'object') {
      const h = v.hasil ?? v.vonis ?? v.status;
      if (h) return { medan: k, hasil: String(h) };
    }
  }
  return null;
}

/** Kelas vonis, dipakai menandai lubang. */
export function kelasVonis(teks) {
  if (!teks) return 'TANPA-VONIS';
  const t = teks.toUpperCase();
  if (/BELUM DIVONIS|TIDAK SELESAI|BELUM DIJALANKAN/.test(t)) return 'BELUM';
  if (/GAGAL|DITOLAK|DICABUT|TIDAK MENANG/.test(t)) return 'GAGAL';
  if (/LULUS|DITERIMA|BERHASIL|MENANG/.test(t)) return 'LULUS';
  return 'LAIN';
}

export function kumpulkanPraDaftar(akar = AKAR) {
  const dir = path.join(akar, 'flywheel');
  let nama = [];
  try { nama = fs.readdirSync(dir).filter((f) => /^PRA-DAFTAR-.*\.json$/.test(f)); } catch { return []; }
  return nama.map((f) => {
    const j = bacaJson(path.join(dir, f));
    const v = petikVonis(j);
    return {
      berkas: f,
      nama: j?.nama ?? f.replace(/^PRA-DAFTAR-|\.json$/g, ''),
      tanggal: j?.tanggal ?? null,
      vonis: v?.hasil ?? null,
      medanVonis: v?.medan ?? null,
      kelas: kelasVonis(v?.hasil),
    };
  }).sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
}

export function kumpulkanLogVast(akar = AKAR) {
  const dir = path.join(akar, 'flywheel', 'vast');
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.log')).map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { berkas: f, bita: st.size, tanggal: st.mtime.toISOString().slice(0, 10) };
    }).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  } catch { return []; }
}

export function kumpulkanSanad(akar = AKAR) {
  const dir = path.join(akar, 'models');
  try {
    return fs.readdirSync(dir).filter((f) => /^SANAD-.*\.json$/.test(f)).map((f) => {
      const j = bacaJson(path.join(dir, f));
      // `berlakuUntuk` dibaca dari SANAD-nya sendiri. Versi pertama mencocokkan
      // NAMA BERKAS, dan itu melaporkan `migancore:0.14` sebagai TANPA-SANAD
      // padahal rantainya ada — di bawah nama `14k`. Bukti bahwa keduanya satu
      // bobot: `ollama list` memberi digest yang sama (d334393c0815).
      // Yang diperbaiki DATANYA (SANAD menyebut nama yang dicakupnya), bukan
      // pencocoknya dengan alias yang di-hardcode: alias di kode akan basi diam-diam,
      // alias di data ikut berpindah bersama artefaknya.
      return {
        berkas: f,
        model: f.replace(/^SANAD-|\.json$/g, ''),
        mata: (j?.rantai || []).length,
        dhaif: (j?.rantai || []).filter((m) => m.status === 'dhaif').length,
        berlakuUntuk: Array.isArray(j?.berlakuUntuk) ? j.berlakuUntuk : [],
      };
    });
  } catch { return []; }
}

/** Model mana saja yang PERNAH diukur di petak-jujur2. */
export function modelTerukur(akar = AKAR) {
  const dir = path.join(akar, 'eval');
  const set = new Set();
  try {
    for (const f of fs.readdirSync(dir)) {
      const m = /^hasil-jujur2-(.+?)-(?:gerbang|retrieval|p\d)/.exec(f);
      if (m) set.add(m[1]);
    }
  } catch { /* kosong */ }
  return set;
}

/**
 * LUBANG — inilah gunanya berkas ini. Tiga jenis, masing-masing punya ongkos.
 */
export function cariLubang({ praDaftar, adapter, sanad, terukur }) {
  const lubang = [];

  // Percobaan yang SEDANG BERJALAN bukan lubang. Membedakannya penting: A8
  // menutup 4 dari 4 hipotesis lama, tapi angkanya berhenti di 4 karena metrik
  // versi pertama ikut menghitung dua pra-daftar yang ditulis HARI INI dan
  // pengukurannya masih jalan. Metrik yang menghukum kerja yang sedang berjalan
  // membuat orang berhenti mempercayainya.
  //
  // Tanda "sedang berjalan" yang bisa diperiksa mesin: pra-daftar bertanggal
  // hari ini atau kemarin. Bukan tanda sempurna, tapi ia jujur tentang apa yang
  // diukurnya — dan yang lebih tua dari itu memang layak disebut terlewat.
  const hariIni = new Date();
  const bataSegar = new Date(hariIni.getTime() - 36 * 3600 * 1000).toISOString().slice(0, 10);
  for (const p of praDaftar) {
    if (p.kelas !== 'TANPA-VONIS' && p.kelas !== 'BELUM') continue;
    const segar = p.tanggal && p.tanggal >= bataSegar;
    lubang.push({
      jenis: segar ? 'SEDANG-BERJALAN' : 'HIPOTESIS-MENGGANTUNG',
      apa: p.nama,
      sebab: p.vonis ? p.vonis.slice(0, 90) : (segar ? 'pra-daftar baru, pengukurannya belum selesai' : 'tidak ada medan vonis sama sekali'),
    });
  }
  for (const a of adapter) {
    if (!a.ringkasan) continue;
    const kunci = path.basename(a.jalur).replace(/\.tgz$/, '').replace(/^lora-/, '').toLowerCase();
    const pernah = [...terukur].some((m) => m.toLowerCase().includes(kunci) || kunci.includes(m.toLowerCase().replace(/^migancore_/, '')));
    if (!pernah) lubang.push({ jenis: 'BOBOT-TAK-DIUKUR', apa: a.jalur, sebab: `${a.ringkasan.tahap}/${a.ringkasan.cluster}, ${a.ringkasan.nRollout ?? '?'} rollout — latihan dibayar, hasil tak pernah dibaca` });
  }
  // Dua jalan mencocokkan: nama berkas SANAD (warisan) ATAU medan `berlakuUntuk`
  // yang dideklarasikan SANAD itu sendiri (cara yang benar).
  const punyaSanad = new Set(sanad.map((s) => s.model.toLowerCase()));
  // `?? []` bukan kelalaian yang ditambal: SANAD lama (12, 13, uji-jujur-1) memang
  // belum punya medan ini, dan mereka harus tetap terbaca lewat nama berkas.
  const dicakup = new Set(sanad.flatMap((s) => (s.berlakuUntuk ?? []).map((x) => String(x).toLowerCase().replace(/[:/]/g, '_'))));
  for (const m of terukur) {
    if (!/^migancore/i.test(m)) continue;
    const kunci = m.toLowerCase();
    if (dicakup.has(kunci)) continue;                       // dideklarasikan SANAD
    const bersih = kunci.replace(/^migancore_/, 'migancore-');
    if ([...punyaSanad].some((s) => bersih.includes(s) || s.includes(bersih.replace('migancore-', '')))) continue;
    lubang.push({ jenis: 'TANPA-SANAD', apa: m, sebab: 'diukur dan dipakai, tapi rantai periwayatannya tidak tercatat' });
  }
  return lubang;
}

// ─────────────────────────────────────────────────────────────────── uji ──
function uji() {
  let ok = 0, bad = 0;
  const cek = (n, c) => { if (c) ok++; else { bad++; console.log(`  ${M}GAGAL${R} ${n}`); } };

  cek('vonis string langsung terbaca', petikVonis({ vonis: 'LULUS semua' }).hasil === 'LULUS semua');
  cek('vonis bersarang di .hasil', petikVonis({ vonis_10Sep: { hasil: 'DITERIMA' } }).hasil === 'DITERIMA');
  cek('vonis bersarang di .status', petikVonis({ vonisX: { status: 'TIDAK SELESAI' } }).hasil === 'TIDAK SELESAI');
  cek('tanpa medan vonis -> null', petikVonis({ nama: 'x' }) === null);

  cek('kelas BELUM dari kalimat nyata V17', kelasVonis('BELUM DIVONIS — saldo habis di 71% merge') === 'BELUM');
  cek('kelas GAGAL', kelasVonis('GAGAL pada gerbang REGRESI') === 'GAGAL');
  cek('kelas LULUS', kelasVonis('LULUS seluruh ambang') === 'LULUS');
  cek('tanpa vonis', kelasVonis(null) === 'TANPA-VONIS');
  // "TIDAK MENANG" harus GAGAL, bukan LULUS — kata "MENANG" ada di dalamnya.
  cek('TIDAK MENANG bukan LULUS', kelasVonis('LULUS gerbang tapi TIDAK MENANG') === 'GAGAL');

  // Pra-daftar HARI INI yang belum bervonis = SEDANG-BERJALAN, bukan lubang.
  const hariIniStr = new Date().toISOString().slice(0, 10);
  const lubSegar = cariLubang({
    praDaftar: [{ nama: 'baru', kelas: 'TANPA-VONIS', vonis: null, tanggal: hariIniStr }],
    adapter: [], sanad: [], terukur: new Set(),
  });
  cek('pra-daftar hari ini = SEDANG-BERJALAN, bukan menggantung',
    lubSegar[0].jenis === 'SEDANG-BERJALAN');
  cek('pra-daftar lama tanpa vonis TETAP menggantung',
    cariLubang({ praDaftar: [{ nama: 'tua', kelas: 'TANPA-VONIS', vonis: null, tanggal: '2026-08-22' }], adapter: [], sanad: [], terukur: new Set() })[0].jenis === 'HIPOTESIS-MENGGANTUNG');

  const lub = cariLubang({
    praDaftar: [{ nama: 'v17', kelas: 'BELUM', vonis: 'saldo habis', tanggal: '2026-09-01' }, { nama: 'v14', kelas: 'LULUS', vonis: 'ok', tanggal: '2026-08-23' }],
    adapter: [{ jalur: 'models/x/lora-rlvr1.tgz', ringkasan: { tahap: 'MO-GRPO', cluster: 'tool-grpo', nRollout: 5760 } }],
    sanad: [{ model: 'migancore-14k' }],
    terukur: new Set(['migancore_0.14']),
  });
  cek('hipotesis menggantung tertangkap', lub.some((x) => x.jenis === 'HIPOTESIS-MENGGANTUNG' && x.apa === 'v17'));
  cek('yang sudah LULUS tidak ditandai', !lub.some((x) => x.apa === 'v14'));
  cek('bobot tak diukur tertangkap', lub.some((x) => x.jenis === 'BOBOT-TAK-DIUKUR'));
  cek('model tanpa SANAD tertangkap', lub.some((x) => x.jenis === 'TANPA-SANAD'));
  // Kasus NYATA 10 Sep: 0.14 punya rantai, tapi di bawah nama `14k` (digest sama).
  // SANAD yang menyebut cakupannya sendiri harus menutup lubang itu.
  cek('berlakuUntuk menutup lubang alias',
    cariLubang({
      praDaftar: [], adapter: [],
      sanad: [{ model: 'migancore-14k', berlakuUntuk: ['migancore:0.14k', 'migancore:0.14'] }],
      terukur: new Set(['migancore_0.14']),
    }).length === 0);
  cek('tanpa berlakuUntuk, alias TIDAK tertutup',
    cariLubang({
      praDaftar: [], adapter: [],
      sanad: [{ model: 'migancore-99z', berlakuUntuk: [] }],
      terukur: new Set(['migancore_0.14']),
    }).some((x) => x.jenis === 'TANPA-SANAD'));

  cek('pra-daftar nyata terbaca', kumpulkanPraDaftar().length >= 15);
  cek('log vast nyata terbaca', kumpulkanLogVast().length >= 20);

  console.log(bad === 0 ? `${H}${ok} lulus${R}` : `${M}${bad} gagal${R}, ${ok} lulus`);
  return bad === 0 ? 0 : 1;
}

/** Markdown untuk arsip Bmax. Dibangkitkan, tidak pernah diketik. */
export function bangunMarkdown(akar = AKAR, commit = '?') {
  const pra = kumpulkanPraDaftar(akar);
  const ad = kumpulkanAdapter(akar);
  const sn = kumpulkanSanad(akar);
  const vast = kumpulkanLogVast(akar);
  const terukur = modelTerukur(akar);
  const lubang = cariLubang({ praDaftar: pra, adapter: ad, sanad: sn, terukur });

  const L = [];
  L.push('# 06 — LAJUR LATIHAN: setiap run yang pernah terjadi\n');
  L.push(`> DIBANGKITKAN ${new Date().toISOString().slice(0, 19)}Z dari commit \`${commit}\`.`);
  L.push('> Jangan disunting tangan — jalankan `node flywheel/lajur-latihan.mjs --md`.\n');
  L.push('Lahir dari kekhawatiran Fahmi (10 Sep): sesudah lebih dari 17 kali latihan, banyak');
  L.push('yang mungkin terlewat, tumpang tindih, atau terulang. Berkas ini');
  L.push('menyilangkan lima sumber bukti supaya "sudah pernah dicoba belum?" bisa');
  L.push('dijawab sekali lihat.\n');
  L.push('## Hitungan\n');
  L.push('| sumber bukti | jumlah |');
  L.push('|---|---|');
  L.push(`| pra-daftar (hipotesis berambang) | **${pra.length}** |`);
  L.push(`| log run vast (GPU disewa) | **${vast.length}** |`);
  L.push(`| adapter LoRA masih ada | **${ad.length}** |`);
  L.push(`| SANAD (rantai periwayatan) | **${sn.length}** |`);
  L.push(`| model pernah diukur | **${terukur.size}** |\n`);
  L.push(`Ketimpangannya sendiri temuan: **${ad.length} adapter, ${sn.length} SANAD.**`);
  L.push('Banyak yang dijalankan, sedikit yang rantainya tercatat.\n');

  L.push('## Pra-daftar, berurutan waktu\n');
  L.push('| tanggal | pra-daftar | kelas | vonis |');
  L.push('|---|---|---|---|');
  for (const p of pra) L.push(`| ${p.tanggal ?? '—'} | \`${p.nama}\` | **${p.kelas}** | ${(p.vonis ?? '—').replace(/\|/g, '/').slice(0, 110)} |`);
  L.push('');

  const grpo = ad.filter((a) => a.ringkasan?.tahap);
  if (grpo.length) {
    L.push('## Run MO-GRPO dan sinyal gradiennya\n');
    L.push('Di GRPO, gradien lahir dari variasi ganjaran DALAM kelompok. Ragam 0 % =');
    L.push('keuntungan nol = objektif itu tidak mengajarkan apa pun, meski komputasinya');
    L.push('tetap dibayar penuh.\n');
    L.push('| adapter | langkah | rollout | objektif HIDUP | objektif MATI |');
    L.push('|---|---|---|---|---|');
    for (const a of grpo) {
      const o = objektifHidup(a.ringkasan.ragamPerObjektif);
      L.push(`| \`${a.jalur.replace(/\\/g, '/')}\` | ${a.ringkasan.langkah ?? '?'} | ${a.ringkasan.nRollout ?? '?'} | ${o.hidup.map((x) => `${x.nama} ${x.persen}%`).join(' · ') || '—'} | ${o.mati.map((x) => x.nama).join(' · ') || '—'} |`);
    }
    L.push('');
  }

  L.push(`## LUBANG — ${lubang.length} hal yang sudah dibayar tapi belum ditutup\n`);
  for (const jenis of ['HIPOTESIS-MENGGANTUNG', 'BOBOT-TAK-DIUKUR', 'TANPA-SANAD', 'SEDANG-BERJALAN']) {
    const g = lubang.filter((x) => x.jenis === jenis);
    if (!g.length) continue;
    L.push(`### ${jenis} (${g.length})\n`);
    for (const x of g) L.push(`- \`${String(x.apa).replace(/\\/g, '/')}\` — ${x.sebab}`);
    L.push('');
  }
  return L.join('\n');
}

// ────────────────────────────────────────────────────────────────── main ──
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  if (process.argv.includes('--uji')) process.exit(uji());
  if (process.argv.includes('--md')) { process.stdout.write(bangunMarkdown()); process.exit(0); }

  const pra = kumpulkanPraDaftar(), ad = kumpulkanAdapter(), sn = kumpulkanSanad(), vast = kumpulkanLogVast();
  const terukur = modelTerukur();
  const lubang = cariLubang({ praDaftar: pra, adapter: ad, sanad: sn, terukur });

  console.log(`\n${B}# Lajur latihan — silang lima sumber bukti${R}\n`);
  console.log(`  pra-daftar ${String(pra.length).padStart(3)} · log vast ${String(vast.length).padStart(3)} · adapter ${String(ad.length).padStart(3)} · SANAD ${String(sn.length).padStart(3)} · model terukur ${terukur.size}`);
  console.log(`  ${K}${ad.length} adapter tapi ${sn.length} SANAD — banyak dijalankan, sedikit tercatat${R}\n`);

  const perKelas = {};
  for (const p of pra) perKelas[p.kelas] = (perKelas[p.kelas] || 0) + 1;
  console.log(`  vonis pra-daftar: ${Object.entries(perKelas).map(([k, v]) => `${k} ${v}`).join(' · ')}\n`);

  console.log(`${B}## LUBANG — ${lubang.length} hal sudah dibayar, belum ditutup${R}\n`);
  for (const jenis of ['HIPOTESIS-MENGGANTUNG', 'BOBOT-TAK-DIUKUR', 'TANPA-SANAD', 'SEDANG-BERJALAN']) {
    const g = lubang.filter((x) => x.jenis === jenis);
    if (!g.length) continue;
    const w = jenis === 'BOBOT-TAK-DIUKUR' ? M : K;
    console.log(`  ${w}${jenis}${R} (${g.length})`);
    for (const x of g.slice(0, 8)) console.log(`    ${A}${String(x.apa).replace(/\\/g, '/').slice(0, 46).padEnd(48)}${x.sebab.slice(0, 74)}${R}`);
    if (g.length > 8) console.log(`    ${A}… ${g.length - 8} lagi${R}`);
    console.log('');
  }
}
