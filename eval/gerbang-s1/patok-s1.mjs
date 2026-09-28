#!/usr/bin/env node
/**
 * patok-s1.mjs — GERBANG-S1: alat KUNCI pra-daftar (tinjauan adversarial putaran 3, 28 Sep 2026).
 *
 * Kenapa alat, bukan suntingan tangan: pemuat vonis menuntut 'dikunci' dan 'kunciPascaBeku.ditulis' berupa waktu ISO UTC
 * berakhiran Z, blok kunciPascaBeku tepat SATU, dan setiap sha dihitung dari berkas yang benar. Patok tangan membuka
 * jebakan yang sudah terlihat: 'dikunci: true', waktu WIB tanpa Z, blok ditulis dua kali, sha dari salinan yang salah.
 *
 * Tiga langkah, masing-masing SEKALI. Semuanya hanya MENULIS pra-daftar secara bedah; COMMIT oleh operator = buktinya.
 *   --kunci       "dikunci": false → waktu ISO UTC sekarang, plus satu baris penanda. Dijalankan sesudah tinjauan adversarial
 *                 bersih dan SEBELUM encoder dilatih/dibekukan.
 *   --pasca-beku  sisipkan blok "kunciPascaBeku" sebagai baris-baris sesudah '{' (0 baris dihapus). Dijalankan sesudah
 *                 beku.mjs dan SEBELUM satu jawaban uji dinilai (pra-daftar tinjauanAdversarial_28Sep.kunciPascaBeku_prosedur).
 *   --pra-vonis   sisipkan blok "kunciPraVonis": sha semua masukan pasca-run satu stempel (berkas run, skor, label DeepSeek,
 *                 audit, skor T2), masing-masing sudah di-commit TEPAT sekali. Dijalankan SEBELUM vonis (putaran 3 #3).
 *
 * --pasca-beku MENOLAK bila:
 *   - pra-daftar belum dikunci atau blok sudah ada;
 *   - berkas terpatok, pra-daftar, atau berkas penutupan kode belum ter-commit bersih;
 *   - kode berubah antara commitBeku dan HEAD, atau sidik kode sekarang ≠ manifes;
 *   - encoder dibekukan sebelum pra-daftar dikunci;
 *   - validasi buta belum lengkap atau tidak lulus (pra-daftar dataLatih.label.validasiButa: satu perbaikan rubrik v2 boleh
 *     sebelum latih, gagal lagi = TIDAK_SAH_INSTRUMEN);
 *   - arbitrase F-286 dari berkas validasi ≠ aturan label di manifes;
 *   - data latih yang dibekukan ≠ data yang dibangun ulang dari masukan terpatok (jawaban + label + validasi + audit);
 *   - sudah ada run utama P/G.
 *
 *   node eval/gerbang-s1/patok-s1.mjs --kunci [--pra-daftar f] [--beku f]
 *   node eval/gerbang-s1/patok-s1.mjs --pasca-beku [--beku f] [--jawaban-latih f] [--label-latih f] [--jawaban-t2 f]
 *        [--validasi-kunci f] [--validasi-hasil f] [--dir hasil-uji] [--pra-daftar f]
 *   node eval/gerbang-s1/patok-s1.mjs --uji
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.resolve(DI_SINI, '..', '..');
const INTI = await import(pathToFileURL(path.join(DI_SINI, 'inti-s1.mjs')).href);

const shaIsi = (teks) => crypto.createHash('sha256').update(String(teks).replace(/\r\n/g, '\n')).digest('hex');
const eolDari = (teks) => (/\r\n/.test(teks) ? '\r\n' : '\n');
/** Baris lama yang HILANG dari baru (multiset, berurutan): 0 = hanya penyisipan. */
export function barisDihapus(lama, baru) {
  const a = lama.split(/\r?\n/), b = baru.split(/\r?\n/);
  let j = 0, hilang = 0;
  for (const x of a) { let k = j; while (k < b.length && b[k] !== x) k++; if (k < b.length) j = k + 1; else hilang++; }
  return hilang;
}
/**
 * Langkah --kunci pada TEKS: tepat satu baris '"dikunci": false,' → waktu ISO, ditambah blok kunciAwal sesudah '{'
 * (tinjauan putaran 4, B1): { sha256Kode = sidik penutupan kode SAAT kunci, nBerkasKode, commitSebelumKunci, ditulis }.
 * Aturan vonis hidup di kode; kunci yang tidak mematok kode tidak mengunci apa pun.
 */
