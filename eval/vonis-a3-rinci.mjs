#!/usr/bin/env node
/**
 * vonis-a3-rinci.mjs — rincian vonis A3 (jangkar base mentah) dan hasil MEKANIS A4,
 * dihitung HANYA dengan fungsi yang sudah dikunci di eval/ambang-bibit.mjs.
 *
 * Kenapa berkas terpisah, bukan mengubah ambang-bibit.mjs:
 * alat itu masih menurunkan ambang dari JANGKAR gen-1 (`migancore:0.4-qwen3`). A4 menuntut
 * aturan yang sama diterapkan pada jangkar A3 (`qwen3:4b`). Mengganti konstanta JANGKAR di alat
 * gerbang akan langsung mengubah vonis gerbang bibit untuk semua pembaca alat itu, padahal
 * hasil mekanisnya (lihat keluaran) gagal uji tujuan aturannya sendiri. Keputusan itu milik
 * Fahmi; berkas ini hanya MENGHITUNG dan tidak menulis apa pun.
 *
 * Pakai: node eval/vonis-a3-rinci.mjs
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bacaModel, selang, turunkanAmbang, bedaKondisi, JANGKAR } from './ambang-bibit.mjs';
import { nilai2, metrik } from './instrumen-jujur2.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const STOK = 'qwen3:4b';

// Per putaran sah: stempel, MENGARANG, over-refusal, akurasi fakta, per jenis (dinilai ulang).
const awalan = `hasil-jujur2-${STOK.replace(/[:/]/g, '_')}-p`;
const putaran = [];
const perJenis = {};
for (const f of fs.readdirSync(DI_SINI).filter((x) => x.startsWith(awalan) && x.endsWith('.json')).sort()) {
  const j = JSON.parse(fs.readFileSync(path.join(DI_SINI, f), 'utf8'));
  if (!Array.isArray(j.baris) || (j.bank && j.bank !== 'petak-jujur2') || j.petak !== 36) continue;
  if (j.rangkuman?.sah !== true || j.gerbang || j.retrieval) continue;
  const baru = j.baris.filter((b) => b.hasil !== 'GALAT').map((b) => ({ ...b, ...nilai2(b.soal, b.teks) }));
  const m = metrik(baru);
  putaran.push({ berkas: f, MENGARANG_pct: m.MENGARANG_pct, over_refusal_pct: m.over_refusal_pct, fakta_akurasi: m.fakta_akurasi, abstain_recall: m.abstain_recall, galat: j.baris.length - baru.length, berNalar: j.baris.filter((b) => b.pikir).length });
  for (const [k, v] of Object.entries(m.perJenis || {})) {
    perJenis[k] ??= { benar: 0, total: 0 };
    perJenis[k].benar += v.benar; perJenis[k].total += v.total;
  }
}

const stok = bacaModel(STOK);
const s = stok.selang;
const ambangA4 = turunkanAmbang(s);
const gen1 = bacaModel(JANGKAR);

console.log(`\n# A3 — ${STOK} polos di petak-jujur2\n`);
for (const p of putaran) console.log(`  ${p.berkas.padEnd(52)} MENGARANG ${String(p.MENGARANG_pct).padStart(5)} % · over-refusal ${p.over_refusal_pct} % · fakta ${p.fakta_akurasi} · galat ${p.galat} · ber-nalar ${p.berNalar}`);
console.log(`\n  n=${s.n} · rata ${s.rata.toFixed(2)} · sd ${s.sd.toFixed(2)} · SE ${s.se.toFixed(2)} · t(${s.n - 1})=${s.t} · CI95 ${s.bawah.toFixed(2)} .. ${s.atas.toFixed(2)}`);
console.log(`  per jenis (benar/total, 5 putaran): ${Object.entries(perJenis).map(([k, v]) => `${k} ${v.benar}/${v.total} (${Math.round((100 * v.benar) / v.total)} %)`).join(' · ')}`);

console.log(`\n# A4 — aturan lama apa adanya pada jangkar A3`);
console.log(`  ambang mekanis: MENGARANG <= ${ambangA4} %   (batas atas CI95 ${s.atas.toFixed(2)}, dibulatkan ke atas)`);
console.log(`  ambang yang berlaku sekarang (jangkar gen-1 ${JANGKAR}): <= ${turunkanAmbang(gen1.selang)} %`);
console.log(`  kondisi A3 vs gen-1 yang berbeda: ${bedaKondisi(gen1, stok).map((x) => x.nama).join(', ') || '—'}`);

console.log(`\n# Uji tujuan: berapa model terukur yang DITOLAK ambang mekanis ini?`);
const kandidat = ['migancore:0.4-qwen3', 'migancore:0.14', 'migancore:0.14-tool', 'migancore:uji-jujur-1', 'qwen2.5:7b'];
let ditolak = 0;
for (const m of kandidat) {
  const g = bacaModel(m);
  if (!g.selang) { console.log(`  ${m.padEnd(24)} (tidak ada putaran polos sah)`); continue; }
  const lulus = g.selang.atas <= ambangA4;
  const teguh = lulus ? 'LULUS' : g.selang.rata <= ambangA4 ? 'BELUM TEGUH' : 'DITOLAK';
  if (teguh === 'DITOLAK') ditolak++;
  console.log(`  ${m.padEnd(24)} rata ${g.selang.rata.toFixed(1).padStart(5)} % · CI95 ${g.selang.bawah.toFixed(1)}..${g.selang.atas.toFixed(1)} · n=${g.nBerkas} → ${teguh}`);
}
console.log(`  ditolak: ${ditolak} dari ${kandidat.length}`);
