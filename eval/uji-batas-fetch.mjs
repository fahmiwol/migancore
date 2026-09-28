/**
 * uji-batas-fetch.mjs — reproduksi OFFLINE batas 300 detik yang bukan milik kita.
 *
 * Kenapa ada. Uji langit-langit A3 dijalankan dengan `BATAS=1800`, dan gagal di
 * **304 detik** dengan `TypeError: fetch failed` — bukan `AbortError`, bukan
 * batas kita. Artinya ada langit-langit ~300 dtk di suatu tempat yang bukan
 * setelan kita, dan seluruh cerita "base mentah tidak bisa diukur" berdiri di
 * atas angka yang dihasilkan langit-langit itu:
 *
 *   1 Sep  BATAS=120 → 7-11 dari 36 soal GALAT
 *   2 Sep  BATAS=120 → 72-83 % GALAT
 *   10 Sep BATAS=300 → 4 dari 5 soal terkeras GALAT, semuanya tepat di ~300
 *
 * `BATAS=300` tidak akan pernah bisa berhasil kalau langit-langitnya juga 300.
 *
 * Dugaan yang diuji di sini: `fetch` bawaan Node (undici) memberi
 * `headersTimeout` **300.000 ms** secara bawaan. Dengan `stream:false`, Ollama
 * tidak mengirim satu pun header sampai SELURUH jawaban selesai dibuat — jadi
 * setiap jawaban yang butuh lebih dari 300 detik memutus koneksinya sendiri,
 * berapa pun `BATAS` yang kita pasang.
 *
 * Diuji TANPA Ollama, TANPA GPU, TANPA jaringan: sebuah peladen kecil yang
 * menerima koneksi lalu diam. Kalau dugaannya benar, `fetch` menyerah sendiri
 * jauh sebelum batas kita — dan sebabnya bisa dibaca dari `e.cause`.
 *
 * Dijalankan dengan `--cepat` (bawaan) memakai peladen yang diam 8 detik dan
 * `dispatcher` ber-`headersTimeout` 3 detik: bentuk galatnya sama persis,
 * ongkosnya 3 detik bukan 5 menit.
 *
 * Mode `--setara` menjawab pertanyaan kedua: apakah mengganti angkutan MENGUBAH
 * jawabannya? Diuji dengan `seed` yang dikunci — dengan seed sama, sampling
 * mengikuti jalur yang sama, jadi setiap perbedaan byte pasti datang dari
 * angkutannya. Seed hanya dipakai DI SINI, tidak pernah di jalur pengukuran.
 *
 * Mode `--sensus` mencegah cacat ini tumbuh kembali. Ia memindai seluruh repo
 * untuk panggilan `stream: false` dan memisahkan yang TERBATAS (punya
 * `num_predict`, jadi tidak mungkin melewati 300 dtk) dari yang TERPAPAR. Ini
 * jawaban C52 untuk kelas cacat ini: berkas di luar pola pemindai tidak pernah
 * digerbang, jadi pemindainya harus ada sebelum berkas berikutnya ditulis.
 *
 *   node eval/uji-batas-fetch.mjs           # reproduksi cepat (3 dtk)
 *   node eval/uji-batas-fetch.mjs --penuh   # reproduksi asli (305 dtk)
 *   node eval/uji-batas-fetch.mjs --setara  # aliran vs non-aliran, seed dikunci
 *   node eval/uji-batas-fetch.mjs --sensus  # siapa lagi yang terpapar
 *   node eval/uji-batas-fetch.mjs --uji     # uji instrumen
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gabungAliran } from './ukur-jujur2.mjs';

/** Bawaan undici di Node 18+. Sumber angkanya: dokumentasi undici. */
export const HEADERS_TIMEOUT_BAWAAN_MS = 300_000;

/**
 * Apakah galat ini berasal dari batas header undici, bukan dari abort kita?
 * Dibaca dari rantai `cause`, bukan dari teks pesannya — teks pesan `fetch`
 * selalu "fetch failed" apa pun sebabnya, dan itu justru yang membuat cacat ini
 * bertahan tiga minggu: pelari kami mencetak sebabnya sebagai `undefined`.
 */
