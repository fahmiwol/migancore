#!/usr/bin/env node
/**
 * campur-latih — menyusun CAMPURAN data latih dengan rasio rehearsal yang dikunci,
 * lalu membuktikan komposisinya sebelum satu GPU pun disewa.
 *
 * ====================== KENAPA ALAT INI ADA ======================
 * Ini obat langsung untuk Temuan A doc 86. Resep `0.14` (`models/SANAD-14k.json`)
 * memakai **485 baris dari dua cluster sempit** — hitung 285 + gaya 200 — dengan
 * **nol baris** kejujuran, identitas, atau nalar. Akibatnya terukur: model berlaku
 * kalah dari generasi pertamanya di 5 dari 6 sumbu, dan syarat PRD 14 Jun
 * ("0 kebocoran identitas") dilanggar 80 hari tanpa satu alarm pun.
 *
 * Riset 7 Sep menegaskan itu bukan nasib buruk melainkan resep yang kurang bahan:
 * rehearsal yang lazim dipakai untuk menahan catastrophic forgetting adalah
 * **5–20 % data lama dicampur ke data baru**, dan temuan 2025–2026 justru
 * membantah asumsi lama bahwa "LoRA saja sudah cukup" — LoRA membekukan bobot
 * dasar, tetapi kemampuan tetap bisa hilang. Campuran kami memakai **0 %**.
 *
 * C49 memberi alasan tambahan yang lebih tajam: kejujuran dan kemampuan-alat di
 * keluarga ini **saling menukar** (0.14 membeli 8 pp alat dengan 20 pp kejujuran;
 * 0.14-tool sebaliknya). Selama satu run hanya memuat satu sumbu, ia akan selalu
 * membayar dengan sumbu lain. Yang belum pernah dicoba: **memuat keduanya sekaligus**.
 *
 * ====================== YANG DIJAGA ALAT INI ======================
 * 1. **Rasio ditulis sebelum, bukan dilaporkan sesudah.** Resep adalah masukan;
 *    kalau hasilnya menyimpang dari resep, alat BERHENTI.
 * 2. **Gerbang C42**: tidak satu pun baris latih boleh menyerupai soal ujian.
 *    Jumlah soal ujian yang diperiksa DICETAK (C33: penjaga yang memeriksa nol
 *    soal tampak lulus).
 * 3. **Provenance melekat** per baris (`_kelompok`, `_sumber`), dan manifes
 *    membawa sidik SHA-256 tiap berkas sumber — supaya "campuran apa yang dipakai"
 *    tidak pernah jadi pertanyaan ingatan.
 * 4. **Komposisi dicetak untuk DIBACA** sebelum dipakai (aturan #8).
 *
 * Alat ini TIDAK melatih apa pun dan tidak menyewa GPU. Ia hanya menyiapkan bahan
 * dan membuktikan bahannya benar.
 *
 * Pakai:
 *   node flywheel/campur-latih.mjs --resep flywheel/resep/RESEP-V18.json
 *   node flywheel/campur-latih.mjs --resep <r> --tulis
 *   node flywheel/campur-latih.mjs --uji
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { soalPetak, jaccard, gram4 } from '../eval/jaga-pencemaran-kolam.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const arg = process.argv.slice(2);
const ambil = (n, d) => (arg.includes(n) ? arg[arg.indexOf(n) + 1] : d);

export const AMBANG_MIRIP = 0.50; // sama dengan jaga-pencemaran-kolam

export function bacaJsonl(rel) {
  const p = path.isAbsolute(rel) ? rel : path.join(AKAR, rel);
  return fs.readFileSync(p, 'utf8').split('\n').filter((b) => b.trim()).map((b) => JSON.parse(b));
}

export const sidik = (rel) => {
  const p = path.isAbsolute(rel) ? rel : path.join(AKAR, rel);
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
};

/** Teks yang bisa dibandingkan dengan soal ujian: giliran `human`/`user` saja. */
export function teksPengguna(baris) {
  const c = baris.conversations || baris.messages || [];
  return c.filter((t) => /^(human|user)$/i.test(t.from || t.role))
    .map((t) => t.value || t.content || '').join(' ');
}

/**
 * Ambil n baris secara DETERMINISTIK (tanpa acak): langkah merata sepanjang berkas.
 * Acak dengan benih pun menggoda untuk "diulang sampai bagus"; langkah merata tidak
 * bisa ditawar dan hasilnya sama di mesin mana pun.
 */
export function ambilMerata(daftar, n) {
  if (n >= daftar.length) return daftar.slice();
  const keluar = [];
  const langkah = daftar.length / n;
  for (let i = 0; i < n; i++) keluar.push(daftar[Math.floor(i * langkah)]);
  return keluar;
}

