/**
 * jaga-vonis.mjs — vonis yang tidak dibaca SSOT sama dengan vonis yang tidak ada.
 *
 * `migan status` membaca vonis dari `vonis.hasil` di tiap `flywheel/PRA-DAFTAR-*.json`.
 * Ia sudah berteriak kalau ada medan bernama persis `vonis` yang salah bentuk.
 * Yang TIDAK ia lihat: vonis yang ditulis dengan nama medan LAIN — `vonis_9Sep`,
 * `vonis_10Sep`, `vonis_10Sep_adjudikasiTerlambat`, `VONIS`, `keputusan`. Berkas
 * seperti itu lewat tanpa suara, dan vonisnya tidak pernah sampai ke pembacanya.
 *
 * Ini sudah terjadi TIGA kali:
 *   30 Agu  V15        — berbunyi "LULUS" sehari penuh padahal vonisnya dicabut
 *   31 Agu  V16-JUJUR  — ditulis dengan kunci "VONIS"/"keputusan", LENYAP
 *   10 Sep  ENAM berkas sekaligus — L2B, H4-KAMUS, V13, V14, H-MOGRPO, H-PANCI,
 *           lalu L2C-P dan L2C-P2 beberapa jam sesudah hukumnya ditulis ulang
 *
 * Ketiganya kesalahan saya, dan ketiganya bentuk yang sama: isinya benar,
 * tempatnya tidak dibaca. Penjaga ini menutup kelasnya, bukan kejadiannya.
 *
 * ATURAN: tiap PRA-DAFTAR boleh berada di salah satu dari dua keadaan.
 *   (a) punya `vonis.hasil` berupa string tak-kosong — vonisnya terbaca; atau
 *   (b) tidak punya SATU PUN medan yang namanya mengandung "vonis" —
 *       memang belum divonis, dan itu jujur.
 * Apa pun di antaranya = vonis sunyi = GAGAL.
 *
 *   node eval/jaga-vonis.mjs         # periksa repo
 *   node eval/jaga-vonis.mjs --uji   # uji instrumen
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIR = 'flywheel';
export const POLA = /^PRA-DAFTAR-.*\.json$/;

/** Medan yang menyimpan vonis tapi TIDAK dibaca `migan status`. */
export function medanSunyi(obj) {
  return Object.keys(obj || {}).filter((k) => /vonis/i.test(k) && k !== 'vonis');
}

/** Keadaan yang boleh dinyatakan sebuah vonis. Prosa untuk manusia, ini untuk program. */
export const KEADAAN_SAH = ['lulus', 'gagal', 'belum', 'netral'];

/**
 * Vonis satu berkas. Mengembalikan salah satu dari:
 *   'terbaca'  — vonis.hasil string tak-kosong DAN vonis.keadaan sah
 *   'belum'    — tidak ada medan bervonis sama sekali (jujur)
 *   'sunyi'    — ada vonis di medan yang tidak dibaca
 *   'rusak'    — ada medan `vonis` tapi `hasil`-nya bukan string tak-kosong
 *   'ditebak'  — hasilnya sah tapi `keadaan` tidak dinyatakan, jadi warnanya di
 *                `migan status` DITEBAK dari kata-kata prosanya. Tebakan itu
 *                sudah pernah salah di lima berkas sekaligus (10 Sep) — yang
 *                terburuk "GUGUR" tampil HIJAU.
 */
export function periksaBerkas(obj) {
  const punyaVonis = Object.prototype.hasOwnProperty.call(obj || {}, 'vonis');
  const hasil = obj?.vonis?.hasil;
  const sah = typeof hasil === 'string' && hasil.trim().length > 0;
  const sunyi = medanSunyi(obj);
  if (sah) {
    return KEADAAN_SAH.includes(obj?.vonis?.keadaan)
      ? { keadaan: 'terbaca', sunyi }
      : { keadaan: 'ditebak', sunyi, catat: `vonis.keadaan = ${JSON.stringify(obj?.vonis?.keadaan)}` };
  }
  if (punyaVonis) return { keadaan: 'rusak', sunyi };
  if (sunyi.length) return { keadaan: 'sunyi', sunyi };
  return { keadaan: 'belum', sunyi };
}

export function pindai(dir = DIR) {
  const keluar = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!POLA.test(f)) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { keluar.push({ berkas: f, keadaan: 'rusak', sunyi: [], galat: String(e).slice(0, 80) }); continue; }
    keluar.push({ berkas: f, ...periksaBerkas(j) });
  }
  return keluar;
}

