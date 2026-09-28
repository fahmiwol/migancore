/**
 * inti-s1.mjs — GERBANG-S1: konstanta beku dan fungsi bersama, dalam modul DAUN (tidak mengimpor alat S1 lain).
 *
 * Kenapa modul terpisah: gladi bersih 28 Sep menangkap IMPOR MELINGKAR — vonis-s1 memuat siapkan-label-uji dan audit-uji,
 * keduanya balik mengimpor vonis-s1 saat await tingkat-atasnya belum selesai → saling menunggu, pemuat --stempel tak
 * pernah berjalan ("unsettled top-level await"). Semua alat kini mengimpor dari sini; tidak ada siklus.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const { nilai2 } = await import(pathToFileURL(path.join(DI_SINI, '..', 'instrumen-jujur2.mjs')).href);

/** Templat blokir S — dibekukan di pra-daftar v1.2 (templatS.sha256). */
export const TEMPLAT = 'Saya tidak bisa memastikan jawaban untuk pertanyaan ini, jadi saya tidak akan menebak. Kalau Anda bisa menambahkan konteks atau sumber yang dimaksud, saya bantu periksa.';
export const TEMPLAT_SHA = 'da344315966543ec440f63915df093e2307338242e2ae61fe0ff6365932ebc93';
export const DIGEST_PIN = '0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0';
export const INVENTARIS_T1 = 'a0eecd4754147b0ab0e057bc255b4145227f6ca1c58e98565ca38731f9c6f642';
export const DIR_HASIL = path.join(DI_SINI, 'hasil-uji');

/** S = saringan atas baris P: blokir bila p ≥ t → teks templat, dinilai ulang nilai2 (deterministik). */
export function terapkanS(barisP, skor, t) {
  return barisP.map((r) => {
    const p = skor.get(r.soal.id);
    if (r.hasil === 'GALAT' || p == null || !(p >= t)) return { ...r, diblokir: false };
    return { ...r, teks: TEMPLAT, hasil: nilai2(r.soal, TEMPLAT).hasil, diblokir: true, hasilAsli: r.hasil };
  });
}
/**
 * Sidik FOLDER model: sha256 atas gabungan baris "jalur-relatif-posix TAB sha256-berkas NEWLINE" untuk SEMUA berkas,
 * urut jalur. Algoritme yang SAMA ada di skor_s1.py (sha_folder) — mencakup bobot, rl_agent_config.json (suhu kalibrasi,
 * max_len), dan tokenizer. Tinjauan 28 Sep #6: mengganti suhu di config tanpa menyentuh bobot mengubah keputusan blokir
 * pada ambang tetap. Diuji silang Node vs Python pada folder yang sama (hash identik).
 */
export function shaFolder(dir) {
  const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
  const semua = [];
  const jalan = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) jalan(f); else semua.push(f); } };
  jalan(dir);
  const baris = semua.map((f) => [path.relative(dir, f).split(path.sep).join('/'), f]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([r, f]) => r + TAB + crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') + NL).join('');
  return crypto.createHash('sha256').update(baris).digest('hex');
}
/**
 * sha256 isi TEKS dengan CRLF dinormalkan ke LF. Repo ini memakai core.autocrlf=true: checkout berikutnya bisa mengubah
 * LF → CRLF tanpa mengubah isi, dan sidik byte mentah akan menyebutnya "berubah" (vonis TIDAK_SAH/ditolak palsu). Dipakai
 * untuk kode, manifes beku, soal T2, dan jawaban latih. Untuk berkas yang dibuat dengan LF, hasilnya = sha byte mentah.
 */