/** Bandingkan komposisi NYATA dengan resep. Menyimpang = berhenti, bukan peringatan. */
export function periksaKomposisi(resep, nyata) {
  const masalah = [];
  for (const b of resep.bahan) {
    const ada = nyata[b.kelompok] || 0;
    if (ada !== b.ambil) masalah.push(`${b.kelompok}: resep minta ${b.ambil}, tersusun ${ada}`);
  }
  const total = Object.values(nyata).reduce((a, c) => a + c, 0);
  const sasaran = resep.bahan.filter((b) => b.peran === 'sasaran').reduce((a, b) => a + b.ambil, 0);
  const rehearsal = total - sasaran;
  const pctRehearsal = total ? (rehearsal / total) * 100 : 0;
  const [min, maks] = resep.rehearsalPersen || [5, 20];
  if (pctRehearsal < min || pctRehearsal > maks) {
    masalah.push(`rehearsal ${pctRehearsal.toFixed(1)} % di luar jendela resep [${min}, ${maks}]`);
  }
  return { masalah, total, sasaran, rehearsal, pctRehearsal };
}

/** Gerbang C42 atas SELURUH campuran. Mengembalikan jumlah soal ujian yang DIPERIKSA. */
export function gerbangC42(campuran, petak = 'eval/petak-jujur2.mjs') {
  const ujian = soalPetak(petak).teks;
  if (ujian.length < 36) throw new Error(`gerbang C42 hanya melihat ${ujian.length} soal ujian di ${petak} (harus >=36) — penjaga yang memeriksa nol soal tampak lulus (C33)`);
  const gram = ujian.map((u) => ({ u, g: gram4(u) }));
  const tabrakan = [];
  for (const b of campuran) {
    const t = teksPengguna(b);
    if (t.length < 20) continue;
    const g = gram4(t);
    for (const { u, g: gu } of gram) {
      const j = jaccard(g, gu);
      if (j >= AMBANG_MIRIP) tabrakan.push({ latih: t.slice(0, 70), ujian: u.slice(0, 70), jaccard: Number(j.toFixed(3)) });
    }
  }
  return { diperiksa: ujian.length, tabrakan };
}

function uji() {
  let n = 0; const ok = (k, p) => { n++; if (!p) { console.error('GAGAL:', k); process.exit(1); } };
  ok('ambilMerata: n >= panjang → semua', ambilMerata([1, 2, 3], 5).length === 3);
  ok('ambilMerata: deterministik & merata', JSON.stringify(ambilMerata([1, 2, 3, 4, 5, 6], 3)) === JSON.stringify([1, 3, 5]));
  ok('ambilMerata: dua panggilan sama persis', JSON.stringify(ambilMerata([1, 2, 3, 4, 5, 6, 7], 4)) === JSON.stringify(ambilMerata([1, 2, 3, 4, 5, 6, 7], 4)));
  ok('teksPengguna: hanya giliran manusia', teksPengguna({ conversations: [{ from: 'system', value: 'S' }, { from: 'human', value: 'H' }, { from: 'gpt', value: 'G' }] }) === 'H');
  ok('teksPengguna: bentuk messages/role juga terbaca', teksPengguna({ messages: [{ role: 'user', content: 'U' }] }) === 'U');
  // Inti alat ini: resep adalah MASUKAN, bukan laporan.
  const resep = { rehearsalPersen: [5, 20], bahan: [{ kelompok: 'tool', ambil: 80, peran: 'sasaran' }, { kelompok: 'identitas', ambil: 20, peran: 'rehearsal' }] };
  ok('komposisi cocok → tanpa masalah', periksaKomposisi(resep, { tool: 80, identitas: 20 }).masalah.length === 0);
  ok('komposisi menyimpang → ditangkap', periksaKomposisi(resep, { tool: 79, identitas: 20 }).masalah.length === 1);
  ok('rehearsal 20 % masih di dalam jendela', periksaKomposisi(resep, { tool: 80, identitas: 20 }).pctRehearsal === 20);
  const terlalu = periksaKomposisi({ rehearsalPersen: [5, 20], bahan: [{ kelompok: 'a', ambil: 70, peran: 'sasaran' }, { kelompok: 'b', ambil: 30, peran: 'rehearsal' }] }, { a: 70, b: 30 });
  ok('rehearsal 30 % di luar jendela → ditangkap', terlalu.masalah.some((m) => /di luar jendela/.test(m)));
  ok('sidik berkas stabil', sidik('flywheel/dataset/identitas-polos.jsonl') === sidik('flywheel/dataset/identitas-polos.jsonl'));
  // C33: penjaga yang memeriksa nol soal tampak lulus.
  let lempar = false;
  try { gerbangC42([], 'eval/soal-alat.mjs'); } catch { lempar = true; }
  ok('gerbang C42 menolak petak yang soalnya < 36', lempar);
  console.log(`campur-latih: ${n}/${n} uji lulus`);
}

