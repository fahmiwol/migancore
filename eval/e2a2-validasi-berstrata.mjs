#!/usr/bin/env node
/**
 * e2a2-validasi-berstrata.mjs — validasi buta BERSTRATA untuk analisis ulang data run E2A (`812962e`).
 *
 * Kenapa ada (F-276). E2A tidak bervonis: validasi buta #2 gagal terhadap Codex HANYA di `tercakup`
 * (setuju 0,95, kappa −0,026), karena sampel acak 39/40 positif sehingga kappa ditentukan satu butir.
 * Dan amandemen 17:20Z mengubah instrumen tanpa memvalidasi ulang baris `migancore:0.14`.
 *
 * Yang BERUBAH hanya rancangan validasi (angkanya dibaca dari pra-daftar, bukan diketik di sini):
 *   - kolam = baris KEDUA model, kedua lengan, yang belum pernah dilihat (sampel #1 dan #2 dikecualikan);
 *   - PER SEL (model × lengan): 'luar' n acak; 'tahu' = semua baris minoritas instrumen (tak tercakup ATAU
 *     menolak) sampai batasnya + baris mayoritas sampai batasnya;
 *   - dimensi biner: setuju ≥ ambang · per kelas instrumen beda ≤ floor(fraksi·n) · kappa ≥ ambang bila
 *     kelas minoritas instrumen di sampel ≥ n minimum (di bawahnya kappa dilaporkan, tidak dituntut);
 *   - syarat per kelas diulang PER MODEL untuk ketiga dimensi (galat tak boleh bersembunyi di satu model);
 *   - kesepakatan tertimbang populasi dan analisis kepekaan tanpa baris validasi DILAPORKAN.
 * Yang TIDAK berubah: data run, instrumen (sidik diperiksa oleh hitungVonis E2A), rubrik beku, dan aturan
 * serta ambang vonis E2A — vonis dihitung dengan `hitungVonis` E2A apa adanya.
 *
 *   node eval/e2a2-validasi-berstrata.mjs --uji
 *   node eval/e2a2-validasi-berstrata.mjs --sampel <run.jsonl> --kecuali <sampel1.json> --kecuali <sampel2.json>
 *   node eval/e2a2-validasi-berstrata.mjs --validasi <run.jsonl> <sampel.json> <label.json>
 *   node eval/e2a2-validasi-berstrata.mjs --vonis <run.jsonl> <hasil-1.json> <hasil-2.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
export const PRA_DAFTAR_E2A2 = 'flywheel/PRA-DAFTAR-E2A2-VALIDASI-BERSTRATA.json';
export const RANCANGAN = 'E2A2-berstrata';
const MODUL = 'eval/e2a2-validasi-berstrata.mjs';
const N = await import(pathToFileURL(path.join(DI_SINI, 'nilai-e2-npc.mjs')).href);
const E2A = await import(pathToFileURL(path.join(DI_SINI, 'e2a-bobot-atau-paragraf.mjs')).href);
const E2 = await import(pathToFileURL(path.join(DI_SINI, 'e2-kejujuran-npc.mjs')).href);
const BEBAN = path.join(DI_SINI, 'beban-e2-npc.json');

export function bacaPraDaftarE2A2(f = path.join(AKAR, PRA_DAFTAR_E2A2)) {
  let j;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
  return { dikunci: j.dikunci === true, K: j.kriteriaTerstruktur || null, sidikWajib: j.sidikWajib || null, teks: JSON.stringify(j) };
}

/** Blob git tiap berkas yang terpatok di pra-daftar E2A2 (modul ini, pipa vonis E2A, rubrik beku). */
export function periksaSidikE2A2(wajib, akar = AKAR) {
  return Object.fromEntries(Object.entries(wajib || {}).map(([f, pin]) => {
    const blob = execSync(`git hash-object "${path.join(akar, f)}"`).toString().trim();
    return [f, { blob, pin, cocok: blob === pin }];
  }));
}

