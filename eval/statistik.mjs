/**
 * statistik.mjs — SATU sumber untuk semua uji statistik gerbang.
 *
 * Kenapa dipisah: `wilson()` tadinya disalin di `ulang-gerbang.mjs` dan
 * `banding-proporsi.mjs`. Dua salinan bisa melenceng tanpa ketahuan — dan kalau
 * melenceng, dua laporan yang seharusnya sepakat akan memberi angka berbeda
 * untuk data yang sama. Satu berkas, satu kebenaran, satu tempat diuji.
 *
 * Diuji oleh: `node banding-proporsi.mjs --uji-instrumen`
 */
'use strict';

/** Selang kepercayaan Wilson — lebih jujur daripada selang normal untuk n kecil. */
export function wilson(k, n, z = 1.96) {
  if (n === 0) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const tengah = p + (z * z) / (2 * n);
  const akar = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (tengah - akar) / d), Math.min(1, (tengah + akar) / d)];
}

// log n! — penjumlahan langsung; n di sini paling banyak ratusan, cukup eksak
const _lf = [0];
function logFakt(n) {
  for (let i = _lf.length; i <= n; i++) _lf[i] = _lf[i - 1] + Math.log(i);
  return _lf[n];
}

/** peluang hipergeometrik untuk satu tabel 2x2 */
function pHiper(a, b, c, d) {
  const n = a + b + c + d;
  return Math.exp(
    logFakt(a + b) + logFakt(c + d) + logFakt(a + c) + logFakt(b + d) - logFakt(n)
    - logFakt(a) - logFakt(b) - logFakt(c) - logFakt(d)
  );
}

/**
 * Fisher exact dua-sisi, konvensi "jumlahkan semua tabel yang peluangnya TIDAK
 * LEBIH BESAR dari tabel teramati" — konvensi baku (yang dipakai R fisher.test)
 * dan yang menghasilkan 0,4857 pada contoh Lady Tasting Tea (Fisher 1935).
 * Tanpa hampiran normal, jadi sah untuk n kecil dan untuk sel nol.
 */
export function fisher(k1, n1, k2, n2) {
  const a = k1, b = n1 - k1, c = k2, d = n2 - k2;
  const barisAtas = a + b, kolomKiri = a + c, n = a + b + c + d;
  const pObs = pHiper(a, b, c, d);
  const min = Math.max(0, kolomKiri - (n - barisAtas));
  const maks = Math.min(barisAtas, kolomKiri);
  let p = 0;
  for (let x = min; x <= maks; x++) {
    const q = pHiper(x, barisAtas - x, kolomKiri - x, n - barisAtas - kolomKiri + x);
    if (q <= pObs * (1 + 1e-9)) p += q;
  }
  return Math.min(1, p);
}

/**
 * Selang Newcombe (hybrid score) 95% untuk SELISIH p2 - p1. Dibangun dari dua
 * selang Wilson, jadi tahan di batas 0 dan 1 — tidak seperti hampiran normal
 * yang bisa memberi selang di luar [-1, 1].
 * Newcombe RG (1998), Statistics in Medicine 17:873-890, metode 10.
 */
export function newcombe(k1, n1, k2, n2) {
  const p1 = k1 / n1, p2 = k2 / n2;
  const [l1, u1] = wilson(k1, n1), [l2, u2] = wilson(k2, n2);
  const d = p2 - p1;
  return [
    d - Math.sqrt((p2 - l2) ** 2 + (u1 - p1) ** 2),
    d + Math.sqrt((u2 - p2) ** 2 + (p1 - l1) ** 2),
  ];
}

/**
 * Vonis dua arah untuk selisih dua proporsi. BEDA NYATA hanya bila Fisher
 * p<0,05 DAN selang selisih tidak memuat nol — dua syarat, bukan satu.
 *
 * CATATAN PENTING: JANGAN memakai "dua selang Wilson bertumpang tindih" sebagai
 * uji beda. Uji itu terlalu ketat — dua selang bisa bertumpang tindih padahal
 * selisihnya nyata. Itu kesalahan yang pernah saya lakukan pada 21 Agu 2026.
 */
export function vonis(k1, n1, k2, n2) {
  const p = fisher(k1, n1, k2, n2);
  const [lo, hi] = newcombe(k1, n1, k2, n2);
  return { p, lo, hi, nyata: p < 0.05 && !(lo <= 0 && hi >= 0), selisih: k2 / n2 - k1 / n1 };
}

/** vonis TIGA arah terhadap sebuah AMBANG (dipakai ulang-gerbang) */
export function vonisAmbang(k, n, ambang) {
  const [lo, hi] = wilson(k, n);
  if (lo >= ambang) return { v: 'LULUS', lo, hi };
  if (hi < ambang) return { v: 'GAGAL', lo, hi };
  return { v: 'TIDAK PASTI', lo, hi };
}