export function sebabBatasHeader(e) {
  for (let x = e; x; x = x.cause) {
    const kode = x?.code || x?.name || '';
    if (/HeadersTimeout|UND_ERR_HEADERS_TIMEOUT/i.test(kode)) return 'headers';
    if (/BodyTimeout|UND_ERR_BODY_TIMEOUT/i.test(kode)) return 'body';
    if (/AbortError/i.test(kode)) return 'abort';
  }
  return null;
}

/** Peladen yang menerima koneksi lalu DIAM — meniru Ollama saat masih menalar. */
export function peladenDiam(diamMs) {
  const s = http.createServer((_req, res) => {
    setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); }, diamMs);
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r({ s, port: s.address().port })));
}

/** Direktori yang tidak pernah dipindai sensus. */
export const LEWAT = new Set(['node_modules', '.git', 'models', 'data', '.venv', 'dist', 'build']);

/**
 * Terpapar atau tidak. `stream:false` + tanpa `num_predict` = jawaban bisa
 * tumbuh sampai melewati 300 dtk dan memutus koneksinya sendiri. Dengan
 * `num_predict` kecil ia mustahil sampai ke sana: 400 token pada laju CPU Bmax
 * (~9 token/dtk) ≈ 45 detik.
 *
 * `ALIRAN`/`stream: true` juga menutupnya — itu jalan keluar yang benar untuk
 * berkas yang memang tidak boleh dibatasi panjangnya, seperti pengukur.
 */
export function nilaiBerkas(isi) {
  if (!/stream:\s*false/.test(isi)) return null;
  const batas = isi.match(/num_predict:\s*(\d+)/g) || [];
  const beraliran = /stream:\s*ALIRAN|stream:\s*true/.test(isi);
  const warisOpsi = /OPSI_PRODUKSI|opsiProduksi/.test(isi);
  return {
    terpapar: !batas.length && !beraliran && !warisOpsi,
    batas: batas.map((b) => Number(b.match(/\d+/)[0])),
    beraliran, warisOpsi,
  };
}

/**
 * Pindai repo dan kelompokkan tiap pemanggil Ollama.
 *
 * Batas yang diketahui, bukan yang disembunyikan: penilaiannya STATIS. Berkas
 * yang menyebut `num_predict` di komentar atau di string uji akan terbaca
 * terbatas walau panggilan sungguhannya tidak. Berkas ini sendiri kena hal itu
 * (uji instrumennya memuat `num_predict: 400`), jadi ia dikecualikan dari
 * sensusnya sendiri — pola yang sama dengan `periksa-alat.mjs`.
 */
