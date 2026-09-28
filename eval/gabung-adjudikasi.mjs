#!/usr/bin/env node
/**
 * gabung-adjudikasi.mjs — gabungkan vonis penilai-ketiga (Claude) ke lembar
 * validasi manusia, hitung siapa yang benar, dan tulis lembar PENDEK untuk Fahmi
 * (hanya baris yang masih layak ditengok manusia).
 *
 * Dua tabel dihitung, sengaja:
 *   - "kebenaran"  : vonis menurut pembaca manusia (kunci soal yang cacat dikoreksi)
 *   - "kunci harfiah": vonis mekanis kalau kunci petak dibaca apa adanya
 * Selisih keduanya = ukuran CACAT SOAL, bukan cacat penilai. Tanpa pemisahan ini,
 * regex yang setia pada kunci yang salah akan tampak "salah" padahal soalnya.
 *
 * Pakai: node eval/gabung-adjudikasi.mjs
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kappa } from './verifikator.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADJ = path.join(AKAR, 'eval', 'adjudikasi-claude-14b.json');
const LENGKAP = path.join(AKAR, 'eval', 'perselisihan-14b-lengkap.json');
const LEMBAR = path.join(AKAR, 'eval', 'validasi-manusia-14b.md');
const PENDEK = path.join(AKAR, 'eval', 'validasi-manusia-14b-PENDEK.md');

const adj = JSON.parse(fs.readFileSync(ADJ, 'utf8'));
const lengkap = JSON.parse(fs.readFileSync(LENGKAP, 'utf8'));
const byNo = new Map(lengkap.map((b) => [b.no, b]));
const A = adj.baris;
if (A.length !== lengkap.length) { console.error(`adjudikasi ${A.length} baris ≠ perselisihan ${lengkap.length}`); process.exit(1); }

function tally(pakaiKunci) {
  const r = { regex: 0, penilai: 0, tidakAda: 0, n: A.length };
  const m = [], rg = [], pj = [];
  for (const a of A) {
    const b = byNo.get(a.no);
    const v = (pakaiKunci && a.vonisKunci) ? a.vonisKunci : a.vonis;
    m.push(v); rg.push(b.regex); pj.push(b.penilai);
    if (v === b.regex && v === b.penilai) continue; // tidak mungkin di lembar perselisihan
    if (v === b.regex) r.regex++; else if (v === b.penilai) r.penilai++; else r.tidakAda++;
  }
  r.kappaRegex = kappa(m, rg).kappa; r.kappaPenilai = kappa(m, pj).kappa;
  return r;
}
const kebenaran = tally(false), harfiah = tally(true);
const perJenis = {};
for (const a of A) { const b = byNo.get(a.no); const j = (perJenis[b.jenis] ||= { n: 0, regex: 0, penilai: 0, tidakAda: 0 }); j.n++; const v = a.vonis; if (v === b.regex) j.regex++; else if (v === b.penilai) j.penilai++; else j.tidakAda++; }

// Lembar lengkap: isi kolom Claude
const src = fs.readFileSync(LEMBAR, 'utf8').split(/\r?\n/);
const out = [];
for (const l of src) {
  const m = l.match(/^\|\s*(\d+)\s*\|/);
  if (l.startsWith('| # |')) { out.push(l.replace(/\|\s*$/, '') + ' Vonis Claude | catatan Claude | perlu Fahmi |'); continue; }
  if (l.startsWith('|---|---|')) { out.push(l + '---|---|---|'); continue; }
  if (m) { const a = A.find((x) => x.no === Number(m[1])); out.push(l.replace(/\|\s*$/, '') + ` ${a.vonis}${a.vonisKunci ? ` (kunci: ${a.vonisKunci})` : ''} | ${a.catatan.replace(/\|/g, '\\|')} | ${a.perluFahmi ? '**YA**' : ''} |`); continue; }
  out.push(l);
}
fs.writeFileSync(LEMBAR, out.join('\n'));

// Lembar pendek untuk Fahmi
const perlu = A.filter((a) => a.perluFahmi);
const P = [];
P.push('# Validasi manusia — versi PENDEK (hanya yang masih layak ditengok)');
P.push('');
P.push(`Claude sudah mengisi ke-54 baris sebagai penilai ketiga (lihat \`validasi-manusia-14b.md\`). Yang tersisa untukmu: **${perlu.length} baris** — kedua mesin salah, atau soalnya yang cacat, atau vonisnya tipis. Tulis di kolom terakhir: BENAR · SALAH · NGARANG · TOLAK-FAKTA (atau "SETUJU" kalau setuju dengan Claude).`);
P.push('');
P.push('| # | id | jenis | soal | jawaban model | vonis Claude | kenapa perlu kau | **Vonis Fahmi** |');
P.push('|---|---|---|---|---|---|---|---|');
for (const a of perlu) { const b = byNo.get(a.no); const esc = (t) => String(t || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim(); P.push(`| ${a.no} | ${a.id} | ${b.jenis} | ${esc(b.q)}${b.benar ? ` _(kunci: ${esc(b.benar)})_` : ''} | ${esc(b.teks).slice(0, 320)} | ${a.vonis}${a.vonisKunci ? ` (kunci: ${a.vonisKunci})` : ''} | ${esc(a.catatan).slice(0, 200)} |  |`); }
P.push('');
P.push('## Temuan lintas-baris (untuk kau setujui/tolak, bukan diisi)');
for (const [k, v] of Object.entries(adj.temuanLintasBaris)) { P.push(`- **${k}**: ${Array.isArray(v) ? '' : v}`); if (Array.isArray(v)) for (const x of v) P.push(`  - ${x}`); }
fs.writeFileSync(PENDEK, P.join('\n') + '\n');

const f = (x) => x.toFixed(3);
console.log(`\n# Adjudikasi Claude atas ${A.length} perselisihan\n`);
console.log(`  KEBENARAN (kunci cacat dikoreksi): regex benar ${kebenaran.regex} · penilai benar ${kebenaran.penilai} · keduanya salah ${kebenaran.tidakAda} · κ(Claude,regex) ${f(kebenaran.kappaRegex)} · κ(Claude,penilai) ${f(kebenaran.kappaPenilai)}`);
console.log(`  KUNCI HARFIAH:                     regex benar ${harfiah.regex} · penilai benar ${harfiah.penilai} · keduanya salah ${harfiah.tidakAda}`);
console.log(`  selisih dua tabel = ${Math.abs(kebenaran.regex - harfiah.regex)} baris lahir dari SOAL CACAT (J2-F7)`);
console.log('  per jenis (regex/penilai/keduanya-salah): ' + Object.entries(perJenis).map(([k, v]) => `${k} ${v.regex}/${v.penilai}/${v.tidakAda}`).join(' · '));
console.log(`\n  lembar lengkap diperbarui: ${path.relative(AKAR, LEMBAR)}`);
console.log(`  lembar PENDEK untuk Fahmi : ${path.relative(AKAR, PENDEK)} (${perlu.length} baris)\n`);
