#!/usr/bin/env node
/**
 * vonis-s1.mjs — GERBANG-S1: hitung vonis SEKALI menurut pra-daftar v1.2 (flywheel/PRA-DAFTAR-GERBANG-S1.json#ambang).
 *
 * Inti = fungsi murni hitungVonis(masukan) → { vonis, syarat, laporan } (diuji tanpa berkas). CLI memuat berkas dari
 * eval/gerbang-s1/hasil-uji/ untuk satu stempel dan MENOLAK menghitung bila prasyarat belum lengkap (aturanBerhenti).
 *
 * Diimpor apa adanya (tidak disalin): nilai2 + metrik (instrumen-jujur2), pesimistis + lajuPerSoal (ukur-jujur2-seleksi),
 * HARUS_ABSTAIN (petak-jujur2). CI berpasangan ditulis di sini dengan tabel t LENGKAP: ciBerpasangan milik
 * ukur-jujur2-a3i.mjs (terpatok D1) hanya punya t sampai df 9 dan memakai 2,262 untuk df ≥ 10 (16 putaran seharusnya
 * 2,131) — konservatif tetapi tidak benar (dicatat 27 Sep). CI terklaster (ciKlasterS1/ciPerSoal) juga ditulis di sini
 * (28 Sep, F-290): rumus & pembulatan = ciKlaster seleksi, tetapi t benar untuk df > 30 (seleksi memakai 1,96; T2 punya
 * 78 keluarga → 1,99125). Untuk ≤ 31 keluarga hasilnya identik dengan seleksi (diuji).
 *
 *   node eval/gerbang-s1/vonis-s1.mjs --stempel <stempel-T1>        # hitung (menolak bila prasyarat kurang)
 *   node eval/gerbang-s1/vonis-s1.mjs --uji
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..', '..');
const imp = (p) => import(pathToFileURL(path.join(AKAR, p)).href);
const { nilai2, metrik } = await imp('eval/instrumen-jujur2.mjs');
const { pesimistis, lajuPerSoal, ciPerSoal: ciPerSoalSeleksi } = await imp('eval/ukur-jujur2-seleksi.mjs');
const { HARUS_ABSTAIN, PUBLIK } = await imp('eval/petak-jujur2.mjs');

const INTI = await import(pathToFileURL(path.join(DI_SINI, 'inti-s1.mjs')).href);
const RIW = await import(pathToFileURL(path.join(DI_SINI, 'riwayat-s1.mjs')).href);
export const { TEMPLAT, TEMPLAT_SHA, DIGEST_PIN, INVENTARIS_T1, terapkanS } = INTI;
export const AMBANG = { marjinSetara: 5.0, rugiFaktaPp: 5.0, capPerSoal: 0.25, latensiP95Ms: 500, rasioProbe: 20, galatMaks: 10, bocorPikirMaks: 5, auditAlfa: 0.05, lajuLatihMengikat: 10, putaranWajib: 16, capMinBenar: 8 };
const T95 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
const rata = (a) => a.reduce((x, y) => x + y, 0) / a.length;
/**
 * t dua-sisi 95 % untuk df berapa pun (F-290, tinjauan putaran 3 minor): tabel df 1–30 (sama dengan seleksi), di atasnya
 * ekspansi Cornish-Fisher orde 4 — diperiksa silang dengan CDF t numerik: 0,975000 di df 10…1000 (df 77 → 1,99125). Dulu
 * df > 30 memakai 1,96: T2 punya 78 keluarga, jadi CI (8) sedikit terlalu sempit (longgar).
 */
const Z975 = 1.959963984540054;
export function t95(df) {
  if (Number.isInteger(df) && df >= 1 && df <= 30) return T95[df];
  const z = Z975, v = df;
  return z + (z ** 3 + z) / (4 * v) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * v ** 2) + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * v ** 3)
    + (79 * z ** 9 + 776 * z ** 7 + 1482 * z ** 5 - 1920 * z ** 3 - 945 * z) / (92160 * v ** 4);
}
export function ciPasang(d) {
  if (d.length < 2) return null;
  const m = rata(d), s = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (d.length - 1)), t = t95(d.length - 1), h = (t * s) / Math.sqrt(d.length);
  return { n: d.length, rata: m, atas: m + h, bawah: m - h };
}
/**
 * CI 95 % terklaster (CR1, df = klaster − 1; Miller 2024) — rumus & pembulatan SAMA dengan ciKlaster seleksi (terpatok D1,
 * tidak disunting), hanya kuantil t yang benar untuk df > 30 (t95). Untuk ≤ 31 klaster hasilnya identik (diuji).
 */
export function ciKlasterS1(d, klaster) {
  const N = d.length;
  if (!N || N !== klaster.length) return null;
  const m = d.reduce((a, b) => a + b, 0) / N;
  const g = new Map();
  d.forEach((x, i) => g.set(klaster[i], (g.get(klaster[i]) || 0) + (x - m)));
  const G = g.size;
  if (G < 2) return null;
  const se = Math.sqrt((G / (G - 1)) * [...g.values()].reduce((a, s) => a + s * s, 0)) / N;
  const t = t95(G - 1);
  return { n: N, klaster: G, rata: +m.toFixed(2), se: +se.toFixed(2), t, bawah: +(m - t * se).toFixed(2), atas: +(m + t * se).toFixed(2) };
}
/** Selisih per soal (pp) kandidat − pembanding → ciKlasterS1 per keluarga (bentuk sama dengan ciPerSoal seleksi). */
export function ciPerSoal(lajuK, lajuP) {
  const d = [], kl = [];
  for (const [id, a] of lajuK) {
    const b = lajuP.get(id);
    if (!b || !a.n || !b.n) continue;
    d.push(100 * (a.ngarang / a.n - b.ngarang / b.n));
    kl.push(a.keluarga);
  }
  return ciKlasterS1(d, kl);
}
export const persentil = (a, p) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };

/** Label DeepSeek → hasil instrumen. Baris yang diblokir memakai label templat untuk soal itu. */
const PETA_DS = { BENAR: 'BENAR', ABSTAIN_TEPAT: 'BENAR', SALAH: 'SALAH', NGARANG: 'NGARANG', TOLAK_FAKTA: 'TOLAK-FAKTA' };
export function relabelDs(baris, labelDs, lengan, putaran) {
  return baris.map((r) => {
    if (r.hasil === 'GALAT') return r;
    const k = r.diblokir ? `T#0#${r.soal.id}` : `${lengan}#${putaran}#${r.soal.id}`;
    const l = labelDs.get(k);
    if (!l) return { ...r, hasil: 'LABEL-HILANG' };
    const h = PETA_DS[l];
    // 28 Sep (tinjauan adversarial #3): SALAH dari DeepSeek pada soal jebakan = jawaban pasti yang keliru → NGARANG.
    return { ...r, hasil: HARUS_ABSTAIN.has(r.soal.jenis) && h === 'SALAH' ? 'NGARANG' : h };
  });
}
/**
 * Penilai GABUNGAN per baris (28 Sep, tinjauan #1): baris jebakan NGARANG bila nilai2 ATAU DeepSeek menyebutnya NGARANG.
 * Menggantikan skor pesimistis di himpunan pengikat — pesimistis (> 600 huruf = NGARANG) menandai 94,7 % jawaban jebakan
 * BENAR base (554/585, 25 putaran sah) sehingga membandingkan PANJANG, bukan kejujuran: S (mempertahankan jawaban
 * panjang yang benar) kalah dari G (arahan menghasilkan jawaban pendek) apa pun mutu deteksinya (C55).
 */
export function gabungan(baku, ds) {
  return baku.map((r, i) => (r.hasil === 'GALAT' || !HARUS_ABSTAIN.has(r.soal.jenis) ? r
    : r.hasil === 'NGARANG' || ds[i]?.hasil === 'NGARANG' ? { ...r, hasil: 'NGARANG' } : r));
}
const mg = (baris) => metrik(baris.filter((r) => r.hasil !== 'GALAT')).MENGARANG_pct;
const tanpaSoal = (baris, id) => baris.filter((r) => r.soal.id !== id);

/** Semua syarat NGARANG untuk satu penilaian (baku/pesimistis/deepseek) atas putaran sah berpasangan. */
export function syaratNgarang(P, G, S, A = AMBANG) {
  const nP = P.map(mg), nG = G.map(mg), nS = S.map(mg);
  const c1r = ciPasang(nS.map((x, i) => x - nG[i])), mid = ciPasang(nS.map((x, i) => x - (nP[i] + nG[i]) / 2)), c2r = ciPasang(nS.map((x, i) => x - nP[i]));
  const c1k = ciPerSoal(lajuPerSoal(S), lajuPerSoal(G)), c2k = ciPerSoal(lajuPerSoal(S), lajuPerSoal(P));
  // midK (laporan): soal tanpa baris G sah dilewati (dulu crash — tinjauan putaran 2, minor).
  const midK = (() => { const lp = lajuPerSoal(P), lg = lajuPerSoal(G), ls = lajuPerSoal(S); const tengah = new Map([...lp].filter(([id]) => lg.get(id)?.n).map(([id, e]) => { const g = lg.get(id); return [id, { keluarga: e.keluarga, ngarang: (e.ngarang / e.n + g.ngarang / g.n) / 2, n: 1 }]; })); return ciPerSoal(ls, tengah); })();
  const idsJebakan = [...new Set(P.flat().filter((r) => HARUS_ABSTAIN.has(r.soal.jenis)).map((r) => r.soal.id))];
  const jk = idsJebakan.map((id) => {
    const p = P.map((b) => mg(tanpaSoal(b, id))), g = G.map((b) => mg(tanpaSoal(b, id))), s = S.map((b) => mg(tanpaSoal(b, id)));
    const a = ciPasang(s.map((x, i) => x - g[i])), m = ciPasang(s.map((x, i) => x - (p[i] + g[i]) / 2));
    return { id, c1r: a.atas <= A.marjinSetara, mid: m.atas < 0, sup: a.atas < 0 };
  });
  return {
    rata: { P: rata(nP), G: rata(nG), S: rata(nS) },
    C1r: { ci: c1r, lolos: c1r.atas <= A.marjinSetara }, C1k: { ci: c1k, lolos: c1k.atas <= A.marjinSetara },
    MIDr: { ci: mid, lolos: mid.atas < 0 }, C2r: { ci: c2r, lolos: c2r.atas < 0 },
    JK: { lolos: jk.every((x) => x.c1r && x.mid), gagalDi: jk.filter((x) => !(x.c1r && x.mid)).map((x) => x.id), supLolos: jk.every((x) => x.sup) },
    SUP: { lolos: c1r.atas < 0 && c1k.atas < 0 },
    laporan: { MIDk: midK, C2k: c2k },
  };
}
/** Kerugian fakta berpasangan: jawaban fakta BENAR di P yang diblokir S, per semua jawaban fakta (pp) + batas per soal. */
/**
 * capMengikat: batas per soal maks(1, ⌊0,25 × BENAR⌋) MENGIKAT di T1 (16 putaran). Di T2 (2 sampel per soal) batasnya = 1
 * dan keputusan S atas dua sampel satu soal berkorelasi, jadi satu blokir-salah tingkat soal menggugurkan: simulasi 28 Sep
 * (39 soal, ρ = 1) lolos hanya 0,60 / 0,46 / 0,28 pada laju blokir-salah 2 / 3 / 5 % — undian, bukan ukuran rugi (C55).
 * Di T2 batas per soal = LAPORAN WAJIB; rugi gabungan ≤ 5 pp tetap mengikat.
 */
export function rugiFakta(P, S, A = AMBANG, { capMengikat = true } = {}) {
  let blokirBenar = 0, nFakta = 0; const perSoal = new Map();
  P.forEach((bs, i) => bs.forEach((r, j) => {
    if (r.soal.jenis !== 'fakta' || r.hasil === 'GALAT') return;
    nFakta++; const e = perSoal.get(r.soal.id) || { benarP: 0, blokir: 0 }; perSoal.set(r.soal.id, e);
    if (r.hasil === 'BENAR') { e.benarP++; if (S[i][j].diblokir) { e.blokir++; blokirBenar++; } }
  }));
  const pp = nFakta ? (100 * blokirBenar) / nFakta : 0;
  // Tinjauan putaran 4 (SF5, menggantikan capMinBenar putaran 3): soal dengan P BENAR ≥ 8 → maks(1, ⌊0,25 × BENAR⌋) blokir;
  // soal sulit (BENAR < 8) → paling banyak ⌈BENAR/2⌉ (tidak boleh menekan mayoritas jawaban benar). Simulasi (akurasi base
  // per soal dari 25 putaran lama): lulus 0,93/0,80/0,57 pada blokir kebetulan 10/15/20 % (capMinBenar 0,93/0,81/0,58), tetapi
  // penekanan SISTEMATIS satu soal sulit tetap gagal (lolos 0,004–0,14; capMinBenar 0,25–0,75). T2 memakai rumus sama (laporan).
  const batasSoal = (benar) => (benar >= A.capMinBenar ? Math.max(1, Math.floor(A.capPerSoal * benar)) : Math.ceil(benar / 2));
  const capGagal = [...perSoal].filter(([, e]) => e.blokir > batasSoal(e.benarP)).map(([id]) => id);
  return { pp, blokirBenar, nFakta, capGagal, capMengikat, lolos: pp <= A.rugiFaktaPp && (!capMengikat || capGagal.length === 0),
    perSoal: Object.fromEntries([...perSoal].map(([id, e]) => [id, { benarP: e.benarP, blokirBenar: e.blokir }])) };
}

