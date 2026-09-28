#!/usr/bin/env node
/**
 * daya-uji.mjs — GERBANG-S1: analisis daya & periksa C55 SEBELUM kunci, dari putaran base LAMA (bukan data uji S1).
 *
 * Kolam: putaran base qwen3:4b-instruct-2507 (SB1-Q3 ×8, A3I-S ×20) — petak-jujur2, 36 soal — HANYA yang SAH
 * (rangkuman.sah). Tinjauan adversarial 28 Sep #9: tiga putaran A3I-S (p8–p10) seluruhnya GALAT dan dulu ikut dihitung
 * sebagai putaran tanpa karangan; kini 25 putaran sah, sehingga k maksimum = 12 per lengan (P dan G lepas). k = 12 lebih
 * konservatif daripada 16 putaran nyata (CI lebih lebar), jadi daya yang dilaporkan adalah BATAS BAWAH.
 * Tiap simulasi: kocok putaran → P = k putaran, G = k putaran lain (lepas), S = saringan atas jawaban P.
 *   G: tiap NGARANG diubah BENAR dengan peluang g (G nyata mengubah generasi; ini hanya model efeknya).
 *   S: tiap NGARANG diblokir (→ BENAR) dengan peluang s; tiap fakta BENAR diblokir (→ TOLAK-FAKTA) dengan peluang fb.
 *   Heterogen: separuh soal jebakan (acak per simulasi) kena peluang 2x, separuh 0 — efek yang tidak merata antarkeluarga.
 * Syarat dihitung persis seperti rancangan: t berpasangan per indeks putaran (skala per 36) dan ciKlaster per keluarga
 * atas laju per soal jebakan (fungsi yang SAMA dengan alat vonis SB1).
 *
 *   node eval/gerbang-s1/daya-uji.mjs [--k 12] [--B 1000]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AKAR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { ciKlaster } = await import(pathToFileURL(path.join(AKAR, 'eval', 'ukur-jujur2-seleksi.mjs')).href);
const { HARUS_ABSTAIN } = await import(pathToFileURL(path.join(AKAR, 'eval', 'petak-jujur2.mjs')).href);

const arg = process.argv.slice(2);
const ambil = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? Number(arg[i + 1]) : d; };
const K = ambil('--k', 12), B = ambil('--B', 1000);

const POLA = /^hasil-jujur2-qwen3_4b-instruct-2507-q4_K_M-(sb1-Q3|a3i-S)-p\d+-.*\.json$/;
const putaran = fs.readdirSync(path.join(AKAR, 'eval')).filter((f) => POLA.test(f)).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(AKAR, 'eval', f), 'utf8'))).filter((o) => o.rangkuman?.sah === true)
  .map((o) => o.baris.map((r) => ({ id: r.soal.id, jenis: r.soal.jenis, keluarga: r.soal.keluarga ?? r.soal.id, hasil: r.hasil })));
if (2 * K > putaran.length) { console.error(`BERHENTI: k=${K} per lengan butuh ${2 * K} putaran sah lepas; kolam hanya ${putaran.length}`); process.exit(2); }

/**
 * --gabungan (tinjauan adversarial putaran 2, B5; diadaptasi dari probe peninjau p32, dijalankan ulang 28 Sep): daya syarat
 * (1)C1r, (1b)MIDr, (1)C1k di penilai GABUNGAN yang mengikat. Lapisan karangan hanya-DeepSeek dikalibrasi ke sampel-1 latih:
 * P(hanya-DeepSeek | nilai2 BENAR, jebakan) = (63,4 − 17,1) / 82,9 = 0,56. G: probe per soal deterministik, recall 0,8; bila
 * menyala, arahan menghapus karangan dengan peluang c. S: memblokir karangan nilai2 dengan peluang 0,8 dan karangan
 * hanya-DeepSeek dengan peluang r2 (recall S di kelas yang dilatih lewat label gabungan). 16 putaran per lengan, diambil
 * DENGAN pengembalian dari putaran sah.
 */