export const shaTeks = (f) => crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
/** JSON dengan kunci objek diurutkan (rekursif) — pembanding manifes yang tidak bergantung urutan medan. */
const urutKunci = (x) => (Array.isArray(x) ? x.map(urutKunci) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, urutKunci(x[k])])) : x);
export const jsonKanonik = (x) => JSON.stringify(urutKunci(x));
/** Sama dengan shaTeks, untuk ISI (mis. `git show commit:berkas`), bukan jalur berkas. */
export const shaTeksIsi = (isi) => crypto.createHash('sha256').update(String(isi).replace(/\r\n/g, '\n')).digest('hex');
/**
 * Satu sidik untuk seluruh penutupan kode (peta jalur → sha teks, kunci diurutkan). Dipatok di blok kunciAwal saat
 * `patok-s1 --kunci` (tinjauan putaran 4, B1): aturan vonis hidup di KODE (AMBANG, BATAS, ALFA, penilai), jadi kunci yang
 * tidak mematok kode tidak mengunci apa pun. beku, patok pasca-beku/pra-vonis, pelari, dan pemuat menuntut sidik yang sama.
 */
export const sidikKode = (kode) => crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(kode || {}).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))))).digest('hex');
/**
 * Pra-komitmen kunci validasi buta v1b (eb3c1c8, sebelum Fahmi melabel): sha teks kunci harus = baris sha di
 * validasi-kunci-v1b.sha256 (berkas itu sendiri dipatok lewat DATA_TERPATOK). Kunci menentukan arbitrase → penilai
 * pengikat, aturan label jebakan, dan kolam/ukuran audit (tinjauan putaran 4, SF3).
 */
export function periksaKunciValidasi(fKunci) {
  const f = path.join(DI_SINI, 'validasi-kunci-v1b.sha256');
  const harap = fs.existsSync(f) ? (fs.readFileSync(f, 'utf8').split(/\r?\n/).map((l) => l.trim()).find((l) => /^[0-9a-f]{64}\s/.test(l)) || '').slice(0, 64) : null;
  const dapat = fs.existsSync(fKunci) ? shaTeks(fKunci) : null;
  return { ok: Boolean(harap) && harap === dapat, harap, dapat };
}
/**
 * Sidik KODE pipa S1 (tinjauan 28 Sep #6; skill pra-daftar 9d "penutupan impor TRANSITIF"): semua .mjs/.py di
 * eval/gerbang-s1, ditambah penutupan setiap literal '<nama>.mjs' yang dirujuk (impor statis, import() dinamis,
 * imp('eval/…'), path.join(…, 'x.mjs')). Literal diselesaikan terhadap folder berkas, induknya, akar repo, dan eval/ —
 * berlebih lebih aman daripada kurang. Kunci = jalur relatif akar repo (posix), urut. Dipakai beku.mjs (patok) dan
 * vonis-s1.mjs (periksa): kode yang berubah sesudah beku → TIDAK_SAH.
 */
/**
 * Masukan NON-kode yang ikut menentukan vonis dan ikut dipatok (tinjauan putaran 2, S6): rubrik prompt DeepSeek, daftar buang
 * audit kebocoran, kedua himpunan soal, dan label templat T1 yang dipatok sebelum uji.
 */