/**
 * ukuranSampelPerlu — mengubah "belum terbukti beda" dari jalan buntu menjadi
 * PERINTAH KERJA.
 *
 * Kalau sebuah perbandingan pulang dengan vonis "belum terbukti beda", ada dua
 * kemungkinan yang sangat berbeda dan sering saya campur-adukkan:
 *   (a) memang tidak ada bedanya, atau
 *   (b) ADA bedanya, tapi percobaannya terlalu sedikit untuk melihatnya.
 * Menyebut keduanya "tidak terbukti" tanpa membedakannya adalah kemalasan yang
 * menyamar sebagai kehati-hatian.
 *
 * Fungsi ini menjawab: berapa percobaan per model yang dibutuhkan supaya selisih
 * sebesar yang teramati BISA terdeteksi pada kuasa 80% (alfa 0,05 dua-sisi)?
 * Rumus baku dua proporsi:
 *   n = [ z(a/2)*akar(2*p*q) + z(b)*akar(p1q1 + p2q2) ]^2 / (p1-p2)^2
 */
export function ukuranSampelPerlu(p1, p2, kuasa = 0.8, alfa = 0.05) {
  if (p1 === p2) return Infinity;
  const zA = alfa === 0.05 ? 1.959964 : 2.575829;     // dua-sisi
  const zB = kuasa === 0.8 ? 0.841621 : 1.281552;     // 80% atau 90%
  const pBar = (p1 + p2) / 2, qBar = 1 - pBar;
  const suku = zA * Math.sqrt(2 * pBar * qBar)
             + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((suku * suku) / ((p1 - p2) ** 2));
}

// ════════════════════════════════════════════════════════════════════════
// UJI BERPASANGAN — tambahan 23 Agu 2026 (penjaga C19: pseudo-replikasi)
//
// KEJADIANNYA: semua perbandingan model kami (banding-jenis, banding-ab)
// memasukkan 10 soal x 2 suhu x 3 ulangan = 60 "percobaan" ke Fisher seolah
// 60 pengamatan bebas. Padahal (1) dua model diuji pada SOAL YANG SAMA ->
// berpasangan, dan (2) ulangan suhu-0 nyaris identik (pengukuran 23 Agu:
// 7-8 dari 10 soal menghasilkan 3 jawaban persis sama) -> bukan pengamatan
// bebas. Akibat: p<0,0001 pada "ton 0/12 vs 12/12" sebenarnya 2 soal x 6
// ulangan — satuan yang sah cuma DUA. Rujukan: Dietterich 1998 (McNemar,
// uji beda-proporsi punya positif-palsu tinggi pada data berpasangan);
// Miller 2024 arXiv 2411.00640 (varians berpasangan = bebas - 2Cov/n;
// rata-ratakan ulangan PER SOAL dulu).
//
// Satuan pengamatan yang sah = SOAL. Ulangan dirata-rata per soal (skor 0..1),
// lalu pasangan skor A/B per soal diuji dengan McNemar eksak (binomial dua-sisi
// atas soal yang diskordan). Fisher pada gabungan tetap boleh dicetak, tetapi
// WAJIB berlabel "indikatif".
// ════════════════════════════════════════════════════════════════════════

/** McNemar eksak dua-sisi: b = soal A lebih baik, c = soal B lebih baik. */
export function mcnemarEksak(b, c) {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  let p = 0;
  for (let i = 0; i <= k; i++) {
    p += Math.exp(logFakt(n) - logFakt(i) - logFakt(n - i) - n * Math.log(2));
  }
  return Math.min(1, 2 * p);
}

/**
 * Rata-ratakan ulangan per soal, lalu uji berpasangan.
 * @param {Array<{soal:string, a:number[], b:number[]}>} perSoal — daftar ok (0/1) per ulangan, tiap lengan
 * @returns {{nSoal:number, b:number, c:number, seri:number, p:number, selisihRata:number, rataA:number, rataB:number, nyata:boolean}}
 */
export function vonisBerpasangan(perSoal) {
  let b = 0, c = 0, seri = 0, jumA = 0, jumB = 0;
  for (const s of perSoal) {
    const ma = s.a.length ? s.a.reduce((x, y) => x + y, 0) / s.a.length : 0;
    const mb = s.b.length ? s.b.reduce((x, y) => x + y, 0) / s.b.length : 0;
    jumA += ma; jumB += mb;
    if (ma > mb + 1e-9) b++;
    else if (mb > ma + 1e-9) c++;
    else seri++;
  }
  const n = perSoal.length || 1;
  const p = mcnemarEksak(b, c);
  return { nSoal: perSoal.length, b, c, seri, p, rataA: jumA / n, rataB: jumB / n,
    selisihRata: (jumB - jumA) / n, nyata: p < 0.05 };
}