export function kunciTeks(teks, iso, blok) {
  if (!INTI.isoUtc(iso)) throw new Error(`waktu kunci bukan ISO UTC berakhiran Z: ${iso}`);
  if (!blok || blok.ditulis !== iso || !/^[0-9a-f]{64}$/.test(String(blok.sha256Kode))) throw new Error('blok kunciAwal tidak lengkap (ditulis = waktu kunci, sha256Kode = sidik kode)');
  const eol = eolDari(teks), baris = teks.split(/\r?\n/);
  const idx = baris.map((b, i) => (/^\s*"dikunci": false,$/.test(b) ? i : -1)).filter((i) => i >= 0);
  if (idx.length !== 1) throw new Error(`baris '"dikunci": false,' harus tepat satu (ada ${idx.length}) — sudah dikunci?`);
  if (baris[0] !== '{') throw new Error('baris pertama pra-daftar bukan "{"');
  const lekuk = baris[idx[0]].match(/^\s*/)[0];
  baris[idx[0]] = `${lekuk}"dikunci": "${iso}",`;
  const keluar = sisipBlok(baris.join(eol), 'kunciAwal', blok);
  const pd = JSON.parse(keluar);
  if (pd.dikunci !== iso || pd.kunciAwal.sha256Kode !== blok.sha256Kode) throw new Error('hasil kunci tidak terbaca ulang');
  return keluar;
}
/** Sisipkan blok bernama sesudah '{' (0 baris dihapus); kunci itu belum boleh ada di teks. */
export function sisipBlok(teks, nama, blok) {
  if (new RegExp(`"${nama}"`).test(teks)) throw new Error(`blok ${nama} sudah ada — ditulis SEKALI`);
  const eol = eolDari(teks), baris = teks.split(/\r?\n/);
  if (baris[0] !== '{') throw new Error('baris pertama pra-daftar bukan "{"');
  const isi = JSON.stringify({ [nama]: blok }, null, 2).split('\n').slice(1, -1);
  isi[isi.length - 1] += ',';
  baris.splice(1, 0, ...isi);
  const keluar = baris.join(eol);
  const pd = JSON.parse(keluar);
  if (JSON.stringify(pd[nama]) !== JSON.stringify(blok)) throw new Error('blok tidak terbaca ulang sama');
  if (barisDihapus(teks, keluar) !== 0) throw new Error('penyisipan menghapus baris');
  return keluar;
}
/** Langkah --pasca-beku pada TEKS (sesudah beku, sebelum satu jawaban uji dinilai). */
export const sisipPascaBeku = (teks, blok) => sisipBlok(teks, 'kunciPascaBeku', blok);
/** Berkas masukan vonis satu stempel yang dipatok --pra-vonis (nama dasar; pemuat membandingkan dengan nama yang sama). */
export const berkasPascaRun = (stempel) => [`skor-T1-S-${stempel}.jsonl`, `skor-T1-Sq-${stempel}.jsonl`, `label-uji-ds-${stempel}.jsonl`,
  `label-uji-soal-${stempel}.jsonl`, `audit-uji-kunci-${stempel}.json`, `audit-uji-hasil-${stempel}.json`];

