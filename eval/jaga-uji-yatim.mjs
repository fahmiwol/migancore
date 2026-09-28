/**
 * jaga-uji-yatim.mjs — uji yang tidak pernah dijalankan adalah uji yang membusuk.
 *
 * KENAPA ADA. 10 Sep: 13 berkas ditemukan punya mode uji sendiri tapi tidak
 * pernah dijalankan rangkaian penjaga. Diagnosis pertama saya — "lupa
 * didaftarkan" — terlalu dangkal. Sebab sebenarnya lebih tajam:
 *
 *   `eval/periksa-alat.mjs` menyapu SELURUH `eval/*.mjs`, tapi hanya
 *   MENJALANKAN yang mengeja benderanya `--uji-instrumen`. Berkas yang mengeja
 *   `--uji` hidup dari DAFTAR TANGAN di `migan.mjs`, dan folder di luar `eval/`
 *   tidak punya pemindai sama sekali.
 *
 * Jadi C52 di sini bukan *"berkas di luar FOLDER yang dipindai"* melainkan
 * **"berkas di luar POLA NAMA yang dipindai"**. Pemindai yang memakai nama
 * bendera sebagai polanya akan selamanya buta terhadap ejaan lain — dan berkas
 * ke-14 yang lahir dengan ejaan yang salah akan yatim dengan cara yang sama.
 *
 * Mendaftarkan 13 berkas menambal KEJADIANNYA. Berkas ini menutup KELASNYA:
 * tiap berkas bermode uji harus digerbang lewat salah satu jalur, atau berada
 * di daftar kecuali DENGAN ALASAN TERTULIS yang ikut dicetak.
 *
 * SATU JEBAKAN yang sudah memakan saya sekali: mendeteksi "terdaftar" dengan
 * mencari nama berkas di dalam `migan.mjs` akan menelan KOMENTAR juga.
 * `flywheel/pindah-model.mjs` disebut di sana justru dalam komentar yang
 * menjelaskan kenapa ia TIDAK didaftarkan — dan pemindai saya membacanya
 * sebagai bukti bahwa ia didaftarkan. Yang dicari harus PEMANGGILAN, bukan
 * penyebutan.
 *
 *   node eval/jaga-uji-yatim.mjs         # periksa repo
 *   node eval/jaga-uji-yatim.mjs --uji   # uji instrumen
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEWAT = new Set([
  'node_modules', '.git', 'models', 'data', '.venv', 'dataset',
  'dist', 'build', '.next', 'worktrees',
]);

/**
 * Berkas yang SENGAJA tidak digerbang. Wajib membawa alasan, dan alasannya
 * ikut dicetak tiap kali penjaga jalan — pengecualian yang tidak terbaca akan
 * jadi permanen tanpa ada yang memutuskannya.
 */
export const KECUALI = {
  'flywheel/pindah-model.mjs':
    'Ujinya membaca manifes migancore:0.14 di ~/.ollama/models — DI LUAR repo. '
    + 'Mendaftarkannya berarti `migan periksa` menguji ISI MESIN, bukan kode; dan '
    + 'tugas alat itu sendiri justru MEMINDAHKAN blob tersebut ke Bmax, jadi ia '
    + 'akan mematahkan penjaganya sendiri begitu dipakai. Usul: uji dibangun ulang '
    + 'di atas manifes tiruan di folder sementara, baru didaftarkan.',
};

