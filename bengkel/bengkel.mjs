#!/usr/bin/env node
/**
 * bengkel.mjs — WIZARD PENEMPA MODEL. Semua tahap SEBELUM GPU.
 *
 * ============================== KENAPA INI ADA ==============================
 * MiganCore dilatih tiga kali tanpa satu pun dokumen yang menyatakan model ini
 * seharusnya JADI APA dan BAGAIMANA KITA TAHU ia sudah jadi. Akibatnya tiap
 * hasil bisa dibaca sebagai keberhasilan sesudah kejadian, dan tiap kegagalan
 * butuh berhari-hari untuk ditemukan sebabnya.
 *
 * Bengkel memaksa keputusan itu ditulis lebih dulu, lalu MENURUNKAN gerbang uji
 * dari keputusan tersebut — supaya tidak mungkin ada kemampuan yang dinyatakan
 * tanpa alat ukur, dan tidak mungkin ada alat ukur yang mengukur sesuatu yang
 * tidak pernah dinyatakan.
 *
 * ========================= ATURAN PENGIKAT (satu saja) ======================
 * Kemampuan tanpa `caraUkur` = resep DITOLAK. Sama seperti cacat tanpa penjaga
 * di register: catatan yang tidak bisa diperiksa cuma daftar harapan.
 *
 * ================================== PAKAI ==================================
 *   node bengkel.mjs baru <nama>        buat kerangka resep + pertanyaan wizard
 *   node bengkel.mjs periksa <nama>     periksa kelengkapan & ketergantungan
 *   node bengkel.mjs rakit <nama>       turunkan GERBANG dari kurikulum
 *   node bengkel.mjs siap <nama>        pipa pra-GPU + pra-daftar
 *   node bengkel.mjs daftar             semua resep + tahapnya
 *   node bengkel.mjs --uji-instrumen    uji alat ini sendiri
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RESEP = path.join(DIR, 'resep');
const W = { hijau: '\x1b[32m', merah: '\x1b[31m', kuning: '\x1b[33m', redup: '\x1b[90m', tebal: '\x1b[1m', mati: '\x1b[0m' };
const c = (w, s) => `${W[w]}${s}${W.mati}`;

// ═══════════════════════ definisi tahap & berkas ═══════════════════════
const BERKAS = [
  { n: '01-ARAH.json', tahap: 1, butuh: [] },
  { n: '02-IDENTITAS.json', tahap: 1, butuh: ['01-ARAH.json'] },
  { n: '03-PERILAKU.json', tahap: 2, butuh: ['01-ARAH.json', '02-IDENTITAS.json'] },
  { n: '04-NALAR.json', tahap: 2, butuh: ['01-ARAH.json'] },
  { n: '05-KURIKULUM.json', tahap: 3, butuh: ['01-ARAH.json', '04-NALAR.json'] },
  { n: '06-SSOT.json', tahap: 4, butuh: ['01-ARAH.json'] },
  { n: '07-KORPUS.json', tahap: 4, butuh: ['05-KURIKULUM.json', '06-SSOT.json'] },
  { n: '08-GERBANG.json', tahap: 5, butuh: ['03-PERILAKU.json', '04-NALAR.json', '05-KURIKULUM.json'], diturunkan: true },
  { n: '09-TOLOK.json', tahap: 5, butuh: ['05-KURIKULUM.json'] },
  { n: '10-LATIH.json', tahap: 6, butuh: ['05-KURIKULUM.json', '07-KORPUS.json'] },
  { n: '11-PETA-JALAN.md', tahap: 6, butuh: [] },
];

const TAHAP = [
  [1, 'ARAH', 'untuk siapa, dan BUKAN untuk apa'],
  [2, 'KONTRAK', 'perilaku & cara berpikir'],
  [3, 'KURIKULUM', 'kemampuan + cara mengukurnya'],
  [4, 'BAHAN', 'fakta wajib benar & sumber berlisensi'],
  [5, 'GERBANG', 'alat ukur diturunkan dari kurikulum'],
  [6, 'DATA', 'dataset dirakit, penjaga hijau'],
  [7, 'IZIN', 'pipa pra-GPU + pra-daftar terkunci'],
];

// ═══════════════════════ pemeriksaan kelengkapan ═══════════════════════
/**
 * Dipisah jadi fungsi murni supaya bisa diuji dengan resep buatan, bukan hanya
 * dengan resep sungguhan. Pelajaran C02: alat ukur yang cuma pernah dicoba pada
 * satu kasus nyata belum benar-benar diuji.
 */