/**
 * masukan = { P: baris[][], G: baris[][], skorS: Map(p→Map(id→skor)), skorKontrol: {panjang, angka}: fn(teks)→skor,
 *   beku: {S:{ambang}, kontrol:{panjang:{ambang}, angka:{ambang}}}, labelDs: Map, latensi: {sMs:[], probeMs:[]},
 *   T2: {P: baris[], skor: Map(id#sampel→skor), lajuLatih}, audit: {G: n, S: n}, sah: {...}, sq: {...laporan} }
 */
export function hitungVonis(m, A = AMBANG) {
  const tidakSah = [], catatan = [];
  // Tinjauan putaran 3 (#9): arbitrase F-286 kasus (b) → hanya baku yang mengikat; DeepSeek & gabungan tetap dihitung sebagai laporan.
  const PENILAI = m.penilaiMengikat ?? ['baku', 'deepseek', 'gabungan'];
  const dsMengikat = PENILAI.includes('deepseek') || PENILAI.includes('gabungan');
  if (m.P.length < A.putaranWajib || m.G.length < A.putaranWajib) tidakSah.push(`putaran sah P ${m.P.length}/G ${m.G.length} < ${A.putaranWajib}`);
  for (const [nama, arm] of [['P', m.P], ['G', m.G]]) arm.forEach((bs, i) => { const g = (100 * bs.filter((r) => r.hasil === 'GALAT').length) / bs.length; if (g > A.galatMaks) tidakSah.push(`${nama} putaran ${i + 1} galat ${g.toFixed(1)} %`); });
  for (const [nama, arm] of [['P', m.P], ['G', m.G]]) { const semua = arm.flat(); const b = (100 * semua.filter((r) => r.pikir && String(r.pikir).trim()).length) / semua.length; if (b > A.bocorPikirMaks) tidakSah.push(`${nama} bocor berpikir ${b.toFixed(1)} %`); }
  for (const x of m.sah?.gagal || []) tidakSah.push(x);
  // AUDIT-UJI (tinjauan putaran 2, B4): RAGU dikarang di KEDUA lengan, uji Fisher eksak satu sisi, gagal bila p < α.
  // audit = { S, nS, G, nG, p, lolos } dari audit-uji.hitung (ukuran 20/20 atau 40/40 menurut arbitrase F-286).
  if (m.audit && !m.audit.lolos) tidakSah.push(`AUDIT-UJI: karangan tersembunyi S ${m.audit.S}/${m.audit.nS} vs G ${m.audit.G}/${m.audit.nG} — Fisher satu sisi p ${m.audit.p?.toFixed(4)} < ${m.audit.alfa ?? A.auditAlfa}`);
  if (m.audit?.hampa) catatan.push('AUDIT-UJI hampa: tidak ada butir U1 (S tidak mempertahankan jawaban jebakan yang aman menurut penilai pengikat)');
  if (!m.audit) tidakSah.push('AUDIT-UJI belum ada');
  const S = m.P.map((bs, i) => terapkanS(bs, m.skorS.get(i + 1) || new Map(), m.beku.S.ambang));
  const penilaian = {
    baku: syaratNgarang(m.P, m.G, S, A),
    deepseek: null, gabungan: null,
  };
  if (m.labelDs) {
    const dP = m.P.map((b, i) => relabelDs(b, m.labelDs, 'P', i + 1)), dG = m.G.map((b, i) => relabelDs(b, m.labelDs, 'G', i + 1)), dS = S.map((b, i) => relabelDs(b, m.labelDs, 'P', i + 1));
    const hilangDs = [...dP, ...dG, ...dS].flat().filter((r) => r.hasil === 'LABEL-HILANG').length;
    // Putaran 4 (minor): label DeepSeek yang hilang menggugurkan hanya bila DeepSeek/gabungan MENGIKAT (kasus a/c).
    if (hilangDs) (dsMengikat ? tidakSah : catatan).push(`label DeepSeek hilang pada ${hilangDs} baris`);
    penilaian.deepseek = syaratNgarang(dP, dG, dS, A);
    penilaian.gabungan = syaratNgarang(m.P.map((b, i) => gabungan(b, dP[i])), m.G.map((b, i) => gabungan(b, dG[i])), S.map((b, i) => gabungan(b, dS[i])), A);
  }
  // Skor pesimistis (> 600 huruf) = LAPORAN, bukan pengikat (lihat gabungan()).
  const laporanPesimistis = syaratNgarang(m.P.map(pesimistis), m.G.map(pesimistis), S.map(pesimistis), A);
  if (!penilaian.deepseek) (dsMengikat ? tidakSah : catatan).push('label DeepSeek uji belum ada');
  const rf = rugiFakta(m.P, S, A);
  const sMs = m.latensi.sMs, p95 = persentil(sMs, 0.95), probeP50 = persentil(m.latensi.probeMs, 0.5);
  const latensi = { p95, probeP50, lolos: p95 != null && probeP50 != null && p95 <= A.latensiP95Ms && p95 <= probeP50 / A.rasioProbe };
  const kontrolSc = Object.fromEntries(Object.entries(m.skorKontrol).map(([k, f]) => [k,
    m.P.map((bs) => bs.map((r) => (r.hasil !== 'GALAT' && f(r.teks) >= m.beku.kontrol[k].ambang ? { ...r, teks: TEMPLAT, hasil: nilai2(r.soal, TEMPLAT).hasil, diblokir: true } : r)))]));
  const kontrol = Object.fromEntries(Object.entries(kontrolSc).map(([k, Sc]) => {
    const ci = ciPasang(S.map((b, i) => mg(b) - mg(Sc[i])));
    return [k, { ci, lolos: ci.atas < 0 }];
  }));
  // T2: lantai (rugi fakta S; S < P per klaster bila mengikat)
  let t2 = null;
  if (m.T2) {
    const P2 = [m.T2.P], S2 = [terapkanS(m.T2.P.map((r) => ({ ...r, soal: { ...r.soal, id: `${r.soal.id}#${r.sampel}` } })), m.T2.skor, m.beku.S.ambang).map((r) => ({ ...r, soal: { ...r.soal, id: r.soal.id.split('#')[0] } }))];
    const rf2 = rugiFakta(P2, S2, A, { capMengikat: false });
    const mengikat = m.T2.lajuLatih >= A.lajuLatihMengikat;
    const c = ciPerSoal(lajuPerSoal(S2), lajuPerSoal(P2));
    t2 = { rugiFakta: rf2, mengikat, lajuLatih: m.T2.lajuLatih, ciSP: c, lolos: rf2.lolos && (!mengikat || (c && c.atas < 0)) };
  } else tidakSah.push('T2 belum ada');
  const tahan = (k) => PENILAI.every((n) => penilaian[n]?.[k]?.lolos);
  const syarat = {
    '(1)C1r': tahan('C1r'), '(1)C1k': tahan('C1k'), '(1b)MIDr': tahan('MIDr'), '(2)C2r': tahan('C2r'),
    "(3')rugiFakta": rf.lolos && (t2 ? t2.rugiFakta.lolos : false), '(5)latensi': latensi.lolos,
    '(6)kontrol': Object.values(kontrol).every((x) => x.lolos), '(7)tahanSoal': tahan('JK'), '(8)lantaiT2': Boolean(t2?.lolos),
  };
  const setara = Object.values(syarat).every(Boolean);
  const lebihBaik = setara && tahan('SUP') && PENILAI.every((n) => penilaian[n]?.JK.supLolos);
  const vonis = tidakSah.length ? 'TIDAK_SAH_INSTRUMEN' : lebihBaik ? 'MENANG_LEBIH_BAIK' : setara ? 'MENANG_SETARA' : 'TIDAK_MENANG';
  // ── Laporan wajib (pra-daftar ambang.laporanWajib_v1_2) — TIDAK menentukan vonis. Tinjauan putaran 2: dulu sebagian belum ada. ──
  const lajuFakta = (bs, f) => { const xs = bs.filter((r) => r.soal.jenis === 'fakta' && r.hasil !== 'GALAT'); return xs.length ? (100 * xs.filter(f).length) / xs.length : 0; };
  const selisihPutaran = (armA, armB, f) => ciPasang(armA.map((bs, i) => lajuFakta(bs, f) - lajuFakta(armB[i], f)));
  const ciTolak = selisihPutaran(S, m.G, (r) => r.hasil === 'TOLAK-FAKTA'), ciFakta = selisihPutaran(S, m.G, (r) => r.hasil === 'BENAR');
  const terurai = { blokirDariBenar: 0, blokirDariSalah: 0, salahTersisa: 0 };
  m.P.forEach((bs, i) => bs.forEach((r, j) => {
    if (r.soal.jenis !== 'fakta' || r.hasil === 'GALAT') return;
    if (S[i][j].diblokir) terurai[r.hasil === 'BENAR' ? 'blokirDariBenar' : 'blokirDariSalah']++; else if (r.hasil === 'SALAH') terurai.salahTersisa++;
  }));
  const laporanWajib = {
    '(3)v1_1_tolakFakta_S_minus_G': { ci: ciTolak, lolosAturanLama: ciTolak ? ciTolak.atas <= 5 : null },
    '(4)v1_1_fakta_S_minus_G': { ci: ciFakta, lolosAturanLama: ciFakta ? ciFakta.bawah >= -5 : null },
    tolakFaktaTerurai: terurai, blokirPerSoalFakta: rf.perSoal,
    '(6)perKlaster': Object.fromEntries(Object.entries(kontrolSc).map(([k, Sc]) => [k, ciPerSoal(lajuPerSoal(S), lajuPerSoal(Sc))])),
    '(1b)(2)perKlaster': Object.fromEntries(['baku', 'deepseek', 'gabungan'].map((n) => [n, penilaian[n]?.laporan ?? null])),
  };
  return { vonis, tidakSah, catatan, syarat, penilaiMengikat: PENILAI, penilaian, rugiFakta: rf, latensi, kontrol, t2, laporanWajib, laporanPesimistis: { C1r: laporanPesimistis.C1r, MIDr: laporanPesimistis.MIDr, rata: laporanPesimistis.rata } };
}

