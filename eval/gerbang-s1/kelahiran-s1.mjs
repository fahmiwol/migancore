#!/usr/bin/env node
/**
 * kelahiran-s1.mjs — kriteria kelahiran MAKSARA sejak keputusan Fahmi 28 Sep 2026 menyetujui usul
 * "MAKSARA lahir = Gerbang-S1 MENANG" (doc 103 amandemen 28 Sep).
 *
 * Satu perhitungan untuk semua pembaca (dunia Studio 2D/3D, migan status kelak). Dibaca dari vonis pra-daftarnya —
 * tidak ada persen kemajuan, tidak ada tebakan:
 *   LAHIR  — vonis.keadaan 'lulus', vonis.hasil MENANG_SETARA / MENANG_LEBIH_BAIK, DAN berkas vonis TERHITUNG (vonis.berkas,
 *            ditulis vonis-s1.mjs) memuat vonis yang sama — tulisan tangan saja tidak cukup (tinjauan putaran 2, minor);
 *   GUGUR  — vonis.keadaan 'gagal', ATAU vonis.hasil diawali DIHENTIKAN (dihentikan sebelum diuji — tidak ada jalan
 *            lagi menuju MENANG, penghentian 28 Sep), ATAU tenggat syarat mati lewat tanpa vonis MENANG (MiganCore ditutup);
 *   EMBRIO — selain itu (belum bervonis, masih dalam tenggat).
 * Kriteria lama (A4-BARU atas bobot generatif, eval/ambang-bibit.mjs — berkas terpatok D1) tidak disunting; ia basi
 * sejak belok 27 Sep dan tetap ditampilkan sebagai SEJARAH.
 *
 *   node eval/gerbang-s1/kelahiran-s1.mjs            # cetak status
 *   node eval/gerbang-s1/kelahiran-s1.mjs --uji
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { sidikKode } = await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'inti-s1.mjs')).href);

const AKAR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SUMBER = 'flywheel/PRA-DAFTAR-GERBANG-S1.json';
export const TENGGAT = '2026-10-11';
export const KEPUTUSAN = "Fahmi, 28 Sep 2026: \"ya\" — MAKSARA lahir = Gerbang-S1 MENANG (doc 103, amandemen 28 Sep).";

/** Fungsi murni: pra-daftar (objek) + tanggal hari ini (YYYY-MM-DD) + vonis terhitung (dari berkas vonis-s1, atau null) → status. */
export function tingkatDari(pd, hariIni, vonisTerhitung = null) {
  const v = pd?.vonis || {};
  const hasil = typeof v.hasil === 'string' ? v.hasil : '';
  const menang = /^MENANG_(SETARA|LEBIH_BAIK)\b/.test(hasil);
  const cocok = typeof vonisTerhitung === 'string' && hasil.split(/[\s—]/)[0] === vonisTerhitung;
  if (v.keadaan === 'lulus' && menang && cocok) return 'LAHIR';
  if (v.keadaan === 'gagal') return 'GUGUR';
  if (/^DIHENTIKAN\b/.test(hasil)) return 'GUGUR';
  if (hariIni > TENGGAT && !menang) return 'GUGUR';
  return 'EMBRIO';
}
export function statusKelahiranS1(akar = AKAR, hariIni = new Date().toISOString().slice(0, 10)) {
  const f = path.join(akar, SUMBER);
  if (!fs.existsSync(f)) return null;
  const pd = JSON.parse(fs.readFileSync(f, 'utf8'));
  const fv = pd.vonis?.berkas ? path.join(akar, pd.vonis.berkas) : null;
  const vf = fv && fs.existsSync(fv) ? JSON.parse(fs.readFileSync(fv, 'utf8')) : null;
  // Tinjauan putaran 4 (minor): vonis hanya terhitung bila dihitung dengan KODE KUNCI (sidik kodeSha = kunciAwal.sha256Kode).
  const kodeCocok = Boolean(vf?.kodeSha && pd.kunciAwal?.sha256Kode && sidikKode(vf.kodeSha) === pd.kunciAwal.sha256Kode);
  const vonisTerhitung = vf && kodeCocok ? vf.vonis ?? null : null;
  const hariTersisa = Math.round((Date.parse(`${TENGGAT}T23:59:59Z`) - Date.parse(`${hariIni}T00:00:00Z`)) / 864e5);
  return {
    kriteria: 'Gerbang-S1 MENANG_SETARA atau MENANG_LEBIH_BAIK', keputusan: KEPUTUSAN, sumber: SUMBER,
    tingkat: tingkatDari(pd, hariIni, vonisTerhitung), dikunci: Boolean(pd.dikunci), vonisTerhitung, kodeVonisCocokKunci: vf ? kodeCocok : null,
    vonis: { hasil: pd.vonis?.hasil ?? null, keadaan: pd.vonis?.keadaan ?? null, tanggal: pd.vonis?.tanggal ?? null },
    tenggat: TENGGAT, hariTersisa: Math.max(0, hariTersisa),
    kriteriaLama: 'A4-BARU atas bobot generatif (eval/ambang-bibit.mjs) — basi sejak belok 27 Sep; ditampilkan sebagai sejarah.',
  };
}