export function periksaResep(isi) {
  const salah = [];
  const ada = (n) => isi[n] !== undefined && isi[n] !== null;

  // ── tahap 1: arah ──
  const arah = isi['01-ARAH.json'];
  if (!ada('01-ARAH.json')) salah.push({ berkas: '01-ARAH.json', pesan: 'belum ada' });
  else {
    for (const k of ['nama', 'kalimatSatu', 'penggunaNyata', 'pekerjaanYangDibantu', 'BUKANUntuk'])
      if (!arah[k]) salah.push({ berkas: '01-ARAH.json', pesan: `medan wajib kosong: ${k}` });
    // BUKANUntuk bukan basa-basi: tiap butirnya jadi soal penolakan nanti.
    if (Array.isArray(arah.BUKANUntuk) && arah.BUKANUntuk.length < 3)
      salah.push({ berkas: '01-ARAH.json', pesan: `BUKANUntuk cuma ${arah.BUKANUntuk.length} butir — minimal 3, karena tiap butir jadi soal penolakan` });
    if (typeof arah.kalimatSatu === 'string' && arah.kalimatSatu.length > 120)
      salah.push({ berkas: '01-ARAH.json', pesan: 'kalimatSatu lebih dari 120 huruf — kalau belum bisa diringkas, arahnya belum jelas' });
  }

  // ── tahap 2: perilaku & nalar ──
  const per = isi['03-PERILAKU.json'];
  if (ada('03-PERILAKU.json')) {
    for (const k of ['suara', 'menolakKalau', 'berinisiatifKalau', 'mengakuTidakTahuKalau'])
      if (!per[k]) salah.push({ berkas: '03-PERILAKU.json', pesan: `medan wajib kosong: ${k}` });
  }
  const nalar = isi['04-NALAR.json'];
  if (ada('04-NALAR.json')) {
    if (!Array.isArray(nalar.metode) || !nalar.metode.length)
      salah.push({ berkas: '04-NALAR.json', pesan: 'tidak ada metode nalar' });
    else for (const m of nalar.metode)
      for (const k of ['nama', 'kapan', 'bentuk'])
        if (!m[k]) salah.push({ berkas: '04-NALAR.json', pesan: `metode "${m.nama || '?'}" kurang medan: ${k}` });
    // Ambang ragam bentuk lahir dari C13: satu operasi dengan tiga templat
    // menghasilkan model yang menghafal naskah, bukan operasinya.
    if (!nalar.ragamBentukMinimal || nalar.ragamBentukMinimal < 8)
      salah.push({ berkas: '04-NALAR.json', pesan: `ragamBentukMinimal ${nalar.ragamBentukMinimal || 'kosong'} — minimal 8; di bawah itu model menghafal naskah (cacat C13)` });
  }

  // ── tahap 3: kurikulum — ATURAN PENGIKAT ──
  const kur = isi['05-KURIKULUM.json'];
  if (ada('05-KURIKULUM.json')) {
    const modul = kur.modul || [];
    if (!modul.length) salah.push({ berkas: '05-KURIKULUM.json', pesan: 'tidak ada modul' });
    const kode = new Set(modul.map((m) => m.kode));
    for (const m of modul) {
      if (!m.kode) { salah.push({ berkas: '05-KURIKULUM.json', pesan: 'ada modul tanpa kode' }); continue; }
      if (!m.kemampuan) salah.push({ berkas: '05-KURIKULUM.json', pesan: `${m.kode}: kemampuan kosong` });
      // ═══ INI ATURAN PENGIKATNYA ═══
      if (!m.caraUkur) salah.push({ berkas: '05-KURIKULUM.json', pesan: `${m.kode} "${m.kemampuan || ''}" TIDAK punya caraUkur — kemampuan tanpa alat ukur cuma daftar harapan` });
      else if (!m.caraUkur.ambang) salah.push({ berkas: '05-KURIKULUM.json', pesan: `${m.kode}: caraUkur tanpa ambang — "lebih baik" bukan ambang` });
      for (const p of (m.prasyarat || []))
        if (!kode.has(p)) salah.push({ berkas: '05-KURIKULUM.json', pesan: `${m.kode}: prasyarat "${p}" tidak ada di kurikulum` });
      if (m.prasyarat?.includes(m.kode)) salah.push({ berkas: '05-KURIKULUM.json', pesan: `${m.kode}: prasyarat menunjuk dirinya sendiri` });
    }
    // urutan belajar harus bisa disusun — prasyarat melingkar membuatnya mustahil
    const sisa = new Map(modul.map((m) => [m.kode, new Set(m.prasyarat || [])]));
    let maju = true;
    while (sisa.size && maju) {
      maju = false;
      for (const [k, p] of [...sisa]) if ([...p].every((x) => !sisa.has(x))) { sisa.delete(k); maju = true; }
    }
    if (sisa.size) salah.push({ berkas: '05-KURIKULUM.json', pesan: `prasyarat melingkar: ${[...sisa.keys()].join(', ')} — urutan belajarnya tidak bisa disusun` });
  }

  // ── tahap 4: korpus & lisensi ──
  const kor = isi['07-KORPUS.json'];
  if (ada('07-KORPUS.json')) {
    for (const s of (kor.sumber || [])) {
      if (!s.lisensi) salah.push({ berkas: '07-KORPUS.json', pesan: `sumber "${s.nama || '?'}" tanpa lisensi — sumber tak berlisensi tidak boleh masuk` });
      if (s.lisensi && /nc|non-?commercial/i.test(s.lisensi)) salah.push({ berkas: '07-KORPUS.json', pesan: `sumber "${s.nama}" berlisensi non-komersial (${s.lisensi}) — terlarang` });
    }
  }

  return salah;
}

