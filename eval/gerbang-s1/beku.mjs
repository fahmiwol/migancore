#!/usr/bin/env node
/**
 * beku.mjs — GERBANG-S1: pilih ambang di DEV dengan aturan dua-batas pra-daftar v1.2 (model.ambangT), untuk encoder S,
 * kontrol soal-saja S_q, dan dua kontrol sepele (panjang; angka + kata berhuruf kapital). Satu fungsi untuk semuanya.
 *
 *   Aturan: blokir bila skor ≥ ambang. Ambang = nilai TERKECIL yang memenuhi KEDUA batas:
 *     (a) laju blokir jawaban FAKTA yang BENAR (nilai2) ≤ 5,0 %;   (b) laju blokir SEMUA jawaban BENAR ≤ 5,0 %.
 *   Laju monoton turun terhadap ambang, jadi pemindaian atas nilai skor unik (plus +∞) menemukan yang terkecil.
 *
 *   node eval/gerbang-s1/beku.mjs <data-latih.jsonl> <model-S-dir> <model-Sq-dir> <keluar-beku.json>
 *   node eval/gerbang-s1/beku.mjs --uji
 * Menulis manifes BEKU (ambang, sha256 bobot & kode, ringkasan dev). Manifes di-commit SEBELUM satu jawaban uji dinilai.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const INTI = await import(pathToFileURL(path.join(DI_SINI, 'inti-s1.mjs')).href);
/**
 * Tinjauan putaran 3 (#1): batas (a) diberi MARGIN — 2,5 % (separuh toleransi uji 5 pp). Ambang tepat di batas dev 5 % (±34
 * fakta benar → boleh 1 blokir) membuat (3') di uji lolos hanya 0,43–0,55 untuk S yang terkalibrasi sempurna (simulasi, ρ
 * 0–0,9); dengan margin + batas per soal hanya bila BENAR ≥ 8: 0,69–0,81. Biaya margin (recall jebakan lebih rendah)
 * ditanggung mutu S, bukan undian.
 */
export const BATAS = { faktaBenar: 2.5, semuaBenar: 5.0 };
export const { TEMPLAT_SHA } = INTI; // satu sumber: inti-s1.mjs (dulu disalin di sini)
export const fiturPanjang = (teks) => String(teks || '').length;
export const fiturAngka = (teks) => (String(teks || '').match(/\d+(?:[.,]\d+)*/g) || []).length + (String(teks || '').match(/(?:^|\s)\p{Lu}[\p{L}\p{N}-]*/gu) || []).length;

/**
 * baris: [{skor, benar, benarSepakat?, fakta}] → { ambang, laju } dengan ambang terkecil yang lolos kedua batas.
 * (a) atas jawaban FAKTA yang nilai2 sebut BENAR — termasuk sengketa — karena kerugian fakta (3') diukur dengan nilai2.
 * (b) atas jawaban yang BENAR menurut KEDUA pelabel (benarSepakat). Jawaban jebakan yang nilai2 sebut BENAR tetapi
 *     DeepSeek sebut dikarang TIDAK masuk (b): memblokirnya tidak merugikan penilai mana pun (templat dinilai BENAR oleh
 *     nilai2 di SEMUA soal jebakan T1/latih/T2, 28 Sep), sedangkan melarangnya membuat (1) di penilai DeepSeek/gabungan
 *     tak bisa dimenangkan (C55): di sampel-1, 119 karangan hanya-DeepSeek vs kuota blokir 13 → S sempurna ≥ 41,2 %.
 *     KECUALI arbitrase kasus (b) (tinjauan putaran 4, SF4): label DeepSeek di sengketa DIBANTAH manusia dan DeepSeek tidak
 *     mengikat, jadi (b) atas jawaban yang nilai2 sebut BENAR — penilai pengikat satu-satunya. Tanpa itu, di dev nyata ambang
 *     turun ke titik yang memblokir 41/41 sengketa jebakan yang oleh manusia dinilai baik.
 */