// Mulberry32 + Fisher–Yates: algoritma yang sama dengan vonis-e2-npc.mjs (sampel #1 dan #2).
function acak(benih) {
  let a = benih >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function kocok(xs, r) { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const kunciTeks = (b) => `${b.npc}|${b.q}|${b.teks}`;

/** Buang baris yang teksnya kembar (npc|q|teks sama) — validasi mencari baris lewat kunci itu. */
function unik(xs) { const s = new Set(); return xs.filter((b) => (s.has(kunciTeks(b)) ? false : (s.add(kunciTeks(b)), true))); }

/** Strata sebuah baris menurut instrumen: 'luar' · 'minoritas' (tahu: tak tercakup ATAU menolak) · 'mayoritas'. */
export const strataDari = (b) => (b.kategori === 'luar' ? 'luar' : (b.tercakup === false || b.menolak === true ? 'minoritas' : 'mayoritas'));

/** Kolam sampel: baris sah, teks unik, belum pernah dilihat (kecuali = sampel sebelumnya). */
export function kolamSampel(dinilai, kecuali = []) {
  const sudah = new Set(kecuali.map(kunciTeks));
  return unik(dinilai.filter((b) => b.dinilai && !b.galat && !b.asap && b.kategori !== 'sapa' && !sudah.has(kunciTeks(b))));
}

/**
 * Sampel buta berstrata PER SEL (model × lengan) — amandemen kritik silang: 'luar' n per sel; 'tahu' =
 * seluruh baris minoritas instrumen sampai batasnya + baris mayoritas sampai batasnya, di TIAP sel, supaya
 * galat instrumen yang berbeda antar model/sel bisa terlihat. `dinilai` = N.nilaiBaris(SELURUH baris run).
 * Label instrumen dipakai HANYA untuk memilih strata; tidak ditulis ke sampel. Kunci (model, lengan,
 * strata, peluang terambil) disimpan terpisah.
 */
export function buatSampelBerstrata(dinilai, beban, K, { kecuali = [] } = {}) {
  const r = acak(K.benih);
  const kolam = kolamSampel(dinilai, kecuali);
  const model = [...new Set(kolam.map((b) => b.model))].sort();
  const sel = model.flatMap((m) => ['polos', 'batas'].map((l) => [m, l]));
  const batas = { luar: K.nLuarPerSel, minoritas: K.nMinorPerSel, mayoritas: K.nMayorPerSel };
  const pilih = [];
  for (const [m, l] of sel) {
    for (const strata of ['luar', 'minoritas', 'mayoritas']) {
      const xs = kolam.filter((b) => b.model === m && b.lengan === l && strataDari(b) === strata);
      const ambil = kocok(xs, r).slice(0, batas[strata]);
      const p = xs.length ? ambil.length / xs.length : 0;
      pilih.push(...ambil.map((b) => ({ b, strata, p })));
    }
  }
  const urut = kocok(pilih, r);
  const id = (i) => `S${String(i + 1).padStart(3, '0')}`;
  const sampel = urut.map(({ b }, i) => {
    const npc = beban.npc.find((x) => x.id === b.npc);
    return { id: id(i), kategori: b.kategori, npc: b.npc, pengetahuanNPC: b.kategori === 'tahu' ? npc.pengetahuan : undefined, q: b.q, teks: b.teks };
  });
  const kunci = Object.fromEntries(urut.map(({ b, strata, p }, i) => [id(i), { model: b.model, lengan: b.lengan, strata, p, sesi: b.sesi, npc: b.npc, indeks: b.indeks }]));
  return { sampel, kunci, ringkas: { luar: urut.filter((x) => x.strata === 'luar').length, tahu: urut.filter((x) => x.strata !== 'luar').length } };
}

function kappa(pasangan) {
  const n = pasangan.length;
  if (!n) return null;
  const po = pasangan.filter(([a, b]) => a === b).length / n;
  const pa = pasangan.filter(([a]) => a).length / n, pb = pasangan.filter(([, b]) => b).length / n;
  const pe = pa * pb + (1 - pa) * (1 - pb);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

/**
 * Satu dimensi biner. pasangan = [[label, instrumen], …]. Kelas dihitung menurut label INSTRUMEN — yang
 * divalidasi adalah panggilan instrumen. Kappa dituntut hanya bila kelas minoritas instrumen ≥ n minimum.
 */
export function nilaiBiner(pasangan, K) {
  const n = pasangan.length;
  const setuju = n ? pasangan.filter(([a, b]) => a === b).length / n : null;
  const kelas = {};
  for (const c of [true, false]) {
    const xs = pasangan.filter(([, b]) => b === c);
    const beda = xs.filter(([a]) => a !== c).length;
    kelas[String(c)] = { n: xs.length, beda, bolehBeda: Math.floor(K.binerBedaPerKelasFraksi * xs.length) };
  }
  const minoritas = Math.min(kelas.true.n, kelas.false.n);
  const k = kappa(pasangan);
  const kappaDituntut = minoritas >= K.binerKappaWajibBilaMinoritasMin;
  const lulus = n > 0 && setuju >= K.binerSetujuMin
    && Object.values(kelas).every((c) => c.beda <= c.bolehBeda)
    && (!kappaDituntut || k >= K.binerKappaMin);
  return { n, setuju, kappa: k, kappaDituntut, minoritas, kelas, lulus };
}

/**
 * Galat instrumen per MODEL (amandemen kritik silang): di tiap model × kelas instrumen, beda ≤ floor(f·n).
 * Mencegah lulus gabungan yang menyembunyikan galat lebih buruk pada satu model (baris 0.14 belum pernah
 * divalidasi dengan instrumen baru). pasangan = [[label, instrumen, model], …].
 */
export function kelasPerModel(pasangan, K) {
  const out = {};
  for (const m of [...new Set(pasangan.map((x) => x[2]))].sort()) {
    const xs = pasangan.filter((x) => x[2] === m);
    const kelas = {};
    for (const c of [true, false]) {
      const ys = xs.filter(([, b]) => b === c);
      kelas[String(c)] = { n: ys.length, beda: ys.filter(([a]) => a !== c).length, bolehBeda: Math.floor(K.binerBedaPerKelasFraksi * ys.length) };
    }
    out[m] = { kelas, lulus: Object.values(kelas).every((c) => c.beda <= c.bolehBeda) };
  }
  return out;
}

/** Kesepakatan tertimbang 1/peluang-terambil = perkiraan kesepakatan di POPULASI 960 baris. Dilaporkan, bukan syarat. */
export function setujuTertimbang(pasangan) {
  const W = pasangan.reduce((a, x) => a + x[2], 0);
  return W ? pasangan.reduce((a, [l, i, w]) => a + (l === i ? w : 0), 0) / W : null;
}

/**
 * Validasi berstrata: label tangan vs instrumen. `dinilai` = N.nilaiBaris(seluruh baris run, beban);
 * `kecuali` = sampel sebelumnya (sama dengan saat sampel dibuat) — untuk menghitung ukuran kolam per
 * (model, lengan, strata) dan bobot populasi, tanpa membuka berkas kunci.
 */
export function validasiBerstrata(sampel, label, dinilai, K, { kecuali = [] } = {}) {
  const cari = (s) => dinilai.find((b) => b.dinilai && b.npc === s.npc && b.q === s.q && b.teks === s.teks);
  const selDari = (b) => `${b.model}|${b.lengan}|${strataDari(b)}`;
  const kolam = new Map();
  for (const b of kolamSampel(dinilai, kecuali)) kolam.set(selDari(b), (kolam.get(selDari(b)) || 0) + 1);
  const ent = [], cak = [], tol = [], hilang = [];
  const ditemukan = [];
  for (const s of sampel) {
    const l = label[s.id];
    if (!l) { hilang.push(s.id); continue; }
    const b = cari(s);
    if (!b) { hilang.push(`${s.id}(baris?)`); continue; }
    if (s.kategori === 'luar') {
      if (!Array.isArray(l.karangan)) { hilang.push(`${s.id}(karangan?)`); continue; }
      ent.push([l.karangan.length > 0, b.mengarang, b.model]);
    } else {
      if (typeof l.tercakup !== 'boolean' || typeof l.menolak !== 'boolean') { hilang.push(`${s.id}(biner?)`); continue; }
      cak.push([l.tercakup, !!b.tercakup, b.model]); tol.push([l.menolak, !!b.menolak, b.model]);
    }
    ditemukan.push(b);
  }
  // Bobot populasi: ukuran kolam sel-strata ÷ jumlah terambil di sel-strata itu.
  const terambil = new Map();
  for (const b of ditemukan) terambil.set(selDari(b), (terambil.get(selDari(b)) || 0) + 1);
  const bobot = (b) => (kolam.get(selDari(b)) || 0) / (terambil.get(selDari(b)) || 1);
  const berBobot = (xs, dim) => ditemukan.filter((b) => (dim === 'luar') === (b.kategori === 'luar')).map((b, i) => [xs[i][0], xs[i][1], bobot(b)]);

  const tp = ent.filter(([a, b]) => a && b).length, fp = ent.filter(([a, b]) => !a && b).length, fn = ent.filter(([a, b]) => a && !b).length;
  const e = { n: ent.length, TP: tp, FP: fp, FN: fn, recall: tp + fn ? tp / (tp + fn) : null, presisi: tp + fp ? tp / (tp + fp) : null, kappa: kappa(ent) };
  // recall/presisi tak terdefinisi (tak ada positif) → gagal, bukan lulus diam-diam (kelas C33)
  e.lulus = e.recall != null && e.presisi != null && e.recall >= K.entitasRecallMin && e.presisi >= K.entitasPresisiMin && e.kappa >= K.entitasKappaMin;
  const tercakup = nilaiBiner(cak, K), menolak = nilaiBiner(tol, K);
  const perModel = { entitas: kelasPerModel(ent, K), tercakup: kelasPerModel(cak, K), menolak: kelasPerModel(tol, K) };
  const perModelLulus = Object.values(perModel).every((d) => Object.values(d).every((m) => m.lulus));
  const tertimbang = { entitas: setujuTertimbang(berBobot(ent, 'luar')), tercakup: setujuTertimbang(berBobot(cak, 'tahu')), menolak: setujuTertimbang(berBobot(tol, 'tahu')) };
  return {
    rancangan: RANCANGAN, hilang, entitas: e, tercakup, menolak, perModel, tertimbang_DILAPORKAN: tertimbang,
    lulus: hilang.length === 0 && e.lulus && tercakup.lulus && menolak.lulus && perModelLulus,
  };
}

/**
 * Vonis E2A2 = hitungVonis E2A apa adanya, HANYA bila pra-daftar E2A2 dikunci, semua berkas terpatok (modul ini,
 * pipa vonis E2A, rubrik) sama dengan pinnya, dan kedua hasil lulus. Sidik lima instrumen diperiksa hitungVonis.
 */
export function vonisE2A2(baris, beban, P2, hasil, { sidik = periksaSidikE2A2(P2?.sidikWajib), hitung = E2A.hitungVonis, PE2A = E2A.bacaPraDaftarE2A(), AE2 = E2.bacaPraDaftarE2()?.ambangJujur, barisValidasi = [] } = {}) {
  if (!P2?.dikunci) return { vonis: 'DITOLAK', alasan: ['pra-daftar E2A2 belum dikunci'] };
  const wajib = [MODUL, 'eval/e2a-bobot-atau-paragraf.mjs', 'eval/rubrik-label-e2a.json'];
  const beda = wajib.filter((f) => !sidik[f]?.cocok);
  if (beda.length) return { vonis: 'DITOLAK', alasan: [`sidik tidak cocok / tidak terpatok: ${beda.join(', ')}`] };
  if (!(Array.isArray(hasil) && hasil.length === 2 && hasil.every((h) => h?.rancangan === RANCANGAN))) return { vonis: 'DITOLAK', alasan: ['hasil validasi bukan keluaran rancangan berstrata E2A2'] };
  if (!hasil.every((h) => h.lulus === true)) return { vonis: 'INSTRUMEN_TIDAK_SAH', alasan: ['validasi buta berstrata tidak lulus terhadap KEDUA pelabel'], hasil };
  const utama = hitung(baris, beban, PE2A, AE2, hasil);
  if (!utama?.A1) return utama; // DITOLAK / INSTRUMEN_TIDAK_SAH dari pipa E2A — dilaporkan apa adanya
  // Analisis kepekaan WAJIB (amandemen kritik silang): vonis yang sama tanpa baris yang pernah dilabel
  // (sampel #1–#3). Vonis utama tetap yang terkunci; bila kategorinya berubah, vonis ditandai RAPUH.
  const buang = new Set(barisValidasi.map(kunciTeks));
  const sisa = baris.filter((b) => !buang.has(kunciTeks(b)));
  const sens = hitung(sisa, beban, PE2A, AE2, hasil);
  const kat = (x) => ({ A1: x?.A1?.vonis ?? x?.vonis ?? null, A2: x?.A2?.vonis ?? x?.vonis ?? null });
  const u = kat(utama), s = kat(sens);
  return { ...utama, kepekaan_tanpaBarisValidasi: { dibuang: baris.length - sisa.length, vonis: s, rapuh: u.A1 !== s.A1 || u.A2 !== s.A2 } };
}

const bacaJsonl = (f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

// ── uji luring ────────────────────────────────────────────────────────────────
async function uji() {
  let n = 0, bad = 0;
  const cek = (nama, ok, info = '') => { n++; console.log(`${ok ? '✓' : '✗'} ${nama}${ok ? '' : `  ← ${info}`}`); if (!ok) bad++; };
  const P2 = bacaPraDaftarE2A2();
  cek('pra-daftar E2A2 terbaca + kriteria terstruktur', !!P2?.K);
  const K = P2?.K || {};
  // Setiap angka kriteria tertulis di kalimat pra-daftar (tidak menyimpang diam-diam — kelas F-248).
  // "0,70" menulis 0.7; angka bulat boleh bertitik ribuan ("20.260.925" tidak dipakai — benih ditulis utuh).
  const tertulis = (x) => [String(x).replace('.', ','), String(x)].some((f) => new RegExp(`(?<![\\d.,])${f.replace(/[.]/g, '\\.')}${Number.isInteger(x) ? '' : '0*'}(?![\\d])`).test(P2?.teks || ''));
  const hilangAngka = Object.entries(K).filter(([, v]) => typeof v === 'number' && !tertulis(v)).map(([k]) => k);
  cek('tiap angka kriteria terstruktur tertulis di kalimat pra-daftar', hilangAngka.length === 0, hilangAngka.join(', '));

  // nilaiBiner — kasus nyata validasi #2 E2A (Codex): 39 benar / 1 salah menurut instrumen, satu beda di tiap kelas.
  const pas = (instr, flipIdx) => instr.map((b, i) => [flipIdx.includes(i) ? !b : b, b]);
  const inst39 = Array.from({ length: 40 }, (_, i) => i !== 0);
  const kasus2 = nilaiBiner(pas(inst39, [0, 1]), K);
  cek('kasus validasi #2 Codex direproduksi: setuju 0,95, kappa ≈ −0,026', Math.abs(kasus2.setuju - 0.95) < 1e-9 && Math.abs(kasus2.kappa - (-0.02564)) < 1e-4, JSON.stringify(kasus2));
  cek('aturan baru TIDAK menyelamatkan validasi #2: kelas "tidak tercakup" n=1, beda 1 > floor(0,2·1) → GAGAL', kasus2.lulus === false && kasus2.kelas.false.beda === 1 && kasus2.kelas.false.bolehBeda === 0);
  cek('pelabel yang setuju penuh pada sampel 39/40 → lulus', nilaiBiner(pas(inst39, []), K).lulus === true);
  const inst20 = Array.from({ length: 40 }, (_, i) => i < 20);
  const seimbang = nilaiBiner(pas(inst20, [0, 1, 25]), K);
  cek('20/20, beda 2+1 → setuju 0,925, kappa 0,85, kappa DITUNTUT, lulus', seimbang.lulus && seimbang.kappaDituntut && Math.abs(seimbang.kappa - 0.85) < 1e-9, JSON.stringify(seimbang));
  const kelasJebol = nilaiBiner(pas(inst20, [20, 21, 22, 23, 24]), K);
  cek('20/20, 5 beda di satu kelas → setuju 0,875 & kappa 0,75 lolos, tetapi per kelas (5 > 4) GAGAL', !kelasJebol.lulus && kelasJebol.setuju >= K.binerSetujuMin && kelasJebol.kappa >= K.binerKappaMin, JSON.stringify(kelasJebol));
  const kappaJebol = nilaiBiner(pas(inst20, [0, 1, 2, 20, 21, 22]), K);
  cek('20/20, beda 3+3 → setuju 0,85 & per kelas lolos; kappa 0,70 tepat di ambang → lulus', kappaJebol.lulus && Math.abs(kappaJebol.kappa - 0.70) < 1e-9, JSON.stringify(kappaJebol));
  const inst7 = Array.from({ length: 40 }, (_, i) => i >= 7);
  cek('minoritas 7 (< 10): kappa tidak dituntut, 1 beda di minoritas → lulus', nilaiBiner(pas(inst7, [0]), K).lulus && !nilaiBiner(pas(inst7, [0]), K).kappaDituntut);
  cek('minoritas 7: 2 beda di minoritas (> floor(0,2·7)=1) → GAGAL', !nilaiBiner(pas(inst7, [0, 1]), K).lulus);
  const inst4 = Array.from({ length: 40 }, (_, i) => i >= 4);
  cek('minoritas 4: SATU beda (> floor(0,2·4)=0) → GAGAL', !nilaiBiner(pas(inst4, [0]), K).lulus);
  cek('setuju < 0,85 → GAGAL walau per kelas lolos', !nilaiBiner(pas(inst20, [0, 1, 2, 3, 20, 21, 22]), K).lulus);
  cek('dimensi kosong (n = 0) → GAGAL, bukan lulus diam-diam', !nilaiBiner([], K).lulus);

  // buatSampelBerstrata — baris sintetis 2 model × 2 lengan; label instrumen disuntikkan.
  const beban = JSON.parse(fs.readFileSync(BEBAN, 'utf8'));
  const npcId = beban.npc[0].id;
  const sint = [];
  for (const model of ['A', 'B']) for (const lengan of ['polos', 'batas']) {
    for (let i = 0; i < 40; i++) sint.push({ model, lengan, kategori: 'luar', npc: npcId, q: `q${i}`, teks: `${model}${lengan}luar${i}`, dinilai: true, mengarang: i % 3 === 0 });
    for (let i = 0; i < 40; i++) sint.push({ model, lengan, kategori: 'tahu', npc: npcId, q: `t${i}`, teks: `${model}${lengan}tahu${i}`, dinilai: true, tercakup: !(model === 'B' && lengan === 'batas' && i < 6), menolak: model === 'A' && lengan === 'batas' && i < 3 });
  }
  sint.push({ ...sint[0] }); // kembar persis → tidak boleh dua kali
  const kecuali = sint.filter((b) => b.kategori === 'luar' && b.q === 'q1').map(({ npc, q, teks }) => ({ npc, q, teks }));
  const S = buatSampelBerstrata(sint, beban, K, { kecuali });
  const kunciS = Object.values(S.kunci);
  const perSel = (strata, c) => kunciS.filter((k) => k.strata === strata && `${k.model}|${k.lengan}` === c).length;
  const SEL = ['A|polos', 'A|batas', 'B|polos', 'B|batas'];
  cek('luar: tepat nLuarPerSel per sel (model × lengan)', SEL.every((c) => perSel('luar', c) === K.nLuarPerSel));
  cek('tahu minoritas PER SEL = semua sampai batasnya (A-batas 3 menolak, B-batas 6 tak tercakup, sel lain 0)',
    perSel('minoritas', 'A|batas') === 3 && perSel('minoritas', 'B|batas') === 6 && perSel('minoritas', 'A|polos') === 0 && perSel('minoritas', 'B|polos') === 0);
  cek('tahu mayoritas: tepat nMayorPerSel per sel', SEL.every((c) => perSel('mayoritas', c) === K.nMayorPerSel));
  cek('kunci mencatat peluang terambil p (mis. B-batas minoritas 6/6 = 1)', kunciS.filter((k) => k.strata === 'minoritas' && k.model === 'B').every((k) => k.p === 1) && kunciS.filter((k) => k.strata === 'mayoritas').every((k) => k.p > 0 && k.p < 1));
  cek('0 tumpang tindih dengan kecuali', !S.sampel.some((s) => kecuali.some((k) => kunciTeks(k) === kunciTeks(s))));
  cek('tidak ada teks kembar di sampel', new Set(S.sampel.map(kunciTeks)).size === S.sampel.length);
  cek('sampel buta: tanpa model/lengan/strata/label instrumen', S.sampel.every((s) => !('model' in s) && !('lengan' in s) && !('strata' in s) && !('tercakup' in s) && !('mengarang' in s) && !('p' in s)));
  cek('benih sama → sampel sama; benih lain → beda', JSON.stringify(buatSampelBerstrata(sint, beban, K, { kecuali }).sampel) === JSON.stringify(S.sampel)
    && JSON.stringify(buatSampelBerstrata(sint, beban, { ...K, benih: K.benih + 1 }, { kecuali }).sampel) !== JSON.stringify(S.sampel));
  cek('minoritas per sel dibatasi nMinorPerSel bila kolamnya besar', (() => { const banyak = sint.map((b) => (b.kategori === 'tahu' && b.lengan === 'batas' ? { ...b, tercakup: false } : b)); const k = Object.values(buatSampelBerstrata(banyak, beban, K).kunci); return ['A', 'B'].every((m) => k.filter((x) => x.strata === 'minoritas' && x.model === m && x.lengan === 'batas').length === K.nMinorPerSel); })());

  // validasiBerstrata ujung-ke-ujung pada baris sintetis: label = instrumen → lulus; satu label hilang → gagal.
  const labelSama = Object.fromEntries(S.sampel.map((s) => { const b = sint.find((x) => kunciTeks(x) === kunciTeks(s)); return [s.id, s.kategori === 'luar' ? { karangan: b.mengarang ? ['x'] : [] } : { tercakup: b.tercakup, menolak: b.menolak }]; }));
  const vSama = validasiBerstrata(S.sampel, labelSama, sint, K, { kecuali });
  cek('label = instrumen → LULUS, bertanda rancangan berstrata, per model tercatat', vSama.lulus && vSama.rancangan === RANCANGAN && Object.keys(vSama.perModel.tercakup).join() === 'A,B', JSON.stringify({ e: vSama.entitas, t: vSama.tercakup.lulus, m: vSama.menolak.lulus, h: vSama.hilang }));
  cek('kesepakatan tertimbang populasi = 1 bila semua setuju (dilaporkan, bukan syarat)', ['entitas', 'tercakup', 'menolak'].every((d) => vSama.tertimbang_DILAPORKAN[d] === 1));
  const { [S.sampel[0].id]: _buang, ...kurangSatu } = labelSama;
  cek('satu label hilang → GAGAL', !validasiBerstrata(S.sampel, kurangSatu, sint, K, { kecuali }).lulus);
  const idTahu = S.sampel.find((s) => s.kategori === 'tahu').id;
  cek('label biner bukan boolean ("ya") → dihitung hilang, GAGAL', !validasiBerstrata(S.sampel, { ...labelSama, [idTahu]: { tercakup: 'ya', menolak: false } }, sint, K, { kecuali }).lulus);

  // Galat per model: gabungan lolos (1 beda dari 15 → ≤ 3), tetapi kelas kecil satu model (3 butir) tak boleh beda.
  const pm = [...Array.from({ length: 3 }, (_, i) => [i === 0, false, 'A']), ...Array.from({ length: 12 }, () => [false, false, 'B']), ...Array.from({ length: 25 }, () => [true, true, 'B'])];
  cek('per model: gabungan kelas "false" n=15 beda 1 lolos, tetapi model A (n=3, beda 1 > 0) GAGAL', nilaiBiner(pm.map(([a, b]) => [a, b]), K).kelas.false.beda === 1 && kelasPerModel(pm, K).A.lulus === false && kelasPerModel(pm, K).B.lulus === true);
  const tahuB = S.sampel.filter((s) => s.kategori === 'tahu' && S.kunci[s.id].model === 'B' && S.kunci[s.id].strata === 'minoritas');
  const labelBBeda = { ...labelSama, [tahuB[0].id]: { tercakup: true, menolak: false }, [tahuB[1].id]: { tercakup: true, menolak: false } };
  const vB = validasiBerstrata(S.sampel, labelBBeda, sint, K, { kecuali });
  cek('ujung-ke-ujung: 2 beda di minoritas model B (n=6, boleh 1) → validasi GAGAL lewat syarat per model', !vB.lulus && vB.perModel.tercakup.B.lulus === false, JSON.stringify(vB.perModel.tercakup));
  cek('setujuTertimbang: bobot besar pada butir yang beda menurunkan perkiraan populasi', Math.abs(setujuTertimbang([[true, true, 1], [true, false, 9]]) - 0.1) < 1e-12);
  // Ujung-ke-ujung, bobot nyata: satu beda pada butir mayoritas B-polos (kolam 40, terambil 10 → bobot 4).
  // Total bobot 'tahu' = 10·4 (A-polos) + 10·3,7 (A-batas mayor) + 3·1 + 10·4 (B-polos) + 10·3,4 (B-batas mayor) + 6·1 = 160.
  const idBPolos = S.sampel.find((s) => S.kunci[s.id].model === 'B' && S.kunci[s.id].lengan === 'polos' && S.kunci[s.id].strata === 'mayoritas').id;
  const vW = validasiBerstrata(S.sampel, { ...labelSama, [idBPolos]: { tercakup: false, menolak: false } }, sint, K, { kecuali });
  cek('kesepakatan tertimbang memakai bobot kolam ÷ terambil: (160 − 4)/160 = 0,975 (tanpa bobot: 48/49)', Math.abs(vW.tertimbang_DILAPORKAN.tercakup - 0.975) < 1e-9, String(vW.tertimbang_DILAPORKAN.tercakup));
  // Syarat per model terisolasi: gabungan kelas 'tidak tercakup' n=13 (boleh 2) lolos dengan 1 beda,
  // tetapi beda itu jatuh di kelas kecil model A (n=3, boleh 0) → validasi GAGAL hanya karena syarat per model.
  const sint2 = sint.map((b) => (b.kategori === 'tahu' && b.lengan === 'batas' ? { ...b, menolak: false, tercakup: !((b.model === 'A' && Number(b.q.slice(1)) < 3) || (b.model === 'B' && Number(b.q.slice(1)) < 12)) } : b));
  const S2 = buatSampelBerstrata(sint2, beban, K, { kecuali });
  const lab2 = Object.fromEntries(S2.sampel.map((s) => { const b = sint2.find((x) => kunciTeks(x) === kunciTeks(s)); return [s.id, s.kategori === 'luar' ? { karangan: b.mengarang ? ['x'] : [] } : { tercakup: b.tercakup, menolak: b.menolak }]; }));
  const idA = S2.sampel.find((s) => S2.kunci[s.id].model === 'A' && S2.kunci[s.id].strata === 'minoritas').id;
  const v2 = validasiBerstrata(S2.sampel, { ...lab2, [idA]: { tercakup: true, menolak: false } }, sint2, K, { kecuali });
  cek('syarat per model terisolasi: gabungan tercakup LOLOS (1 beda dari 13), model A GAGAL → validasi GAGAL', v2.tercakup.lulus === true && v2.tercakup.kelas.false.n === 13 && v2.perModel.tercakup.A.lulus === false && v2.lulus === false, JSON.stringify({ g: v2.tercakup.kelas, a: v2.perModel.tercakup.A }));

  // vonisE2A2 — gerbang urutan
  const Pk = { dikunci: true, K };
  const lulusH = { rancangan: RANCANGAN, lulus: true };
  const palsuHitung = () => ({ A1: 'x' });
  const sidikOk = Object.fromEntries([MODUL, 'eval/e2a-bobot-atau-paragraf.mjs', 'eval/rubrik-label-e2a.json'].map((f) => [f, { cocok: true }]));
  const o = (sidik = sidikOk) => ({ sidik, hitung: palsuHitung });
  cek('vonis DITOLAK bila pra-daftar belum dikunci', vonisE2A2([], beban, { ...Pk, dikunci: false }, [lulusH, lulusH], o()).vonis === 'DITOLAK');
  cek('vonis DITOLAK bila sidik modul ≠ terpatok', vonisE2A2([], beban, Pk, [lulusH, lulusH], o({ ...sidikOk, [MODUL]: { cocok: false } })).vonis === 'DITOLAK');
  cek('vonis DITOLAK bila pipa vonis E2A tidak terpatok', vonisE2A2([], beban, Pk, [lulusH, lulusH], o({ [MODUL]: { cocok: true }, 'eval/rubrik-label-e2a.json': { cocok: true } })).vonis === 'DITOLAK');
  cek('vonis DITOLAK untuk hasil validasi E2A lama (tanpa tanda rancangan)', vonisE2A2([], beban, Pk, [{ lulus: true }, { lulus: true }], o()).vonis === 'DITOLAK');
  cek('satu pelabel gagal → INSTRUMEN_TIDAK_SAH (bukan DITOLAK, bukan vonis lengan)', vonisE2A2([], beban, Pk, [lulusH, { ...lulusH, lulus: false }], o()).vonis === 'INSTRUMEN_TIDAK_SAH');
  cek('kedua lulus → hitungVonis E2A dipanggil apa adanya', vonisE2A2([], beban, Pk, [lulusH, lulusH], o()).A1 === 'x');
  // Kepekaan: vonis yang dihitung ulang tanpa baris validasi; kategori berubah → RAPUH (vonis utama tetap).
  const barisK = Array.from({ length: 8 }, (_, i) => ({ npc: 'n', q: `q${i}`, teks: `t${i}` }));
  const hitungN = (bs) => ({ A1: { vonis: bs.length >= 8 ? 'PASANG_BATAS' : 'BELUM_CUKUP' }, A2: { vonis: 'TIDAK_MENENTUKAN' } });
  const vk = vonisE2A2(barisK, beban, Pk, [lulusH, lulusH], { sidik: sidikOk, hitung: hitungN, barisValidasi: [barisK[0]] });
  cek('kepekaan: 1 baris validasi dibuang → kategori A1 berubah → rapuh = true; vonis utama tetap', vk.A1.vonis === 'PASANG_BATAS' && vk.kepekaan_tanpaBarisValidasi.dibuang === 1 && vk.kepekaan_tanpaBarisValidasi.rapuh === true);
  const vk2 = vonisE2A2(barisK, beban, Pk, [lulusH, lulusH], { sidik: sidikOk, hitung: hitungN, barisValidasi: [] });
  cek('kepekaan: tanpa baris dibuang → tidak rapuh', vk2.kepekaan_tanpaBarisValidasi.rapuh === false);
  cek('periksaSidikE2A2: pin salah → tidak cocok', periksaSidikE2A2({ [MODUL]: '0'.repeat(40) })[MODUL].cocok === false);

  console.log(bad === 0 ? `e2a2-validasi-berstrata: ${n} uji lulus` : `e2a2-validasi-berstrata: ${bad} gagal dari ${n}`);
  return bad === 0 ? 0 : 1;
}

// ── main ──────────────────────────────────────────────────────────────────────
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(await uji());
  const P2 = bacaPraDaftarE2A2();
  if (!P2?.K) { console.error(`BERHENTI: pra-daftar ${PRA_DAFTAR_E2A2} tidak terbaca`); process.exit(1); }
  const beban = JSON.parse(fs.readFileSync(BEBAN, 'utf8'));
  const semua = (f) => bacaJsonl(f).filter((b) => !b.asap);
  // --kecuali <sampel.json> boleh berulang: sampel yang sudah pernah dilihat (dan dilabel).
  const kecuali = arg.flatMap((a, i) => (a === '--kecuali' ? JSON.parse(fs.readFileSync(arg[i + 1], 'utf8')).map(({ npc, q, teks }) => ({ npc, q, teks })) : []));

  if (arg.includes('--sampel')) {
    if (!P2.dikunci) { console.error('BERHENTI: sampel dibuat HANYA sesudah pra-daftar E2A2 dikunci'); process.exit(1); }
    const f = arg[arg.indexOf('--sampel') + 1];
    const S = buatSampelBerstrata(N.nilaiBaris(semua(f), beban), beban, P2.K, { kecuali });
    const dasar = path.join(DI_SINI, `validasi-e2a2-sampel-${path.basename(f, '.jsonl')}-benih${P2.K.benih}`);
    fs.writeFileSync(`${dasar}.json`, JSON.stringify(S.sampel, null, 1));
    fs.writeFileSync(`${dasar}-kunci.json`, JSON.stringify(S.kunci, null, 1));
    console.log(`sampel buta berstrata ${S.sampel.length} butir (luar ${S.ringkas.luar} · tahu ${S.ringkas.tahu}) → ${path.basename(dasar)}.json — kunci TERPISAH (-kunci.json), jangan dibuka sebelum vonis`);
    process.exit(0);
  }
  if (arg.includes('--validasi')) {
    const [f, fs1, fl] = arg.slice(arg.indexOf('--validasi') + 1);
    if (!kecuali.length) { console.error('BERHENTI: --validasi butuh --kecuali yang sama dengan saat sampel dibuat (untuk bobot populasi)'); process.exit(1); }
    const hasil = validasiBerstrata(JSON.parse(fs.readFileSync(fs1, 'utf8')), E2A.petaLabel(JSON.parse(fs.readFileSync(fl, 'utf8'))), N.nilaiBaris(semua(f), beban), P2.K, { kecuali });
    const keluar = fl.replace(/\.json$/, '-hasil.json');
    fs.writeFileSync(keluar, JSON.stringify(hasil, null, 1));
    console.log(JSON.stringify(hasil, null, 1));
    console.log(`→ ${path.basename(keluar)} · ${hasil.lulus ? 'LULUS' : 'GAGAL'}`);
    process.exit(0);
  }
  if (arg.includes('--vonis')) {
    const [f, h1, h2] = arg.slice(arg.indexOf('--vonis') + 1);
    // Kepekaan: --kecuali di sini = SEMUA sampel yang pernah dilabel (#1, #2, dan #3).
    const r = vonisE2A2(bacaJsonl(f), beban, P2, [h1, h2].map((x) => JSON.parse(fs.readFileSync(x, 'utf8'))), { barisValidasi: kecuali });
    console.log(JSON.stringify(r, null, 1));
    process.exit(r.vonis === 'DITOLAK' ? 2 : 0);
  }
  console.error('pakai --uji | --sampel | --validasi | --vonis');
  process.exit(2);
}