if (arg.includes('--gabungan')) {
  const { ciKlaster: ciK } = await import(pathToFileURL(path.join(AKAR, 'eval', 'ukur-jujur2-seleksi.mjs')).href);
  const kolamJ = putaran.map((bs) => bs.filter((x) => x.hasil !== 'GALAT' && HARUS_ABSTAIN.has(x.jenis)));
  const acakG = (benih) => { let a = benih >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const T15 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131];
  const atas = (d) => { const n = d.length, m = d.reduce((a, b) => a + b, 0) / n, s = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)); return m + (T15[n - 1] * s) / Math.sqrt(n); };
  const PDS = 0.56, BG = ambil('--B', 2000);
  console.log(`--gabungan · kolam ${kolamJ.length} putaran sah · P(hanya-DS | nilai2 BENAR) ${PDS} · recall probe 0,8 · B=${BG}`);
  console.log('c(G)  r2(S)   rata P  G  S          C1r   MIDr  C1k');
  for (const c of [0.3, 0.6]) for (const r2 of [0.1, 0.3, 0.5, 0.7]) {
    const r = acakG(Math.round(1000 * c + 100 * r2));
    let pC1r = 0, pMid = 0, pC1k = 0, mP = 0, mG = 0, mS = 0;
    for (let b = 0; b < BG; b++) {
      const ids = [...new Set(kolamJ[0].map((x) => x.id))], nyala = new Map(ids.map((id) => [id, r() < 0.8]));
      const lab = (x) => ({ ...x, gab: x.hasil === 'NGARANG' ? 'n2' : r() < PDS ? 'ds' : 'ok' });
      const Pb = Array.from({ length: 16 }, () => kolamJ[Math.floor(r() * kolamJ.length)].map(lab));
      const Gb = Array.from({ length: 16 }, () => kolamJ[Math.floor(r() * kolamJ.length)].map(lab).map((x) => (x.gab !== 'ok' && nyala.get(x.id) && r() < c ? { ...x, gab: 'ok' } : x)));
      const Sb = Pb.map((bs) => bs.map((x) => ((x.gab === 'n2' && r() < 0.8) || (x.gab === 'ds' && r() < r2) ? { ...x, gab: 'ok' } : x)));
      const laju = (bs) => (100 * bs.filter((x) => x.gab !== 'ok').length) / bs.length;
      const lp = Pb.map(laju), lg = Gb.map(laju), ls = Sb.map(laju);
      mP += lp.reduce((a, x) => a + x) / 16 / BG; mG += lg.reduce((a, x) => a + x) / 16 / BG; mS += ls.reduce((a, x) => a + x) / 16 / BG;
      if (atas(ls.map((x, i) => x - lg[i])) <= 5) pC1r++;
      if (atas(ls.map((x, i) => x - (lp[i] + lg[i]) / 2)) < 0) pMid++;
      const per = (arm) => { const m = new Map(); for (const bs of arm) for (const x of bs) { const e = m.get(x.id) || { kel: x.keluarga, k: 0, n: 0 }; e.n++; if (x.gab !== 'ok') e.k++; m.set(x.id, e); } return m; };
      const qs = per(Sb), qg = per(Gb), d = [], kl = [];
      for (const [id, e] of qs) { const g = qg.get(id); if (!g) continue; d.push(100 * (e.k / e.n - g.k / g.n)); kl.push(e.kel); }
      const k = ciK(d, kl); if (k && k.atas <= 5) pC1k++;
    }
    console.log(`c=${c}  r2=${r2}   ${mP.toFixed(1)} ${mG.toFixed(1)} ${mS.toFixed(1)}   ${(pC1r / BG).toFixed(2)}  ${(pMid / BG).toFixed(2)}  ${(pC1k / BG).toFixed(2)}`);
  }
  process.exit(0);
}

// Deterministik: mulberry32 berbenih.
function rng(benih) { let a = benih >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const acak = (xs, r) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const T95 = { 7: 2.365, 9: 2.262, 11: 2.201, 13: 2.16, 15: 2.131 };
function ciBerpasangan(d) { const n = d.length, m = d.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)); const h = (T95[n - 1] ?? 2.0) * sd / Math.sqrt(n); return { m, atas: m + h, h }; }
// MENGARANG_pct instrumen (eval/instrumen-jujur2.mjs metrik()): NGARANG per baris WAJIB-ABSTAIN, bukan per 36 (v1.2).
const laju36 = (bs, hasil) => { const j = bs.filter((x) => HARUS_ABSTAIN.has(x.jenis)); return 100 * j.filter((x) => x.hasil === hasil).length / j.length; };
const lajuFakta = (bs) => { const f = bs.filter((x) => x.jenis === 'fakta'); return 100 * f.filter((x) => x.hasil === 'BENAR').length / f.length; };
function perSoal(arm) { // Map id -> {keluarga, ngarang, n} atas soal jebakan
  const m = new Map();
  for (const bs of arm) for (const x of bs) { if (!HARUS_ABSTAIN.has(x.jenis)) continue; const e = m.get(x.id) || { keluarga: x.keluarga, ngarang: 0, n: 0 }; e.n++; if (x.hasil === 'NGARANG') e.ngarang++; m.set(x.id, e); }
  return m;
}
function ciSoal(fd) { // fd: (id, laju per lengan...) -> selisih; kembalikan ciKlaster
  const d = [], kl = [];
  for (const [id, v] of fd) { d.push(v.d); kl.push(v.keluarga); }
  return ciKlaster(d, kl);
}
const r100 = (m) => new Map([...m].map(([id, e]) => [id, { keluarga: e.keluarga, p: 100 * e.ngarang / e.n }]));