export function sensusBerkas(akar = '.', kecuali = ['eval/uji-batas-fetch.mjs']) {
  const keluar = [];
  (function jelajah(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (LEWAT.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { jelajah(p); continue; }
      if (!/\.(mjs|js)$/.test(e.name)) continue;
      let isi;
      try { isi = fs.readFileSync(p, 'utf8'); } catch { continue; }
      const nama = p.replace(/\\/g, '/').replace(/^\.\//, '');
      if (kecuali.includes(nama)) continue;
      const v = nilaiBerkas(isi);
      if (v) keluar.push({ berkas: nama, ...v });
    }
  }(akar));
  return keluar.sort((a, b) => (b.terpapar - a.terpapar) || a.berkas.localeCompare(b.berkas));
}

function sensus() {
  const semua = sensusBerkas();
  const terpapar = semua.filter((x) => x.terpapar);
  console.log(`\n# sensus pemanggil Ollama — ${semua.length} berkas ber-\`stream: false\`\n`);
  for (const x of terpapar) console.log(`  TERPAPAR  ${x.berkas}`);
  if (!terpapar.length) console.log('  (tidak ada yang terpapar)');
  console.log(`\n  terbatas (${semua.length - terpapar.length}):`);
  for (const x of semua.filter((y) => !y.terpapar)) {
    const ket = x.batas.length ? `num_predict ${[...new Set(x.batas)].join('/')}`
      : x.beraliran ? 'punya jalur aliran' : 'mewarisi OPSI_PRODUKSI';
    console.log(`    ${x.berkas.padEnd(34)} ${ket}`);
  }
  console.log('\n  TERPAPAR = jawaban boleh tumbuh tanpa batas + Ollama diam sampai selesai');
  console.log('  → langit-langit 300 dtk undici berlaku. Obatnya: aliran, atau num_predict.\n');
  process.exit(0);
}

/** Soal pendek yang selesai cepat — yang diuji angkutannya, bukan modelnya. */
export const SOAL_SETARA = [
  'Apa ibu kota provinsi Jawa Barat?',
  'Sebutkan tiga pulau terbesar di Indonesia.',
  'Berapa hasil 17 dikali 23?',
];

/** Satu panggilan Ollama dengan seed dikunci, di salah satu moda angkutan. */
async function panggil(host, model, teks, aliran, seed) {
  const r = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, messages: [{ role: 'user', content: teks }],
      stream: aliran, options: { temperature: 0.7, seed },
    }),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  if (aliran) return (await gabungAliran(r.body) ?? '').trim();
  return String((await r.json())?.message?.content ?? '').trim();
}

async function setara() {
  const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  const model = process.argv[process.argv.indexOf('--setara') + 1]?.startsWith('--')
    ? 'qwen3:4b' : (process.argv[process.argv.indexOf('--setara') + 1] || 'qwen3:4b');
  const SEED = 20260910;
  console.log(`\n# kesetaraan angkutan — ${model} @ ${host} · seed ${SEED}\n`);
  // PRASYARAT: seed harus benar-benar memberi determinisme DI MODA YANG SAMA.
  // Tanpa cek ini, "aliran mengubah jawaban" tidak bisa dibedakan dari "model
  // ini memang tidak deterministik" — dan rancangan pertama uji ini memang
  // tidak bisa membedakannya, lalu menuduh aliran. Kalau prasyaratnya gagal,
  // ujinya BATAL, bukan lulus dan bukan gagal.
  //
  // Jawaban KOSONG juga membatalkan: dua jawaban kosong selalu "identik", dan
  // itu lulus-kosong (C33) yang sempat terjadi saat `num_predict` kecil habis
  // di dalam blok nalar model.
  const q0 = SOAL_SETARA[0];
  const d1 = await panggil(host, model, q0, false, SEED).catch(() => null);
  const d2 = await panggil(host, model, q0, false, SEED).catch(() => null);
  if (!d1 || !d2 || !d1.length) {
    console.log(`  BATAL — prasyarat: jawaban kosong atau gagal (${d1?.length ?? 'galat'} hrf).`);
    process.exit(2);
  }
  if (d1 !== d2) {
    console.log(`  BATAL — prasyarat: dua panggilan MODA SAMA + seed sama sudah berbeda`
      + ` (${d1.length} vs ${d2.length} hrf).`);
    console.log('  Model ini tidak deterministik pada seed; uji kesetaraan angkutan');
    console.log('  tidak bisa memisahkan sebab. Pakai model yang deterministik.\n');
    process.exit(2);
  }
  console.log(`  prasyarat OK — seed deterministik di moda sama (${d1.length} hrf, 2×)\n`);

  // Sisi non-aliran BOLEH gagal — itu justru bagian kedua dari buktinya. Yang
  // tidak boleh: sisi aliran gagal, atau keduanya berhasil dengan isi berbeda.
  const coba = async (aliran, q) => {
    const t0 = Date.now();
    try { return { ok: true, teks: await panggil(host, model, q, aliran, SEED), dtk: Math.round((Date.now() - t0) / 1000) }; }
    catch (e) { return { ok: false, sebab: sebabBatasHeader(e) || String(e).slice(0, 60), dtk: Math.round((Date.now() - t0) / 1000) }; }
  };

  let beda = 0, aliranGagal = 0, hanyaAliran = 0, sama = 0;
  for (const q of SOAL_SETARA) {
    const a = await coba(false, q);
    const b = await coba(true, q);
    if (!b.ok) { aliranGagal++; console.log(`  ALIRAN GAGAL  ${b.sebab}  (${b.dtk}s)  ${q}`); continue; }
    if (!a.ok) {
      hanyaAliran++;
      console.log(`  HANYA ALIRAN  non-aliran gagal "${a.sebab}" di ${a.dtk}s · aliran OK ${b.teks.length} hrf di ${b.dtk}s  ${q}`);
      continue;
    }
    if (a.teks === b.teks) { sama++; console.log(`  SAMA  ${String(a.teks.length).padStart(5)} hrf  (${a.dtk}s / ${b.dtk}s)  ${q}`); continue; }
    beda++;
    console.log(`  BEDA  ${a.teks.length} vs ${b.teks.length} hrf  ${q}`);
    console.log(`      non-aliran: ${a.teks.replace(/\s+/g, ' ').slice(0, 90)}`);
    console.log(`      aliran    : ${b.teks.replace(/\s+/g, ' ').slice(0, 90)}`);
  }

  const lulus = beda === 0 && aliranGagal === 0;
  console.log(`\n  identik ${sama} · berbeda ${beda} · hanya aliran yang berhasil ${hanyaAliran} · aliran gagal ${aliranGagal}`);
  console.log(lulus
    ? '\n  SETARA — tidak ada satu pun jawaban yang berubah karena angkutan.'
      + (hanyaAliran ? `\n  Dan ${hanyaAliran} soal HANYA bisa diukur lewat aliran — itu langit-langit 300 dtk-nya.\n` : '\n')
    : '\n  JANGAN nyalakan ALIRAN — ada jawaban yang berubah atau aliran yang gagal.\n');
  process.exit(lulus ? 0 : 1);
}