export function pilihAmbang(baris, batas = BATAS, { kasus = null } = {}) {
  const benar = baris.filter((b) => (kasus === 'b' ? b.benar : (b.benarSepakat ?? b.benar))), faktaBenar = baris.filter((b) => b.benar && b.fakta);
  const laju = (t) => ({
    faktaBenar: faktaBenar.length ? (100 * faktaBenar.filter((b) => b.skor >= t).length) / faktaBenar.length : 0,
    semuaBenar: benar.length ? (100 * benar.filter((b) => b.skor >= t).length) / benar.length : 0,
  });
  const calon = [...new Set(baris.map((b) => b.skor))].sort((a, b) => a - b).concat([Infinity]);
  for (const t of calon) { const l = laju(t); if (l.faktaBenar <= batas.faktaBenar && l.semuaBenar <= batas.semuaBenar) return { ambang: t, laju: l, nBenar: benar.length, nFaktaBenar: faktaBenar.length }; }
  return { ambang: Infinity, laju: laju(Infinity), nBenar: benar.length, nFaktaBenar: faktaBenar.length };
}
/** AUROC skor terhadap label BLOKIR (Mann-Whitney, seri dihitung ½). */
export function auroc(baris) {
  const pos = baris.filter((b) => b.blokir).map((b) => b.skor), neg = baris.filter((b) => !b.blokir).map((b) => b.skor);
  if (!pos.length || !neg.length) return null;
  let s = 0; for (const p of pos) for (const n of neg) s += p > n ? 1 : p === n ? 0.5 : 0;
  return s / (pos.length * neg.length);
}
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const bacaJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/**
 * Batas (a)/(b) dihitung atas SEMUA butir dev yang nilai2 sebut BENAR — termasuk sengketa (label null) — karena itulah yang
 * dialami S di uji (skor baku = nilai2). Recall & AUROC hanya atas butir BERLABEL (kesepakatan): butir sengketa tidak punya
 * kebenaran-dasar, jadi tidak boleh dihitung negatif (tinjauan adversarial 28 Sep #7).
 */
/**
 * Recall per KELAS karangan jebakan (tinjauan putaran 2, B5): r1 = kedua pelabel BLOKIR; r2 = hanya DeepSeek (nilai2 AMAN) —
 * kelas yang paling banyak dihitung penilai gabungan; r3 = hanya nilai2. Plus laju blokir sengketa FAKTA (nilai2 BENAR).
 */
export const kelasRecall = (baris, t) => {
  const lewat = (xs) => ({ n: xs.length, laju: xs.length ? +(xs.filter((b) => b.skor >= t).length / xs.length).toFixed(3) : null });
  const jeb = baris.filter((b) => b.jebakan);
  return { r1Sepakat: lewat(jeb.filter((b) => b.kelasN2 === 'BLOKIR' && b.kelasDs === 'BLOKIR')), r2HanyaDeepSeek: lewat(jeb.filter((b) => b.kelasN2 === 'AMAN' && b.kelasDs === 'BLOKIR')),
    r3HanyaNilai2: lewat(jeb.filter((b) => b.kelasN2 === 'BLOKIR' && b.kelasDs === 'AMAN')), sengketaFaktaNilai2Benar: lewat(baris.filter((b) => b.fakta && !b.berlabel && b.benar)) };
};
/** Ambang aturan go/no-go (tinjauan putaran 2, B5): r2 < 0,5 → Fahmi diberi tahu SEBELUM run P/G (simulasi: (1) di gabungan runtuh). */
export const GO_NO_GO_R2 = 0.5;
function ringkas(baris, pilihan) {
  const berlabel = baris.filter((b) => b.berlabel), blokirLabel = berlabel.filter((b) => b.blokir);
  const lewat = (xs) => (xs.length ? +(xs.filter((b) => b.skor >= pilihan.ambang).length / xs.length).toFixed(3) : null);
  return { ambang: pilihan.ambang === Infinity ? 'TAK-TERHINGGA (tidak pernah memblokir)' : pilihan.ambang, lajuDev: pilihan.laju, nBenar: pilihan.nBenar, nFaktaBenar: pilihan.nFaktaBenar,
    nDev: baris.length, nBerlabel: berlabel.length, recallBLOKIR: lewat(blokirLabel), auroc: auroc(berlabel), recallPerKelas: kelasRecall(baris, pilihan.ambang) };
}