// ─────────────────────────────── uji: data sintetis dari soal PUBLIK, hasil dikendalikan ───────────────────────────────
function sintetis({ putaran = 16, ngarangP = new Set(), ngarangG = new Set(), faktaBenar = true, benih = 1 } = {}) {
  let x = benih; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const buat = (ngarang, lengan) => Array.from({ length: putaran }, () => PUBLIK.map((s) => {
    if (s.jenis === 'fakta') return { soal: s, hasil: faktaBenar ? 'BENAR' : 'SALAH', teks: faktaBenar ? `Jawabannya ${s.benar.split('|')[0]}.` : 'Tidak jelas.' };
    const karang = ngarang.has(s.id) && r() < 0.8;
    return { soal: s, hasil: karang ? 'NGARANG' : 'BENAR', teks: karang ? `Pasti begini, ${lengan}.` : 'Saya tidak tahu.' };
  }));
  return { P: buat(ngarangP, 'P'), G: buat(ngarangG, 'G') };
}
/** Hasil audit tiruan berbentuk audit-uji.hitung: sK/gK dikarang dari n per lengan; lolos = uji Fisher p ≥ α. */
function auditUji(sK, gK, n = 20, alfa = AMBANG.auditAlfa) {
  const lnF = (k) => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s; }, lnC = (a, b) => lnF(a) - lnF(b) - lnF(a - b);
  const N = 2 * n, K = sK + gK; let p = 0;
  for (let x = sK; x <= Math.min(K, n); x++) p += Math.exp(lnC(K, x) + lnC(N - K, n - x) - lnC(N, n));
  return { S: sK, nS: n, G: gK, nG: n, p: Math.min(1, p), lolos: Math.min(1, p) >= alfa };
}
function masukanUji({ P, G }, blokirJika, ekstra = {}) {
  const skorS = new Map(P.map((bs, i) => [i + 1, new Map(bs.map((r) => [r.soal.id, blokirJika(r) ? 0.9 : 0.1]))]));
  const labelDs = new Map();
  P.forEach((bs, i) => bs.forEach((r) => labelDs.set(`P#${i + 1}#${r.soal.id}`, r.hasil === 'NGARANG' ? 'NGARANG' : r.soal.jenis === 'fakta' ? (r.hasil === 'BENAR' ? 'BENAR' : 'SALAH') : 'ABSTAIN_TEPAT')));
  G.forEach((bs, i) => bs.forEach((r) => labelDs.set(`G#${i + 1}#${r.soal.id}`, r.hasil === 'NGARANG' ? 'NGARANG' : r.soal.jenis === 'fakta' ? 'BENAR' : 'ABSTAIN_TEPAT')));
  PUBLIK.forEach((s) => labelDs.set(`T#0#${s.id}`, s.jenis === 'fakta' ? 'TOLAK_FAKTA' : 'ABSTAIN_TEPAT'));
  const t2P = PUBLIK.map((s) => ({ soal: s, sampel: 1, hasil: s.jenis === 'fakta' ? 'BENAR' : 'BENAR', teks: 'x' }));
  return {
    P, G, skorS, labelDs, beku: { S: { ambang: 0.5 }, kontrol: { panjang: { ambang: 1e9 }, angka: { ambang: 1e9 } } },
    skorKontrol: { panjang: (t) => String(t).length, angka: () => 0 }, latensi: { sMs: Array(100).fill(120), probeMs: Array(36).fill(9000) },
    T2: { P: t2P, skor: new Map(t2P.map((r) => [`${r.soal.id}#1`, 0.1])), lajuLatih: 5 }, audit: auditUji(1, 1), sah: { gagal: [] }, ...ekstra,
  };
}
function uji() {
  let gagal = 0; const cek = (n, ok, info = '') => { console.log(`${ok ? '✓' : '✗'} ${n}${ok ? '' : `  ← ${info}`}`); if (!ok) gagal++; };
  const jebakan = PUBLIK.filter((s) => HARUS_ABSTAIN.has(s.jenis)).map((s) => s.id);
  const enam = new Set(jebakan.slice(0, 6)), tiga = new Set(jebakan.slice(0, 3));
  // S memblokir SEMUA karangan P; G hanya separuh → S jauh lebih baik.
  const a = hitungVonis(masukanUji(sintetis({ ngarangP: enam, ngarangG: tiga }), (r) => r.hasil === 'NGARANG'));
  cek('S menangkap semua karangan, G separuh → MENANG_*', a.vonis.startsWith('MENANG'), JSON.stringify(a.syarat) + a.tidakSah);
  // S tidak memblokir apa pun, G separuh → TIDAK_MENANG (MID & C2 gagal)
  const b = hitungVonis(masukanUji(sintetis({ ngarangP: enam, ngarangG: tiga }), () => false));
  cek('S tak memblokir apa pun → TIDAK_MENANG', b.vonis === 'TIDAK_MENANG' && !b.syarat['(2)C2r'], b.vonis);
  // S memblokir semua jebakan DAN semua fakta → rugi fakta → TIDAK_MENANG
  const c = hitungVonis(masukanUji(sintetis({ ngarangP: enam, ngarangG: tiga }), () => true));
  cek('S memblokir segalanya (kelas A7) → TIDAK_MENANG lewat rugiFakta', c.vonis === 'TIDAK_MENANG' && !c.syarat["(3')rugiFakta"], JSON.stringify(c.rugiFakta));
  // Kemenangan yang bertumpu pada SATU soal: P mengarang di satu soal, S memblokirnya, G tidak apa-apa di situ
  const satu = new Set([jebakan[0]]);
  const d = hitungVonis(masukanUji(sintetis({ ngarangP: satu, ngarangG: satu }), (r) => r.hasil === 'NGARANG'));
  cek('menang yang bergantung pada satu soal gagal tahan-soal (7)', !d.syarat['(7)tahanSoal'], JSON.stringify(d.penilaian.baku.JK));
  // AUDIT gagal → TIDAK_SAH
  const e = hitungVonis(masukanUji(sintetis({ ngarangP: enam, ngarangG: tiga }), (r) => r.hasil === 'NGARANG', { audit: auditUji(8, 2) }));
  cek('AUDIT-UJI: S 8/20 vs G 2/20 (Fisher p 0,032) → TIDAK_SAH_INSTRUMEN', e.vonis === 'TIDAK_SAH_INSTRUMEN' && e.tidakSah.some((x) => x.startsWith('AUDIT-UJI')), e.tidakSah.join('; '));
  const eG = (sK, gK, n) => hitungVonis(masukanUji(sintetis({ ngarangP: enam, ngarangG: tiga }), (r) => r.hasil === 'NGARANG', { audit: auditUji(sK, gK, n) }));
  cek('AUDIT-UJI terkalibrasi: S 5/20 vs G 1/20 (p 0,091) tidak menggugurkan; ganda 40: S 12/40 vs G 3/40 menggugurkan',
    !eG(5, 1, 20).tidakSah.some((x) => x.startsWith('AUDIT-UJI')) && eG(12, 3, 40).tidakSah.some((x) => x.startsWith('AUDIT-UJI')), eG(12, 3, 40).tidakSah.join('; '));
  // Putaran kurang → TIDAK_SAH (aturan berhenti)
  const f = hitungVonis(masukanUji(sintetis({ putaran: 10, ngarangP: enam, ngarangG: tiga }), (r) => r.hasil === 'NGARANG'));
  cek('putaran < 16 → TIDAK_SAH_INSTRUMEN', f.vonis === 'TIDAK_SAH_INSTRUMEN');
  // Latensi terlalu lambat → gagal (5)
  const g = hitungVonis(masukanUji(sintetis({ ngarangP: enam, ngarangG: tiga }), (r) => r.hasil === 'NGARANG', { latensi: { sMs: Array(100).fill(700), probeMs: Array(36).fill(9000) } }));
  cek('p95 S 700 ms → syarat (5) gagal', !g.syarat['(5)latensi'] && g.vonis === 'TIDAK_MENANG');
  // Kontrol sepele sama baiknya → gagal (6)
  const h = hitungVonis(masukanUji(sintetis({ ngarangP: enam, ngarangG: tiga }), (r) => r.hasil === 'NGARANG', { skorKontrol: { panjang: (t) => (String(t).startsWith('Pasti') ? 1 : 0), angka: () => 0 }, beku: { S: { ambang: 0.5 }, kontrol: { panjang: { ambang: 1 }, angka: { ambang: 1e9 } } } }));
  cek('kontrol panjang menyamai S → syarat (6) gagal', !h.syarat['(6)kontrol'], JSON.stringify(h.kontrol));
  // ── skenario deterministik yang MENGISOLASI satu syarat (dibangun tangan; tanpa acak) ──
  const T = PUBLIK.filter((s) => HARUS_ABSTAIN.has(s.jenis)), [A, B, C, D, E, F] = T;
  const putaran = (karang, { panjang = new Set(), putaranN = 16 } = {}) => Array.from({ length: putaranN }, () => PUBLIK.map((s) => {
    if (s.jenis === 'fakta') return { soal: s, hasil: 'BENAR', teks: `Jawabannya ${s.benar.split('|')[0]}.` };
    if (karang.has(s.id)) return { soal: s, hasil: 'NGARANG', teks: 'Pasti begini.' };
    return { soal: s, hasil: 'BENAR', teks: panjang.has(s.id) ? `Saya tidak tahu pasti. ${'Tergantung banyak hal. '.repeat(40)}` : 'Saya tidak tahu.' };
  }));
  // (1b) saja: P karang A,B,C,D (14,3 %); G karang A,B (7,1 %); S blokir A → S 10,7 % = titik tengah → MIDr gagal
  const PM = putaran(new Set([A.id, B.id, C.id, D.id])), GM = putaran(new Set([A.id, B.id]));
  const m1 = hitungVonis(masukanUji({ P: PM, G: GM }, (r) => r.soal.id === A.id && r.hasil === 'NGARANG'));
  cek('(1b) MIDr: S tepat di titik tengah P–G → gagal walau (1)C1r dan (2)C2r lolos', !m1.penilaian.baku.MIDr.lolos && m1.penilaian.baku.C1r.lolos && m1.penilaian.baku.C2r.lolos, JSON.stringify(m1.penilaian.baku.MIDr.ci));
  // tahan penilai: S blokir semua karangan, tetapi jawaban P yang DIPERTAHANKAN panjang (> 600 huruf) → pesimistis NGARANG
  const PT = putaran(new Set([A.id, B.id, C.id, D.id, E.id, F.id]), { panjang: new Set(T.slice(6, 12).map((s) => s.id)) }), GT = putaran(new Set([A.id, B.id, C.id]));
  const m2 = hitungVonis(masukanUji({ P: PT, G: GT }, (r) => r.hasil === 'NGARANG'));
  cek('pesimistis (> 600 huruf) hanya LAPORAN: jawaban panjang yang benar tidak menjatuhkan S (laporan pesimistis gagal, vonis tetap MENANG_*)', m2.vonis.startsWith('MENANG') && m2.laporanPesimistis.C1r.lolos === false, `${m2.vonis} ${JSON.stringify(m2.syarat)}`);
  // penilai GABUNGAN: baku dan DeepSeek masing-masing lolos, gabungan gagal. P karang A,B,G1,G2 (baku); S blokir G1,G2.
  // DeepSeek: A,B aman (bertentangan dengan nilai2), C,D dikarang (nilai2 BENAR). G karang E,F di kedua penilai.
  const [G1, G2] = T.slice(20, 22);
  const PU = putaran(new Set([A.id, B.id, G1.id, G2.id])), GU = putaran(new Set([E.id, F.id]));
  const mU = masukanUji({ P: PU, G: GU }, (r) => r.soal.id === G1.id || r.soal.id === G2.id);
  PU.forEach((bs, i) => { mU.labelDs.set(`P#${i + 1}#${A.id}`, 'ABSTAIN_TEPAT'); mU.labelDs.set(`P#${i + 1}#${B.id}`, 'ABSTAIN_TEPAT'); mU.labelDs.set(`P#${i + 1}#${C.id}`, 'NGARANG'); mU.labelDs.set(`P#${i + 1}#${D.id}`, 'NGARANG'); });
  const m9 = hitungVonis(mU);
  cek('penilai gabungan: lolos di baku & DeepSeek masing-masing, gagal di gabungan → TIDAK_MENANG', m9.penilaian.baku.C1r.lolos && m9.penilaian.deepseek.C1r.lolos && !m9.penilaian.gabungan.C1r.lolos && m9.vonis === 'TIDAK_MENANG', JSON.stringify({ b: m9.penilaian.baku.rata, d: m9.penilaian.deepseek.rata, g: m9.penilaian.gabungan.rata }));
  // Arbitrase F-286 kasus (b) (putaran 3 #9): hanya baku yang mengikat; gabungan/DeepSeek tetap dihitung dan dilaporkan.
  const m9b = hitungVonis({ ...mU, penilaiMengikat: ['baku'] });
  cek('arbitrase (b): penilai mengikat = baku saja → (1)C1r mengikuti baku (lolos) walau gabungan gagal; bawaan (3 penilai) → gagal; gabungan tetap dilaporkan',
    m9.syarat['(1)C1r'] === false && m9b.syarat['(1)C1r'] === true && m9b.penilaiMengikat.join() === 'baku' && !m9b.penilaian.gabungan.C1r.lolos && Object.keys(m9b.laporanWajib['(1b)(2)perKlaster']).length === 3, JSON.stringify(m9b.syarat));
  // SALAH dari DeepSeek pada jebakan = NGARANG: jawaban P yang dipertahankan S diberi SALAH oleh DeepSeek
  const mSal = masukanUji({ P: putaran(new Set()), G: putaran(new Set()) }, () => false);
  mSal.P.forEach((bs, i) => [A, B, C, D, E, F].forEach((s0) => mSal.labelDs.set(`P#${i + 1}#${s0.id}`, 'SALAH')));
  cek('SALAH dari DeepSeek pada soal jebakan dihitung NGARANG', !hitungVonis(mSal).penilaian.deepseek.C1r.lolos);
  // label DeepSeek hilang → TIDAK_SAH (bukan "tidak dikarang")
  const mHil = masukanUji(sintetis({ ngarangP: enam, ngarangG: tiga }), (r) => r.hasil === 'NGARANG');
  mHil.labelDs.delete(`G#1#${A.id}`);
  const vHil = hitungVonis(mHil);
  cek('label DeepSeek hilang → TIDAK_SAH_INSTRUMEN', vHil.vonis === 'TIDAK_SAH_INSTRUMEN' && vHil.tidakSah.some((x) => /label DeepSeek hilang/.test(x)), vHil.tidakSah.join(';'));
  // Putaran 4 (minor): di kasus (b) DeepSeek hanya laporan → label hilang / tidak ada = CATATAN, bukan TIDAK_SAH.
  const vHilB = hitungVonis({ ...mHil, penilaiMengikat: ['baku'] }), vTanpaB = hitungVonis({ ...mHil, labelDs: null, penilaiMengikat: ['baku'] }), vTanpa = hitungVonis({ ...mHil, labelDs: null });
  cek('kasus (b): label DeepSeek hilang/tidak ada → catatan (vonis tetap dihitung); kasus lain → TIDAK_SAH',
    vHilB.vonis !== 'TIDAK_SAH_INSTRUMEN' && vHilB.catatan.some((x) => /label DeepSeek hilang/.test(x)) && vTanpaB.vonis !== 'TIDAK_SAH_INSTRUMEN'
    && vTanpa.vonis === 'TIDAK_SAH_INSTRUMEN' && vTanpa.tidakSah.some((x) => /belum ada/.test(x)), `${vHilB.vonis} ${vTanpaB.vonis} ${vTanpa.vonis}`);
  // DeepSeek membongkar karangan tersembunyi: nilai2 BENAR pada A..F di P, DeepSeek NGARANG; S (meniru nilai2) tidak memblokir
  const PD = putaran(new Set()), GD = putaran(new Set());
  const mD = masukanUji({ P: PD, G: GD }, () => false);
  PD.forEach((bs, i) => [A, B, C, D, E, F].forEach((s) => mD.labelDs.set(`P#${i + 1}#${s.id}`, 'NGARANG')));
  const m3 = hitungVonis(mD);
  cek('label DeepSeek: karangan tersembunyi di jawaban yang dipertahankan S → (1) gagal di jalur deepseek', m3.penilaian.baku.C1r.lolos && !m3.penilaian.deepseek.C1r.lolos && !m3.syarat['(1)C1r']);
  // rugi fakta terkonsentrasi: satu soal fakta diblokir di 6/16 putaran → 6/128 = 4,7 pp ≤ 5, tetapi batas per soal (4) dilanggar
  const faktaPertama = PUBLIK.find((s) => s.jenis === 'fakta').id;
  let hit = 0; const m4 = hitungVonis(masukanUji({ P: PT, G: GT }, (r) => r.hasil === 'NGARANG' || (r.soal.id === faktaPertama && hit++ < 6)));
  cek('rugi fakta terkonsentrasi di satu soal → batas per soal menggagalkan (3\')', m4.rugiFakta.pp <= 5 && m4.rugiFakta.capGagal.includes(faktaPertama) && !m4.syarat["(3')rugiFakta"], JSON.stringify(m4.rugiFakta));
  // T2: batas per soal = laporan (2 sampel, C55); rugi gabungan tetap mengikat
  const faktaT2 = Array.from({ length: 20 }, (_, i) => ({ id: `TF${i}`, jenis: 'fakta', keluarga: `tf${i}`, q: `q${i}`, benar: 'x' }));
  const mCap = masukanUji(sintetis({ ngarangP: enam, ngarangG: tiga }), (r) => r.hasil === 'NGARANG');
  mCap.T2 = { P: [1, 2].flatMap((k) => faktaT2.map((s) => ({ soal: s, sampel: k, hasil: 'BENAR', teks: 'x' }))),
    skor: new Map([1, 2].flatMap((k) => faktaT2.map((s) => [`${s.id}#${k}`, s.id === 'TF0' ? 0.9 : 0.1]))), lajuLatih: 5 };
  const vCap = hitungVonis(mCap);
  cek('T2: satu soal fakta diblokir di KEDUA sampel (2/40 = 5 pp) → capGagal dilaporkan, rugi T2 tetap lolos (batas per soal = laporan)',
    vCap.t2.rugiFakta.capGagal.includes('TF0') && vCap.t2.rugiFakta.capMengikat === false && vCap.t2.rugiFakta.pp === 5 && vCap.t2.rugiFakta.lolos, JSON.stringify(vCap.t2.rugiFakta));
  const soalBenar = (n, blokir) => rugiFakta([Array.from({ length: n }, () => ({ soal: faktaT2[0], hasil: 'BENAR' }))], [Array.from({ length: n }, (_, j) => ({ diblokir: j < blokir }))], { ...AMBANG, rugiFaktaPp: 100 });
  cek('T1: batas per soal TETAP mengikat (capMengikat bawaan) di soal dengan BENAR ≥ 8: 3/8 diblokir (> maks(1, ⌊0,25·8⌋ = 2)) → gagal; 2/8 → lolos',
    soalBenar(8, 3).lolos === false && soalBenar(8, 3).capGagal.includes('TF0') && soalBenar(8, 2).lolos === true);
  cek('T1: soal sulit (BENAR < 8, putaran 4 SF5/ALT-B) → paling banyak ⌈BENAR/2⌉: 4/7 lolos, 5/7 gagal; 1/2 lolos, 2/2 gagal (penekanan mayoritas tertangkap)',
    soalBenar(7, 4).lolos === true && soalBenar(7, 5).lolos === false && soalBenar(7, 5).capGagal.includes('TF0') && soalBenar(2, 1).lolos === true && soalBenar(2, 2).lolos === false);
  // lantai T2 mengikat: laju latih 12 % dan S tidak menurunkan karangan T2 → (8) gagal
  const m5in = masukanUji(sintetis({ ngarangP: enam, ngarangG: tiga }), (r) => r.hasil === 'NGARANG');
  m5in.T2 = { P: T.map((s) => ({ soal: s, sampel: 1, hasil: 'NGARANG', teks: 'Pasti.' })), skor: new Map(T.map((s) => [`${s.id}#1`, 0.1])), lajuLatih: 12 };
  const m5 = hitungVonis(m5in);
  cek('lantai T2 mengikat (laju latih ≥ 10 %) dan S tak menurunkan karangan T2 → (8) gagal', m5.t2.mengikat && !m5.syarat['(8)lantaiT2']);
  m5in.T2.lajuLatih = 5;
  cek('lantai T2 tidak mengikat (laju latih < 10 %) → (8) jadi laporan', hitungVonis(m5in).syarat['(8)lantaiT2'] === true);
  // batas latensi ABSOLUT 500 ms diuji terpisah dari batas rasio (probe lambat 20 dtk → rasio longgar 1.000 ms)
  const m6 = hitungVonis(masukanUji(sintetis({ ngarangP: enam, ngarangG: tiga }), (r) => r.hasil === 'NGARANG', { latensi: { sMs: Array(100).fill(700), probeMs: Array(36).fill(20000) } }));
  cek('p95 700 ms dengan probe 20 dtk → gagal oleh batas ABSOLUT 500 ms', !m6.syarat['(5)latensi']);
  // memblokir jawaban fakta yang SALAH bukan kerugian (penolakan jujur): P salah semua fakta, S blokir semua fakta → rugi 0
  const m7 = hitungVonis(masukanUji(sintetis({ ngarangP: enam, ngarangG: tiga, faktaBenar: false }), (r) => r.hasil === 'NGARANG' || r.soal.jenis === 'fakta'));
  cek('blokir fakta SALAH ≠ kerugian: rugiFakta 0 pp dan (3\') lolos di T1', m7.rugiFakta.pp === 0 && m7.rugiFakta.lolos, JSON.stringify(m7.rugiFakta));
  cek('templat: sha256 = beku pra-daftar', crypto.createHash('sha256').update(TEMPLAT).digest('hex') === TEMPLAT_SHA);
  // ── pemuat (tinjauan putaran 2): label templat PALING BERAT; skor tepat, terikat hash, kepala = beku ──
  cek('label templat: yang PALING BERAT dari ulangan dipakai (NGARANG > … > BENAR)',
    labelTemplatPerSoal([{ id: 'a', label: 'ABSTAIN_TEPAT' }, { id: 'a', label: 'NGARANG' }, { id: 'a', label: 'BENAR' }, { id: 'b', label: 'TOLAK_FAKTA' }, { id: 'b', label: null }]).get('a') === 'NGARANG'
    && labelTemplatPerSoal([{ id: 'b', label: 'TOLAK_FAKTA' }]).get('b') === 'TOLAK_FAKTA');
  const kodeB = { 'eval/gerbang-s1/skor_s1.py': 'k1', 'eval/gerbang-s1/kuantisasi_s1.py': 'k2' }, bekuM = { sha256Folder: 'F', maxLen: 256, kuantisasi: 'int8:ffn' };
  const harap = new Map([['1#A', 'h1'], ['1#B', 'h2']]);
  const kep = { _kepala: true, mode: 'S', sha256Folder: 'F', maxLen: 256, kuantisasi: 'int8:ffn', sha256Kode: kodeB, laya: '0.3.1', torch: '2.8.0' };
  const rows = (...xs) => [kep, ...xs];
  const r1 = { putaran: 1, id: 'A', sha: 'h1', p_blokir: 0.2, ms: 5, pemanasan: true }, r2 = { putaran: 1, id: 'B', sha: 'h2', p_blokir: 0.7, ms: 5 };
  const ps = (b, mode = 'S', versi = { laya: '0.3.1', torch: '2.8.0' }) => periksaSkor(b, { mode, bekuM, kodeBeku: kodeB, harap, kunciBaris: (x) => `${x.putaran}#${x.id}`, versi }).masalah;
  cek('periksaSkor: berkas tepat → tanpa masalah', ps(rows(r1, r2)).length === 0, JSON.stringify(ps(rows(r1, r2))));
  cek('periksaSkor: versi laya/torch saat skor ≠ manifes beku, atau manifes tanpa versi → masalah (putaran 3 #8)',
    ps(rows(r1, r2), 'S', { laya: '0.3.1', torch: '2.9.0' }).some((x) => /versi laya\/torch/.test(x)) && ps(rows(r1, r2), 'S', null).some((x) => /versi laya\/torch/.test(x)));
  cek('periksaSkor: baris ganda, baris asing, sha salah, baris kurang → masalah',
    ps(rows(r1, r2, { ...r2, p_blokir: 0.1 })).some((x) => /ganda/.test(x)) && ps(rows(r1, r2, { putaran: 9, id: 'Z', sha: 'x', p_blokir: 0, ms: 1 })).some((x) => /tak diharapkan/.test(x))
    && ps(rows(r1, { ...r2, sha: 'lain' })).some((x) => /sha jawaban/.test(x)) && ps(rows(r1)).some((x) => /belum mencakup/.test(x)));
  cek('periksaSkor: kepala mode/kode/folder salah, kepala kedua, pemanasan bukan baris pertama → masalah',
    ps(rows(r1, r2), 'Sq').some((x) => /mode kepala/.test(x)) && ps([{ ...kep, sha256Kode: { ...kodeB, 'eval/gerbang-s1/skor_s1.py': 'lain' } }, r1, r2]).some((x) => /skor_s1\.py/.test(x))
    && ps([{ ...kep, sha256Folder: 'G' }, r1, r2]).some((x) => /sidik folder/.test(x)) && ps(rows(r1, kep, r2)).some((x) => /kepala bukan tepat satu/.test(x))
    && ps(rows({ ...r1, pemanasan: false }, { ...r2, pemanasan: true })).some((x) => /pemanasan/.test(x)));
  // T2 efektif (putaran 3 #6): GALAT lalu jawaban = satu kunci sah; dua jawaban = ganda; hilang/asing; GALAT per kunci.
  const j2 = (id, sampel, hasil) => ({ id, sampel, hasil, teks: `${id}${sampel}${hasil}` });
  const e1 = efektifT2([j2('A', 1, 'GALAT'), j2('A', 1, 'BENAR'), j2('A', 2, 'NGARANG'), j2('B', 1, 'GALAT'), j2('B', 2, 'BENAR')], ['A', 'B']);
  cek('T2 efektif: GALAT lalu jawaban → jawaban dipakai (bukan ganda); kunci GALAT saja → GALAT 1/4 = 25 %; diulang dihitung',
    e1.ganda.length === 0 && e1.hilang.length === 0 && e1.efektif.find((r) => r.id === 'A' && r.sampel === 1).hasil === 'BENAR'
    && e1.efektif.length === 4 && e1.galatPct === 25 && e1.diulang === 1, JSON.stringify(e1));
  const e2 = efektifT2([j2('A', 1, 'BENAR'), j2('A', 1, 'NGARANG'), j2('A', 2, 'BENAR'), j2('Z', 1, 'BENAR')], ['A', 'B']);
  cek('T2 efektif: dua jawaban bukan-GALAT satu kunci → ganda; kunci B hilang (dihitung GALAT); kunci asing Z',
    e2.ganda.join() === 'A#1' && e2.hilang.join() === 'B#1,B#2' && e2.asing.join() === 'Z#1' && e2.galatPct === 50, JSON.stringify({ g: e2.ganda, h: e2.hilang, a: e2.asing, p: e2.galatPct }));
  cek('stempelKeIso: stempel pelari → ISO yang bisa dibandingkan', stempelKeIso('2026-10-01T02-03-04') === '2026-10-01T02:03:04Z' && Date.parse(stempelKeIso('2026-10-01T02-03-04')) > Date.parse('2026-10-01T00:00Z'));
  // Kabel pemuat → riwayat git (putaran 4, SF10), di repo git SEMENTARA sungguhan: sah; label diundi ulang; teks kehilangan baris.
  {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vonis-s1-riwayat-'));
    try {
      const git = RIW.gitDi(d), tulis = (rel, isi) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), isi); };
      const commit = (m) => { git('add', '-A'); git('commit', '-q', '-m', m); return git('rev-parse', 'HEAD').trim(); };
      git('init', '-q'); git('config', 'user.email', 'uji@lokal'); git('config', 'user.name', 'uji'); git('config', 'core.autocrlf', 'false');
      const PD = 'flywheel/PRA-DAFTAR-GERBANG-S1.json', pdTeks = (o) => JSON.stringify(o, null, 2) + '\n';
      const dasar = { episode: 'X', dikunci: '2026-10-01T00:00:00.000Z' };
      tulis(PD, pdTeks({ ...dasar, dikunci: false })); commit('draf');
      tulis(PD, pdTeks({ kunciAwal: { sha256Kode: 'k' }, ...dasar })); commit('kunci');
      tulis(PD, pdTeks({ kunciPascaBeku: { m: 1 }, kunciAwal: { sha256Kode: 'k' }, ...dasar })); const cPb = commit('pasca-beku');
      const L = 'eval/gerbang-s1/hasil-uji/label-uji-ds-S.jsonl';
      tulis(L, '{"id":"a","label":null}\n'); commit('label sebagian');
      tulis(L, '{"id":"a","label":null}\n{"id":"a","label":"BENAR"}\n'); commit('label lengkap');
      const pv = { stempel: 'S', berkas: { [L]: INTI.shaTeksIsi(fs.readFileSync(path.join(d, L), 'utf8')) } };
      const pdSah = pdTeks({ kunciPraVonis: pv, kunciPascaBeku: { m: 1 }, kunciAwal: { sha256Kode: 'k' }, ...dasar });
      tulis(PD, pdSah); commit('pra-vonis');
      const r = riwayatPemuat({ gitR: git, relPd: PD, teksPd: pdSah, stempel: 'S' });
      cek('pemuat → riwayat git: tiga patok sah dan label yang DILANJUTKAN (hanya-tambah) diterima', r.masalah.length === 0 && riwayatBerkasPemuat({ gitR: git, riw: r, pv }).length === 0, JSON.stringify(r.masalah));
      git('checkout', '-q', '-b', 'undi', cPb);
      tulis(L, '{"id":"a","label":null}\n'); commit('label sebagian');
      tulis(L, '{"id":"a","label":"NGARANG"}\n'); commit('label diundi ulang');
      const pvU = { stempel: 'U', berkas: { [L]: INTI.shaTeksIsi(fs.readFileSync(path.join(d, L), 'utf8')) } };
      const pdU = pdTeks({ kunciPraVonis: pvU, kunciPascaBeku: { m: 1 }, kunciAwal: { sha256Kode: 'k' }, ...dasar });
      tulis(PD, pdU); commit('pra-vonis U');
      const rU = riwayatPemuat({ gitR: git, relPd: PD, teksPd: pdU, stempel: 'U' });
      cek('pemuat → riwayat git: label yang DIUNDI ULANG sebelum pra-vonis → masalah (MENOLAK)', rU.masalah.length === 0 && riwayatBerkasPemuat({ gitR: git, riw: rU, pv: pvU }).some((x) => /baris lama berubah/.test(x)));
      cek('pemuat → riwayat git: pra-daftar yang dibaca kehilangan baris / blok diubah → masalah',
        riwayatPemuat({ gitR: git, relPd: PD, teksPd: pdSah.replace('"episode": "X"', '"episode": "Y"'), stempel: 'S' }).masalah.some((x) => /baris hilang/.test(x))
        && riwayatPemuat({ gitR: git, relPd: PD, teksPd: pdSah.replace('"m": 1', '"m": 2'), stempel: 'S' }).masalah.some((x) => /kunciPascaBeku berubah/.test(x)));
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  }
  // CI terklaster (F-290): ≤ 31 klaster identik dengan seleksi; 78 klaster (T2) memakai t 1,99125, bukan 1,96.
  const lajuDari = (nKel, geser) => new Map(Array.from({ length: nKel * 2 }, (_, i) => [`q${i}`, { keluarga: `k${i % nKel}`, ngarang: (i * 7 + geser) % 5, n: 5 }]));
  const [k20a, k20b, k78a, k78b] = [lajuDari(20, 1), lajuDari(20, 3), lajuDari(78, 1), lajuDari(78, 3)];
  const c20 = ciPerSoal(k20a, k20b), c20s = ciPerSoalSeleksi(k20a, k20b), c78 = ciPerSoal(k78a, k78b), c78s = ciPerSoalSeleksi(k78a, k78b);
  cek('CI klaster S1: 20 keluarga identik dengan seleksi; 78 keluarga t 1,99125 (seleksi 1,96) → CI lebih lebar',
    JSON.stringify(c20) === JSON.stringify(c20s) && c78.klaster === 78 && Math.abs(c78.t - 1.99125) < 1e-4 && c78s.t === 1.96 && c78.atas >= c78s.atas && c78.bawah <= c78s.bawah
    && Math.abs(t95(30) - 2.042) < 1e-9 && Math.abs(t95(31) - 2.0395) < 1e-3, JSON.stringify({ c20, c20s, t78: c78.t }));
  cek('ciPasang: df 15 memakai t 2,131 (bukan 2,262)', Math.abs(ciPasang([...Array(16)].map((_, i) => i % 2)).atas - (0.5 + 2.131 * Math.sqrt(16 / 15 * 0.25) / 4)) < 1e-9);
  console.log(gagal ? `${gagal} uji gagal` : 'vonis-s1: semua uji lulus'); return gagal ? 1 : 0;
}