async function utama() {
  const penuh = process.argv.includes('--penuh');
  const batasHeaderMs = penuh ? HEADERS_TIMEOUT_BAWAAN_MS : 3_000;
  const diamMs = penuh ? HEADERS_TIMEOUT_BAWAAN_MS + 5_000 : 8_000;
  const batasKitaMs = 1_800_000;

  console.log(`\n# reproduksi batas fetch — ${penuh ? 'PENUH (bawaan undici)' : 'CEPAT (bentuk sama, 3 dtk)'}`);
  console.log(`  peladen diam    : ${diamMs / 1000}s`);
  console.log(`  headersTimeout  : ${batasHeaderMs / 1000}s`);
  console.log(`  BATAS kita      : ${batasKitaMs / 1000}s  ← jauh lebih longgar\n`);

  const { s, port } = await peladenDiam(diamMs);
  const kendali = new AbortController();
  const jam = setTimeout(() => kendali.abort(), batasKitaMs);
  const t0 = Date.now();
  let hasil;
  try {
    // `dispatcher` hanya dipakai di mode cepat, untuk memendekkan batas yang di
    // mode penuh datang dari bawaan Node. Bentuk galatnya identik.
    const opsi = { signal: kendali.signal };
    if (!penuh) {
      const { Agent } = await import('undici').catch(() => ({}));
      if (!Agent) {
        console.log('  LEWATI mode cepat — paket `undici` tidak ada. Jalankan --penuh (305 dtk).');
        s.close(); clearTimeout(jam); process.exit(0);
      }
      opsi.dispatcher = new Agent({ headersTimeout: batasHeaderMs });
    }
    const r = await fetch(`http://127.0.0.1:${port}/`, opsi);
    hasil = { ok: true, status: r.status };
  } catch (e) {
    hasil = { ok: false, pesan: String(e), sebab: sebabBatasHeader(e) };
  } finally {
    clearTimeout(jam); s.close();
  }
  const dtk = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`  hasil  : ${hasil.ok ? 'OK ' + hasil.status : hasil.pesan}`);
  console.log(`  detik  : ${dtk}`);
  console.log(`  sebab  : ${hasil.sebab || '—'}`);
  const cocok = !hasil.ok && hasil.sebab === 'headers' && Number(dtk) < batasKitaMs / 1000;
  console.log(cocok
    ? `\n  TEREPRODUKSI — fetch menyerah di ${dtk}s walau BATAS kita ${batasKitaMs / 1000}s.\n`
      + '  Sebabnya headersTimeout undici, BUKAN model dan BUKAN setelan kita.\n'
    : '\n  TIDAK tereproduksi — dugaan headersTimeout belum terbukti di sini.\n');
  process.exit(cocok ? 0 : 1);
}