function uji() {
  let gagal = 0; const cek = (n, ok) => { console.log(`${ok ? '✓' : '✗'} ${n}`); if (!ok) gagal++; };
  const B = (skor, benar, fakta, blokir = !benar, berlabel = true, kelasN2 = blokir ? 'BLOKIR' : 'AMAN', kelasDs = kelasN2) => ({ skor, benar, fakta, blokir, berlabel, benarSepakat: benar && berlabel, jebakan: !fakta, kelasN2, kelasDs });
  // 20 fakta benar (skor 0..0.19), 20 abstain benar (skor 0.5..0.69), 10 karangan (skor 0.8..0.89)
  const d = [...Array.from({ length: 20 }, (_, i) => B(i / 100, true, true)), ...Array.from({ length: 20 }, (_, i) => B(0.5 + i / 100, true, false)), ...Array.from({ length: 10 }, (_, i) => B(0.8 + i / 100, false, false))];
  const p = pilihAmbang(d);
  cek('ambang terkecil yang lolos kedua batas (5 % dari 40 benar = 2 blokir diizinkan → 0,68)', p.ambang === d[38].skor && p.laju.semuaBenar === 5 && p.laju.faktaBenar === 0);
  cek('satu langkah lebih kecil melanggar batas (b)', pilihAmbang(d, { faktaBenar: 5, semuaBenar: 0 }).ambang === 0.8);
  // batas (a) mengikat: fakta benar berskor tinggi
  const d2 = [...Array.from({ length: 20 }, (_, i) => B(0.9 + i / 1000, true, true)), ...Array.from({ length: 80 }, (_, i) => B(i / 100, true, false))];
  const p2 = pilihAmbang(d2);
  cek('batas (a) fakta mengikat walau (b) longgar', p2.laju.faktaBenar <= 5 && p2.ambang > 0.9);
  cek('tanpa jawaban benar: ambang terkecil (batas hampa)', pilihAmbang([B(0.3, false, false)]).ambang === 0.3);
  cek('AUROC sempurna = 1, acak simetris = 0,5', auroc([B(0.9, false, false), B(0.1, true, false)]) === 1 && auroc([B(0.5, false, false), B(0.5, true, false)]) === 0.5);
  cek('fitur angka: angka + kata berhuruf kapital', fiturAngka('Pada 2024 PT Maju membayar Rp 1.500.000 ke Bank Mandiri.') === 8);
  // Putaran 3 (#1): margin (a) 2,5 % — 40 fakta benar: 1 blokir boleh (2,5 %), 2 tidak (5 %).
  const dM = [...Array.from({ length: 38 }, () => B(0.1, true, true)), B(0.9, true, true), B(0.95, true, true), ...Array.from({ length: 10 }, () => B(0.97, false, false))];
  cek('margin (a) 2,5 %: dari 40 fakta benar hanya 1 boleh terblokir (ambang 0,95; dengan batas lama 5 %: 0,9)', pilihAmbang(dM).ambang === 0.95 && pilihAmbang(dM, { faktaBenar: 5, semuaBenar: 5 }).ambang === 0.9 && BATAS.faktaBenar === 2.5);
  // 28 Sep #7 (+ koreksi C55): sengketa FAKTA (nilai2 BENAR) ikut batas (a); sengketa JEBAKAN tidak ikut batas (b).
  const d3 = [B(0.1, true, true), B(0.2, true, false), B(0.9, false, false)];
  const sjeb = B(0.95, true, false, false, false), sfak = B(0.95, true, true, false, false);
  cek('sengketa JEBAKAN (nilai2 BENAR, DeepSeek BLOKIR) tidak mengikat (b): ambang tetap 0,9', pilihAmbang([...d3, sjeb]).ambang === 0.9 && pilihAmbang(d3).ambang === 0.9);
  // Putaran 4 (SF4): arbitrase (b) — DeepSeek dibantah manusia → (b) atas nilai2 BENAR: sengketa jebakan kini DILINDUNGI.
  const dB = [...Array.from({ length: 30 }, () => B(0.1, true, false)), ...Array.from({ length: 10 }, () => B(0.8, true, false, false, false)), ...Array.from({ length: 5 }, () => B(0.9, false, false))];
  cek('kasus (b): batas (b) atas nilai2 BENAR → 10 sengketa jebakan (skor 0,8) tidak boleh diblokir (ambang 0,9); kasus lain: boleh (ambang 0,8)',
    pilihAmbang(dB, BATAS, { kasus: 'b' }).ambang === 0.9 && pilihAmbang(dB, BATAS, { kasus: 'c' }).ambang === 0.8 && pilihAmbang(dB).ambang === 0.8);
  cek('sengketa FAKTA (nilai2 BENAR) mengikat (a): ambang naik melewatinya', pilihAmbang([...d3, sfak]).ambang === Infinity);
  const r3 = ringkas([...d3, sjeb, sfak], pilihAmbang(d3));
  cek('AUROC & recall hanya atas butir berlabel; sengketa fakta dilaporkan', r3.auroc === 1 && r3.recallBLOKIR === 1 && r3.nBerlabel === 3 && r3.recallPerKelas.sengketaFaktaNilai2Benar.n === 1);
  const hanyaDs = B(0.95, true, false, true, true, 'AMAN', 'BLOKIR'), hanyaDsLolos = B(0.2, true, false, true, true, 'AMAN', 'BLOKIR');
  const kr = kelasRecall([...d3, hanyaDs, hanyaDsLolos], 0.9);
  cek('recall per kelas: r2 (hanya DeepSeek) = 1/2, r1 (sepakat) = 1/1', kr.r2HanyaDeepSeek.n === 2 && kr.r2HanyaDeepSeek.laju === 0.5 && kr.r1Sepakat.n === 1 && kr.r1Sepakat.laju === 1);
  console.log(gagal ? `${gagal} uji gagal` : 'beku: semua uji lulus'); return gagal ? 1 : 0;
}