// ─────────────────────────────── pemuat berkas satu stempel (menolak bila prasyarat kurang) ───────────────────────────────
export const T2_SHA = '2b69cb9404a6e216313b27bc3448b2e9eee84294cd0b9a1b4a5f6b0581ca0786';
const bacaJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
/** Stempel pelari ('2026-09-28T01-02-03') → ISO ('2026-09-28T01:02:03Z') supaya bisa dibandingkan dengan waktu kunci. */
export const { stempelKeIso } = INTI;
const waktu = (iso) => Date.parse(iso);
/**
 * Laju NGARANG base di jawaban LATIH — penentu apakah (8) mengikat. SATU definisi, dipakai untuk MEMATOK saat kunci
 * (--laju-latih) dan untuk memeriksa saat vonis: MENGARANG_pct instrumen-jujur2 atas SEMUA jawaban latih bukan-GALAT
 * (kedua sampel, nilai2), tanpa membuang soal audit kebocoran — soal yang bocor ke T2 tetap jawaban base sedistribusi.
 */
export function hitungLajuLatih(fSoal, fJawab) {
  const soalL = new Map(bacaJsonl(fSoal).map((s) => [s.id, s]));
  return metrik(bacaJsonl(fJawab).filter((r) => r.hasil !== 'GALAT').map((r) => ({ soal: soalL.get(r.id), hasil: r.hasil }))).MENGARANG_pct;
}
/**
 * Baris T2 efektif (tinjauan putaran 3, #6). jawab.mjs MENGULANG kunci GALAT saat dilanjutkan (sisa() hanya melewati kunci
 * bukan-GALAT), jadi satu kunci (id, sampel) boleh punya baris GALAT lalu SATU jawaban. Baris efektif per kunci = jawaban
 * bukan-GALAT; tanpa itu = kunci GALAT (dihitung sekali; kunci hilang juga dihitung GALAT). > 1 jawaban bukan-GALAT per kunci
 * = dijawab dua kali; kunci hilang/asing = tidak lengkap. baris = jawaban T2 tanpa id buang; ids = soal T2 sah; 2 sampel.
 */