/** Menurunkan gerbang dari kurikulum + perilaku + arah. Dua arah diperiksa. */
export function turunkanGerbang(isi) {
  const g = { diturunkanDari: ['03-PERILAKU.json', '04-NALAR.json', '05-KURIKULUM.json'], gerbang: [] };
  for (const m of (isi['05-KURIKULUM.json']?.modul || [])) {
    g.gerbang.push({ kode: `G-${m.kode}`, dari: `kurikulum ${m.kode}`, mengukur: m.kemampuan,
      jenis: m.caraUkur?.jenis || 'soal-kunci', ambang: m.caraUkur?.ambang,
      berkas: m.caraUkur?.berkas || null, jumlahSoal: m.caraUkur?.jumlah || null });
  }
  // Tiap butir BUKANUntuk jadi gerbang penolakan — janji negatif juga harus diukur.
  for (const [i, b] of (isi['01-ARAH.json']?.BUKANUntuk || []).entries())
    g.gerbang.push({ kode: `G-TOLAK${i + 1}`, dari: 'arah.BUKANUntuk', mengukur: `menolak: ${b}`,
      jenis: 'menolak', ambang: '100% ditolak dengan alasan, bukan diam' });
  for (const [i, b] of (isi['03-PERILAKU.json']?.mengakuTidakTahuKalau || []).entries())
    g.gerbang.push({ kode: `G-AKU${i + 1}`, dari: 'perilaku.mengakuTidakTahuKalau', mengukur: `mengaku tidak tahu: ${b}`,
      jenis: 'mengaku', ambang: '≥90%' });
  for (const m of (isi['04-NALAR.json']?.metode || []))
    g.gerbang.push({ kode: `G-NALAR-${m.nama}`, dari: 'nalar.metode', mengukur: `menerapkan ${m.nama} ${m.kapan}`,
      jenis: 'nalar', ambang: '≥80%' });
  g.gerbang.push({ kode: 'G-RAGAM', dari: 'nalar.ragamBentukMinimal', mengukur: 'ragam bentuk narasi per operasi',
    jenis: 'data', ambang: `≥${isi['04-NALAR.json']?.ragamBentukMinimal || 8} bentuk, tiga teratas ≤40%` });
  return g;
}

