#!/usr/bin/env node
/**
 * latensi-probe.mjs — GERBANG-S1: latensi keputusan probe G (pembagi syarat (5): p95 S ≤ p50 probe / 20) di sesi Bmax
 * yang MENGANGGUR, SEBELUM memilih max_len/int8 S. Fungsi probe yang SAMA dengan pra-lintasan pg-berpasangan (probe
 * keterjawaban, suhu 0), atas 36 soal PUBLIK T1, satu kali per soal; percobaan gagal diulang ≤ 3 kali dan dicatat.
 *
 * Kenapa (tinjauan adversarial 28 Sep #8): p50 probe historis berkisar 956–9.048 ms, jadi batas rasio bergerak 48–452 ms,
 * sedangkan aturan pemilihan latensi hanya menargetkan 0,40 dtk. Aturan kini: target = min(400, 0,8 × p50_probe / 20) ms.
 *
 *   OLLAMA_HOST=http://127.0.0.1:11434 node eval/gerbang-s1/latensi-probe.mjs <keluar.json>
 *   node eval/gerbang-s1/latensi-probe.mjs --uji
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..', '..');
const imp = (p) => import(pathToFileURL(path.join(AKAR, p)).href);
export const RASIO = 20, RUANG = 0.8, BATAS_MUTLAK_MS = 400;
/** Persentil interpolasi linear — rumus yang SAMA dengan vonis-s1 persentil. */
export const persentil = (a, p) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
/** Target p95 S untuk aturan pemilihan latensi: min(400 ms, 0,8 × p50_probe / 20). */
export const targetS = (p50Probe) => Math.min(BATAS_MUTLAK_MS, (RUANG * p50Probe) / RASIO);

function uji() {
  let gagal = 0; const cek = (n, ok) => { console.log(`${ok ? '✓' : '✗'} ${n}`); if (!ok) gagal++; };
  cek('persentil: median [1,2,3,4] = 2,5; p95 1..100 = 95,05', persentil([4, 1, 3, 2], 0.5) === 2.5 && Math.abs(persentil(Array.from({ length: 100 }, (_, i) => i + 1), 0.95) - 95.05) < 1e-9);
  cek('target: probe 9.000 ms → 360 ms; probe 20.000 ms → 400 (batas mutlak); probe 956 ms → 38,24 ms', targetS(9000) === 360 && targetS(20000) === 400 && Math.abs(targetS(956) - 38.24) < 1e-9);
  console.log(gagal ? `${gagal} uji gagal` : 'latensi-probe: semua uji lulus'); return gagal ? 1 : 0;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(uji());
  const fKeluar = arg[0];
  if (!fKeluar) { console.error('pakai: latensi-probe.mjs <keluar.json> | --uji'); process.exit(2); }
  if (fs.existsSync(fKeluar)) { console.error(`BERHENTI: ${fKeluar} sudah ada`); process.exit(1); }
  const { probe } = await imp('eval/probe-keterjawaban.mjs');
  const { PUBLIK } = await imp('eval/petak-jujur2.mjs');
  const { PROBE } = await import(pathToFileURL(path.join(DI_SINI, 'pg-berpasangan.mjs')).href);
  const hasil = [];
  for (const s of PUBLIK) {
    let h = null, ms = null, coba = 0;
    while (coba < 3 && !h?.ok) { coba++; const t0 = Date.now(); h = await probe(PROBE, s.q); ms = Date.now() - t0; }
    hasil.push({ id: s.id, ok: Boolean(h?.ok), ms, coba });
  }
  const ms = hasil.filter((x) => x.ok).map((x) => x.ms), p50 = persentil(ms, 0.5);
  const keluaran = { alat: 'latensi-probe.mjs', probe: PROBE, host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434', mesin: os.hostname(), cpu: os.cpus()[0]?.model,
    t: new Date().toISOString(), n: hasil.length, gagal: hasil.filter((x) => !x.ok).length, p50, p95: persentil(ms, 0.95), targetS_ms: p50 == null ? null : targetS(p50), hasil };
  fs.writeFileSync(fKeluar, JSON.stringify(keluaran, null, 1));
  console.log(`probe ${PROBE}: p50 ${p50} ms · p95 ${keluaran.p95} ms · gagal ${keluaran.gagal}/${hasil.length} → target p95 S ${keluaran.targetS_ms?.toFixed(1)} ms → ${fKeluar}`);
}