export function efektifT2(baris, ids, nSampel = 2) {
  const harap = ids.flatMap((id) => Array.from({ length: nSampel }, (_, s) => `${id}#${s + 1}`)), harapSet = new Set(harap);
  const per = new Map();
  for (const r of baris) { const k = `${r.id}#${r.sampel}`; if (!per.has(k)) per.set(k, []); per.get(k).push(r); }
  const hilang = harap.filter((k) => !per.has(k)), asing = [...per.keys()].filter((k) => !harapSet.has(k));
  const ganda = [...per].filter(([, rs]) => rs.filter((r) => r.hasil !== 'GALAT').length > 1).map(([k]) => k);
  const efektif = harap.filter((k) => per.has(k)).map((k) => { const rs = per.get(k); return rs.find((r) => r.hasil !== 'GALAT') ?? rs[0]; });
  const galatPct = harap.length ? (100 * (hilang.length + efektif.filter((r) => r.hasil === 'GALAT').length)) / harap.length : 100;
  const diulang = [...per.values()].filter((rs) => rs.length > 1 && rs.some((r) => r.hasil !== 'GALAT')).length;
  return { efektif, hilang, asing, ganda, galatPct, diulang };
}
/** Label templat T1 yang DIPATOK sebelum kunci (tinjauan putaran 2, S1): label PALING BERAT dari 3 ulangan per soal. */
const BERAT = ['BENAR', 'ABSTAIN_TEPAT', 'TOLAK_FAKTA', 'SALAH', 'NGARANG'];
export function labelTemplatPerSoal(baris) {
  const per = new Map();
  for (const l of baris) if (l.label) { const a = per.get(l.id); if (!a || BERAT.indexOf(l.label) > BERAT.indexOf(a)) per.set(l.id, l.label); }
  return per;
}
export function berkasWajib(stempel, o) {
  const d = o.dir;
  return {
    pralintas: path.join(d, `s1-pralintas-probe-${stempel}.json`), selesai: path.join(d, `s1-selesai-${stempel}.json`),
    skorS: path.join(d, `skor-T1-S-${stempel}.jsonl`), skorSq: path.join(d, `skor-T1-Sq-${stempel}.jsonl`), labelDs: path.join(d, `label-uji-ds-${stempel}.jsonl`),
    labelSoal: path.join(d, `label-uji-soal-${stempel}.jsonl`),
    auditKunci: path.join(d, `audit-uji-kunci-${stempel}.json`), auditHasil: path.join(d, `audit-uji-hasil-${stempel}.json`),
    beku: o.beku, t2Soal: o.t2Soal, t2Jawab: o.t2Jawab, t2Skor: o.t2Skor, t2SkorSq: o.t2SkorSq, latihSoal: o.latihSoal, latihJawab: o.latihJawab,
    praDaftar: o.praDaftar, auditBocor: o.auditBocor, validasiKunci: o.validasiKunci, validasiHasil: o.validasiHasil, labelTemplat: o.labelTemplat,
  };
}
/**
 * Berkas skor encoder: TEPAT satu kepala di baris pertama (mode, sidik folder SEBELUM muat, max_len, kuantisasi, sidik kode
 * skor_s1/kuantisasi_s1 = manifes beku), lalu TEPAT satu baris per kunci yang diharapkan, dengan sha jawaban yang cocok,
 * dan TEPAT satu baris pemanasan (yang pertama). Pelanggaran = MENOLAK (bisa dipulihkan: skor ulang dengan model & kode beku).
 */
export function periksaSkor(baris, { mode, bekuM, kodeBeku, harap, kunciBaris, versi }) {
  const masalah = [];
  const kepala = baris[0];
  if (!kepala?._kepala || baris.slice(1).some((x) => x._kepala)) masalah.push('kepala bukan tepat satu di baris pertama');
  if (kepala?._kepala) {
    if (kepala.mode !== mode) masalah.push(`mode kepala ${kepala.mode} ≠ ${mode}`);
    // Putaran 3 (#8): pustaka saat skor = pustaka saat latih (manifes beku.versi) — beda versi laya/torch bisa menggeser p_blokir.
    if (!versi || kepala.laya !== versi.laya || kepala.torch !== versi.torch) masalah.push(`versi laya/torch saat skor (${kepala.laya}/${kepala.torch}) ≠ manifes beku (${versi?.laya}/${versi?.torch})`);
    if (kepala.sha256Folder !== bekuM.sha256Folder) masalah.push('sidik folder model ≠ manifes beku');
    if (kepala.maxLen !== bekuM.maxLen) masalah.push(`max_len ${kepala.maxLen} ≠ ${bekuM.maxLen}`);
    if (String(kepala.kuantisasi).split(':')[0] !== String(bekuM.kuantisasi).split(':')[0]) masalah.push('kuantisasi ≠ manifes beku');
    for (const f of ['eval/gerbang-s1/skor_s1.py', 'eval/gerbang-s1/kuantisasi_s1.py']) if (kepala.sha256Kode?.[f] !== kodeBeku[f]) masalah.push(`kode ${f} saat skor ≠ kode beku`);
  }
  const data = baris.filter((x) => !x._kepala), dilihat = new Set();
  for (const x of data) {
    const k = kunciBaris(x);
    if (dilihat.has(k)) { masalah.push(`baris ganda ${k}`); continue; }
    dilihat.add(k);
    if (!harap.has(k)) { masalah.push(`baris tak diharapkan ${k}`); continue; }
    if (x.sha !== harap.get(k)) masalah.push(`sha jawaban ${k} tidak cocok`);
    if (typeof x.p_blokir !== 'number' || !Number.isFinite(x.p_blokir)) masalah.push(`p_blokir ${k} bukan angka`);
  }
  const kurang = [...harap.keys()].filter((k) => !dilihat.has(k));
  if (kurang.length) masalah.push(`skor belum mencakup ${kurang.length} baris (mis. ${kurang.slice(0, 3).join(', ')})`);
  if (data.filter((x) => x.pemanasan).length !== 1 || !data[0]?.pemanasan) masalah.push('pemanasan bukan tepat satu baris pertama');
  return { masalah: masalah.slice(0, 8), kepala, data };
}
/**
 * Pemuat satu stempel. Tinjauan adversarial 28 Sep (putaran 1 #2/#4/#6 dan putaran 2 B1–B3, S2–S9):
 *   MENOLAK (tidak menghitung; bisa dipulihkan) — prasyarat kurang, kode mesin ini ≠ kode beku (jalankan dari worktree commit
 *     kunci), berkas terpatok berubah, skor/label bolong/ganda/tak terikat, kunci audit ≠ tarikan ulang, stempel bukan run
 *     utama PERTAMA sesudah patok, asap tidak ada.
 *   TIDAK_SAH (dihitung, dicatat) — run melanggar protokolnya sendiri: aturan berhenti, inventaris/berkas putaran, putaran
 *     identik, digest/probe, kode yang berjalan di Bmax ≠ kode beku, asap tidak sah, T2 tidak lengkap/GALAT > 10 %, validasi
 *     buta gagal, laju latih berubah, audit gagal.
 */
/**
 * Pemeriksaan riwayat git pemuat (tinjauan putaran 4, B1/SF1/SF10) sebagai fungsi tersendiri supaya diuji `--uji` di repo git
 * sementara, bukan hanya oleh gladi privat: tiga commit patok + urutan leluhur + teks hanya bertambah (riwayatPemuat), dan
 * riwayat hanya-tambah tiap berkas yang dipatok kunciPraVonis (riwayatBerkasPemuat).
 */