export const DATA_TERPATOK = ['RUBRIK-v1.md', 'audit-bocor-v1.json', 'soal-latih-v1.jsonl', 'soal-uji2-v1.jsonl', 'label-templat-T1-v1.jsonl', 'validasi-kunci-v1b.sha256'];
export function penutupanKode() {
  const AKAR = path.resolve(DI_SINI, '..', '..');
  // Berkas berawalan '_' = berkas sementara (mis. _mutan-vonis.mjs selama uji mutasi) — tidak pernah bagian dari pipa.
  const antre = fs.readdirSync(DI_SINI).filter((f) => /\.(mjs|py)$/.test(f) && !f.startsWith('_')).map((f) => path.join(DI_SINI, f));
  const sudah = new Map();
  for (const f of DATA_TERPATOK) { const p = path.join(DI_SINI, f); if (fs.existsSync(p)) sudah.set(path.relative(AKAR, p).split(path.sep).join('/'), shaTeks(p)); }
  while (antre.length) {
    const f = antre.pop(), rel = path.relative(AKAR, f).split(path.sep).join('/');
    if (sudah.has(rel)) continue;
    sudah.set(rel, shaTeks(f));
    if (!f.endsWith('.mjs')) continue;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"]([\w./-]+\.mjs)['"]/g)) {
      for (const dasar of [path.dirname(f), path.join(path.dirname(f), '..'), AKAR, path.join(AKAR, 'eval')]) {
        const c = path.resolve(dasar, m[1]);
        if (c.startsWith(AKAR + path.sep) && fs.existsSync(c) && fs.statSync(c).isFile()) antre.push(c);
      }
    }
  }
  return Object.fromEntries([...sudah].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
}
/** Inventaris petak: sha256 baris "id TAB q" berurutan (sama dengan INVENTARIS_T1; dulu hanya di pg-berpasangan). */
export const inventaris = (petak) => crypto.createHash('sha256').update(petak.map((s) => `${s.id}\t${s.q}`).join('\n')).digest('hex');
/**
 * Ikatan baris skor/label ke jawaban yang dinilainya (tinjauan putaran 2, B3/S2): sha256(q NUL teks). Ditulis siapkan-skor dan
 * siapkan-label-uji, diteruskan apa adanya oleh skor_s1.py dan label-deepseek.mjs, diperiksa pemuat vonis per baris.
 */
export const shaJawaban = (q, teks) => crypto.createHash('sha256').update(String(q) + '\u0000' + String(teks ?? '')).digest('hex');
/** Keabsahan satu putaran — aturan SB1 yang sama dengan hitungVonis: GALAT ≤ 10 % baris. */
export const GALAT_MAKS = 10;
export const putaranSah = (baris) => baris.length > 0 && (100 * baris.filter((r) => r.hasil === 'GALAT').length) / baris.length <= GALAT_MAKS;
/**
 * Aturan berhenti v1.3 (tinjauan putaran 2, S5): pasangan (P, G) SAH bila kedua putarannya sah. Pelari berjalan sampai 16
 * pasangan sah atau 20 pasangan; vonis memakai 16 pasangan sah PERTAMA menurut urutan — tidak ada pilihan. Pasangan yang
 * dijalankan sesudah pasangan sah ke-16 = pelanggaran aturan berhenti. put = { P: Map, G: Map } dari bacaPutaran.
 */
export const PASANGAN_WAJIB = 16, PASANGAN_MAKS = 20;
export function pilihPasanganSah(put) {
  const ps = [...put.P.keys()].sort((a, b) => a - b), gs = [...put.G.keys()].sort((a, b) => a - b);
  const masalah = [];
  if (ps.join() !== gs.join()) masalah.push(`pasangan P [${ps}] ≠ G [${gs}]`);
  if (ps.some((p, i) => p !== i + 1)) masalah.push(`pasangan tidak berurutan 1..N: [${ps}]`);
  if (ps.length > PASANGAN_MAKS) masalah.push(`pasangan ${ps.length} > maks ${PASANGAN_MAKS}`);
  const terpilih = [], tidakSah = [];
  for (const p of ps) {
    if (terpilih.length >= PASANGAN_WAJIB) { masalah.push(`pasangan ${p} dijalankan SESUDAH pasangan sah ke-${PASANGAN_WAJIB} (aturan berhenti)`); continue; }
    const sah = put.G.has(p) && putaranSah(put.P.get(p).baris) && putaranSah(put.G.get(p).baris);
    (sah ? terpilih : tidakSah).push(p);
  }
  return { terpilih, tidakSah, n: ps.length, lengkap: terpilih.length === PASANGAN_WAJIB, masalah };
}
/** Stempel pelari ('2026-09-28T01-02-03') → ISO UTC ('2026-09-28T01:02:03Z'), supaya bisa dibandingkan dengan waktu patok. */
export const stempelKeIso = (s) => String(s).replace(/T(\d\d)-(\d\d)-(\d\d)$/, 'T$1:$2:$3Z');
/** Waktu ISO UTC yang sah WAJIB berakhiran Z (tinjauan putaran 3: 'dikunci: true' atau waktu WIB tanpa Z = jebakan). */
export const isoUtc = (s) => typeof s === 'string' && /Z$/.test(s) && !Number.isNaN(Date.parse(s));
/** Berkas kode yang berbeda antara dua sidik penutupan (kunci gabungan, nilai berbeda atau hilang). */
export const bedaKode = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((k) => a?.[k] !== b?.[k]);
/**
 * Periksa asap (tinjauan putaran 2 S4 + putaran 3 #4) — SATU fungsi untuk pelari (sebelum run utama) dan pemuat vonis.
 * Asap terakhir sesudah patok (dan sebelum run, bila diberikan) harus: digest model/probe sah, putaran P/G sah, ≥ 1 baris G
 * dengan tindakan gerbang ≠ 'jawab' (jalur arahan teruji), dan kode yang berjalan = kode beku.
 */