function utama() {
  if (arg.includes('--uji')) return uji();
  const jalurResep = ambil('--resep', null);
  if (!jalurResep) throw new Error('wajib --resep <berkas.json>');
  const resep = JSON.parse(fs.readFileSync(path.resolve(jalurResep), 'utf8'));

  console.log(`# campur-latih — resep \`${resep.nama}\` (${resep.tanggal})`);
  console.log(`# sasaran: ${resep.sasaran}\n`);

  const campuran = [];
  const nyata = {};
  const sumberSidik = {};
  for (const b of resep.bahan) {
    const semua = bacaJsonl(b.berkas);
    const diambil = ambilMerata(semua, b.ambil);
    for (const baris of diambil) campuran.push({ ...baris, _kelompok: b.kelompok, _sumber: b.berkas });
    nyata[b.kelompok] = diambil.length;
    sumberSidik[b.berkas] = { sidik: sidik(b.berkas), tersedia: semua.length, diambil: diambil.length };
  }

  const k = periksaKomposisi(resep, nyata);
  console.log('Komposisi (dicetak untuk DIBACA sebelum dipakai):');
  for (const b of resep.bahan) {
    const pct = ((nyata[b.kelompok] / k.total) * 100).toFixed(1);
    console.log(`  ${b.peran === 'sasaran' ? '🎯' : '🔁'} ${b.kelompok.padEnd(12)} ${String(nyata[b.kelompok]).padStart(4)} baris (${pct.padStart(5)} %) dari ${sumberSidik[b.berkas].tersedia} tersedia · ${b.berkas}`);
  }
  console.log(`\n  total ${k.total} · sasaran ${k.sasaran} · rehearsal ${k.rehearsal} (**${k.pctRehearsal.toFixed(1)} %**, jendela resep ${resep.rehearsalPersen.join('–')} %)`);

  if (k.masalah.length) {
    console.log('\nBERHENTI — komposisi menyimpang dari resep:');
    for (const m of k.masalah) console.log(`  ✗ ${m}`);
    process.exit(1);
  }

  const g = gerbangC42(campuran);
  console.log(`\nGerbang C42: ${g.diperiksa} soal ujian diperiksa · tabrakan ${g.tabrakan.length}`);
  if (g.tabrakan.length) {
    for (const t of g.tabrakan.slice(0, 5)) console.log(`  ✗ j=${t.jaccard} "${t.latih}" ~ "${t.ujian}"`);
    console.log('\nBERHENTI — bahan latih menyentuh petak ukur (C42). Perbaiki bahan, jangan lanjutkan.');
    process.exit(1);
  }

  if (!arg.includes('--tulis')) {
    console.log('\n(kering — tambahkan --tulis untuk menulis campuran + manifes)');
    return;
  }
  const stempel = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const dirKeluar = path.join(AKAR, 'flywheel', 'dataset', resep.nama.toLowerCase());
  fs.mkdirSync(dirKeluar, { recursive: true });
  // Nama berkas TIDAK bertanggal, dan itu disengaja: seluruh pipeline latih
  // (`kontrak-latih.mjs`, `migan latih`, SYARAT.praDaftarCocok) membaca
  // `cluster-<nama>.jsonl`. Versi pertama menulis `campuran-<stempel>.jsonl`,
  // yang tidak dibaca satu pun alat di hilir — kontraknya menolak dengan
  // "tidak ada: cluster-campuran.jsonl" dan GPU tidak akan pernah tersewa.
  // Stempel waktunya tetap ada, di manifes, tempat ia memang berguna.
  const berkasCampuran = path.join(dirKeluar, 'cluster-campuran.jsonl');
  fs.writeFileSync(berkasCampuran, campuran.map((x) => JSON.stringify(x)).join('\n') + '\n');
  const manifes = {
    resep: resep.nama, tanggal: new Date().toISOString(), sasaran: resep.sasaran,
    komposisi: nyata, total: k.total, rehearsalPersen: Number(k.pctRehearsal.toFixed(2)),
    jendelaResep: resep.rehearsalPersen, sumber: sumberSidik,
    gerbangC42: { diperiksa: g.diperiksa, tabrakan: 0 },
    sidikCampuran: crypto.createHash('sha256').update(fs.readFileSync(berkasCampuran)).digest('hex').slice(0, 16),
    _: 'Manifes ini yang dirujuk SANAD run berikutnya. Kalau campuran diubah, sidiknya berubah — itu gunanya.',
  };
  fs.writeFileSync(path.join(dirKeluar, `MANIFES-${stempel}.json`), JSON.stringify(manifes, null, 1));
  console.log(`\nditulis: ${path.relative(AKAR, berkasCampuran)} (sidik ${manifes.sidikCampuran})`);
  console.log(`manifes: ${path.relative(AKAR, path.join(dirKeluar, `MANIFES-${stempel}.json`))}`);
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) utama();