// 28 Sep: dilebarkan. Pola lama hanya `process.argv.includes('--uji')`, sehingga 13 berkas yang mengeja
// `arg.includes('--uji')` (arg = process.argv.slice(2)) atau `a[0] === '--uji'` lolos tanpa terlihat —
// 12 alat Gerbang-S1 + bangun-silsilah. Kini: `.includes('--uji')` pada larik apa pun, dan perbandingan `=== '--uji'`
// dari dua sisi. Ejaan `['--uji']` (argumen PEMANGGIL, mis. di migan.mjs) sengaja tidak cocok.
const PUNYA_UJI = /(?:\.includes\(\s*['"]--uji['"]\s*\)|===\s*['"]--uji['"]|['"]--uji['"]\s*===)/;
const PUNYA_UJI_INSTRUMEN = /process\.argv\.includes\(\s*['"]--uji-instrumen['"]\s*\)/;

/**
 * Apakah `migan.mjs` benar-benar MEMANGGIL berkas ini?
 *
 * Yang dicari bentuk pemanggilannya — `jalan('path'` / `jalanPy("path"` —
 * bukan sekadar nama berkasnya muncul di suatu tempat. Komentar menyebut nama
 * berkas sesering kode memanggilnya, dan komentar tidak menjalankan apa pun.
 */
export function dipanggilOleh(isiMigan, rel) {
  const aman = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`jalan(?:Py)?\\(\\s*['"\`]${aman}['"\`]`).test(isiMigan);
}

/** Keadaan satu berkas bermode uji. */
/** Baris komentar (//, /*, * ) dibuang sebelum mencari bendera: komentar MENYEBUT ejaan, tidak MEMERIKSA bendera. */
export const tanpaKomentar = (isi) => isi.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

export function nilaiBerkas({ rel, isi, isiMigan }) {
  const kode = tanpaKomentar(isi);
  const uji = PUNYA_UJI.test(kode);
  const instrumen = PUNYA_UJI_INSTRUMEN.test(kode);
  if (!uji && !instrumen) return null;
  if (instrumen) return { rel, jalur: 'periksa-alat (--uji-instrumen)', yatim: false };
  if (dipanggilOleh(isiMigan, rel)) return { rel, jalur: 'migan periksa (daftar)', yatim: false };
  if (KECUALI[rel]) return { rel, jalur: 'DIKECUALIKAN', yatim: false, alasan: KECUALI[rel] };
  return { rel, jalur: null, yatim: true };
}

export function pindai(akar = '.') {
  const isiMigan = fs.readFileSync(path.join(akar, 'migan.mjs'), 'utf8');
  const keluar = [];
  (function jelajah(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (LEWAT.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { jelajah(p); continue; }
      if (!e.name.endsWith('.mjs')) continue;
      let isi;
      try { isi = fs.readFileSync(p, 'utf8'); } catch { continue; }
      const rel = p.replace(/\\/g, '/').replace(/^\.\//, '');
      const v = nilaiBerkas({ rel, isi, isiMigan });
      if (v) keluar.push(v);
    }
  }(akar));
  return keluar.sort((a, b) => (b.yatim - a.yatim) || a.rel.localeCompare(b.rel));
}

function utama() {
  const semua = pindai();
  const yatim = semua.filter((x) => x.yatim);
  const kecuali = semua.filter((x) => x.jalur === 'DIKECUALIKAN');
  const n = (j) => semua.filter((x) => x.jalur === j).length;

  console.log(`\n# Jaga uji yatim — ${semua.length} berkas bermode uji\n`);
  console.log(`  disapu periksa-alat  : ${n('periksa-alat (--uji-instrumen)')}`);
  console.log(`  daftar migan periksa : ${n('migan periksa (daftar)')}`);
  console.log(`  dikecualikan         : ${kecuali.length}`);
  console.log(`  YATIM                : ${yatim.length}\n`);

  for (const x of yatim) console.log(`  YATIM  ${x.rel}`);
  for (const x of kecuali) {
    console.log(`  KECUALI ${x.rel}`);
    console.log(`          ${x.alasan.replace(/\s+/g, ' ').slice(0, 300)}`);
  }

  console.log(yatim.length
    ? '\n  Uji yang tidak pernah dijalankan adalah uji yang membusuk — ia bisa sudah\n'
      + '  gagal berbulan-bulan tanpa ada yang tahu, dan alat yang ujinya gagal tetap\n'
      + '  dipakai mengambil keputusan. Daftarkan di `migan periksa`, atau masukkan ke\n'
      + '  KECUALI DENGAN ALASAN yang ikut tercetak.\n'
    : '\n  Tidak ada uji yang yatim.\n');
  process.exit(yatim.length ? 1 : 0);
}

function uji() {
  let lulus = 0, gagal = 0;
  const cek = (n, k) => { k ? lulus++ : (gagal++, console.log(`  GAGAL: ${n}`)); };
  const MG = "jalan('eval/a.mjs', ['--uji'])";

  cek('berkas tanpa mode uji diabaikan',
    nilaiBerkas({ rel: 'x.mjs', isi: 'const a=1', isiMigan: '' }) === null);
  cek('--uji-instrumen → digerbang periksa-alat',
    nilaiBerkas({ rel: 'eval/x.mjs', isi: "process.argv.includes('--uji-instrumen')", isiMigan: '' }).yatim === false);
  cek('--uji + dipanggil migan → tidak yatim',
    nilaiBerkas({ rel: 'eval/a.mjs', isi: "process.argv.includes('--uji')", isiMigan: MG }).yatim === false);
  cek('--uji tanpa pemanggil → YATIM',
    nilaiBerkas({ rel: 'eval/b.mjs', isi: "process.argv.includes('--uji')", isiMigan: MG }).yatim === true);
  // 28 Sep: ejaan lain bendera yang sama (C52 — pemindai buta ejaan) juga harus terlihat.
  cek("ejaan arg.includes('--uji') terlihat (YATIM bila tak dipanggil)",
    nilaiBerkas({ rel: 'eval/c.mjs', isi: "const arg = process.argv.slice(2); if (arg.includes('--uji')) uji();", isiMigan: MG })?.yatim === true);
  cek("ejaan a[0] === '--uji' terlihat",
    nilaiBerkas({ rel: 'eval/d.mjs', isi: "if (a[0] === '--uji') process.exit(uji());", isiMigan: MG })?.yatim === true);
  cek("argumen pemanggil ['--uji'] BUKAN mode uji",
    nilaiBerkas({ rel: 'eval/e.mjs', isi: "execFileSync(node, [f, '--uji'])", isiMigan: MG }) === null);
  cek('ejaan bendera yang hanya disebut di KOMENTAR bukan mode uji',
    nilaiBerkas({ rel: 'eval/f.mjs', isi: "// alat lain mengeja arg.includes('--uji')\n * atau a[0] === '--uji'\nconst x = 1;", isiMigan: MG }) === null);

  // Jebakan yang sudah memakan saya sekali: nama berkas di KOMENTAR.
  const komentar = "// flywheel/pindah-model.mjs sengaja TIDAK ikut karena ...";
  cek('disebut di KOMENTAR bukan berarti dipanggil',
    dipanggilOleh(komentar, 'flywheel/pindah-model.mjs') === false);
  cek('pemanggilan sungguhan terdeteksi',
    dipanggilOleh("jalan('flywheel/pindah-model.mjs', ['--uji'])", 'flywheel/pindah-model.mjs') === true);
  cek('jalanPy juga terhitung memanggil',
    dipanggilOleh('jalanPy("a/b.mjs", [])', 'a/b.mjs') === true);
  cek('titik di nama berkas tidak jadi wildcard regex',
    dipanggilOleh("jalan('evalXa.mjs')", 'eval.a.mjs') === false);
  cek('tanda petik balik juga bentuk pemanggilan sah',
    dipanggilOleh('jalan(`eval/a.mjs`)', 'eval/a.mjs') === true);

  cek('pengecualian butuh alasan tertulis',
    Object.values(KECUALI).every((a) => typeof a === 'string' && a.length > 60));
  cek('berkas dikecualikan tidak dihitung yatim',
    nilaiBerkas({ rel: 'flywheel/pindah-model.mjs', isi: "process.argv.includes('--uji')", isiMigan: '' }).yatim === false);
  cek('berkas dikecualikan tetap membawa alasannya ke keluaran',
    typeof nilaiBerkas({ rel: 'flywheel/pindah-model.mjs', isi: "process.argv.includes('--uji')", isiMigan: '' }).alasan === 'string');

  const nyata = pindai();
  cek('repo nyata punya banyak berkas bermode uji', nyata.length > 50);
  cek('repo nyata: TIDAK ada uji yatim', nyata.every((x) => !x.yatim));

  console.log(`\n  ${lulus} lulus · ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
}

const dipanggilLangsung = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (dipanggilLangsung) {
  if (process.argv.includes('--uji')) uji();
  else utama();
}