function utama() {
  const semua = pindai();
  const buruk = semua.filter((x) => ['sunyi', 'rusak', 'ditebak'].includes(x.keadaan));
  const hitung = semua.reduce((a, x) => ({ ...a, [x.keadaan]: (a[x.keadaan] || 0) + 1 }), {});
  console.log(`\n# Jaga vonis — ${semua.length} pra-daftar`);
  console.log(`  terbaca SSOT ${hitung.terbaca || 0} · belum divonis ${hitung.belum || 0}`
    + ` · SUNYI ${hitung.sunyi || 0} · RUSAK ${hitung.rusak || 0} · warna DITEBAK ${hitung.ditebak || 0}\n`);
  for (const x of buruk) {
    console.log(`  ${x.keadaan.toUpperCase().padEnd(7)} ${x.berkas}`);
    if (x.sunyi.length) console.log(`          vonis ada di medan: ${x.sunyi.join(', ')} — tidak dibaca migan status`);
    if (x.catat) console.log(`          ${x.catat} — harus salah satu dari: ${KEADAAN_SAH.join(', ')}`);
    if (x.galat) console.log(`          ${x.galat}`);
  }
  console.log(buruk.length
    ? '\n  SUNYI  → rangkum ke vonis.hasil sambil menahan blok rinciannya, tunjuk balik\n'
      + '           lewat vonis.rincian. Merangkum, bukan memindahkan.\n'
      + '  DITEBAK→ tambahkan vonis.keadaan. Tanpa itu warnanya ditebak dari prosa,\n'
      + '           dan tebakan itu sudah pernah membuat "GUGUR" tampil HIJAU.\n'
    : '\n  Semua vonis terbaca SSOT dan menyatakan keadaannya sendiri.\n');
  process.exit(buruk.length ? 1 : 0);
}

function uji() {
  let lulus = 0, gagal = 0;
  const cek = (n, k) => { k ? lulus++ : (gagal++, console.log(`  GAGAL: ${n}`)); };

  cek('vonis.hasil + keadaan sah → terbaca',
    periksaBerkas({ vonis: { hasil: 'LULUS', keadaan: 'lulus' } }).keadaan === 'terbaca');
  cek('vonis.hasil TANPA keadaan → DITEBAK, bukan terbaca',
    periksaBerkas({ vonis: { hasil: 'GUGUR pada lengan bersih' } }).keadaan === 'ditebak');
  cek('keadaan di luar daftar → DITEBAK',
    periksaBerkas({ vonis: { hasil: 'x', keadaan: 'hijau' } }).keadaan === 'ditebak');
  cek('empat keadaan sah, tidak lebih',
    KEADAAN_SAH.length === 4 && KEADAAN_SAH.every((k) => k === k.toLowerCase()));
  cek('tanpa medan bervonis → belum (jujur, bukan cacat)',
    periksaBerkas({ ambang: {} }).keadaan === 'belum');
  cek('vonis_10Sep saja → SUNYI',
    periksaBerkas({ vonis_10Sep: { hasil: 'x' } }).keadaan === 'sunyi');
  cek('VONIS huruf besar → SUNYI (kasus V16-JUJUR)',
    periksaBerkas({ VONIS: 'GAGAL' }).keadaan === 'sunyi');
  cek('vonis ada tapi hasil bukan string → RUSAK',
    periksaBerkas({ vonis: { hasil: null } }).keadaan === 'rusak');
  cek('vonis.hasil string KOSONG → RUSAK, bukan terbaca',
    periksaBerkas({ vonis: { hasil: '   ' } }).keadaan === 'rusak');
  cek('vonis lengkap + medan bertanggal → terbaca, medan lama tetap dilaporkan',
    (() => { const r = periksaBerkas({ vonis: { hasil: 'LULUS', keadaan: 'lulus' }, vonis_10Sep: {} });
      return r.keadaan === 'terbaca' && r.sunyi.includes('vonis_10Sep'); })());
  cek('medanSunyi tidak menghitung `vonis` itu sendiri',
    medanSunyi({ vonis: {} }).length === 0);
  cek('objek kosong/null aman',
    periksaBerkas({}).keadaan === 'belum' && periksaBerkas(null).keadaan === 'belum');

  // Uji di repo NYATA: sesudah perbaikan 10 Sep, tidak boleh ada yang sunyi.
  const nyata = pindai();
  cek('repo nyata punya pra-daftar untuk dipindai', nyata.length >= 10);
  cek('repo nyata: tidak ada vonis SUNYI',
    nyata.every((x) => x.keadaan !== 'sunyi'),
  );
  cek('repo nyata: tidak ada vonis RUSAK', nyata.every((x) => x.keadaan !== 'rusak'));

  console.log(`\n  ${lulus} lulus · ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
}

const dipanggilLangsung = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (dipanggilLangsung) {
  if (process.argv.includes('--uji')) uji();
  else utama();
}