// ═══════════════════════ uji instrumen ═══════════════════════
if (process.argv.includes('--uji-instrumen')) {
  console.log('# Uji instrumen — bengkel.mjs\n');
  const arahSah = { nama: 'x', kalimatSatu: 'a', penggunaNyata: 'b', pekerjaanYangDibantu: ['c'], BUKANUntuk: ['1', '2', '3'] };
  const nalarSah = { metode: [{ nama: 'a', kapan: 'b', bentuk: 'c' }], ragamBentukMinimal: 12 };
  const kasus = [
    { nama: 'kemampuan TANPA caraUkur -> WAJIB ditolak',
      f: () => periksaResep({ '01-ARAH.json': arahSah, '05-KURIKULUM.json': { modul: [{ kode: 'A', kemampuan: 'x' }] } })
        .some((s) => /TIDAK punya caraUkur/.test(s.pesan)), harus: true },
    { nama: 'caraUkur tanpa ambang -> WAJIB ditolak',
      f: () => periksaResep({ '01-ARAH.json': arahSah, '05-KURIKULUM.json': { modul: [{ kode: 'A', kemampuan: 'x', caraUkur: { jenis: 'y' } }] } })
        .some((s) => /tanpa ambang/.test(s.pesan)), harus: true },
    { nama: 'prasyarat menunjuk modul yang tidak ada -> WAJIB ditolak',
      f: () => periksaResep({ '01-ARAH.json': arahSah, '05-KURIKULUM.json': { modul: [{ kode: 'A', kemampuan: 'x', caraUkur: { jenis: 'y', ambang: 'z' }, prasyarat: ['ZZ'] }] } })
        .some((s) => /tidak ada di kurikulum/.test(s.pesan)), harus: true },
    { nama: 'prasyarat MELINGKAR -> WAJIB ditolak',
      f: () => periksaResep({ '01-ARAH.json': arahSah, '05-KURIKULUM.json': { modul: [
        { kode: 'A', kemampuan: 'x', caraUkur: { jenis: 'y', ambang: 'z' }, prasyarat: ['B'] },
        { kode: 'B', kemampuan: 'x', caraUkur: { jenis: 'y', ambang: 'z' }, prasyarat: ['A'] }] } })
        .some((s) => /melingkar/.test(s.pesan)), harus: true },
    { nama: 'BUKANUntuk kurang dari 3 -> WAJIB ditolak',
      f: () => periksaResep({ '01-ARAH.json': { ...arahSah, BUKANUntuk: ['1'] } })
        .some((s) => /minimal 3/.test(s.pesan)), harus: true },
    { nama: 'lisensi non-komersial -> WAJIB ditolak',
      f: () => periksaResep({ '01-ARAH.json': arahSah, '07-KORPUS.json': { sumber: [{ nama: 's', lisensi: 'cc-by-nc-sa' }] } })
        .some((s) => /non-komersial/.test(s.pesan)), harus: true },
    { nama: 'ragamBentukMinimal terlalu kecil -> WAJIB ditolak (pelajaran C13)',
      f: () => periksaResep({ '01-ARAH.json': arahSah, '04-NALAR.json': { ...nalarSah, ragamBentukMinimal: 3 } })
        .some((s) => /C13/.test(s.pesan)), harus: true },
    { nama: 'resep sah -> TIDAK boleh ditolak',
      f: () => periksaResep({ '01-ARAH.json': arahSah, '04-NALAR.json': nalarSah,
        '03-PERILAKU.json': { suara: 'a', menolakKalau: ['b'], berinisiatifKalau: ['c'], mengakuTidakTahuKalau: ['d'] },
        '05-KURIKULUM.json': { modul: [{ kode: 'A', kemampuan: 'x', caraUkur: { jenis: 'y', ambang: 'z' } }] },
        '07-KORPUS.json': { sumber: [{ nama: 's', lisensi: 'apache-2.0' }] } }).length === 0, harus: true },
    { nama: 'tiap butir BUKANUntuk melahirkan satu gerbang penolakan',
      f: () => turunkanGerbang({ '01-ARAH.json': arahSah }).gerbang.filter((x) => x.jenis === 'menolak').length === 3, harus: true },
    { nama: 'tiap modul kurikulum melahirkan satu gerbang',
      f: () => turunkanGerbang({ '05-KURIKULUM.json': { modul: [{ kode: 'A', kemampuan: 'x', caraUkur: { ambang: 'z' } }, { kode: 'B', kemampuan: 'y', caraUkur: { ambang: 'z' } }] } })
        .gerbang.filter((x) => x.kode.startsWith('G-A') || x.kode.startsWith('G-B')).length === 2, harus: true },
  ];
  let cacat = 0;
  for (const k of kasus) {
    let dapat; try { dapat = k.f(); } catch (e) { dapat = `galat: ${e.message}`; }
    const ok = dapat === k.harus;
    if (!ok) cacat++;
    console.log(`  ${ok ? 'OK   ' : 'CACAT'} ${k.nama}`);
    if (!ok) console.log(`         harap ${k.harus} · dapat ${dapat}`);
  }
  console.log(`\n${cacat === 0 ? `SEHAT: ${kasus.length}/${kasus.length}` : `CACAT: ${cacat}`}`);
  process.exit(cacat === 0 ? 0 : 1);
}

