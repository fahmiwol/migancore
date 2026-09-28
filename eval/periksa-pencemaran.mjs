#!/usr/bin/env node
/**
 * periksa-pencemaran.mjs — MENCARI KEBOCORAN SOAL EVAL KE DALAM DATA LATIH.
 *
 * ============================== KENAPA INI PENTING ==========================
 * Kalau soal gerbang bocor ke data latih, gerbang berhenti mengukur KEMAMPUAN
 * dan mulai mengukur HAFALAN. Bahayanya bukan angkanya jadi jelek — bahayanya
 * angkanya jadi BAGUS, dan kita tidak akan pernah tahu.
 *
 * Kecurigaan yang memicu berkas ini datang dari jawaban nyata v11:
 *   Soal  : "12 ton x Rp14.500/kg, berapa total?"
 *   Jawab : "Ubah ton ke kg: 12 ton : 10 = 1.200 kg. Kalikan: 1.200 x 14.500
 *            = Rp174.000.000. Hasilnya Rp174.000.000."   -> dinilai BENAR
 * Angka akhirnya benar, tapi JALANNYA omong kosong: 12 ton bukan 1.200 kg, dan
 * 1.200 x 14.500 bukan 174.000.000. Jawaban benar dengan kerja yang salah itu
 * ciri khas HAFALAN, bukan hitungan. Maka pertanyaannya wajib diajukan: apakah
 * soal ini — atau angkanya — memang ada di data latih?
 *
 * ================================ TIGA TINGKAT ==============================
 * Tidak semua irisan itu kecurangan. Dibedakan bertingkat:
 *   1. FAKTA BERSAMA — angka/istilah bisnis yang memang harus diketahui model
 *      (mis. harga Rp14.500/kg). WAJAR. Gerbang menguji pemakaiannya.
 *   2. KALIMAT SOAL BOCOR — potongan 8 kata dari soal muncul di data latih.
 *      MENCURIGAKAN: model bisa mengenali soalnya, bukan mengerjakannya.
 *   3. SOAL + JAWABAN BOCOR — potongan soal DAN kunci jawabannya muncul di
 *      baris latih yang sama. INI KECURANGAN. Gerbangnya batal.
 *
 * Metodenya potongan 8 kata (8-gram), cara baku yang dipakai laporan model
 * besar untuk memeriksa pencemaran tolok ukur.
 *
 * Pakai: node periksa-pencemaran.mjs [berkas-atau-folder-data-latih]
 *        (bawaan: flywheel/dataset/migancore-curated.jsonl)
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DIR, '..');
const TARGET = process.argv[2] || path.join(AKAR, 'flywheel', 'dataset', 'migancore-curated.jsonl');
const N_GRAM = 8;

const rapikan = (s) => String(s).toLowerCase()
  .replace(/[^a-z0-9\s.,]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const kata = (s) => rapikan(s).split(' ').filter(Boolean);
function gram(s, n = N_GRAM) {
  const k = kata(s);
  const out = [];
  for (let i = 0; i + n <= k.length; i++) out.push(k.slice(i, i + n).join(' '));
  return out;
}
// angka "khas": 4 digit ke atas, sesudah titik ribuan dibuang
const angkaKhas = (s) => [...new Set(
  (String(s).replace(/\./g, '').match(/\d{4,}/g) || []).filter((x) => Number(x) >= 1000)
)];

// ───────────────────────────── kumpulkan SOAL dari semua gerbang ──
// Tidak mengurai struktur tiap gerbang (rapuh). Ambil SEMUA teks panjang di
// dalam tanda kutip — kelebihan tangkapan itu murah, kelewatan tidak.
/**
 * KERANGKA BERSAMA ≠ PENCEMARAN.
 * System prompt gerbang memang sengaja mirip system prompt data latih — itu
 * kerangka yang dipakai bersama, bukan bocoran soal. Kalau tidak dipisahkan,
 * laporan ini penuh alarm palsu ("Kamu MiganCore, agent AI milik Fahmi Ghani…")
 * dan pencemaran yang sungguhan tenggelam di antaranya. Alarm palsu yang banyak
 * sama berbahayanya dengan tidak ada alarm sama sekali.
 */
const KERANGKA = /^(kamu migancore|jawab berdasarkan|kerjakan bertahap|kalau butuh informasi|tool.?call|cocok atau argumen|jangan mengarang panggilan|format json)/i;

/**
 * Kunci jawaban gerbang veto, dibaca dari sumbernya — bukan diketik ulang.
 * Bentuknya di uji-aritmetika.mjs: ['soal…', 174000000],
 */