function uji() {
  let lulus = 0, gagal = 0;
  const cek = (n, k) => { k ? lulus++ : (gagal++, console.log(`  GAGAL: ${n}`)); };

  cek('bawaan undici 300 dtk (angka yang dipakai seluruh diagnosis)',
    HEADERS_TIMEOUT_BAWAAN_MS === 300_000);

  cek('kenali HeadersTimeoutError lewat code',
    sebabBatasHeader({ cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } }) === 'headers');
  cek('kenali lewat name juga', sebabBatasHeader({ cause: { name: 'HeadersTimeoutError' } }) === 'headers');
  cek('kenali BodyTimeout terpisah', sebabBatasHeader({ cause: { code: 'UND_ERR_BODY_TIMEOUT' } }) === 'body');
  cek('abort kita sendiri TIDAK disalahartikan sebagai batas header',
    sebabBatasHeader({ name: 'AbortError' }) === 'abort');
  cek('galat lain → null, bukan tebakan', sebabBatasHeader({ cause: { code: 'ECONNREFUSED' } }) === null);
  cek('rantai cause dalam tetap terbaca',
    sebabBatasHeader({ cause: { cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } } }) === 'headers');
  cek('galat tanpa cause tidak melempar', sebabBatasHeader(new Error('x')) === null);
  cek('null/undefined aman', sebabBatasHeader(null) === null && sebabBatasHeader(undefined) === null);

  cek('berkas tanpa stream:false diabaikan sensus', nilaiBerkas('fetch(url)') === null);
  cek('stream:false polos → TERPAPAR', nilaiBerkas('{ stream: false }').terpapar === true);
  cek('stream:false + num_predict → terbatas',
    nilaiBerkas('{ stream: false, options:{ num_predict: 400 } }').terpapar === false);
  cek('num_predict terbaca angkanya',
    nilaiBerkas('{ stream: false, num_predict: 320 }').batas[0] === 320);
  cek('berkas ber-jalur-aliran tidak dihitung terpapar',
    nilaiBerkas('{ stream: ALIRAN }\n{ stream: false }').terpapar === false);
  cek('pewaris OPSI_PRODUKSI tidak dihitung terpapar',
    nilaiBerkas('const o = KANON.OPSI_PRODUKSI;\n{ stream: false, options: o }').terpapar === false);
  cek('sensus membaca repo nyata dan menemukan pemanggil',
    (() => { const s = sensusBerkas(); return s.length > 5 && s.every((x) => typeof x.berkas === 'string'); })());
  cek('sensus melewati node_modules', LEWAT.has('node_modules'));
  cek('sensus mengecualikan dirinya sendiri (uji ini memuat num_predict)',
    sensusBerkas().every((x) => x.berkas !== 'eval/uji-batas-fetch.mjs'));

  console.log(`\n  ${lulus} lulus · ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
}

const dipanggilLangsung = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (dipanggilLangsung) {
  if (process.argv.includes('--uji')) uji();
  else if (process.argv.includes('--sensus')) sensus();
  else if (process.argv.includes('--setara')) setara().catch((e) => { console.error(e); process.exit(2); });
  else utama().catch((e) => { console.error(e); process.exit(2); });
}