/** Kelompokkan rinci hasil uji-aritmetika (A dan B) menjadi pasangan per soal. */
export function pasangkanPerSoal(rinciA, rinciB, kunci = (r) => r.soal) {
  const m = new Map();
  for (const r of rinciA) { const k = kunci(r); if (!m.has(k)) m.set(k, { soal: k, a: [], b: [] }); m.get(k).a.push(r.ok ? 1 : 0); }
  for (const r of rinciB) { const k = kunci(r); if (!m.has(k)) m.set(k, { soal: k, a: [], b: [] }); m.get(k).b.push(r.ok ? 1 : 0); }
  return [...m.values()].filter((s) => s.a.length && s.b.length);
}

// ───────────────────────────────────────────────── uji instrumen ──
// Hanya jalan bila berkas ini dieksekusi langsung (bukan saat diimpor).
if (process.argv[1] && /statistik\.mjs$/.test(process.argv[1]) && process.argv.includes('--uji-instrumen')) {
  const kasus = [];
  const cek = (n, ok) => kasus.push([n, ok]);
  const dekat = (x, y, eps = 1e-4) => Math.abs(x - y) < eps;

  // yang lama tetap dijaga
  cek('fisher Lady Tasting Tea = 0,4857', dekat(fisher(3, 4, 1, 4), 0.4857, 1e-3));
  cek('wilson 8/10 = [0,49; 0,94] (n=10 tak bisa bedakan 80% dari 50%)', (() => { const [l, u] = wilson(8, 10); return dekat(l, 0.4901, 2e-3) && dekat(u, 0.9433, 2e-3); })());

  // McNemar eksak: nilai baku
  cek('mcnemar b=0 c=0 -> p=1', mcnemarEksak(0, 0) === 1);
  cek('mcnemar b=5 c=0 -> p=0,0625 (belum nyata pada 5 soal)', dekat(mcnemarEksak(5, 0), 0.0625));
  cek('mcnemar b=6 c=0 -> p=0,03125 (nyata)', dekat(mcnemarEksak(6, 0), 0.03125));
  cek('mcnemar b=2 c=0 -> p=0,5', dekat(mcnemarEksak(2, 0), 0.5));
  cek('mcnemar simetris b=3 c=7 == b=7 c=3', dekat(mcnemarEksak(3, 7), mcnemarEksak(7, 3)));
  cek('mcnemar b=10 c=0 -> p=0,00195', dekat(mcnemarEksak(10, 0), 0.001953, 1e-5));

  // KENDALI INTI C19: data nyata 22 Agu — ton 0/12 vs 12/12 = 2 soal x 6 ulangan.
  // Fisher gabungan menjerit; berpasangan per soal hanya p=0,5.
  const pGabung = fisher(0, 12, 12, 12);
  const vb = vonisBerpasangan([{ soal: 'ton-19', a: [0, 0, 0, 0, 0, 0], b: [1, 1, 1, 1, 1, 1] },
                                { soal: 'ton-14', a: [0, 0, 0, 0, 0, 0], b: [1, 1, 1, 1, 1, 1] }]);
  cek('KENDALI C19: Fisher gabungan 0/12 vs 12/12 p<0,001 (menjerit)', pGabung < 0.001);
  cek('KENDALI C19: berpasangan per soal cuma 2 soal -> p=0,5, TIDAK nyata', vb.nSoal === 2 && vb.c === 2 && dekat(vb.p, 0.5) && vb.nyata === false);
  cek('berpasangan: seri dihitung seri, bukan diskordan', vonisBerpasangan([{ soal: 'x', a: [1, 1], b: [1, 1] }]).seri === 1);
  cek('berpasangan: ulangan dirata-rata (2/3 vs 1/3 -> A lebih baik)', vonisBerpasangan([{ soal: 'x', a: [1, 1, 0], b: [1, 0, 0] }]).b === 1);
  const pas = pasangkanPerSoal([{ soal: 's1', ok: true }, { soal: 's1', ok: false }, { soal: 's2', ok: true }],
                               [{ soal: 's1', ok: true }, { soal: 's2', ok: false }, { soal: 's3', ok: true }]);
  cek('pasangkanPerSoal: hanya soal yang ada di KEDUA lengan (s3 dibuang)', pas.length === 2 && pas.find((x) => x.soal === 's1').a.length === 2);

  let gagal = 0;
  for (const [n, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${n}`); if (!ok) gagal++; }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}