function uji() {
  let gagal = 0; const cek = (n, ok) => { console.log(`${ok ? '✓' : '✗'} ${n}`); if (!ok) gagal++; };
  cek('belum bervonis dalam tenggat → EMBRIO', tingkatDari({ vonis: { hasil: 'BELUM DIJALANKAN', keadaan: 'belum' } }, '2026-09-28') === 'EMBRIO');
  cek('MENANG_SETARA lulus + berkas terhitung sama → LAHIR', tingkatDari({ vonis: { hasil: 'MENANG_SETARA — …', keadaan: 'lulus' } }, '2026-10-02', 'MENANG_SETARA') === 'LAHIR');
  cek('MENANG_LEBIH_BAIK lulus + berkas terhitung sama → LAHIR', tingkatDari({ vonis: { hasil: 'MENANG_LEBIH_BAIK', keadaan: 'lulus' } }, '2026-10-02', 'MENANG_LEBIH_BAIK') === 'LAHIR');
  cek('MENANG tertulis TANPA berkas vonis terhitung → bukan LAHIR', tingkatDari({ vonis: { hasil: 'MENANG_SETARA', keadaan: 'lulus' } }, '2026-10-02', null) === 'EMBRIO');
  cek('MENANG tertulis, berkas terhitung TIDAK_MENANG → bukan LAHIR', tingkatDari({ vonis: { hasil: 'MENANG_SETARA', keadaan: 'lulus' } }, '2026-10-02', 'TIDAK_MENANG') === 'EMBRIO');
  cek('TIDAK_MENANG gagal → GUGUR', tingkatDari({ vonis: { hasil: 'TIDAK_MENANG', keadaan: 'gagal' } }, '2026-10-02') === 'GUGUR');
  cek('tenggat lewat tanpa MENANG → GUGUR', tingkatDari({ vonis: { hasil: 'BELUM', keadaan: 'belum' } }, '2026-10-12') === 'GUGUR');
  cek('DIHENTIKAN (netral, tidak diuji) dalam tenggat → GUGUR', tingkatDari({ vonis: { hasil: 'DIHENTIKAN 28 Sep — bukan vonis', keadaan: 'netral' } }, '2026-09-28') === 'GUGUR');
  cek('kata DIHENTIKAN di tengah teks tidak dihitung', tingkatDari({ vonis: { hasil: 'BELUM — tidak DIHENTIKAN', keadaan: 'belum' } }, '2026-09-28') === 'EMBRIO');
  cek('kata MENANG di tengah teks TIDAK dihitung (awalan saja)', tingkatDari({ vonis: { hasil: 'TIDAK_MENANG_SETARA', keadaan: 'lulus' } }, '2026-10-02') === 'EMBRIO');
  cek('status nyata terbaca dari pra-daftar', statusKelahiranS1()?.sumber === SUMBER);
  // Putaran 4 (minor): berkas vonis yang dihitung dengan kode ≠ kode kunci tidak dihitung → bukan LAHIR.
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kelahiran-s1-'));
  try {
    const kode = { 'eval/a.mjs': '1' }, pd = (sha) => ({ kunciAwal: { sha256Kode: sha }, dikunci: '2026-10-01T00:00:00.000Z', vonis: { hasil: 'MENANG_SETARA', keadaan: 'lulus', berkas: 'v.json' } });
    fs.mkdirSync(path.join(d, 'flywheel')); fs.writeFileSync(path.join(d, 'v.json'), JSON.stringify({ vonis: 'MENANG_SETARA', kodeSha: kode }));
    fs.writeFileSync(path.join(d, SUMBER), JSON.stringify(pd(sidikKode(kode))));
    const sah = statusKelahiranS1(d, '2026-10-02');
    fs.writeFileSync(path.join(d, SUMBER), JSON.stringify(pd('0'.repeat(64))));
    const beda = statusKelahiranS1(d, '2026-10-02');
    cek('berkas vonis dengan kode = kode kunci → LAHIR; kode ≠ kunci → tidak dihitung (EMBRIO)', sah.tingkat === 'LAHIR' && sah.kodeVonisCocokKunci === true && beda.tingkat === 'EMBRIO' && beda.kodeVonisCocokKunci === false);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
  console.log(gagal ? `${gagal} uji gagal` : 'kelahiran-s1: semua uji lulus'); return gagal ? 1 : 0;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  if (process.argv.includes('--uji')) process.exit(uji());
  console.log(JSON.stringify(statusKelahiranS1(), null, 1));
}