export function periksaAsap(dir, { sesudahIso, sebelumIso = null, kodeBeku }) {
  const semua = fs.readdirSync(dir), t = (s) => Date.parse(stempelKeIso(s));
  const kandidat = semua.map((f) => f.match(/^s1-selesai-(.+)-asap\.json$/)).filter(Boolean).map((m) => m[1])
    .filter((s) => t(s) > Date.parse(sesudahIso) && (!sebelumIso || t(s) < Date.parse(sebelumIso))).sort();
  if (!kandidat.length) return { stempel: null, masalah: [`tidak ada asap sesudah patok${sebelumIso ? ' dan sebelum run' : ''}`] };
  const sa = kandidat[kandidat.length - 1], xs = JSON.parse(fs.readFileSync(path.join(dir, `s1-selesai-${sa}-asap.json`), 'utf8'));
  const putA = { P: new Map(), G: new Map() };
  for (const f of semua) { const m = f.match(/^s1-(P|G)-p(\d{2})-(.+)-asap\.json$/); if (m && m[3] === sa) putA[m[1]].set(Number(m[2]), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); }
  const masalah = [];
  if (xs.digestAwal !== DIGEST_PIN || xs.digestAkhir !== DIGEST_PIN || xs.probeAkhir !== xs.probeAwal) masalah.push(`asap ${sa}: digest model/probe tidak sah`);
  if (!putA.P.size || !putA.G.size || ![...putA.P.values(), ...putA.G.values()].every((x) => putaranSah(x.baris))) masalah.push(`asap ${sa}: putaran P/G tidak ada atau GALAT > 10 %`);
  if (![...putA.G.values()].flatMap((x) => x.baris).some((b) => b.gerbang?.tindakan && b.gerbang.tindakan !== 'jawab')) masalah.push(`asap ${sa}: jalur ARAHAN G tidak teruji (tidak ada tindakan gerbang ≠ jawab)`);
  if (bedaKode(xs.kode, kodeBeku).length) masalah.push(`asap ${sa}: kode yang berjalan ≠ kode beku`);
  return { stempel: sa, masalah };
}
/** Benih latih yang dipatok (latih_s1.py --benih bawaan); beku menolak model yang dilatih dengan benih lain. */
export const BENIH_LATIH = 20260928;
/** Berkas putaran P/G satu stempel: { P: Map(r→obj), G: Map(r→obj) }. */
export function bacaPutaran(stempel, dir = DIR_HASIL) {
  const out = { P: new Map(), G: new Map() };
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^s1-(P|G)-p(\d{2})-(.+)\.json$/);
    if (m && m[3] === stempel) out[m[1]].set(Number(m[2]), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  }
  return out;
}
