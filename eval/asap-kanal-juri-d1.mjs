#!/usr/bin/env node
/**
 * asap-kanal-juri-d1.mjs — UJI ASAP kanal juri D1 (pra-daftar flywheel/PRA-DAFTAR-D1-NPC-SPESIALIS.json →
 * prosedurPelabel_DIBEKUKAN.asapKanalJuri). DIAGNOSTIK: bukan instrumen, bukan data vonis.
 *
 * Satu batch ≤ 25 butir KALIBRASI (eval/kalibrasi-juri-d1/sampel.json — bukan data D1): kelima butir tahu/antar lalu butir
 * luar menurut urutan berkas sampai 25, per juri, lewat jalankanClaude + promptJuri + terimaKeluaranJuri + masalahInfraJuri yang
 * SAMA dengan pelabelan D1 (biner resmi, env dibersihkan, effort max). Dicatat: model, num_turns, stop_reason, stderr, token
 * keluar & pikir, batas token, durasi; label dibandingkan dengan label kalibrasi juri yang sama (deskriptif).
 *
 *   node eval/asap-kanal-juri-d1.mjs            # kedua juri → eval/asap-kanal-juri-d1/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const N = await import(pathToFileURL(path.join(DI_SINI, 'nilai-d1.mjs')).href);
const KAL = path.join(DI_SINI, 'kalibrasi-juri-d1');
const KELUAR = path.join(DI_SINI, 'asap-kanal-juri-d1');
const beban = JSON.parse(fs.readFileSync(N.BEBAN_D1, 'utf8'));
const semua = JSON.parse(fs.readFileSync(path.join(KAL, 'sampel.json'), 'utf8')).sampel;
const butir = [...semua.filter((b) => b.kategori !== 'luar'), ...semua.filter((b) => b.kategori === 'luar')].slice(0, 25).map((b) => N.butirJuri(b.id, b));
const labelKal = { A: JSON.parse(fs.readFileSync(path.join(KAL, 'label-A-opus.json'), 'utf8')).label, B: JSON.parse(fs.readFileSync(path.join(KAL, 'label-B-sonnet.json'), 'utf8')).label };
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const setara = (x, y, kat) => ({
  rujuk: sama([...(x.rujuk || [])].sort(), [...(y.rujuk || [])].sort()), menolak: x.menolak === y.menolak,
  ...(kat === 'luar' ? { mengarang: (x.karangan || []).length > 0 === (y.karangan || []).length > 0 } : { tercakup: x.tercakup === y.tercakup, salah: x.salah === y.salah }),
});

fs.mkdirSync(KELUAR, { recursive: true });
const biner = N.binerClaude(), versiCli = N.versiClaude(biner);
console.log(`asap kanal juri D1 · ${biner} · ${versiCli} · resmi ${N.binerResmi(biner)} · ${butir.length} butir kalibrasi (${butir.filter((b) => b.kategori !== 'luar').length} tahu/antar)`);
const ringkas = { _: 'Uji asap kanal juri D1 — diagnostik, butir kalibrasi, BUKAN data vonis.', pada: new Date().toISOString(), biner, versiCli, butir: butir.map((b) => b.id), juri: {} };
for (const juri of ['A', 'B']) {
  const prompt = N.promptJuri(butir, beban, N.KELUARAN.cli);
  const t0 = Date.now();
  const h = N.jalankanClaude(prompt, N.MODEL_JURI[juri], { biner });
  const detik = Math.round((Date.now() - t0) / 1000);
  const infra = N.masalahInfraJuri(h, juri);
  const t = infra ? { label: {}, masalah: ['(tidak diperiksa: galat infrastruktur)'] } : N.terimaKeluaranJuri(h.teks, { butir }, beban);
  const banding = {};
  for (const b of butir) {
    const x = t.label[b.id], y = labelKal[juri][b.id];
    if (!x || !y) continue;
    for (const [k, v] of Object.entries(setara(x, y, b.kategori))) { (banding[k] ||= { sama: 0, n: 0 }).n++; if (v) banding[k].sama++; }
  }
  const u = h.modelUsage?.[N.MODEL_JURI[juri]] || {};
  ringkas.juri[juri] = { model: N.MODEL_JURI[juri], detik, masalahInfra: infra, masalahKeluaran: t.masalah, modelUtama: h.modelUtama ?? null, modelUsage: h.modelUsage ?? null,
    tokKeluar: u.outputTokens ?? h.tokKeluar ?? null, batasTokKeluar: u.maxOutputTokens ?? null, tokPikir: h.tokPikir ?? null, numTurns: h.numTurns ?? null, stopReason: h.stopReason ?? null,
    stderr: h.stderr || null, fastMode: h.fastMode ?? null, kesepakatanDenganKalibrasi_DESKRIPTIF: banding };
  fs.writeFileSync(path.join(KELUAR, `asap-${juri}.json`), JSON.stringify({ juri, keluaranMentah: h.teks ?? null, galat: h.galat ?? null, label: t.label }, null, 1));
  console.log(`juri ${juri}: ${infra ? `INFRA: ${infra}` : `${Object.keys(t.label).length} label, masalah ${t.masalah.length}`} · ${detik} dtk · keluar ${ringkas.juri[juri].tokKeluar}/${ringkas.juri[juri].batasTokKeluar} · pikir ${h.tokPikir} · turns ${h.numTurns} · ${JSON.stringify(banding)}`);
}
fs.writeFileSync(path.join(KELUAR, 'ringkasan.json'), JSON.stringify(ringkas, null, 1));
console.log(`→ ${path.relative(path.join(DI_SINI, '..'), KELUAR)}/ringkasan.json`);