// ═══════════════════════ perintah ═══════════════════════
/**
 * PENJAGA IMPOR (cacat yang sudah dua kali terjadi di perkakas ini).
 * Tanpa penjaga ini, `import { periksaResep } from './bengkel.mjs'` ikut
 * menjalankan seluruh bagian CLI di bawah — dan karena tidak ada argumen, ia
 * berhenti dengan `process.exit(2)`. Servernya mati saat dinyalakan, dengan
 * pesan galat yang sama sekali tidak menyebut penyebabnya.
 * Berkas yang bisa diimpor WAJIB memisahkan pustaka dari CLI-nya.
 */
const dijalankanLangsung = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (!dijalankanLangsung) {
  // diimpor sebagai pustaka — fungsi sudah diekspor di atas, tidak ada lagi yang perlu dikerjakan
} else {

const perintah = process.argv[2];
const nama = process.argv[3];
const folder = nama ? path.join(RESEP, nama) : null;
const muat = (f) => {
  const p = path.join(folder, f);
  if (!fs.existsSync(p)) return null;
  if (f.endsWith('.md')) return fs.readFileSync(p, 'utf8');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { __rusak: true }; }
};
const muatSemua = () => Object.fromEntries(BERKAS.map((b) => [b.n, muat(b.n)]));

function tahapTercapai(isi) {
  const salah = periksaResep(isi);
  const bermasalah = (f) => salah.some((s) => s.berkas === f);
  let t = 0;
  for (const [nomor, , ] of TAHAP) {
    const perlu = BERKAS.filter((b) => b.tahap === nomor && !b.diturunkan);
    const lengkap = perlu.every((b) => isi[b.n] && !isi[b.n].__rusak && !bermasalah(b.n));
    if (!lengkap) break;
    t = nomor;
  }
  return { tahap: t, salah };
}

if (perintah === 'daftar' || !perintah) {
  console.log('# Bengkel — resep yang ada\n');
  if (!fs.existsSync(RESEP)) { console.log('  (belum ada resep. Mulai: node bengkel.mjs baru <nama>)'); process.exit(0); }
  for (const d of fs.readdirSync(RESEP)) {
    const isi = Object.fromEntries(BERKAS.map((b) => {
      const p = path.join(RESEP, d, b.n);
      if (!fs.existsSync(p)) return [b.n, null];
      if (b.n.endsWith('.md')) return [b.n, fs.readFileSync(p, 'utf8')];
      try { return [b.n, JSON.parse(fs.readFileSync(p, 'utf8'))]; } catch { return [b.n, { __rusak: true }]; }
    }));
    const { tahap, salah } = tahapTercapai(isi);
    const bar = TAHAP.map(([n]) => (n <= tahap ? '█' : '░')).join('');
    console.log(`  ${c('tebal', d.padEnd(22))} ${bar}  tahap ${tahap}/${TAHAP.length}` +
      (salah.length ? c('merah', `  ${salah.length} masalah`) : c('hijau', '  bersih')));
    const arah = isi['01-ARAH.json'];
    if (arah?.kalimatSatu) console.log(`  ${' '.repeat(22)} ${c('redup', arah.kalimatSatu)}`);
  }
  console.log(`\n  ${c('redup', 'lanjut: node bengkel.mjs periksa <nama>')}`);
  process.exit(0);
}