function uji() {
  let gagal = 0;
  const cek = (n, ok, d = '') => { console.log(`${ok ? '✓' : '✗'} ${n}${ok ? '' : `  ← ${d}`}`); if (!ok) gagal++; };
  const draf = ['{', '  "episode": "X",', '  "dikunci": false,', '  "vonis": { "hasil": "BELUM" }', '}', ''];
  const blokK = (iso) => ({ sha256Kode: 'c'.repeat(64), nBerkasKode: 45, commitSebelumKunci: 'e'.repeat(40), alat: 'uji', ditulis: iso });
  for (const eol of ['\n', '\r\n']) {
    const t = draf.join(eol), iso = '2026-10-01T00:00:00.000Z';
    const k = kunciTeks(t, iso, blokK(iso));
    cek(`--kunci (${eol === '\n' ? 'LF' : 'CRLF'}): dikunci = ISO, satu baris berubah + blok kunciAwal (sidik kode), EOL dipertahankan`,
      JSON.parse(k).dikunci === iso && JSON.parse(k).kunciAwal.sha256Kode === 'c'.repeat(64) && barisDihapus(t, k) === 1 && (eol === '\n' || !/[^\r]\n/.test(k)));
    let lempar = false; try { kunciTeks(k, iso, blokK(iso)); } catch { lempar = true; }
    cek(`--kunci (${eol === '\n' ? 'LF' : 'CRLF'}): kedua kali → menolak`, lempar);
    lempar = false; try { kunciTeks(t, '2026-10-01T07:00', blokK('2026-10-01T07:00')); } catch { lempar = true; }
    cek('--kunci: waktu tanpa Z → menolak', lempar);
    lempar = false; try { kunciTeks(t, iso, { ...blokK(iso), sha256Kode: null }); } catch { lempar = true; }
    cek('--kunci: tanpa sidik kode → menolak (B1 putaran 4)', lempar);
    const blok = { sha256Manifes: 'a'.repeat(64), lajuLatihBeku: 17.1, ditulis: '2026-10-02T00:00:00.000Z' };
    const s = sisipPascaBeku(k, blok);
    cek(`--pasca-beku (${eol === '\n' ? 'LF' : 'CRLF'}): 0 baris dihapus, blok terbaca, tepat satu kunci "kunciPascaBeku", EOL dipertahankan`,
      barisDihapus(k, s) === 0 && JSON.parse(s).kunciPascaBeku.lajuLatihBeku === 17.1 && (s.match(/"kunciPascaBeku"/g) || []).length === 1 && (eol === '\n' || !/[^\r]\n/.test(s)));
    lempar = false; try { sisipPascaBeku(s, blok); } catch { lempar = true; }
    cek(`--pasca-beku (${eol === '\n' ? 'LF' : 'CRLF'}): kedua kali → menolak`, lempar);
  }
  cek('barisDihapus: suntingan satu baris terhitung 1, penyisipan murni 0', barisDihapus('a\nb\nc', 'a\nB\nc') === 1 && barisDihapus('a\nb', 'a\nx\nb\ny') === 0);
  const sk = kunciTeks(draf.join('\r\n'), '2026-10-01T00:00:00.000Z', blokK('2026-10-01T00:00:00.000Z')), sp = sisipPascaBeku(sk, { ditulis: '2026-10-02T00:00:00.000Z' });
  const sv = sisipBlok(sp, 'kunciPraVonis', { stempel: 'S', berkas: { a: 'b' }, ditulis: '2026-10-03T00:00:00.000Z' });
  let lemparPv = false; try { sisipBlok(sv, 'kunciPraVonis', { stempel: 'S' }); } catch { lemparPv = true; }
  cek('--pra-vonis: blok kedua disisipkan tanpa menghapus baris; kedua kali menolak; blok kunciPascaBeku tetap satu',
    barisDihapus(sp, sv) === 0 && JSON.parse(sv).kunciPraVonis.stempel === 'S' && lemparPv && (sv.match(/"kunciPascaBeku"/g) || []).length === 1);
  let lempar = false; try { kunciTeks('{\n  "dikunci": false,\n  "x": { "dikunci": false, "y": 1 }\n}', '2026-10-01T00:00:00.000Z', blokK('2026-10-01T00:00:00.000Z')); } catch { lempar = true; }
  cek('--kunci: baris dikunci bersarang tidak dianggap (hanya baris "dikunci": false, sendiri) → tetap satu', !lempar);
  console.log(gagal ? `${gagal} uji gagal` : 'patok-s1: semua uji lulus');
  return gagal ? 1 : 0;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(uji());
  const opsi = (n, b) => { const i = arg.indexOf(n); return i >= 0 ? path.resolve(arg[i + 1]) : b; };
  const berhenti = (pesan) => { console.error(`MENOLAK MEMATOK — ${pesan}`); process.exit(1); };
  const git = (...a) => execFileSync('git', a, { cwd: AKAR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const rel = (f) => path.relative(AKAR, f).split(path.sep).join('/');
  const bersih = (berkas) => {
    for (const f of berkas) {
      if (!fs.existsSync(f)) berhenti(`${rel(f)} tidak ada`);
      if (rel(f).startsWith('..')) berhenti(`${f} di luar repo — berkas terpatok wajib di repo dan ter-commit`);
      try { git('ls-files', '--error-unmatch', '--', rel(f)); } catch { berhenti(`${rel(f)} belum dilacak git — commit dulu`); }
    }
    const kotor = git('status', '--porcelain', '--ignored', '--', ...berkas.map(rel));
    if (kotor) berhenti(`berkas belum ter-commit bersih:\n${kotor}`);
  };
  const fPd = opsi('--pra-daftar', path.join(AKAR, 'flywheel', 'PRA-DAFTAR-GERBANG-S1.json'));
  const fBeku = opsi('--beku', path.join(DI_SINI, 'beku-v1.json'));
  const kode = INTI.penutupanKode(), berkasKode = Object.keys(kode).map((k) => path.join(AKAR, k));
  const teks = fs.readFileSync(fPd, 'utf8'), pd = JSON.parse(teks);
  const sekarang = new Date().toISOString();

  const RIW = await import(pathToFileURL(path.join(DI_SINI, 'riwayat-s1.mjs')).href);
  const gitMentah = RIW.gitDi(AKAR);
  if (arg.includes('--kunci')) {
    if (pd.dikunci !== false) berhenti(`medan dikunci = ${JSON.stringify(pd.dikunci)} (harus false) — pra-daftar dikunci SEKALI`);
    if (/"kunciAwal"/.test(teks)) berhenti('blok kunciAwal sudah ada — ditulis SEKALI');
    if (fs.existsSync(fBeku)) berhenti(`${rel(fBeku)} sudah ada — encoder dibekukan sebelum pra-daftar dikunci`);
    bersih([fPd, ...berkasKode]);
    // Tinjauan putaran 4 (B1): kunci mematok SIDIK KODE (AMBANG, BATAS, ALFA, penilai hidup di kode) + HEAD.
    const blok = { sha256Kode: INTI.sidikKode(kode), nBerkasKode: Object.keys(kode).length, commitSebelumKunci: git('rev-parse', 'HEAD'),
      alat: 'eval/gerbang-s1/patok-s1.mjs --kunci', ditulis: sekarang };
    fs.writeFileSync(fPd, kunciTeks(teks, sekarang, blok));
    console.log(`DIKUNCI ${sekarang} → ${rel(fPd)} · sidik kode ${blok.sha256Kode.slice(0, 16)} (${blok.nBerkasKode} berkas)\nLangkah berikut (operator): git add ${rel(fPd)} && git commit -m "GERBANG-S1: pra-daftar DIKUNCI ${sekarang}"\nSejak kunci TIDAK ada suntingan kode S1 maupun impor transitifnya sampai vonis.`);
    process.exit(0);
  }
  if (arg.includes('--pra-vonis')) {
    // Tinjauan putaran 3 (#3) + putaran 4 (SF1): masukan pasca-run (berkas run, skor, label DeepSeek, soal label, audit, skor
    // T2) dipatok SEBELUM vonis. Tiap berkas HANYA-TAMBAH sepanjang riwayatnya (label yang dilanjutkan sah; label/skor yang
    // diundi ulang tertangkap) dan lahir sesudah commit pasca-beku. Aturan yang sama diperiksa ULANG oleh pemuat (kode beku).
    const iS = arg.indexOf('--stempel'), stempel = iS >= 0 ? arg[iS + 1] : null;
    if (!stempel) berhenti('--stempel <stempel-run> wajib');
    if (!INTI.isoUtc(pd.dikunci) || !INTI.isoUtc(pd.kunciPascaBeku?.ditulis) || (teks.match(/"kunciPascaBeku"/g) || []).length !== 1) berhenti('pra-daftar belum dikunci, atau blok kunciPascaBeku belum ada / tidak tepat satu');
    if (/"kunciPraVonis"/.test(teks)) berhenti('blok kunciPraVonis sudah ada — ditulis SEKALI');
    bersih([fPd]);
    const relPd = rel(fPd);
    const rk = RIW.commitPatok(gitMentah, { relPd, teksKini: teks, sampai: 'kunciPascaBeku' });
    if (rk.masalah.length) berhenti(rk.masalah.join('; '));
    const dir = opsi('--dir', INTI.DIR_HASIL);
    const berkasRun = fs.readdirSync(dir).filter((x) => /^s1-.*\.json$/.test(x)).map((x) => path.join(dir, x));
    if (!berkasRun.some((f) => path.basename(f) === `s1-selesai-${stempel}.json`)) berhenti(`s1-selesai-${stempel}.json tidak ada di ${rel(dir)}`);
    const semua = [...berkasRun, ...berkasPascaRun(stempel).map((x) => path.join(dir, x)),
      opsi('--t2-skor', path.join(DI_SINI, 'skor-T2-S.jsonl')), opsi('--t2-skor-sq', path.join(DI_SINI, 'skor-T2-Sq.jsonl'))];
    bersih(semua);
    const head = git('rev-parse', 'HEAD');
    const masalahRiwayat = semua.flatMap((f) => RIW.periksaBerkasHasil(gitMentah, { cPv: head, cPb: rk.cPb, rel: rel(f), shaIsi: INTI.shaTeksIsi, shaPatok: INTI.shaTeks(f) }));
    if (masalahRiwayat.length) berhenti(`riwayat berkas hasil:\n  ${masalahRiwayat.slice(0, 8).join('\n  ')}`);
    const blok = { stempel, berkas: Object.fromEntries(semua.map((f) => [rel(f), INTI.shaTeks(f)])), commitSaatPatok: git('rev-parse', 'HEAD'),
      alat: 'eval/gerbang-s1/patok-s1.mjs --pra-vonis', ditulis: sekarang };
    fs.writeFileSync(fPd, sisipBlok(teks, 'kunciPraVonis', blok));
    console.log(`kunciPraVonis DITULIS ${sekarang} → ${relPd} (${semua.length} berkas)\nLangkah berikut (operator): git add ${relPd} && git commit -m "GERBANG-S1: kunciPraVonis ${stempel}" — lalu vonis SEKALI dari worktree commit kunci.`);
    process.exit(0);
  }
  if (!arg.includes('--pasca-beku')) { console.error('pakai: --kunci | --pasca-beku [opsi] | --pra-vonis --stempel <s> [opsi] | --uji'); process.exit(2); }

  const f = {
    jawabanLatih: opsi('--jawaban-latih', path.join(DI_SINI, 'jawaban-latih-v1.jsonl')), labelLatih: opsi('--label-latih', path.join(DI_SINI, 'label-ds-latih-v1.jsonl')),
    soalLatih: opsi('--soal-latih', path.join(DI_SINI, 'soal-latih-v1.jsonl')), jawabanT2: opsi('--jawaban-t2', path.join(DI_SINI, 'jawaban-uji2-v1.jsonl')),
    validasiKunci: opsi('--validasi-kunci', path.join(DI_SINI, 'validasi-kunci-v1b.json')), validasiHasil: opsi('--validasi-hasil', path.join(DI_SINI, 'validasi-fahmi-v1b.json')),
    auditBocor: opsi('--audit-bocor', path.join(DI_SINI, 'audit-bocor-v1.json')), data: opsi('--data', path.join(DI_SINI, 'data-latih-v1.jsonl')),
    soalT2: opsi('--soal-t2', path.join(DI_SINI, 'soal-uji2-v1.jsonl')),
  };
  const dirHasil = opsi('--dir', INTI.DIR_HASIL);
  // 1. urutan: dikunci dulu (dengan kunciAwal), blok belum ada
  if (!INTI.isoUtc(pd.dikunci) || !pd.kunciAwal) berhenti('pra-daftar belum dikunci dengan patok-s1 --kunci (dikunci ISO Z + blok kunciAwal)');
  if (/"kunciPascaBeku"/.test(teks)) berhenti('blok kunciPascaBeku sudah ada — ditulis SEKALI');
  // 2. semua yang dipatok & kode: dilacak dan bersih
  bersih([fPd, fBeku, ...Object.values(f), ...berkasKode]);
  const beku = JSON.parse(fs.readFileSync(fBeku, 'utf8'));
  // 2b. Tinjauan putaran 4 (B1): riwayat kunci sah (satu commit kunciAwal, teks sesudahnya hanya bertambah), kode beku = kode
  //     saat KUNCI, dan beku lahir sesudah commit kunci.
  const rk = RIW.commitPatok(gitMentah, { relPd: rel(fPd), teksKini: teks, sampai: 'kunciAwal' });
  if (rk.masalah.length) berhenti(rk.masalah.join('; '));
  if (INTI.sidikKode(beku.sha256Kode) !== pd.kunciAwal.sha256Kode) berhenti('kode yang dibekukan ≠ kode saat pra-daftar DIKUNCI (kunciAwal.sha256Kode) — aturan berubah sesudah kunci');
  if (beku.commitKunciAwal !== rk.cK || !RIW.leluhur(gitMentah, rk.cK, beku.commitBeku) || rk.cK === beku.commitBeku) berhenti(`beku tidak lahir sesudah commit kunci ${rk.cK.slice(0, 12)} (commitBeku ${String(beku.commitBeku).slice(0, 12)})`);
  // 3. kode: commitBeku ada, tidak ada perubahan penutupan sesudahnya, sidik sekarang = manifes (sebelum penurunan ulang manifes:
  //    pesannya lebih spesifik)
  if (!/^[0-9a-f]{40}$/.test(String(beku.commitBeku))) berhenti('manifes beku tanpa commitBeku');
  try { git('cat-file', '-e', `${beku.commitBeku}^{commit}`); } catch { berhenti(`commitBeku ${beku.commitBeku} tidak ada di repo ini`); }
  const berubah = git('diff', '--name-only', beku.commitBeku, 'HEAD', '--', ...Object.keys(kode));
  if (berubah) berhenti(`kode penutupan berubah sesudah commitBeku:\n${berubah}`);
  const beda = INTI.bedaKode(kode, beku.sha256Kode);
  if (beda.length) berhenti(`sidik kode sekarang ≠ manifes beku (${beda.length} berkas, mis. ${beda.slice(0, 3).join(', ')})`);
  // 4. waktu: encoder dibekukan SESUDAH pra-daftar dikunci
  if (!INTI.isoUtc(beku.dibekukan) || !(Date.parse(beku.dibekukan) > Date.parse(pd.dikunci))) berhenti(`encoder dibekukan (${beku.dibekukan}) tidak sesudah pra-daftar dikunci (${pd.dikunci})`);
  // 2c. Putaran 4 (SF3): kunci validasi = pra-komitmen.
  const pk = INTI.periksaKunciValidasi(f.validasiKunci);
  if (!pk.ok) berhenti(`kunci validasi ≠ pra-komitmen (sha ${String(pk.dapat).slice(0, 12)} ≠ ${String(pk.harap).slice(0, 12)})`);
  // 2d. Putaran 4 (SF2): manifes DITURUNKAN ULANG dari folder model + data (ambang/sidik yang disunting tangan tertangkap).
  const { hitungManifes } = await import(pathToFileURL(path.join(DI_SINI, 'beku.mjs')).href);
  const hm = hitungManifes({ fData: f.data, dirS: beku.S.dir, dirSq: beku.Sq.dir });
  if (hm.masalah.length) berhenti(`manifes tidak bisa diturunkan ulang: ${hm.masalah.join('; ')}`);
  const { _, dibekukan, commitBeku: _cb, commitKunciAwal: _ck, ...bekuInti } = beku;
  if (INTI.jsonKanonik(bekuInti) !== INTI.jsonKanonik(hm.manifes)) {
    const beda = Object.keys({ ...bekuInti, ...hm.manifes }).filter((k) => INTI.jsonKanonik(bekuInti[k] ?? null) !== INTI.jsonKanonik(hm.manifes[k] ?? null));
    berhenti(`manifes beku ≠ diturunkan ulang dari folder model/data (medan: ${beda.join(', ')})`);
  }
  // 2e. Putaran 4 (SF9): T2 lengkap & sah SEBELUM dipatok (buta hasil: hanya kunci, GALAT, dan digest).
  const { efektifT2 } = await import(pathToFileURL(path.join(DI_SINI, 'vonis-s1.mjs')).href);
  const bacaJ = (p) => fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const buangT2 = new Set(JSON.parse(fs.readFileSync(f.auditBocor, 'utf8')).buang.map((b) => (typeof b === 'string' ? b : b.id)));
  const t2 = efektifT2(bacaJ(f.jawabanT2).filter((r) => !buangT2.has(r.id)), bacaJ(f.soalT2).filter((s) => !buangT2.has(s.id)).map((s) => s.id));
  const digestT2 = t2.efektif.filter((r) => r.hasil !== 'GALAT' && r.digest !== INTI.DIGEST_PIN).length;
  const bocorT2 = bacaJ(f.jawabanT2).filter((r) => buangT2.has(r.id)).length;
  if (t2.hilang.length || t2.asing.length || t2.ganda.length || t2.galatPct > 10 || digestT2 || bocorT2) berhenti(`jawaban T2 belum sah: hilang ${t2.hilang.length}, asing ${t2.asing.length}, ganda ${t2.ganda.length}, GALAT ${t2.galatPct.toFixed(1)} %, digest ≠ pin ${digestT2}, soal DIBUANG audit ${bocorT2} — lengkapi/ulang dengan jawab.mjs --kecuali sebelum dipatok`);
  // 5. validasi buta lulus + arbitrase = aturan label di manifes
  const { hitung: hitungValidasi, arbitrase } = await import(pathToFileURL(path.join(DI_SINI, 'validasi.mjs')).href);
  const { bangun, aturanJebakanDari } = await import(pathToFileURL(path.join(DI_SINI, 'bangun-data.mjs')).href);
  const v = hitungValidasi(JSON.parse(fs.readFileSync(f.validasiKunci, 'utf8')).kunci, JSON.parse(fs.readFileSync(f.validasiHasil, 'utf8')));
  if (v.belum) berhenti(`validasi buta belum lengkap (${v.belum} butir)`);
  if (!v.lulus) berhenti(`validasi buta TIDAK lulus (${JSON.stringify(v.per)}) — pra-daftar: satu perbaikan rubrik v2 boleh sebelum latih; gagal lagi = TIDAK_SAH_INSTRUMEN`);
  const arb = arbitrase(v);
  if (beku.kasusArbitrase !== arb.kasus || beku.aturanLabelJebakan !== aturanJebakanDari(arb.kasus)) berhenti(`manifes beku: arbitrase '${beku.kasusArbitrase}'/${beku.aturanLabelJebakan}, validasi terpatok: '${arb.kasus}'/${aturanJebakanDari(arb.kasus)}`);
  // 6. data latih yang dibekukan = dibangun ulang dari masukan terpatok (mengikat jawaban + label + validasi + audit ke beku)
  const bacaJsonl = (p) => fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const buang = new Set(JSON.parse(fs.readFileSync(f.auditBocor, 'utf8')).buang.map((b) => (typeof b === 'string' ? b : b.id)));
  const ulang = bangun(bacaJsonl(f.soalLatih), bacaJsonl(f.jawabanLatih), bacaJsonl(f.labelLatih), buang, { aturanJebakan: aturanJebakanDari(arb.kasus) });
  if (ulang.tanpaLabelDs) berhenti(`${ulang.tanpaLabelDs} jawaban latih tanpa label DeepSeek`);
  const shaData = shaIsi(ulang.baris.map((b) => JSON.stringify(b)).join('\n') + '\n');
  if (shaData !== beku.sha256DataLatih) berhenti(`data latih di manifes (${String(beku.sha256DataLatih).slice(0, 12)}) ≠ dibangun ulang dari masukan terpatok (${shaData.slice(0, 12)})`);
  // 7. belum ada run utama P/G
  const runUtama = fs.existsSync(dirHasil) ? fs.readdirSync(dirHasil).filter((x) => /^s1-(selesai|pralintas-probe|[PG]-p\d\d)-/.test(x) && !/-asap\.json$/.test(x)) : [];
  if (runUtama.length) berhenti(`sudah ada berkas run utama P/G di ${rel(dirHasil)} (mis. ${runUtama[0]}) — patok harus mendahului run`);
  // 8. tulis blok
  const { hitungLajuLatih } = await import(pathToFileURL(path.join(DI_SINI, 'vonis-s1.mjs')).href);
  const blok = {
    sha256Manifes: INTI.shaTeks(fBeku), lajuLatihBeku: hitungLajuLatih(f.soalLatih, f.jawabanLatih),
    sha256JawabanLatih: INTI.shaTeks(f.jawabanLatih), sha256JawabanT2: INTI.shaTeks(f.jawabanT2),
    sha256ValidasiKunci: INTI.shaTeks(f.validasiKunci), sha256ValidasiHasil: INTI.shaTeks(f.validasiHasil),
    sha256LabelLatih: INTI.shaTeks(f.labelLatih), sha256DataLatih: shaData, kasusArbitrase: arb.kasus,
    commitBeku: beku.commitBeku, commitSaatPatok: git('rev-parse', 'HEAD'), goNoGo: beku.goNoGo ?? null,
    alat: 'eval/gerbang-s1/patok-s1.mjs --pasca-beku', ditulis: sekarang,
  };
  fs.writeFileSync(fPd, sisipPascaBeku(teks, blok));
  console.log(`kunciPascaBeku DITULIS ${sekarang} → ${rel(fPd)}\n  laju latih ${blok.lajuLatihBeku} · arbitrase (${arb.kasus}) · manifes ${blok.sha256Manifes.slice(0, 12)} · data ${shaData.slice(0, 12)}`);
  if (beku.goNoGo?.beriTahuFahmi) console.log(`PERINGATAN go/no-go: r2 = ${beku.goNoGo.r2} < ${beku.goNoGo.ambang} — beri tahu Fahmi SEBELUM run P/G.`);
  console.log(`Langkah berikut (operator): git add ${rel(fPd)} && git commit -m "GERBANG-S1: kunciPascaBeku ${sekarang}" — hash commit itu = commitKunci.`);
}
