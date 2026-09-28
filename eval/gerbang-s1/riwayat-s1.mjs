#!/usr/bin/env node
/**
 * riwayat-s1.mjs — GERBANG-S1: pemeriksaan RIWAYAT GIT untuk tiga patok dan berkas hasil (tinjauan adversarial putaran 4,
 * 28 Sep 2026: B1, SF1, SF10). SATU modul dipakai patok-s1.mjs (peringatan dini) DAN pemuat vonis (penentu; berjalan dari
 * kode beku), supaya aturan riwayat tidak hanya hidup di alat yang dijalankan dari pohon kerja yang belum beku.
 *
 * Aturan:
 *   - tiap blok patok ("kunciAwal", "kunciPascaBeku", "kunciPraVonis") diperkenalkan oleh commit yang bisa dipastikan satu
 *     (untuk kunciPraVonis: satu per stempel), dan ketiganya berurutan secara LELUHUR (bukan menurut jam laptop);
 *   - teks pra-daftar sesudah patok hanya BERTAMBAH (0 baris dihapus terhadap teks di commit patok);
 *   - berkas hasil yang dipatok bersifat HANYA-TAMBAH sepanjang riwayatnya (mengikuti ganti nama): JSONL = tiap versi lama
 *     adalah awalan versi sesudahnya (label yang dilanjutkan sah); objek JSON hasil audit = himpunan-bagian bernilai SAMA
 *     (label yang diubah sesudah di-commit = undian ulang); berkas lain tidak boleh berubah sesudah commit pertamanya;
 *     setiap versinya lahir SESUDAH commit patok pasca-beku.
 *
 *   node eval/gerbang-s1/riwayat-s1.mjs --uji      # memakai repo git sementara di folder temp OS
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Pelari git pada satu akar (repo atau worktree). Keluaran TIDAK dipangkas (isi berkas harus utuh). */
export const gitDi = (akar) => (...a) => execFileSync('git', a, { cwd: akar, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024 });
const normal = (s) => String(s).replace(/\r\n/g, '\n');
/** Baris lama yang hilang dari teks baru (subsekuens berurutan; CRLF dinormalkan). 0 = hanya penyisipan. */
export function barisHilang(lama, baru) {
  const a = normal(lama).split('\n'), b = normal(baru).split('\n');
  let j = 0, hilang = 0;
  for (const x of a) { let k = j; while (k < b.length && b[k] !== x) k++; if (k < b.length) j = k + 1; else hilang++; }
  return hilang;
}
/** Commit di SEMUA ref yang diff-nya menyentuh baris berisi kunci JSON "<nama>" pada berkas pra-daftar (jalur relatif repo). */
export const commitBlok = (git, relPd, nama) => git('log', '--all', '--format=%H', '-G', `"${nama}"`, '--', relPd).split('\n').map((s) => s.trim()).filter(Boolean);
// cat-file, bukan show: `git show <rev>:<jalur>` mencoba stat() argumennya sebagai nama berkas dulu, dan di Windows gagal
// ("failed to stat") bila cwd + hash 40 karakter + jalur melewati batas jalur — ditemukan gladi v8 (28 Sep).
export const isiDi = (git, commit, rel) => git('cat-file', 'blob', `${commit}:${rel}`);
export function leluhur(git, a, b) { try { git('merge-base', '--is-ancestor', a, b); return true; } catch { return false; } }
/** Versi berkas sepanjang riwayat yang bisa dicapai dari `commit`, mengikuti ganti nama: [{commit, jalur, isi}] tertua → terbaru. */
export function versiBerkas(git, commit, rel) {
  const v = [];
  let kini = null;
  for (const baris of git('log', '--follow', '--format=@@%H', '--name-only', commit, '--', rel).split('\n')) {
    const t = baris.trim();
    if (!t) continue;
    if (t.startsWith('@@')) { kini = { commit: t.slice(2) }; v.push(kini); } else if (kini && !kini.jalur) kini.jalur = t;
  }
  for (const x of v) { try { x.isi = isiDi(git, x.commit, x.jalur); } catch { x.isi = null; } }
  return v.reverse();
}
const objekPolos = (x) => x && typeof x === 'object' && !Array.isArray(x);
/** Aturan hanya-tambah untuk satu berkas. jenis: 'jsonl' | 'peta' (objek JSON, kunci → nilai tetap) | 'tetap'. */
export function jenisBerkas(jalur) { return /\.jsonl$/.test(jalur) ? 'jsonl' : /audit-uji-hasil-.*\.json$/.test(jalur) ? 'peta' : 'tetap'; }
export function hanyaTambah(versi, jenis) {
  for (let i = 1; i < versi.length; i++) {
    const a = versi[i - 1], b = versi[i];
    if (a.isi == null || b.isi == null) return { ok: false, sebab: `berkas terhapus di riwayat (${(a.isi == null ? a : b).commit.slice(0, 12)})` };
    if (normal(a.isi) === normal(b.isi)) continue;
    if (jenis === 'jsonl') {
      const la = normal(a.isi).split('\n').filter((x) => x.trim()), lb = normal(b.isi).split('\n').filter((x) => x.trim());
      if (la.length <= lb.length && la.every((x, k) => x === lb[k])) continue;
      return { ok: false, sebab: `baris lama berubah/dihapus di ${b.commit.slice(0, 12)} (bukan hanya ditambah)` };
    }
    if (jenis === 'peta') {
      let pa, pb; try { pa = JSON.parse(a.isi); pb = JSON.parse(b.isi); } catch { return { ok: false, sebab: 'bukan JSON' }; }
      if (objekPolos(pa) && objekPolos(pb) && Object.keys(pa).every((k) => k in pb && JSON.stringify(pa[k]) === JSON.stringify(pb[k]))) continue;
      return { ok: false, sebab: `label lama diubah/dihapus di ${b.commit.slice(0, 12)} (undian ulang)` };
    }
    return { ok: false, sebab: `isi berubah sesudah commit pertamanya (${b.commit.slice(0, 12)})` };
  }
  return { ok: true };
}
/**
 * Periksa satu berkas hasil yang dipatok: riwayat hanya-tambah dari commit patok pra-vonis (cPv), setiap versi lahir SESUDAH
 * commit pasca-beku (cPb), dan isi di cPv = sha terpatok (lewat fungsi sha teks yang diberikan).
 */