function kunciAritmetika() {
  // Soal gerbang veto kini datang dari berkas bersih; membaca sumber .mjs akan
  // terus melaporkan soal LAMA yang sudah dipensiunkan.
  const bersih = path.join(DIR, 'soal-aritmetika-bersih.json');
  if (fs.existsSync(bersih)) {
    return JSON.parse(fs.readFileSync(bersih, 'utf8')).soal
      .map((s) => ({ soal: s.soal, kunci: s.kunci }))
      .filter((x) => x.kunci >= 1000);
  }
  const src = fs.readFileSync(path.join(DIR, 'uji-aritmetika.mjs'), 'utf8');
  const blok = src.slice(src.indexOf('const SOAL = ['), src.indexOf('];', src.indexOf('const SOAL = [')));
  return [...blok.matchAll(/\[\s*'([^']+)'\s*,\s*([0-9.]+)\s*\]/g)]
    .map((m) => ({ soal: m[1], kunci: Number(m[2]) }))
    .filter((x) => Number.isFinite(x.kunci) && x.kunci >= 1000);   // angka 2 digit terlalu umum
}

function soalDariGerbang() {
  const probe = [];

  /**
   * `bank-nalar` MEMBANGKITKAN soalnya, dan sejak 21 Agu pembangkitnya sudah
   * membuang soal yang bocor. Yang benar-benar dipakai mengukur adalah
   * `bank-nalar.jsonl`, BUKAN templat mentah di dalam `bank-nalar.mjs`.
   * Memindai sumbernya akan terus melaporkan soal yang sebetulnya sudah tidak
   * pernah ditanyakan — alarm palsu yang tak akan pernah bisa dipadamkan.
   */
  const bank = path.join(DIR, 'bank-nalar.jsonl');
  if (fs.existsSync(bank)) {
    for (const l of fs.readFileSync(bank, 'utf8').split(/\r?\n/)) {
      if (!l.trim()) continue;
      try {
        const o = JSON.parse(l);
        if (o.tanya && kata(o.tanya).length >= N_GRAM) probe.push({ gerbang: 'bank-nalar.jsonl', teks: o.tanya, kerangka: false });
      } catch { /* lewati */ }
    }
  }

  for (const f of fs.readdirSync(DIR).filter((x) => /^uji-/.test(x) && x.endsWith('.mjs'))) {
    /**
     * Dua sumber ALARM PALSU yang harus dibuang sebelum memindai:
     *   1. KOMENTAR — blok dokumentasi saya penuh kutipan keluaran model nyata
     *      (memang sengaja). Tentu saja itu "cocok" dengan data latih; ia bukan
     *      soal gerbang.
     *   2. Blok KENDALI — kendali uji instrumen memang WAJIB berisi keluaran
     *      nyata model. Menandainya sebagai pencemaran itu salah baca.
     * Percobaan pertama berkas ini melaporkan 9 soal uji-kias tercemar; sesudah
     * dua sumber ini dibuang, yang sungguhan tinggal 3. Alarm palsu sebanyak itu
     * membuat temuan yang nyata tenggelam — sama berbahayanya dengan tidak ada
     * alarm sama sekali.
     */
    let src = fs.readFileSync(path.join(DIR, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')       // komentar blok
      .replace(/^[ \t]*\/\/.*$/gm, ' ')        // komentar baris penuh
      // Soal yang sudah DIPENSIUNKAN tidak pernah ditanyakan ke model lagi; ia
      // hanya tinggal sebagai kendali instrumen. Melaporkannya sebagai
      // pencemaran adalah alarm yang tidak akan pernah bisa dipadamkan.
      .split(/\r?\n/).filter((b) => !/pensiun:/.test(b)).join('\n');
    const awalKendali = src.indexOf('const KENDALI = [');
    if (awalKendali !== -1) {
      const akhir = src.indexOf('\n];', awalKendali);
      if (akhir !== -1) src = src.slice(0, awalKendali) + src.slice(akhir);
    }
    const teks = [
      ...[...src.matchAll(/'((?:[^'\\]|\\.){30,}?)'/g)].map((m) => m[1]),
      ...[...src.matchAll(/"((?:[^"\\]|\\.){30,}?)"/g)].map((m) => m[1]),
      ...[...src.matchAll(/`((?:[^`\\]|\\.){30,}?)`/g)].map((m) => m[1]),
    ];
    for (const t of teks) {
      const bersih = t.replace(/\\n/g, ' ').replace(/\$\{[^}]*\}/g, ' ');
      if (kata(bersih).length < N_GRAM) continue;
      // Potongan KODE yang ikut tertangkap (templat multi-baris, potongan array)
      // bukan soal. Kalau dibiarkan, laporannya penuh baris seperti
      //   ", jawabBenar: Math.round(kuadrat / nlogn), buktiProses: ["
      // yang tidak berarti apa pun.
      if (/=>|\}\)|\bconst \b|\breturn \b|': \[|', '/.test(bersih)) continue;
      probe.push({ gerbang: f, teks: bersih, kerangka: KERANGKA.test(rapikan(bersih)) });
    }
  }
  return probe;
}

// ───────────────────────────── muat data latih ──
function muatBaris(p) {
  const berkas = fs.statSync(p).isDirectory()
    ? fs.readdirSync(p).filter((x) => x.endsWith('.jsonl')).map((x) => path.join(p, x))
    : [p];
  const baris = [];
  for (const b of berkas) {
    for (const l of fs.readFileSync(b, 'utf8').split(/\r?\n/)) {
      if (!l.trim()) continue;
      try {
        const o = JSON.parse(l);
        const isi = (o.conversations || []).map((c) => c.value).join('\n');
        baris.push({ berkas: path.basename(b), id: o.id || '', isi });
      } catch { /* baris rusak dilewati */ }
    }
  }
  return baris;
}

const probe = soalDariGerbang();
const latih = muatBaris(TARGET);
console.log('# Periksa pencemaran — soal eval vs data latih\n');
console.log(`  data latih : ${TARGET}`);
console.log(`  baris      : ${latih.length}`);
console.log(`  probe soal : ${probe.length} teks dari ${new Set(probe.map((p) => p.gerbang)).size} gerbang`);
console.log(`  metode     : potongan ${N_GRAM} kata + angka khas ≥4 digit\n`);

// indeks 8-gram -> daftar baris latih
const indeks = new Map();
latih.forEach((b, i) => {
  for (const g of gram(b.isi)) {
    if (!indeks.has(g)) indeks.set(g, new Set());
    indeks.get(g).add(i);
  }
});
// indeks angka khas -> baris
const indeksAngka = new Map();
latih.forEach((b, i) => {
  for (const a of angkaKhas(b.isi)) {
    if (!indeksAngka.has(a)) indeksAngka.set(a, new Set());
    indeksAngka.get(a).add(i);
  }
});

const tingkat2 = [];   // kalimat soal bocor
const tingkat1 = new Map();  // angka bersama -> berapa soal memakainya
for (const p of probe) {
  if (p.kerangka) continue;          // kerangka bersama, bukan bocoran soal
  const g = gram(p.teks);
  const cocok = g.filter((x) => indeks.has(x));
  if (cocok.length) {
    const barisKena = new Set();
    for (const c of cocok) for (const i of indeks.get(c)) barisKena.add(i);
    tingkat2.push({ ...p, cocok: cocok.slice(0, 3), jumlahCocok: cocok.length, total: g.length, baris: [...barisKena].slice(0, 3) });
  }
  for (const a of angkaKhas(p.teks)) {
    if (indeksAngka.has(a)) tingkat1.set(a, (tingkat1.get(a) || 0) + 1);
  }
}

// tingkat 3: kalimat soal DAN angka kunci di baris latih yang SAMA
const tingkat3 = [];
for (const t of tingkat2) {
  const angka = angkaKhas(t.teks);
  if (!angka.length) continue;
  for (const i of t.baris) {
    const punyaSemua = angka.filter((a) => latih[i].isi.replace(/\./g, '').includes(a));
    if (punyaSemua.length) tingkat3.push({ ...t, baris: i, angkaSama: punyaSemua.slice(0, 4) });
  }
}

/**
 * ── TINGKAT 2b — KUNCI JAWABAN BOCOR ────────────────────────────────────────
 * Celah yang LOLOS dari pemeriksaan 8 kata: soalnya boleh berbeda kalimat, tapi
 * kalau ANGKA JAWABANNYA ada di data latih, model bisa menyebut hasil yang benar
 * tanpa menghitung. Persis yang terjadi pada v11:
 *   "12 ton : 10 = 1.200 kg. 1.200 x 14.500 = Rp174.000.000."
 * Jalannya omong kosong, hasilnya tepat — karena Rp174.000.000 memang ada di
 * data latih. Pemeriksaan 8 kata memberi nilai BERSIH untuk gerbang ini, dan
 * nilai bersih itu menyesatkan. Alat ukur yang cuma memeriksa satu jenis
 * kebocoran akan selalu memberi rasa aman yang salah.
 */
const kunciBocor = [];
for (const k of kunciAritmetika()) {
  const pola = String(k.kunci);
  const kena = latih.filter((b) => b.isi.replace(/[.,]/g, '').includes(pola));
  if (kena.length) kunciBocor.push({ ...k, jumlah: kena.length, sumber: [...new Set(kena.map((x) => x.berkas))].slice(0, 3) });
}

console.log('## Tingkat 1 — FAKTA BERSAMA (wajar; gerbang menguji pemakaiannya)');
if (!tingkat1.size) console.log('  (tidak ada)');
else {
  const urut = [...tingkat1].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [a, n] of urut) console.log(`  ${a.padEnd(12)} dipakai ${n} soal · muncul di ${indeksAngka.get(a).size} baris latih`);
}

console.log('\n## Tingkat 2 — KALIMAT SOAL BOCOR (mencurigakan)');
if (!tingkat2.length) console.log('  BERSIH — tidak ada potongan 8 kata dari soal yang muncul di data latih');
else {
  for (const t of tingkat2.slice(0, 15)) {
    console.log(`  [${t.gerbang}] ${t.jumlahCocok}/${t.total} potongan cocok`);
    console.log(`     soal : ${t.teks.slice(0, 90)}`);
    console.log(`     cocok: "${t.cocok[0]}"`);
    console.log(`     baris: ${t.baris.map((i) => latih[i].id || i).join(', ')}`);
  }
  if (tingkat2.length > 15) console.log(`  … dan ${tingkat2.length - 15} lagi`);
}

console.log('\n## Tingkat 2b — KUNCI JAWABAN GERBANG VETO ada di data latih');
if (!kunciBocor.length) {
  console.log('  BERSIH — tak satu pun kunci jawaban aritmetika muncul di data latih');
} else {
  console.log('  Model kita bisa menyebut angka ini dari HAFALAN. Model pembanding yang tidak');
  console.log('  pernah dilatih data kita TIDAK punya keuntungan itu. Artinya selisih yang');
  console.log('  terukur adalah BATAS BAWAH kerusakan, bukan besarnya yang sebenarnya.\n');
  for (const k of kunciBocor) {
    console.log(`  ${String(k.kunci).padEnd(12)} ${k.jumlah} baris · ${k.sumber.join(', ')}`);
    console.log(`  ${' '.repeat(12)} soal: ${k.soal.slice(0, 60)}`);
  }
}

console.log('\n## Tingkat 3 — SOAL + KUNCI JAWABAN di baris yang SAMA (kecurangan)');
if (!tingkat3.length) console.log('  BERSIH — tidak ada baris latih yang memuat soal sekaligus angka kuncinya');
else {
  for (const t of tingkat3.slice(0, 10)) {
    console.log(`  [${t.gerbang}] baris ${latih[t.baris].id || t.baris} (${latih[t.baris].berkas})`);
    console.log(`     soal  : ${t.teks.slice(0, 90)}`);
    console.log(`     angka : ${t.angkaSama.join(', ')}`);
    console.log(`     isi   : ${latih[t.baris].isi.replace(/\s+/g, ' ').slice(0, 160)}`);
  }
}

const vonis = tingkat3.length ? 'GAGAL — ada soal+kunci di baris latih yang sama'
            : tingkat2.length ? 'PERIKSA TANGAN — ada kalimat soal yang bocor, harus dibaca satu per satu'
            : 'BERSIH';
console.log(`\n## VONIS: ${vonis}`);

const laporan = { target: TARGET, barisLatih: latih.length, probe: probe.length,
  tingkat1: [...tingkat1].map(([a, n]) => ({ angka: a, soal: n, baris: indeksAngka.get(a).size })),
  tingkat2: tingkat2.map((t) => ({ gerbang: t.gerbang, soal: t.teks.slice(0, 200), cocok: t.cocok, jumlahCocok: t.jumlahCocok, baris: t.baris.map((i) => latih[i].id) })),
  tingkat3: tingkat3.map((t) => ({ gerbang: t.gerbang, soal: t.teks.slice(0, 200), angka: t.angkaSama, baris: latih[t.baris].id })),
  kunciBocor, vonis };
fs.writeFileSync(path.join(DIR, 'LAPORAN-PENCEMARAN.md'),
  `# Laporan pencemaran\n\n\`\`\`\n${vonis}\n\`\`\`\n\n- data latih: \`${TARGET}\`\n- baris: ${latih.length}\n- tingkat 2 (kalimat soal bocor): ${tingkat2.length}\n- tingkat 3 (soal+kunci): ${tingkat3.length}\n`, 'utf8');
fs.writeFileSync(path.join(DIR, 'laporan-pencemaran.json'), JSON.stringify(laporan, null, 2), 'utf8');
console.log('\ntertulis: LAPORAN-PENCEMARAN.md + laporan-pencemaran.json');
process.exit(tingkat3.length ? 1 : 0);