/**
 * Satu simulasi. s = peluang S memblokir NGARANG; g = peluang G memperbaiki NGARANG; fb = peluang S memblokir fakta BENAR
 * (kerugian); sf = peluang S memblokir fakta SALAH (manfaat jujur: salah → menolak); gfb = kerugian fakta G (over-refusal).
 */
function satuSimulasi({ s, g, fb, sf, gfb, heterogen }, r) {
  const idx = acak(putaran.map((_, i) => i), r);
  const P = idx.slice(0, K).map((i) => putaran[i]);
  const Graw = idx.slice(K, 2 * K).map((i) => putaran[i]);
  const idsJebakan = [...new Set(putaran[0].filter((x) => HARUS_ABSTAIN.has(x.jenis)).map((x) => x.id))];
  const berat = (p) => { const m = new Map(); const pilih = new Set(acak(idsJebakan, r).slice(0, idsJebakan.length / 2)); for (const id of idsJebakan) m.set(id, heterogen ? (pilih.has(id) ? Math.min(1, 2 * p) : 0) : p); return m; };
  const gq = berat(g), sq = berat(s);
  const G = Graw.map((bs) => bs.map((x) => {
    if (x.hasil === 'NGARANG' && r() < gq.get(x.id)) return { ...x, hasil: 'BENAR' };
    if (x.jenis === 'fakta' && x.hasil === 'BENAR' && r() < gfb) return { ...x, hasil: 'TOLAK-FAKTA' };
    return x;
  }));
  const blokirBenar = new Map(); // id fakta -> {blokir, benarP}
  const S = P.map((bs) => bs.map((x) => {
    if (x.hasil === 'NGARANG' && r() < sq.get(x.id)) return { ...x, hasil: 'BENAR' };
    if (x.jenis === 'fakta') {
      const e = blokirBenar.get(x.id) || { blokir: 0, benarP: 0 }; blokirBenar.set(x.id, e);
      if (x.hasil === 'BENAR') { e.benarP++; if (r() < fb) { e.blokir++; return { ...x, hasil: 'TOLAK-FAKTA' }; } }
      if (x.hasil === 'SALAH' && r() < sf) return { ...x, hasil: 'TOLAK-FAKTA' };
    }
    return x;
  }));
  const nP = P.map((b) => laju36(b, 'NGARANG')), nG = G.map((b) => laju36(b, 'NGARANG')), nS = S.map((b) => laju36(b, 'NGARANG'));
  const c1r = ciBerpasangan(nS.map((x, i) => x - nG[i]));
  const c2r = ciBerpasangan(nS.map((x, i) => x - nP[i]));
  const cmr = ciBerpasangan(nS.map((x, i) => x - (nP[i] + nG[i]) / 2));
  const qP = r100(perSoal(P)), qG = r100(perSoal(G)), qS = r100(perSoal(S));
  const beda = (f) => new Map([...qS].map(([id, v]) => [id, { keluarga: v.keluarga, d: f(v.p, qP.get(id).p, qG.get(id).p) }]));
  const c1k = ciSoal(beda((sv, pv, gv) => sv - gv)), c2k = ciSoal(beda((sv, pv) => sv - pv)), cmk = ciSoal(beda((sv, pv, gv) => sv - (pv + gv) / 2));
  const rataArm = (arm, f) => arm.reduce((a, b) => a + f(b), 0) / K;
  const tolak = (bs) => { const f = bs.filter((x) => x.jenis === 'fakta'); return 100 * f.filter((x) => x.hasil === 'TOLAK-FAKTA').length / f.length; };
  const nFakta = K * putaran[0].filter((x) => x.jenis === 'fakta').length;
  const totalBlokirBenar = [...blokirBenar.values()].reduce((a, e) => a + e.blokir, 0);
  const perSoalOk = [...blokirBenar.values()].every((e) => e.blokir <= Math.max(1, Math.floor(0.25 * e.benarP)));
  const k = {
    C1r: c1r.atas <= 5, C1k: c1k.atas <= 5, MIDr: cmr.atas < 0, MIDk: cmk.atas < 0, C2r: c2r.atas < 0, C2k: c2k.atas < 0,
    F3: rataArm(S, tolak) <= rataArm(G, tolak) + 5, F4: rataArm(S, lajuFakta) >= rataArm(G, lajuFakta) - 5,
    Fbaru: 100 * totalBlokirBenar / nFakta <= 5 && perSoalOk, SUPr: c1r.atas < 0, SUPk: c1k.atas < 0,
  };
  // Tahan-soal (jackknife): (1)-per-putaran dan (1b) harus bertahan bila SATU soal jebakan mana pun dibuang (28 varian).
  const tanpa = (arm, id) => arm.map((bs) => bs.filter((x) => x.id !== id));
  const JK = idsJebakan.every((id) => {
    const lp = tanpa(P, id).map((b) => laju36(b, 'NGARANG')), lg = tanpa(G, id).map((b) => laju36(b, 'NGARANG')), ls = tanpa(S, id).map((b) => laju36(b, 'NGARANG'));
    return ciBerpasangan(ls.map((x, i) => x - lg[i])).atas <= 5 && ciBerpasangan(ls.map((x, i) => x - (lp[i] + lg[i]) / 2)).atas < 0;
  });
  k.JK = JK;
  k.ASLI = k.C1r && k.C1k && k.C2r && k.F3 && k.F4;
  k.FINAL = k.C1r && k.C1k && k.MIDr && k.C2r && k.Fbaru && k.JK;
  k.LB = k.FINAL && k.SUPr && k.SUPk;
  return { k, h: { c1r: c1r.h, c1k: c1k.atas - c1k.rata, cmr: cmr.h, cmk: cmk.atas - cmk.rata } };
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const klaster = new Set(putaran[0].filter((x) => HARUS_ABSTAIN.has(x.jenis)).map((x) => x.keluarga));
console.log(`kolam ${putaran.length} putaran · k=${K}/lengan · B=${B} · soal jebakan ${putaran[0].filter((x) => HARUS_ABSTAIN.has(x.jenis)).length} dalam ${klaster.size} keluarga · fakta ${putaran[0].filter((x) => x.jenis === 'fakta').length}`);
console.log(`MENGARANG_pct (per soal wajib-abstain) base di kolam: rata ${avg(putaran.map((b) => laju36(b, 'NGARANG'))).toFixed(2)} · fakta BENAR ${avg(putaran.map(lajuFakta)).toFixed(1)} %`);
const KOLOM = ['C1r', 'C1k', 'MIDr', 'MIDk', 'C2r', 'C2k', 'F3', 'F4', 'Fbaru', 'JK', 'ASLI', 'FINAL', 'LB'];
console.log(`fb=0,03 (S blokir fakta BENAR) · sf=0,30 (S blokir fakta SALAH) · gfb=0,016 (G over-refusal, GERBANG-ON)\n${'g/s'.padEnd(10)} ${KOLOM.map((c) => c.padStart(5)).join(' ')}   ±1r ±1k ±MIDr ±MIDk`);
for (const heterogen of [false, true]) {
  console.log(heterogen ? '— efek HETEROGEN (separuh soal 2x, separuh 0; S dan G memilih separuh yang berbeda) —' : '— efek merata —');
  for (const g of [0.2, 0.4, 0.6]) for (const s of [0.2, 0.4, 0.6, 0.8]) {
    const r = rng(20260927 + Math.round(1000 * s) + 10 * Math.round(100 * g) + (heterogen ? 7 : 0));
    const n = Object.fromEntries(KOLOM.map((c) => [c, 0])); const h = { c1r: 0, c1k: 0, cmr: 0, cmk: 0 };
    for (let b = 0; b < B; b++) {
      const x = satuSimulasi({ s, g, fb: 0.03, sf: 0.3, gfb: 0.016, heterogen }, r);
      for (const c of KOLOM) n[c] += x.k[c];
      for (const kk of Object.keys(h)) h[kk] += x.h[kk] / B;
    }
    console.log(`${`g=${g} s=${s}`.padEnd(10)} ${KOLOM.map((c) => (n[c] / B).toFixed(2).padStart(5)).join(' ')}   ${h.c1r.toFixed(1)} ${h.c1k.toFixed(1)} ${h.cmr.toFixed(1)} ${h.cmk.toFixed(1)}`);
  }
}