export function periksaBerkasHasil(git, { cPv, cPb, rel, shaIsi, shaPatok }) {
  const v = versiBerkas(git, cPv, rel);
  if (!v.length) return [`${rel}: tidak ada di riwayat commit pra-vonis`];
  const masalah = [];
  const h = hanyaTambah(v, jenisBerkas(rel));
  if (!h.ok) masalah.push(`${rel}: ${h.sebab}`);
  const dini = v.filter((x) => x.commit === cPb || !leluhur(git, cPb, x.commit));
  if (dini.length) masalah.push(`${rel}: versi di ${dini[0].commit.slice(0, 12)} tidak lahir sesudah commit pasca-beku`);
  const akhir = v[v.length - 1];
  if (akhir.isi == null || shaIsi(akhir.isi) !== shaPatok) masalah.push(`${rel}: isi di commit pra-vonis ≠ sha terpatok`);
  return masalah;
}
/**
 * Tiga commit patok dari riwayat (bukan dari jam): cK (kunciAwal), cPb (kunciPascaBeku), cPv (kunciPraVonis untuk stempel ini,
 * bila diminta). Menuntut satu commit per blok, urutan leluhur cK → cPb → cPv, blok tidak berubah sesudah commit pertamanya,
 * dan teks pra-daftar di tiap commit berikutnya hanya BERTAMBAH. teksKini = pra-daftar yang dibaca alat (0 baris hilang
 * terhadap teks di commit patok terakhir yang diminta).
 */