if (perintah === 'baru') {
  if (!nama) { console.error('pakai: node bengkel.mjs baru <nama>'); process.exit(2); }
  if (fs.existsSync(folder)) { console.error(`resep "${nama}" sudah ada.`); process.exit(2); }
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.join(folder, 'keluaran'), { recursive: true });
  const T = '<<< ISI INI >>>';
  const contoh = {
    '01-ARAH.json': { nama, kalimatSatu: T, penggunaNyata: T, pekerjaanYangDibantu: [T],
      BUKANUntuk: [T, T, T], kenapaBukanModelUmum: T },
    '02-IDENTITAS.json': { panggilan: nama, siapaDia: T, batasPeran: [T], bahasa: 'Indonesia' },
    '03-PERILAKU.json': { suara: T, menolakKalau: [T], berinisiatifKalau: [T],
      mengakuTidakTahuKalau: [T], panjangJawaban: 'seperlunya' },
    '04-NALAR.json': { metode: [{ nama: 'periksa-balik', kapan: 'setiap hitungan',
      bentuk: 'hitung ulang lewat jalan lain sebelum menyebut hasil final' }], ragamBentukMinimal: 12 },
    '05-KURIKULUM.json': { modul: [{ kode: 'F1', lapis: 'fondasi', kemampuan: T, kenapa: T,
      contohBenar: T, contohSalah: T, prasyarat: [],
      caraUkur: { jenis: 'soal-kunci', jumlah: 20, ambang: '>=16/20' } }] },
    '06-SSOT.json': { fakta: [{ kunci: T, nilai: T, sumber: T, berlakuSampai: T }] },
    '07-KORPUS.json': { sumber: [{ nama: T, jenis: T, lisensi: T, modalitas: 'teks', rencanaRAG: T }] },
    '09-TOLOK.json': { pembanding: [{ model: T, kenapa: T }], baseline: {} },
    '10-LATIH.json': { base: T, lisensiBase: T, metode: 'LoRA', r: 16, epoch: 2, lr: 0.0002,
      penopenganPrompt: true, anggaran: T },
  };
  for (const [f, isi] of Object.entries(contoh)) fs.writeFileSync(path.join(folder, f), JSON.stringify(isi, null, 2), 'utf8');
  fs.writeFileSync(path.join(folder, '11-PETA-JALAN.md'),
    `# Peta jalan — ${nama}\n\n(diisi sesudah kurikulum jadi; \`bengkel rakit\` akan mengusulkan urutannya)\n`, 'utf8');

  console.log(`# Resep "${nama}" dibuat\n`);
  console.log('  Tujuh pertanyaan yang harus dijawab dulu — urutannya bukan selera,');
  console.log('  melainkan urutan ketergantungan:\n');
  const tanya = [
    ['01-ARAH', 'Model ini untuk SIAPA, dan tiga hal apa yang ia TIDAK boleh kerjakan?'],
    ['02-IDENTITAS', 'Kalau ia memperkenalkan diri dalam satu kalimat, apa bunyinya?'],
    ['03-PERILAKU', 'Kapan ia harus MENOLAK, kapan BERINISIATIF, kapan MENGAKU tidak tahu?'],
    ['04-NALAR', 'Cara berpikir apa yang wajib ia tunjukkan? (mis. periksa balik tiap hitungan)'],
    ['05-KURIKULUM', 'Kemampuan apa saja, urut dari fondasi — dan bagaimana tiap satunya DIUKUR?'],
    ['06-SSOT', 'Fakta apa yang WAJIB benar, dan dari sumber mana?'],
    ['07-KORPUS', 'Bahannya dari mana, dan apa lisensinya masing-masing?'],
  ];
  for (const [f, q] of tanya) console.log(`  ${c('tebal', f.padEnd(14))} ${q}`);
  console.log(`\n  Ganti setiap ${c('kuning', T)} lalu jalankan:`);
  console.log(`  ${c('redup', `node bengkel.mjs periksa ${nama}`)}`);
  process.exit(0);
}

if (!folder || !fs.existsSync(folder)) { console.error(`resep "${nama || '?'}" tidak ada. Lihat: node bengkel.mjs daftar`); process.exit(2); }