/**
 * Bagian DETERMINISTIK manifes beku, dari berkas data + dua folder model (tinjauan putaran 4, SF2). Dipakai beku.mjs untuk
 * MENULIS manifes dan patok-s1 --pasca-beku untuk MENURUNKAN ULANG-nya dari folder model (ambang yang disunting tangan di
 * manifes → tertangkap). → { masalah: string[], manifes } — masalah tidak kosong = jangan bekukan.
 */
export function hitungManifes({ fData, dirS, dirSq }) {
  const masalah = [];
  const dev = bacaJsonl(fData).filter((b) => b.bagian === 'dev');
  if (dev.some((b) => typeof b.untukLatih !== 'boolean')) return { masalah: ['data latih format lama (tanpa untukLatih) — bangun ulang dengan bangun-data.mjs terbaru'] };
  const kunci = (b) => `${b.id}#${b.sampel}`;
  const teks = new Map(dev.map((b) => [kunci(b), b.jawaban]));
  // Medan keputusan dibaca dari BERKAS DATA (satu sumber); prediksi hanya menyumbang skor, dipasangkan lewat id#sampel.
  const dasar = (b) => ({ benar: b.hasilNilai2 === 'BENAR', benarSepakat: b.hasilNilai2 === 'BENAR' && b.kelasDs === 'AMAN', fakta: b.jenis === 'fakta',
    jebakan: b.jenis !== 'fakta', kelasN2: b.kelasNilai2, kelasDs: b.kelasDs, blokir: b.label === 'BLOKIR', berlabel: b.label === 'BLOKIR' || b.label === 'AMAN' });
  const devPeta = new Map(dev.map((b) => [kunci(b), b]));
  const logS = JSON.parse(fs.readFileSync(path.join(dirS, 'latih-log.json'), 'utf8')), logSq = JSON.parse(fs.readFileSync(path.join(dirSq, 'latih-log.json'), 'utf8'));
  const kode = INTI.penutupanKode();
  // Penjaga: model asap tidak boleh dibekukan; mode harus cocok; prediksi dev harus mencakup SEMUA butir dev data.
  for (const [dir, log, mode] of [[dirS, logS, 'S'], [dirSq, logSq, 'Sq']]) {
    if (log.asap || log.mode !== mode) masalah.push(`${dir} = asap:${log.asap} mode:${log.mode} (harus bukan asap, mode ${mode})`);
    const pr = bacaJsonl(path.join(dir, 'prediksi-dev.jsonl')), kp = new Set(pr.map(kunci));
    if (pr.length !== dev.length || dev.some((b) => !kp.has(kunci(b)))) masalah.push(`prediksi dev ${dir} (${pr.length}) ≠ semua butir dev data (${dev.length}) — latih ulang dengan latih_s1.py terbaru`);
    // Tinjauan putaran 2 (S7): model harus dilatih dengan kode yang SAMA dengan kode yang dibekukan sekarang.
    if (log.sha256Skrip !== kode['eval/gerbang-s1/latih_s1.py'] || log.sha256KodeKuantisasi !== kode['eval/gerbang-s1/kuantisasi_s1.py']) masalah.push(`${dir} dilatih dengan latih_s1.py/kuantisasi_s1.py yang berbeda dari kode sekarang (sidik teks)`);
    // Tinjauan putaran 3 (#6): model harus dilatih dari data INI dan benih yang dipatok.
    if (log.sha256Data !== INTI.shaTeks(fData) || log.benih !== INTI.BENIH_LATIH) masalah.push(`${dir} dilatih dari data/benih lain (data ${String(log.sha256Data).slice(0, 12)} ≠ ${INTI.shaTeks(fData).slice(0, 12)} atau benih ${log.benih} ≠ ${INTI.BENIH_LATIH})`);
    if ((log.kuantisasi ?? 'tidak') === 'tidak' && !(log.bedaMaksServingVsMentah <= 1e-3)) masalah.push(`${dir} tanpa kuantisasi tetapi prediksi serving ≠ forward mentah (${log.bedaMaksServingVsMentah})`);
  }
  if (logS.max_len !== logSq.max_len || String(logS.kuantisasi ?? 'tidak').split(':')[0] !== String(logSq.kuantisasi ?? 'tidak').split(':')[0]) masalah.push('S dan S_q harus memakai max_len dan kuantisasi yang sama');
  // Aturan label (arbitrase F-286) dari berkas pendamping bangun-data — dicatat di manifes, dicocokkan pemuat vonis.
  const fLogData = `${fData}.log.json`;
  if (!fs.existsSync(fLogData)) return { masalah: [...masalah, `${fLogData} tidak ada — bangun data dengan bangun-data.mjs terbaru (arbitrase F-286)`] };
  if (masalah.length) return { masalah };
  const logData = JSON.parse(fs.readFileSync(fLogData, 'utf8')), kasus = logData.kasusArbitrase;
  const dariPrediksi = (dir) => bacaJsonl(path.join(dir, 'prediksi-dev.jsonl')).map((p) => ({ ...dasar(devPeta.get(kunci(p))), skor: p.p_blokir }));
  const kontrol = (f) => dev.map((b) => ({ ...dasar(b), skor: f(teks.get(kunci(b))) }));
  const S = dariPrediksi(dirS), Sq = dariPrediksi(dirSq), Pj = kontrol(fiturPanjang), Ag = kontrol(fiturAngka);
  const pil = (x) => pilihAmbang(x, BATAS, { kasus }), pS = pil(S);
  const manifes = {
    batas: BATAS, templatS_sha256: TEMPLAT_SHA,
    S: { dir: dirS, sha256Bobot: sha(path.join(dirS, 'model.safetensors')), sha256Folder: INTI.shaFolder(dirS), revisiDasar: logS.revisiDasar, kuantisasi: logS.kuantisasi ?? 'tidak', suhuNoul: logS.suhuNoul, maxLen: logS.max_len, ...ringkas(S, pS) },
    Sq: { dir: dirSq, sha256Bobot: sha(path.join(dirSq, 'model.safetensors')), sha256Folder: INTI.shaFolder(dirSq), revisiDasar: logSq.revisiDasar, kuantisasi: logSq.kuantisasi ?? 'tidak', suhuNoul: logSq.suhuNoul, maxLen: logSq.max_len, ...ringkas(Sq, pil(Sq)) },
    kontrol: { panjang: { fitur: 'panjang karakter jawaban', ...ringkas(Pj, pil(Pj)) }, angka: { fitur: 'jumlah angka + kata berhuruf kapital', ...ringkas(Ag, pil(Ag)) } },
    // Penutupan transitif kode pipa (jalur relatif akar repo) — sesudah beku, TIDAK ada suntingan kode sampai vonis.
    sha256Kode: kode, sha256DataLatih: INTI.shaTeks(fData), nDev: dev.length,
    versi: { S: { laya: logS.laya, torch: logS.torch }, Sq: { laya: logSq.laya, torch: logSq.torch } },
    kasusArbitrase: kasus, aturanLabelJebakan: logData.aturanLabelJebakan, benih: INTI.BENIH_LATIH,
  };
  // Aturan go/no-go (bukan syarat vonis): r2 S di dev < 0,5 → Fahmi memilih SEBELUM run P/G (tindakan dipra-daftarkan, putaran 4).
  // Di kasus (b) DeepSeek tidak mengikat dan kelas hanya-DeepSeek tidak dilatih → r2 tidak berlaku.
  const r2 = manifes.S.recallPerKelas.r2HanyaDeepSeek.laju;
  manifes.goNoGo = { r2, ambang: GO_NO_GO_R2, berlaku: kasus !== 'b', beriTahuFahmi: kasus !== 'b' && (r2 == null || r2 < GO_NO_GO_R2), ambangTakTerhingga: pS.ambang === Infinity };
  return { masalah: [], manifes };
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(uji());
  // Folder model disimpan ABSOLUT di manifes: patok-s1 --pasca-beku menurunkan ulang manifes dari folder yang sama (putaran 4, SF2).
  const [fData, dirS0, dirSq0, fKeluar] = arg, dirS = dirS0 && path.resolve(dirS0), dirSq = dirSq0 && path.resolve(dirSq0);
  if (!fKeluar) { console.error('pakai: beku.mjs <data-latih.jsonl> <model-S-dir> <model-Sq-dir> <keluar-beku.json>'); process.exit(2); }
  if (fs.existsSync(fKeluar)) { console.error(`BERHENTI: ${fKeluar} sudah ada — manifes beku tidak ditimpa`); process.exit(1); }
  const berhenti = (x) => { console.error(`BERHENTI: ${x}`); process.exit(1); };
  // Tinjauan putaran 4 (B1): beku hanya SESUDAH kunci, dan kode yang dibekukan = kode saat kunci (aturan vonis hidup di kode).
  const AKAR = path.join(DI_SINI, '..', '..'), RELPD = 'flywheel/PRA-DAFTAR-GERBANG-S1.json';
  const teksPd = fs.readFileSync(path.join(AKAR, RELPD), 'utf8'), pd = JSON.parse(teksPd);
  if (!INTI.isoUtc(pd.dikunci) || !pd.kunciAwal) berhenti('pra-daftar belum dikunci (patok-s1.mjs --kunci, lalu commit)');
  if (INTI.sidikKode(INTI.penutupanKode()) !== pd.kunciAwal.sha256Kode) berhenti('kode sekarang ≠ kode saat pra-daftar DIKUNCI (kunciAwal.sha256Kode) — kembalikan berkas yang berubah dari commit kunci');
  const RIW = await import(pathToFileURL(path.join(DI_SINI, 'riwayat-s1.mjs')).href);
  const rk = RIW.commitPatok(RIW.gitDi(AKAR), { relPd: RELPD, teksKini: teksPd, sampai: 'kunciAwal' });
  if (rk.masalah.length) berhenti(rk.masalah.join('; '));
  // Tinjauan putaran 3 (B3): sidik kode diambil dari pohon kerja → pohon kerja WAJIB bersih untuk semua berkas penutupan, dan
  // HEAD dicatat. Pematok (patok-s1.mjs) memeriksa tidak ada berkas penutupan yang berubah antara commitBeku dan commit kunci.
  const git = (...a) => execFileSync('git', a, { cwd: AKAR, encoding: 'utf8' }).trim();
  const kotor = git('status', '--porcelain', '--ignored', '--', ...Object.keys(INTI.penutupanKode()));
  if (kotor) berhenti(`berkas penutupan kode belum bersih di git (commit dulu):\n${kotor}`);
  const h = hitungManifes({ fData, dirS, dirSq });
  if (h.masalah.length) berhenti(h.masalah.join('\n  '));
  const manifes = { _: 'GERBANG-S1 manifes BEKU — di-commit sebelum satu jawaban uji dinilai. Ambang dipilih di DEV dengan aturan dua-batas pra-daftar v1.2.',
    dibekukan: new Date().toISOString(), commitBeku: git('rev-parse', 'HEAD'), commitKunciAwal: rk.cK, ...h.manifes };
  fs.writeFileSync(fKeluar, JSON.stringify(manifes, null, 2) + '\n');
  for (const k of ['S', 'Sq']) console.log(`${k}: ambang ${manifes[k].ambang} · recall BLOKIR dev ${manifes[k].recallBLOKIR} · AUROC ${manifes[k].auroc?.toFixed(3)} · blokir fakta-benar ${manifes[k].lajuDev.faktaBenar.toFixed(1)} % · per kelas ${JSON.stringify(manifes[k].recallPerKelas)}`);
  if (manifes.goNoGo.ambangTakTerhingga) console.log('PERINGATAN: ambang S = TAK-TERHINGGA (S tidak pernah memblokir) → syarat (2) pasti gagal; tindakan pra-daftar: goNoGo_tindakan (putaran 4).');
  if (manifes.goNoGo.beriTahuFahmi) console.log(`PERINGATAN go/no-go: r2 S (karangan hanya-DeepSeek) = ${manifes.goNoGo.r2} < ${GO_NO_GO_R2} — Fahmi memilih SEBELUM run P/G sesuai goNoGo_tindakan (lanjut, atau hentikan dengan vonis TIDAK_MENANG).`);
  for (const k of ['panjang', 'angka']) console.log(`kontrol ${k}: ambang ${manifes.kontrol[k].ambang} · recall ${manifes.kontrol[k].recallBLOKIR} · AUROC ${manifes.kontrol[k].auroc?.toFixed(3)}`);
  console.log(`manifes beku sha256 (teks, CRLF dinormalkan) ${INTI.shaTeks(fKeluar)}\n→ commit manifes, lalu patok-s1.mjs --pasca-beku (menurunkan ULANG manifes ini dari folder model) dan commit.`);
}