export function commitPatok(git, { relPd, teksKini, stempel = null, sampai = 'kunciPraVonis' }) {
  const masalah = [], hasil = {};
  const satu = (nama, saring = () => true) => {
    const cs = commitBlok(git, relPd, nama).filter((c) => { try { return saring(JSON.parse(isiDi(git, c, relPd))); } catch { return false; } });
    if (cs.length !== 1) { masalah.push(`riwayat git: blok ${nama} diperkenalkan ${cs.length} commit${stempel && nama === 'kunciPraVonis' ? ` (stempel ${stempel})` : ''} — harus tepat satu`); return null; }
    return cs[0];
  };
  hasil.cK = satu('kunciAwal', (pd) => Boolean(pd.kunciAwal));
  if (sampai !== 'kunciAwal') hasil.cPb = satu('kunciPascaBeku', (pd) => Boolean(pd.kunciPascaBeku));
  if (sampai === 'kunciPraVonis') hasil.cPv = satu('kunciPraVonis', (pd) => pd.kunciPraVonis?.stempel === stempel);
  const urut = [hasil.cK, hasil.cPb, hasil.cPv].filter(Boolean);
  if (masalah.length) return { masalah, ...hasil };
  for (let i = 1; i < urut.length; i++) if (!leluhur(git, urut[i - 1], urut[i]) || urut[i - 1] === urut[i]) masalah.push(`riwayat git: ${urut[i - 1].slice(0, 12)} bukan leluhur ${urut[i].slice(0, 12)} (urutan patok)`);
  const teks = urut.map((c) => isiDi(git, c, relPd));
  for (let i = 1; i < teks.length; i++) { const h = barisHilang(teks[i - 1], teks[i]); if (h) masalah.push(`pra-daftar: ${h} baris hilang antara ${urut[i - 1].slice(0, 12)} dan ${urut[i].slice(0, 12)}`); }
  if (teksKini != null) { const h = barisHilang(teks[teks.length - 1], teksKini); if (h) masalah.push(`pra-daftar yang dibaca: ${h} baris hilang terhadap commit patok ${urut[urut.length - 1].slice(0, 12)}`); }
  // blok tidak berubah sesudah commit yang memperkenalkannya
  const pdAkhir = JSON.parse(teksKini ?? teks[teks.length - 1]);
  for (const [nama, c] of [['kunciAwal', hasil.cK], ['kunciPascaBeku', hasil.cPb], ['kunciPraVonis', hasil.cPv]]) {
    if (!c) continue;
    if (JSON.stringify(JSON.parse(isiDi(git, c, relPd))[nama]) !== JSON.stringify(pdAkhir[nama])) masalah.push(`blok ${nama} berubah sesudah commit pertamanya (${c.slice(0, 12)})`);
  }
  return { masalah, ...hasil };
}