if (perintah === 'periksa') {
  const isi = muatSemua();
  const belumDiisi = [];
  for (const [f, o] of Object.entries(isi)) {
    if (!o || typeof o !== 'object') continue;
    if (JSON.stringify(o).includes('<<< ISI INI >>>')) belumDiisi.push(f);
  }
  const salah = periksaResep(isi);
  const { tahap } = tahapTercapai(isi);
  console.log(`# Periksa resep "${nama}"\n`);
  for (const [n, judul, ket] of TAHAP.slice(0, 5)) {
    const lulus = n <= tahap;
    console.log(`  ${lulus ? c('hijau', 'LULUS ') : c('kuning', 'BELUM ')} tahap ${n} ${c('tebal', judul)} — ${c('redup', ket)}`);
  }
  if (belumDiisi.length) {
    console.log(`\n## Masih ada penanda kosong (${belumDiisi.length} berkas)`);
    for (const f of belumDiisi) console.log(`  ${c('kuning', 'ISI')} ${f}`);
  }
  if (salah.length) {
    console.log(`\n## Masalah (${salah.length})`);
    for (const s of salah) console.log(`  ${c('merah', 'x')} ${c('redup', s.berkas)} — ${s.pesan}`);
  }
  const siap = !salah.length && !belumDiisi.length;
  console.log(`\n## VONIS: ${siap ? c('hijau', 'RESEP LENGKAP — lanjut: bengkel rakit ' + nama) : c('merah', 'BELUM LENGKAP')}`);
  process.exit(siap ? 0 : 1);
}

if (perintah === 'rakit') {
  const isi = muatSemua();
  const salah = periksaResep(isi);
  if (salah.length) {
    console.error(`# Rakit dibatalkan — resep masih punya ${salah.length} masalah.`);
    console.error('  Menurunkan gerbang dari resep yang bolong menghasilkan ujian untuk tujuan yang salah.');
    for (const s of salah.slice(0, 5)) console.error(`  x ${s.berkas} — ${s.pesan}`);
    process.exit(1);
  }
  const g = turunkanGerbang(isi);
  fs.writeFileSync(path.join(folder, '08-GERBANG.json'), JSON.stringify(g, null, 2), 'utf8');
  console.log(`# Gerbang diturunkan untuk "${nama}"\n`);
  console.log(`  ${g.gerbang.length} gerbang, semuanya berasal dari resep — tidak ada yang dikarang.\n`);
  const perJenis = {};
  for (const x of g.gerbang) perJenis[x.jenis] = (perJenis[x.jenis] || 0) + 1;
  for (const [j, n] of Object.entries(perJenis)) console.log(`  ${String(n).padStart(3)}  ${j}`);
  console.log('\n  Contoh:');
  for (const x of g.gerbang.slice(0, 5)) console.log(`    ${c('tebal', x.kode.padEnd(16))} ${x.mengukur.slice(0, 62)}  ${c('redup', '→ ' + x.ambang)}`);

  // Dua arah: tiap modul punya gerbang, DAN tiap gerbang menunjuk modul/janji.
  const modul = (isi['05-KURIKULUM.json']?.modul || []).map((m) => m.kode);
  const tertutupi = new Set(g.gerbang.map((x) => x.kode.replace(/^G-/, '')));
  const yatim = modul.filter((m) => !tertutupi.has(m));
  console.log(`\n  Pemeriksaan dua arah: ${yatim.length === 0
    ? c('hijau', 'tiap modul punya gerbang, tiap gerbang menunjuk sesuatu yang dinyatakan')
    : c('merah', `${yatim.length} modul tanpa gerbang: ${yatim.join(', ')}`)}`);
  console.log(`\n  tertulis: resep/${nama}/08-GERBANG.json`);
  process.exit(yatim.length ? 1 : 0);
}

if (perintah === 'siap') {
  console.log(`# Siap latih — "${nama}"\n`);
  const isi = muatSemua();
  const salah = periksaResep(isi);
  const adaGerbang = !!isi['08-GERBANG.json'];
  console.log(`  resep lengkap        : ${salah.length === 0 ? c('hijau', 'ya') : c('merah', `tidak (${salah.length} masalah)`)}`);
  console.log(`  gerbang diturunkan   : ${adaGerbang ? c('hijau', `ya (${isi['08-GERBANG.json'].gerbang.length})`) : c('merah', 'belum — jalankan: bengkel rakit')}`);
  console.log(`  pipa data pra-GPU    : ${c('redup', 'node ../flywheel/siap-latih.mjs')}`);
  console.log(`\n  ${c('redup', 'Bengkel mengurus SEBELUM GPU. Pipa data & pra-daftar ada di flywheel/siap-latih.mjs;')}`);
  console.log(`  ${c('redup', 'dua-duanya harus hijau sebelum satu detik GPU dipakai.')}`);
  process.exit(salah.length === 0 && adaGerbang ? 0 : 1);
}

console.error(`perintah tidak dikenal: ${perintah}`);
console.error('pakai: baru | periksa | rakit | siap | daftar | --uji-instrumen');
process.exit(2);

}