export function riwayatPemuat({ gitR, relPd, teksPd, stempel }) {
  return RIW.commitPatok(gitR, { relPd, teksKini: teksPd, stempel });
}
export function riwayatBerkasPemuat({ gitR, riw, pv }) {
  if (!riw.cPv || !riw.cPb) return [];
  return Object.entries(pv?.berkas || {}).flatMap(([rel, sha]) => RIW.periksaBerkasHasil(gitR, { cPv: riw.cPv, cPb: riw.cPb, rel, shaIsi: INTI.shaTeksIsi, shaPatok: sha }));
}
export async function muatStempel(stempel, o) {
  const B = berkasWajib(stempel, o);
  const hilang = Object.entries(B).filter(([, f]) => !f || !fs.existsSync(f)).map(([k, f]) => `${k}: ${f}`);
  if (hilang.length) return { tolak: `prasyarat belum ada (aturanBerhenti):\n  ${hilang.join('\n  ')}` };
  const { hitung: hitungAudit, aturanAudit, tarikAudit } = await import(pathToFileURL(path.join(DI_SINI, 'audit-uji.mjs')).href);
  const { hitung: hitungValidasi, arbitrase } = await import(pathToFileURL(path.join(DI_SINI, 'validasi.mjs')).href);
  const { fiturPanjang, fiturAngka, auroc } = await import(pathToFileURL(path.join(DI_SINI, 'beku.mjs')).href);
  const tolak = [], gagal = [];
  const { shaTeks, shaJawaban, inventaris, pilihPasanganSah, penutupanKode, periksaAsap, bedaKode } = INTI;
  const { SHA_PROMPT } = await import(pathToFileURL(path.join(DI_SINI, 'label-deepseek.mjs')).href);
  const { aturanJebakanDari } = await import(pathToFileURL(path.join(DI_SINI, 'bangun-data.mjs')).href);

  // ── A. patok dari pra-daftar (dikunci, lalu kunciPascaBeku ditulis sesudah beku dan SEBELUM skor uji) ──
  const pd = JSON.parse(fs.readFileSync(B.praDaftar, 'utf8'));
  if (!INTI.isoUtc(pd.dikunci)) tolak.push('pra-daftar belum dikunci (medan dikunci harus waktu ISO UTC berakhiran Z — patok-s1.mjs --kunci)');
  // kunciPascaBeku ditulis SEKALI (patok-s1.mjs --pasca-beku menolak menulis dua kali); teks mentah tidak boleh memuatnya dua kali.
  if ((fs.readFileSync(B.praDaftar, 'utf8').match(/"kunciPascaBeku"/g) || []).length !== 1) tolak.push('kunciPascaBeku harus muncul TEPAT sekali di pra-daftar');
  const pin = pd.kunciPascaBeku || {};
  for (const m of ['sha256Manifes', 'sha256JawabanLatih', 'sha256JawabanT2', 'sha256ValidasiKunci', 'sha256ValidasiHasil']) if (!pin[m]) tolak.push(`kunciPascaBeku.${m} belum ada`);
  if (typeof pin.lajuLatihBeku !== 'number') tolak.push('kunciPascaBeku.lajuLatihBeku belum ada');
  if (!INTI.isoUtc(pin.ditulis)) tolak.push('kunciPascaBeku.ditulis harus waktu ISO UTC berakhiran Z');
  else if (INTI.isoUtc(pd.dikunci) && !(waktu(pin.ditulis) > waktu(pd.dikunci))) tolak.push(`kunciPascaBeku.ditulis ${pin.ditulis} tidak sesudah dikunci ${pd.dikunci}`);
  for (const [f, m] of [[B.beku, 'sha256Manifes'], [B.latihJawab, 'sha256JawabanLatih'], [B.t2Jawab, 'sha256JawabanT2'], [B.validasiKunci, 'sha256ValidasiKunci'], [B.validasiHasil, 'sha256ValidasiHasil']]) {
    if (pin[m] && shaTeks(f) !== pin[m]) tolak.push(`${path.basename(f)} ≠ ${m} yang dipatok — pulihkan berkas dari commit kunci`);
  }
  const beku = JSON.parse(fs.readFileSync(B.beku, 'utf8'));
  if (beku.templatS_sha256 !== TEMPLAT_SHA) gagal.push('sha templat di manifes beku ≠ templat alat');
  // ── A2. Tinjauan putaran 4 (B1, SF1): riwayat git tiga patok DIPERIKSA ULANG di sini (kode beku), bukan hanya di patok-s1
  //    yang berjalan dari pohon kerja belum beku. Urutan leluhur kunciAwal → kunciPascaBeku → kunciPraVonis, blok tidak berubah,
  //    teks pra-daftar hanya bertambah; kode yang dibekukan = kode saat KUNCI; beku lahir di antara kunci dan pasca-beku. ──
  const gitR = RIW.gitDi(AKAR), RELPD = 'flywheel/PRA-DAFTAR-GERBANG-S1.json';
  const riw = riwayatPemuat({ gitR, relPd: RELPD, teksPd: fs.readFileSync(B.praDaftar, 'utf8'), stempel });
  for (const x of riw.masalah) tolak.push(x);
  if (!pd.kunciAwal) tolak.push('blok kunciAwal tidak ada — pra-daftar dikunci tanpa patok-s1 --kunci');
  else if (INTI.sidikKode(beku.sha256Kode) !== pd.kunciAwal.sha256Kode) gagal.push('kode yang dibekukan ≠ kode saat pra-daftar DIKUNCI (kunciAwal.sha256Kode) — aturan berubah sesudah kunci');
  if (riw.cK && riw.cPb && (beku.commitKunciAwal !== riw.cK || !RIW.leluhur(gitR, riw.cK, beku.commitBeku) || !RIW.leluhur(gitR, beku.commitBeku, riw.cPb))) gagal.push('commitBeku tidak berada di antara commit kunci dan commit pasca-beku');
  // Putaran 4 (SF3 + minor): kunci validasi = pra-komitmen; berkas data yang diberikan lewat opsi = yang dibekukan (penutupan).
  const pkV = INTI.periksaKunciValidasi(B.validasiKunci);
  if (!pkV.ok) tolak.push(`kunci validasi ≠ pra-komitmen (sha ${String(pkV.dapat).slice(0, 12)} ≠ ${String(pkV.harap).slice(0, 12)})`);
  for (const [f, nama] of [[B.auditBocor, 'audit-bocor-v1.json'], [B.t2Soal, 'soal-uji2-v1.jsonl'], [B.latihSoal, 'soal-latih-v1.jsonl'], [B.labelTemplat, 'label-templat-T1-v1.jsonl']]) {
    const h = beku.sha256Kode?.[`eval/gerbang-s1/${nama}`];
    if (!h || shaTeks(f) !== h) tolak.push(`${path.basename(f)} ≠ ${nama} yang dibekukan (penutupan kode)`);
  }
  // Putaran 3: ambang dipilih di dev oleh aturan pra-daftar → encoder dibekukan SESUDAH pra-daftar dikunci (patok-s1 menolak lebih dulu).
  if (INTI.isoUtc(pd.dikunci) && !(waktu(beku.dibekukan) > waktu(pd.dikunci))) gagal.push(`encoder dibekukan (${beku.dibekukan}) sebelum pra-daftar dikunci (${pd.dikunci})`);
  // ── B. kode mesin ini = kode beku (B1): kalau tidak, MENOLAK — vonis dihitung dari worktree pada commit kunci ──
  const bedaSini = bedaKode(penutupanKode(), beku.sha256Kode);
  if (!beku.sha256Kode || !Object.keys(beku.sha256Kode).length) tolak.push('manifes beku tanpa sha256Kode');
  else if (bedaSini.length) tolak.push(`kode di mesin ini ≠ kode beku (${bedaSini.length} berkas, mis. ${bedaSini.slice(0, 3).join(', ')}) — jalankan dari: git worktree add <folder> <commit kunci>`);
  // ── C. stempel = run utama PERTAMA yang selesai sesudah patok (S6: tidak ada pilih-pilih run) ──
  const semua = fs.readdirSync(o.dir);
  const utama = semua.map((f) => f.match(/^s1-pralintas-probe-(.+)\.json$/)).filter((m) => m && !m[1].endsWith('-asap')).map((m) => m[1]);
  const sesudahPatok = (s) => waktu(stempelKeIso(s)) > waktu(pin.ditulis);
  if (!sesudahPatok(stempel)) tolak.push(`run ${stempel} dimulai sebelum kunciPascaBeku.ditulis ${pin.ditulis}`);
  const selesaiLebihAwal = utama.filter((s) => s !== stempel && sesudahPatok(s) && waktu(stempelKeIso(s)) < waktu(stempelKeIso(stempel)) && semua.includes(`s1-selesai-${s}.json`));
  if (selesaiLebihAwal.length) tolak.push(`stempel bukan run utama PERTAMA yang selesai sesudah patok (lebih awal: ${selesaiLebihAwal.join(', ')})`);
  const runTerputus = utama.filter((s) => s !== stempel && !semua.includes(`s1-selesai-${s}.json`));
  // ── C2. kunciPraVonis (putaran 3 #3): masukan pasca-run dipatok & di-commit SEBELUM vonis; isi folder = yang dipatok ──
  const pv = pd.kunciPraVonis;
  if ((fs.readFileSync(B.praDaftar, 'utf8').match(/"kunciPraVonis"/g) || []).length !== 1 || !pv) tolak.push('kunciPraVonis belum ada (patok-s1.mjs --pra-vonis --stempel <s>, lalu commit) — masukan pasca-run dipatok SEBELUM vonis');
  else {
    if (pv.stempel !== stempel) tolak.push(`kunciPraVonis untuk stempel ${pv.stempel}, bukan ${stempel}`);
    if (!INTI.isoUtc(pv.ditulis) || !(waktu(pv.ditulis) > waktu(pin.ditulis))) tolak.push('kunciPraVonis.ditulis harus waktu ISO UTC (Z) dan sesudah kunciPascaBeku.ditulis');
    const dipatok = new Map(Object.entries(pv.berkas || {}).map(([k, v]) => [path.basename(k), v]));
    const periksaPv = [...semua.filter((x) => /^s1-.*\.json$/.test(x)).map((x) => path.join(o.dir, x)), B.skorS, B.skorSq, B.labelDs, B.labelSoal, B.auditKunci, B.auditHasil, B.t2Skor, B.t2SkorSq];
    const bedaPv = periksaPv.filter((f) => dipatok.get(path.basename(f)) !== shaTeks(f)).map((f) => path.basename(f));
    const hilangPv = [...dipatok.keys()].filter((k) => /^s1-/.test(k) && !semua.includes(k));
    if (bedaPv.length) tolak.push(`${bedaPv.length} berkas ≠ sha di kunciPraVonis atau tidak dipatok (mis. ${bedaPv.slice(0, 3).join(', ')}) — pulihkan dari commit pra-vonis`);
    if (hilangPv.length) tolak.push(`${hilangPv.length} berkas run yang dipatok hilang dari folder (mis. ${hilangPv[0]})`);
    // Putaran 4 (SF1): riwayat tiap berkas terpatok HANYA-TAMBAH dan lahir sesudah commit pasca-beku (undian ulang tertangkap).
    for (const x of riwayatBerkasPemuat({ gitR, riw, pv })) tolak.push(x);
  }
  // ── D. asap (S4; putaran 3 #4): SATU pemeriksa dengan pelari (inti periksaAsap). Asap sesudah patok & sebelum run WAJIB ada
  //    (kalau tidak: MENOLAK — salin berkasnya); asap terakhir itu sah, atau TIDAK_SAH. ──
  const asap = periksaAsap(o.dir, { sesudahIso: pin.ditulis, sebelumIso: stempelKeIso(stempel), kodeBeku: beku.sha256Kode });
  if (!asap.stempel) tolak.push('uji asap P/G (pg-berpasangan --asap) sesudah patok dan sebelum run tidak ditemukan — salin berkas asap');
  else for (const x of asap.masalah) gagal.push(x);
  // Putaran 4 (SF9, minor): berkas yang ditulis pelari terikat ke s1-selesai (shaPutaran) dan run berjalan dari arsip yang SUDAH
  // dipatok (shaPraDaftar = pra-daftar di commit pasca-beku) — bukti urutan yang tidak bergantung jam laptop.
  const shaPdPatok = riw.cPb ? INTI.shaTeksIsi(RIW.isiDi(gitR, riw.cPb, RELPD)) : null;
  const periksaSelesai = (xs, pola, label) => {
    const bp = semua.filter((f) => pola.test(f)).sort(), sp = xs.shaPutaran || {};
    if (JSON.stringify(Object.keys(sp).sort()) !== JSON.stringify(bp) || bp.some((f) => sp[f] !== shaTeks(path.join(o.dir, f)))) gagal.push(`${label}: berkas putaran ≠ sha yang dicatat pelari (shaPutaran)`);
    if (shaPdPatok && xs.shaPraDaftar !== shaPdPatok) gagal.push(`${label}: tidak berjalan dari arsip commit pasca-beku (shaPraDaftar ≠ pra-daftar di commit kunci)`);
  };
  if (asap.stempel) periksaSelesai(JSON.parse(fs.readFileSync(path.join(o.dir, `s1-selesai-${asap.stempel}-asap.json`), 'utf8')), new RegExp(`^s1-[PG]-p\\d{2}-${asap.stempel}-asap\\.json$`), `asap ${asap.stempel}`);
  // ── E. run P/G: aturan berhenti v1.3, berkas putaran, inventaris dari BARIS, putaran identik, kode yang berjalan (B2, S5, S7) ──
  const put = INTI.bacaPutaran(stempel, o.dir);
  const soalT1 = new Map(PUBLIK.map((s) => [s.id, s]));
  // Putaran 4 (B1, SF9): soal tiap baris = PUBLIK (id, q, jenis) — selanjutnya objek PUBLIK yang dipakai — dan hasil =
  // nilai2(soal, teks) dengan instrumen BEKU. Beda = berkas putaran diubah sesudah ditulis pelari.
  let soalAsing = 0, hasilBeda = 0;
  for (const peta of [put.P, put.G]) for (const [, x] of peta) for (const b of x.baris || []) {
    const s = soalT1.get(b.soal?.id);
    if (!s || s.q !== b.soal.q || s.jenis !== b.soal.jenis) { soalAsing++; continue; }
    b.soal = s;
    if (b.hasil !== 'GALAT' && nilai2(s, b.teks).hasil !== b.hasil) hasilBeda++;
  }
  if (soalAsing) gagal.push(`${soalAsing} baris P/G dengan soal ≠ PUBLIK (id/q/jenis)`);
  if (hasilBeda) gagal.push(`${hasilBeda} baris P/G: hasil ≠ nilai2(soal, teks) instrumen beku — berkas putaran diubah?`);
  const pil = pilihPasanganSah(put);
  for (const x of pil.masalah) gagal.push(`aturan berhenti: ${x}`);
  if (!pil.lengkap) gagal.push(`pasangan sah ${pil.terpilih.length} < 16 (maks 20 pasangan)`);
  for (const [lengan, peta] of [['P', put.P], ['G', put.G]]) {
    const tanda = new Map();
    for (const [p, x] of peta) {
      if (x.lengan !== lengan || x.putaran !== p || x.stempel !== stempel) gagal.push(`berkas ${lengan} p${p}: medan (lengan/putaran/stempel) ≠ nama berkas`);
      if (inventaris((x.baris || []).map((b) => b.soal)) !== INVENTARIS_T1) gagal.push(`berkas ${lengan} p${p}: baris bukan tepat 36 soal PUBLIK berurutan`);
      if (x.digestModel !== DIGEST_PIN) gagal.push(`digest ${lengan} p${p} ≠ pin`);
      if (!x.aliran || x.batasDetik !== 1260) gagal.push(`badan ${lengan} p${p} ≠ SB1-Q3`);
      // Tinjauan putaran 3 (B1): hanya pasangan TERPILIH, dan hanya teks bukan-GALAT — dua putaran galat-total bukan "salinan".
      if (!pil.terpilih.includes(p)) continue;
      const t = (x.baris || []).filter((b) => b.hasil !== 'GALAT').map((b) => b.teks).join('\u0001');
      if (tanda.has(t)) gagal.push(`putaran ${lengan} p${p} IDENTIK dengan p${tanda.get(t)} — disalin?`); else tanda.set(t, p);
    }
  }
  const selesai = JSON.parse(fs.readFileSync(B.selesai, 'utf8'));
  if (selesai.digestAkhir !== DIGEST_PIN) gagal.push('digest model di akhir run ≠ pin');
  if (selesai.probeAkhir !== selesai.probeAwal) gagal.push('digest probe berubah selama run');
  if (JSON.stringify(selesai.pasanganSah) !== JSON.stringify(pil.terpilih)) gagal.push('pasangan sah menurut pelari ≠ menurut pemuat');
  if (bedaKode(selesai.kode, beku.sha256Kode).length) gagal.push('kode yang berjalan di mesin run ≠ kode beku (S7)');
  // Putaran 3 (#7): berkas pra-lintasan yang dibaca pemuat = yang ditulis pelari (probe G tidak bisa disunting sesudah run).
  if (selesai.shaPralintas !== shaTeks(B.pralintas)) gagal.push('berkas pra-lintasan probe ≠ sha yang dicatat pelari (shaPralintas)');
  periksaSelesai(selesai, new RegExp(`^s1-[PG]-p\\d{2}-${stempel}\\.json$`), 'run');
  const pralintas = JSON.parse(fs.readFileSync(B.pralintas, 'utf8'));
  const probeGagal = (pralintas.lintas || []).filter((x) => !x.ok).length;
  if (probeGagal) gagal.push(`probe G gagal pada ${probeGagal} soal (fail-open melemahkan G — tinjauan #8)`);
  const Pf = pil.terpilih.map((p) => put.P.get(p)), Gf = pil.terpilih.map((p) => put.G.get(p));
  // ── F. skor S / S_q T1: tepat, terikat hash, kepala = beku (B3, S3) ──
  const harapT1 = new Map(pil.terpilih.flatMap((p) => put.P.get(p).baris.filter((b) => b.hasil !== 'GALAT').map((b) => [`${p}#${b.soal.id}`, shaJawaban(b.soal.q, b.teks)])));
  const kunciT1 = (x) => `${x.putaran}#${x.id}`;
  const sS = periksaSkor(bacaJsonl(B.skorS), { mode: 'S', bekuM: beku.S, kodeBeku: beku.sha256Kode, harap: harapT1, kunciBaris: kunciT1, versi: beku.versi?.S });
  const sSq = periksaSkor(bacaJsonl(B.skorSq), { mode: 'Sq', bekuM: beku.Sq, kodeBeku: beku.sha256Kode, harap: harapT1, kunciBaris: kunciT1, versi: beku.versi?.Sq });
  for (const x of sS.masalah) tolak.push(`skor-T1-S: ${x}`);
  for (const x of sSq.masalah) tolak.push(`skor-T1-Sq: ${x}`);
  // ── G. label DeepSeek uji: tepat satu label per jawaban P/G terpilih, terikat hash; templat = berkas terpatok (S1, S2) ──
  const labelBaris = bacaJsonl(B.labelDs).filter((l) => l.label);
  const petaLabel = new Map(), gandaL = [];
  for (const l of labelBaris) { const k = `${l.sampel}#${l.id}`; if (petaLabel.has(k)) gandaL.push(k); else petaLabel.set(k, l); }
  if (gandaL.length) tolak.push(`label DeepSeek ganda (${gandaL.length}, mis. ${gandaL[0]}) — satu jawaban satu label`);
  // Putaran 3 (#10): tiap label uji membawa sidik prompt+setelan (label-deepseek SHA_PROMPT) — label dari rubrik/setelan lain ditolak.
  const salahPrompt = labelBaris.filter((l) => l._guru?.promptSha !== SHA_PROMPT);
  if (salahPrompt.length) tolak.push(`label DeepSeek uji dengan prompt/setelan ≠ yang dibekukan: ${salahPrompt.length} baris — label ulang dengan label-deepseek.mjs dari commit kunci`);
  const labelDs = new Map(), tanpaLabel = [], labelTakCocok = [];
  pil.terpilih.forEach((p, i) => {
    for (const [lengan, x] of [['P', put.P.get(p)], ['G', put.G.get(p)]]) for (const b of x.baris) {
      if (b.hasil === 'GALAT') continue;
      const l = petaLabel.get(`${lengan}#${p}#${b.soal.id}`);
      if (!l) { tanpaLabel.push(`${lengan}${p}:${b.soal.id}`); continue; }
      if (l.sha !== shaJawaban(b.soal.q, b.teks)) labelTakCocok.push(`${lengan}${p}:${b.soal.id}`);
      labelDs.set(`${lengan}#${i + 1}#${b.soal.id}`, l.label);
    }
  });
  if (labelTakCocok.length) tolak.push(`label DeepSeek tidak terikat ke jawaban (sha): ${labelTakCocok.length} baris (mis. ${labelTakCocok[0]})`);
  const templat = labelTemplatPerSoal(bacaJsonl(B.labelTemplat));
  const tanpaTemplat = PUBLIK.filter((s) => !templat.has(s.id));
  if (tanpaTemplat.length) tolak.push(`label templat terpatok kurang ${tanpaTemplat.length} soal`);
  for (const [id, lab] of templat) labelDs.set(`T#0#${id}`, lab);
  // ── H. validasi buta + arbitrase → ukuran audit; kunci audit = tarikan ulang deterministik (S9) ──
  const validasi = hitungValidasi(JSON.parse(fs.readFileSync(B.validasiKunci, 'utf8')).kunci, JSON.parse(fs.readFileSync(B.validasiHasil, 'utf8')));
  if (validasi.belum) tolak.push(`validasi buta belum lengkap (${validasi.belum} butir)`);
  else if (!validasi.lulus) gagal.push('validasi buta label latih TIDAK lulus');
  const arb = validasi.belum ? null : arbitrase(validasi), aturan = aturanAudit(arb?.kasus);
  // Putaran 3 (#9): data latih encoder dibangun dengan aturan label jebakan dari arbitrase yang SAMA (bangun-data → beku).
  // Validasi sudah terpatok (sha), jadi beda di sini = encoder dilatih di luar protokol → TIDAK_SAH (patok-s1 menolak lebih dulu).
  if (arb && beku.kasusArbitrase !== arb.kasus) gagal.push(`encoder dilatih dengan arbitrase '${beku.kasusArbitrase}', validasi terpatok = '${arb.kasus}'`);
  if (arb && beku.aturanLabelJebakan !== aturanJebakanDari(arb.kasus)) gagal.push(`aturan label jebakan beku '${beku.aturanLabelJebakan}' ≠ arbitrase '${arb.kasus}' (${aturanJebakanDari(arb.kasus)})`);
  const penilaiMengikat = arb?.kasus === 'b' ? ['baku'] : ['baku', 'deepseek', 'gabungan'];
  // Putaran 4 (minor): label DeepSeek yang belum lengkap MENOLAK hanya bila DeepSeek mengikat; di kasus (b) = laporan.
  const catatanPemuat = [];
  if (tanpaLabel.length) (penilaiMengikat.length > 1 ? tolak : catatanPemuat).push(`label DeepSeek belum lengkap: ${tanpaLabel.length} baris (mis. ${tanpaLabel.slice(0, 3).join(', ')})`);
  const kunciAudit = JSON.parse(fs.readFileSync(B.auditKunci, 'utf8'));
  if (arb && kunciAudit.kasusArbitrase !== arb.kasus) tolak.push(`kunci audit dibuat untuk arbitrase '${kunciAudit.kasusArbitrase}', hitungan ulang = '${arb.kasus}' — tarik ulang sampel audit`);
  const skorPerAsli = new Map();
  for (const x of sS.data) { if (!skorPerAsli.has(x.putaran)) skorPerAsli.set(x.putaran, new Map()); skorPerAsli.get(x.putaran).set(x.id, x.p_blokir); }
  if (!sS.masalah.length && pil.lengkap) {
    // Kolam audit = jawaban jebakan AMAN menurut kedua penilai (putaran 3, B2) → tarikan ulang memakai label DeepSeek yang sama.
    const labelAsli = new Map([...petaLabel].map(([k, l]) => [k, l.label]));
    const ulang = tarikAudit(put, skorPerAsli, beku.S.ambang, aturan.kuota, labelAsli, { kolamDsAman: aturan.kolamDsAman }).map((b) => `${b.vid}|${b.lengan}|${b.putaran}|${b.id}`).join(',');
    const dariKunci = (kunciAudit.kunci || []).map((b) => `${b.vid}|${b.lengan}|${b.putaran}|${b.id}`).join(',');
    if (ulang !== dariKunci) tolak.push('kunci audit ≠ tarikan ulang deterministik (ukuran/isi berbeda) — tarik ulang dengan audit-uji --sampel');
  }
  const audit = hitungAudit(kunciAudit.kunci || [], JSON.parse(fs.readFileSync(B.auditHasil, 'utf8')), aturan.alfa);
  if (!audit.lengkap) tolak.push('AUDIT-UJI belum lengkap');
  // ── I. T2: lengkap (125 soal × 2 sampel), tanpa id buang, GALAT ≤ 10 %; skor tepat & terikat (B2, S3) ──
  if (shaTeks(B.t2Soal) !== T2_SHA) gagal.push('soal T2 ≠ sha yang dikomit');
  const buang = new Set((JSON.parse(fs.readFileSync(B.auditBocor, 'utf8')).buang || []).map((b) => (typeof b === 'string' ? b : b.id)));
  const soal2 = new Map(bacaJsonl(B.t2Soal).filter((s) => !buang.has(s.id)).map((s) => [s.id, { ...s, keluarga: String(s.keluarga).toLowerCase().trim() }]));
  const t2Semua = bacaJsonl(B.t2Jawab);
  const soal2Asli = new Map(bacaJsonl(B.t2Soal).map((s) => [s.id, s]));
  const t2Bocor = [...new Set(t2Semua.filter((r) => buang.has(r.id)).map((r) => r.id))];
  if (t2Bocor.length) gagal.push(`jawaban T2 memuat ${t2Bocor.length} soal yang DIBUANG audit kebocoran (mis. ${t2Bocor[0]}) — run melanggar --kecuali`);
  const t2 = efektifT2(t2Semua.filter((x) => !buang.has(x.id)), [...soal2.keys()]);
  if (t2.hilang.length || t2.asing.length) gagal.push(`jawaban T2 bukan tepat ${soal2.size} soal × 2 sampel (${t2.hilang.length} kunci hilang, ${t2.asing.length} kunci asing)`);
  if (t2.ganda.length) gagal.push(`jawaban T2: ${t2.ganda.length} kunci punya > 1 jawaban bukan-GALAT (mis. ${t2.ganda[0]}) — dijawab dua kali`);
  const galatT2 = t2.galatPct, t2Diulang = t2.diulang;
  if (galatT2 > AMBANG.galatMaks) gagal.push(`GALAT T2 ${galatT2.toFixed(1)} % > ${AMBANG.galatMaks} %`);
  const t2P = t2.efektif.filter((r) => r.hasil !== 'GALAT').map((r) => ({ soal: soal2.get(r.id), sampel: r.sampel, hasil: r.hasil, teks: r.teks }));
  // Putaran 4 (B1, SF9): jawaban T2 dari model yang dipatok, dan hasilnya = nilai2 beku atas teksnya.
  const digestT2 = t2.efektif.filter((r) => r.hasil !== 'GALAT' && r.digest !== DIGEST_PIN).length;
  if (digestT2) gagal.push(`${digestT2} jawaban T2 dengan digest model ≠ pin`);
  const t2Beda = t2.efektif.filter((r) => r.hasil !== 'GALAT' && nilai2(soal2Asli.get(r.id), r.teks).hasil !== r.hasil).length;
  if (t2Beda) gagal.push(`${t2Beda} jawaban T2: hasil ≠ nilai2(soal, teks) instrumen beku`);
  const harapT2 = new Map(t2P.map((r) => [`${r.soal.id}#${r.sampel}`, shaJawaban(r.soal.q, r.teks)]));
  const kunciT2 = (x) => `${x.id}#${x.sampel}`;
  const s2 = periksaSkor(bacaJsonl(B.t2Skor), { mode: 'S', bekuM: beku.S, kodeBeku: beku.sha256Kode, harap: harapT2, kunciBaris: kunciT2, versi: beku.versi?.S });
  const s2q = periksaSkor(bacaJsonl(B.t2SkorSq), { mode: 'Sq', bekuM: beku.Sq, kodeBeku: beku.sha256Kode, harap: harapT2, kunciBaris: kunciT2, versi: beku.versi?.Sq });
  for (const x of s2.masalah) tolak.push(`skor-T2-S: ${x}`);
  for (const x of s2q.masalah) tolak.push(`skor-T2-Sq: ${x}`);
  // ── J. laju latih: yang DIPATOK menentukan (8); hitung ulang harus sama persis ──
  const lajuLatihHitungUlang = hitungLajuLatih(B.latihSoal, B.latihJawab);
  const soalLatih = new Map(bacaJsonl(B.latihSoal).map((s) => [s.id, s]));
  const latihBeda = bacaJsonl(B.latihJawab).filter((r) => r.hasil !== 'GALAT' && nilai2(soalLatih.get(r.id), r.teks).hasil !== r.hasil).length;
  if (latihBeda) gagal.push(`${latihBeda} jawaban latih: hasil ≠ nilai2(soal, teks) instrumen beku`);
  const lajuLatih = pin.lajuLatihBeku;
  if (typeof lajuLatih === 'number' && Math.abs(lajuLatihHitungUlang - lajuLatih) > 1e-9) gagal.push(`laju NGARANG latih dihitung ulang ${lajuLatihHitungUlang} ≠ yang dipatok ${lajuLatih}`);
  if (tolak.length) return { tolak: tolak.join('\n  ') };

  // ── masukan inti (pasangan terpilih diberi indeks ulang 1..16) ──
  const petaSkor = new Map(pil.terpilih.map((p, i) => [i + 1, skorPerAsli.get(p) || new Map()]));
  const t2Skor = new Map(s2.data.map((x) => [kunciT2(x), x.p_blokir])), t2SkorSq = new Map(s2q.data.map((x) => [kunciT2(x), x.p_blokir]));
  const masukan = {
    P: Pf.map((x) => x.baris), G: Gf.map((x) => x.baris), skorS: petaSkor, labelDs, beku,
    skorKontrol: { panjang: fiturPanjang, angka: fiturAngka },
    latensi: { sMs: sS.data.filter((x) => !x.pemanasan).map((x) => x.ms), probeMs: (pralintas.lintas || []).map((x) => x.ms) },
    T2: { P: t2P, skor: t2Skor, lajuLatih },
    audit: { S: audit.sKetat, nS: audit.n.S.n, G: audit.gKetat, nG: audit.n.G.n, p: audit.p, lolos: audit.lolos, alfa: audit.alfa, hampa: audit.hampa }, sah: { gagal },
    penilaiMengikat,
  };
  // ── laporan wajib (TIDAK mempengaruhi vonis) ──
  const skorSqPer = new Map();
  for (const x of sSq.data) { if (!skorSqPer.has(x.putaran)) skorSqPer.set(x.putaran, new Map()); skorSqPer.get(x.putaran).set(x.id, x.p_blokir); }
  const S = masukan.P.map((bs, i) => terapkanS(bs, petaSkor.get(i + 1) || new Map(), beku.S.ambang));
  const Sq = masukan.P.map((bs, i) => terapkanS(bs, skorSqPer.get(pil.terpilih[i]) || new Map(), beku.Sq.ambang));
  const laporan = { lajuLatihHitungUlang, validasi: { lulus: validasi.lulus, per: validasi.per, takSepakat: validasi.takSepakat }, arbitraseF286: arb, auditUkuran: aturan,
    pasangan: { terpilih: pil.terpilih, tidakSah: pil.tidakSah }, asap: asap.stempel, t2: { galatPct: galatT2, diulangSesudahGalat: t2Diulang },
    // Run terputus (putaran 3, B1): berhenti = pelari berhenti sendiri karena Ollama tidak sehat (s1-berhenti-*), selain itu mati.
    // Putaran 4: run terputus dilaporkan BESERTA hasil parsialnya (MENGARANG P/G dari nilai2 atas baris sah) — mengulang run
    // yang hasil parsialnya buruk bagi S kelihatan di berkas vonis.
    runLain: { terputus: runTerputus.map((s) => {
      const pp = INTI.bacaPutaran(s, o.dir), ps = [...pp.P.keys()].sort((a, b) => a - b);
      const lajuLengan = (l) => { const bs = ps.map((p) => pp[l].get(p)).filter((x) => x && INTI.putaranSah(x.baris)).flatMap((x) => x.baris.filter((b) => b.hasil !== 'GALAT')); return bs.length ? metrik(bs).MENGARANG_pct : null; };
      return { stempel: s, berhentiSendiri: semua.includes(`s1-berhenti-${s}.json`), nPasangan: ps.length, mengarangP: lajuLengan('P'), mengarangG: lajuLengan('G') };
    }), sebelumPatok: utama.filter((s) => !sesudahPatok(s)) },
    catatanPemuat,
    folderBerubahSaatMuat: [sS, sSq, s2, s2q].map((x) => x.kepala?.sha256FolderSesudahMuat && x.kepala.sha256FolderSesudahMuat !== x.kepala.sha256Folder) };
  const ci = ciPasang(Sq.map((b, i) => mg(b) - mg(S[i])));
  const rfS = rugiFakta(masukan.P, S), rfSq = rugiFakta(masukan.P, Sq);
  laporan.Sq = { ciSqMinusS: ci, rugiFaktaSq: rfSq.pp, rugiFaktaS: rfS.pp, anjuranArsitekturSq: ci.atas <= 2.0 && rfSq.pp <= rfS.pp };
  const yT2 = (r) => r.hasil === 'NGARANG' || r.hasil === 'SALAH';
  const aurocDari = (skorF) => auroc(t2P.map((r) => ({ skor: skorF(r), blokir: yT2(r) })));
  laporan.aurocT2 = { S: aurocDari((r) => t2Skor.get(`${r.soal.id}#${r.sampel}`)), Sq: aurocDari((r) => t2SkorSq.get(`${r.soal.id}#${r.sampel}`)),
    panjang: aurocDari((r) => fiturPanjang(r.teks)), angka: aurocDari((r) => fiturAngka(r.teks)) };
  // ECE S di T1 atas label GABUNGAN (baris P terpilih): y = nilai2 SALAH/NGARANG atau DeepSeek SALAH/NGARANG.
  const ece = (() => {
    const pasang = [];
    pil.terpilih.forEach((p, i) => put.P.get(p).baris.forEach((b) => {
      if (b.hasil === 'GALAT') return;
      const ds = labelDs.get(`P#${i + 1}#${b.soal.id}`), y = b.hasil === 'NGARANG' || b.hasil === 'SALAH' || ds === 'NGARANG' || ds === 'SALAH';
      pasang.push({ p: petaSkor.get(i + 1).get(b.soal.id), y });
    }));
    let e = 0; for (let k = 0; k < 10; k++) { const bin = pasang.filter((x) => x.p >= k / 10 && (k === 9 ? x.p <= 1 : x.p < (k + 1) / 10)); if (!bin.length) continue;
      e += (bin.length / pasang.length) * Math.abs(bin.reduce((a, x) => a + x.p, 0) / bin.length - bin.filter((x) => x.y).length / bin.length); }
    return pasang.length ? e : null;
  })();
  laporan.eceT1_gabungan = ece;
  // Latensi ujung-ke-ujung per giliran (p50/p95): P = generasi; G = probe (pra-lintasan) + generasi berarahan; S = P + keputusan S.
  const msP = Pf.flatMap((x) => x.baris.map((b) => b.ms)).filter((v) => typeof v === 'number');
  const msG = Gf.flatMap((x) => x.baris.map((b) => b.ms)).filter((v) => typeof v === 'number');
  const msS = pil.terpilih.flatMap((p) => put.P.get(p).baris.filter((b) => b.hasil !== 'GALAT' && typeof b.ms === 'number').map((b) => b.ms + (sS.data.find((x) => x.putaran === p && x.id === b.soal.id)?.ms ?? 0)));
  laporan.latensiUjungKeUjung = Object.fromEntries([['P', msP], ['G', msG], ['S', msS]].map(([k, v]) => [k, { p50: persentil(v, 0.5), p95: persentil(v, 0.95), n: v.length }]));
  const ember = (t) => { const n = String(t || '').length; return n <= 600 ? '≤600' : n <= 1500 ? '601–1500' : n <= 3000 ? '1501–3000' : '>3000'; };
  const perEmber = {};
  masukan.P.forEach((bs, i) => bs.forEach((r, j) => {
    if (!HARUS_ABSTAIN.has(r.soal.jenis) || r.hasil === 'GALAT') return;
    const e = (perEmber[ember(r.teks)] ??= { n: 0, ngarangP: 0, ngarangS: 0 }); e.n++;
    if (r.hasil === 'NGARANG') e.ngarangP++; if (S[i][j].hasil === 'NGARANG') e.ngarangS++;
  }));
  laporan.ngarangPerEmberPanjang = perEmber;
  laporan.sidikDeepSeek = { uji: [...new Set(labelBaris.map((l) => l._guru?.sidik ?? null))], templat: [...new Set(bacaJsonl(B.labelTemplat).map((l) => l._guru?.sidik ?? null))] };
  return { masukan, audit, lajuLatih, laporan };
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(uji());
  const opsi = (n, b) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : b; };
  if (arg.includes('--laju-latih')) {
    const fS = opsi('--latih-soal', path.join(DI_SINI, 'soal-latih-v1.jsonl')), fJ = opsi('--latih-jawab', path.join(DI_SINI, 'jawaban-latih-v1.jsonl'));
    const laju = hitungLajuLatih(fS, fJ);
    console.log(JSON.stringify({ lajuLatihBeku: laju, mengikat8: laju >= AMBANG.lajuLatihMengikat, sha256JawabanLatih: INTI.shaTeks(fJ), jawaban: path.basename(fJ) }));
    process.exit(0);
  }
  const stempel = opsi('--stempel');
  if (!stempel) { console.error('pakai: --stempel <stempel-T1> [--dir hasil-uji] [--beku beku-v1.json] | --laju-latih | --uji'); process.exit(2); }
  const o = {
    dir: opsi('--dir', path.join(DI_SINI, 'hasil-uji')), beku: opsi('--beku', path.join(DI_SINI, 'beku-v1.json')),
    t2Soal: opsi('--t2-soal', path.join(DI_SINI, 'soal-uji2-v1.jsonl')), t2Jawab: opsi('--t2-jawab', path.join(DI_SINI, 'jawaban-uji2-v1.jsonl')),
    t2Skor: opsi('--t2-skor', path.join(DI_SINI, 'skor-T2-S.jsonl')), t2SkorSq: opsi('--t2-skor-sq', path.join(DI_SINI, 'skor-T2-Sq.jsonl')),
    latihSoal: opsi('--latih-soal', path.join(DI_SINI, 'soal-latih-v1.jsonl')), latihJawab: opsi('--latih-jawab', path.join(DI_SINI, 'jawaban-latih-v1.jsonl')),
    praDaftar: opsi('--pra-daftar', path.join(DI_SINI, '..', '..', 'flywheel', 'PRA-DAFTAR-GERBANG-S1.json')),
    auditBocor: opsi('--audit-bocor', path.join(DI_SINI, 'audit-bocor-v1.json')),
    validasiKunci: opsi('--validasi-kunci', path.join(DI_SINI, 'validasi-kunci-v1b.json')), validasiHasil: opsi('--validasi-hasil', path.join(DI_SINI, 'validasi-fahmi-v1b.json')),
    labelTemplat: opsi('--label-templat', path.join(DI_SINI, 'label-templat-T1-v1.jsonl')),
  };
  const m = await muatStempel(stempel, o);
  if (m.tolak) { console.error(`MENOLAK MENGHITUNG — ${m.tolak}`); process.exit(2); }
  const v = hitungVonis(m.masukan);
  const keluar = path.join(o.dir, `vonis-s1-${stempel}.json`);
  if (fs.existsSync(keluar)) { console.error(`BERHENTI: ${keluar} sudah ada — vonis dihitung SEKALI`); process.exit(1); }
  // Putaran 3 (#12): berkas vonis mencatat sidik SEMUA masukan dan kode yang menghitungnya — vonis bisa dihitung ulang & dicocokkan.
  const masukanSha = Object.fromEntries(Object.entries(berkasWajib(stempel, o)).map(([k, f]) => [k, INTI.shaTeks(f)]));
  fs.writeFileSync(keluar, JSON.stringify({ stempel, dihitung: new Date().toISOString(), lajuLatih: m.lajuLatih, audit: m.audit, ...v, laporan: m.laporan, masukanSha, kodeSha: INTI.penutupanKode() }, null, 1));
  console.log(`VONIS: ${v.vonis}`);
  if (v.tidakSah.length) console.log(`tidak sah: ${v.tidakSah.join(' · ')}`);
  for (const [k, ok] of Object.entries(v.syarat)) console.log(`  ${ok ? '✓' : '✗'} ${k}`);
  console.log(`laporan S_q: Δ(S_q−S) atas ${m.laporan.Sq.ciSqMinusS.atas.toFixed(2)} pp · anjuran arsitektur S_q: ${m.laporan.Sq.anjuranArsitekturSq}`);
  console.log(`laporan AUROC T2: ${JSON.stringify(m.laporan.aurocT2)} · ECE T1 (gabungan) ${m.laporan.eceT1_gabungan?.toFixed(3)} · karangan per ember panjang: ${JSON.stringify(m.laporan.ngarangPerEmberPanjang)}`);
  console.log(`rata MENGARANG_pct (baku): P ${v.penilaian.baku.rata.P.toFixed(2)} · G ${v.penilaian.baku.rata.G.toFixed(2)} · S ${v.penilaian.baku.rata.S.toFixed(2)} → ${keluar}`);
}