// ─────────────────────────────── uji: repo git sementara SUNGGUHAN ───────────────────────────────
function uji() {
  let gagal = 0;
  const cek = (n, ok, d = '') => { console.log(`${ok ? '✓' : '✗'} ${n}${ok ? '' : `  ← ${d}`}`); if (!ok) gagal++; };
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'riwayat-s1-'));
  try {
    const git = gitDi(d);
    git('init', '-q'); git('config', 'user.email', 'uji@lokal'); git('config', 'user.name', 'uji'); git('config', 'core.autocrlf', 'false');
    const tulis = (rel, isi) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), isi); };
    const commit = (m) => { git('add', '-A'); git('commit', '-q', '-m', m); return git('rev-parse', 'HEAD').trim(); };
    const PD = 'flywheel/pd.json';
    const pd = (o) => JSON.stringify(o, null, 2) + '\n';
    tulis(PD, pd({ episode: 'X', dikunci: false })); commit('draf');
    tulis(PD, pd({ kunciAwal: { sha256Kode: 'k' }, episode: 'X', dikunci: '2026-10-01T00:00:00.000Z' })); const cK = commit('kunci');
    tulis('eval/beku.json', '{}'); commit('beku');
    tulis(PD, pd({ kunciPascaBeku: { m: 1 }, kunciAwal: { sha256Kode: 'k' }, episode: 'X', dikunci: '2026-10-01T00:00:00.000Z' })); const cPb = commit('pasca-beku');
    // hasil: label dilanjutkan (awalan), audit dilengkapi (himpunan-bagian), run sekali
    tulis('hasil/label-uji-ds-S.jsonl', '{"id":"a","label":null}\n'); commit('label sebagian');
    tulis('hasil/label-uji-ds-S.jsonl', '{"id":"a","label":null}\n{"id":"a","label":"BENAR"}\n'); commit('label lengkap');
    tulis('hasil/audit-uji-hasil-S.json', '{"A01":{"label":"AMAN"}}'); commit('audit sebagian');
    tulis('hasil/audit-uji-hasil-S.json', '{"A01":{"label":"AMAN"},"A02":{"label":"BLOKIR"}}'); commit('audit lengkap');
    tulis('hasil/s1-selesai-S.json', '{"x":1}'); commit('run');
    const pdPv = { kunciPraVonis: { stempel: 'S' }, kunciPascaBeku: { m: 1 }, kunciAwal: { sha256Kode: 'k' }, episode: 'X', dikunci: '2026-10-01T00:00:00.000Z' };
    tulis(PD, pd(pdPv)); const cPv = commit('pra-vonis');
    const r = commitPatok(git, { relPd: PD, teksKini: pd(pdPv), stempel: 'S' });
    cek('commitPatok: tiga commit ditemukan, berurutan leluhur, teks hanya bertambah', r.masalah.length === 0 && r.cK === cK && r.cPb === cPb && r.cPv === cPv, JSON.stringify(r.masalah));
    const r2 = commitPatok(git, { relPd: PD, teksKini: pd({ ...pdPv, episode: 'Y' }), stempel: 'S' });
    cek('teks pra-daftar yang dibaca kehilangan baris terhadap commit patok → masalah', r2.masalah.some((x) => /baris hilang terhadap commit patok/.test(x)), JSON.stringify(r2.masalah));
    const r3 = commitPatok(git, { relPd: PD, teksKini: pd({ ...pdPv, kunciPascaBeku: { m: 2 } }), stempel: 'S' });
    cek('blok kunciPascaBeku diubah sesudah commitnya → masalah', r3.masalah.some((x) => /kunciPascaBeku berubah/.test(x)), JSON.stringify(r3.masalah));
    cek('commitPatok untuk stempel lain → kunciPraVonis tidak ditemukan', commitPatok(git, { relPd: PD, teksKini: pd(pdPv), stempel: 'LAIN' }).masalah.some((x) => /kunciPraVonis diperkenalkan 0 commit/.test(x)));
    const sha = (s) => normal(s).length.toString();
    const cekB = (rel) => periksaBerkasHasil(git, { cPv, cPb, rel, shaIsi: sha, shaPatok: sha(isiDi(git, cPv, rel)) });
    cek('hanya-tambah: label JSONL dilanjutkan (awalan) dan audit dilengkapi (himpunan-bagian) SAH; berkas run sekali SAH',
      cekB('hasil/label-uji-ds-S.jsonl').length === 0 && cekB('hasil/audit-uji-hasil-S.json').length === 0 && cekB('hasil/s1-selesai-S.json').length === 0);
    // pelanggaran di cabang baru (tidak mengganggu cabang utama)
    git('checkout', '-q', '-b', 'undi', cPv);
    tulis('hasil/label-uji-ds-S.jsonl', '{"id":"a","label":null}\n{"id":"a","label":"NGARANG"}\n'); const c1 = commit('label diundi ulang');
    cek('hanya-tambah: label lama DIUBAH → ditolak', periksaBerkasHasil(git, { cPv: c1, cPb, rel: 'hasil/label-uji-ds-S.jsonl', shaIsi: sha, shaPatok: sha(isiDi(git, c1, 'hasil/label-uji-ds-S.jsonl')) }).some((x) => /baris lama berubah/.test(x)));
    tulis('hasil/audit-uji-hasil-S.json', '{"A01":{"label":"BLOKIR"},"A02":{"label":"BLOKIR"}}'); const c2 = commit('audit diubah');
    cek('hanya-tambah: label audit DIUBAH sesudah commit → ditolak (undian ulang)', periksaBerkasHasil(git, { cPv: c2, cPb, rel: 'hasil/audit-uji-hasil-S.json', shaIsi: sha, shaPatok: sha(isiDi(git, c2, 'hasil/audit-uji-hasil-S.json')) }).some((x) => /undian ulang/.test(x)));
    tulis('hasil/s1-selesai-S.json', '{"x":2}'); const c3 = commit('run ditulis ulang');
    cek('berkas run berubah sesudah commit pertama → ditolak', periksaBerkasHasil(git, { cPv: c3, cPb, rel: 'hasil/s1-selesai-S.json', shaIsi: sha, shaPatok: sha(isiDi(git, c3, 'hasil/s1-selesai-S.json')) }).some((x) => /isi berubah/.test(x)));
    git('mv', 'hasil/s1-selesai-S.json', 'hasil/s1-selesai-T.json'); const c4 = commit('ganti nama');
    tulis('hasil/s1-selesai-T.json', '{"x":3}'); const c5 = commit('ubah sesudah ganti nama');
    cek('ganti nama diikuti (--follow): perubahan sesudah ganti nama tetap tertangkap', c4 && periksaBerkasHasil(git, { cPv: c5, cPb, rel: 'hasil/s1-selesai-T.json', shaIsi: sha, shaPatok: sha(isiDi(git, c5, 'hasil/s1-selesai-T.json')) }).length > 0);
    // berkas yang lahir SEBELUM patok pasca-beku
    git('checkout', '-q', '-b', 'dini', cK);
    tulis('hasil/skor-T1-S-S.jsonl', '{"a":1}\n'); commit('skor sebelum patok');
    tulis(PD, pd({ kunciPascaBeku: { m: 1 }, kunciAwal: { sha256Kode: 'k' }, episode: 'X', dikunci: '2026-10-01T00:00:00.000Z' })); const cPb2 = commit('pasca-beku (cabang dini)');
    const pdDini = { kunciPraVonis: { stempel: 'D' }, kunciPascaBeku: { m: 1 }, kunciAwal: { sha256Kode: 'k' }, episode: 'X', dikunci: '2026-10-01T00:00:00.000Z' };
    tulis(PD, pd(pdDini)); const cPv2 = commit('pra-vonis (cabang dini)');
    cek('berkas hasil yang lahir SEBELUM commit pasca-beku → ditolak', periksaBerkasHasil(git, { cPv: cPv2, cPb: cPb2, rel: 'hasil/skor-T1-S-S.jsonl', shaIsi: sha, shaPatok: sha('{"a":1}\n') }).some((x) => /tidak lahir sesudah/.test(x)));
    cek('blok kunciPascaBeku diperkenalkan di DUA cabang → commitPatok menolak (bukan satu)', commitPatok(git, { relPd: PD, teksKini: pd(pdDini), stempel: 'D' }).masalah.some((x) => /kunciPascaBeku diperkenalkan 2 commit/.test(x)));
    cek('barisHilang: penyisipan murni 0, suntingan 1, CRLF tidak dihitung', barisHilang('a\nb\nc', 'a\nx\nb\nc') === 0 && barisHilang('a\nb\nc', 'a\nB\nc') === 1 && barisHilang('a\r\nb', 'a\nb') === 0);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
  console.log(gagal ? `${gagal} uji gagal` : 'riwayat-s1: semua uji lulus');
  return gagal ? 1 : 0;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG && process.argv.includes('--uji')) process.exit(uji());
