#!/usr/bin/env node
/**
 * ab-percobaan.mjs — HARNESS PERCOBAAN A/B. Satu faktor, sisanya dikunci.
 *
 * ============================== KENAPA INI ADA ==============================
 * Percobaan pertama saya soal pengaruh system prompt ditulis sebagai untaian
 * perintah cangkang. Ia gagal diam-diam: nol berkas keluaran, nol pesan galat.
 * Percobaan yang gagal tanpa suara jauh lebih berbahaya daripada percobaan yang
 * gagal keras — karena yang pertama bisa disangka "belum selesai" dan ditunggu
 * selamanya, atau lebih buruk, hasil setengahnya dipakai.
 *
 * Berkas ini menggantikannya dengan yang bisa diulang, dicatat, dan diperiksa.
 *
 * ==================== TIGA HAL YANG MEMBUATNYA BUKAN SEKADAR LOOP ==========
 *
 * 1. SELANG-SELING, BUKAN BERURUTAN. Menjalankan seluruh lengan A lalu seluruh
 *    lengan B mencampur "lengan" dengan "waktu": GPU memanas, cache model
 *    berubah, mesin dipakai hal lain. Kalau B dijalankan belakangan dan hasilnya
 *    lebih buruk, kita tidak bisa tahu itu karena B atau karena belakangan.
 *    Di sini tiap percobaan diselang-seling A,B,A,B — jadi apa pun yang
 *    berubah seiring waktu mengenai kedua lengan sama rata.
 *
 * 2. BLOK SOAL YANG SAMA. Kedua lengan menjawab soal yang sama persis, bukan
 *    sampel acak yang berbeda. Perbedaan soal jauh lebih besar daripada
 *    perbedaan yang dicari.
 *
 * 3. PRA-DAFTAR DI DALAM BERKAS. Hipotesis, ukuran pemutus, dan ambangnya
 *    ditulis SEBELUM dijalankan, di dalam kode, ikut tercatat di hasil.
 *    Tanpa itu, hasil apa pun bisa dibaca sebagai keberhasilan sesudah kejadian.
 *
 * Analisisnya memakai Fisher exact + selang Newcombe (statistik.mjs), dipecah
 * PER JENIS — karena agregat sudah pernah menyembunyikan 0/12 di sebelah 12/12.
 *
 * Pakai: node ab-percobaan.mjs <percobaan> [ulang=3]
 *        node ab-percobaan.mjs --daftar
 *        node ab-percobaan.mjs --uji-instrumen
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vonis, ukuranSampelPerlu } from './statistik.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

/**
 * PERCOBAAN TERDAFTAR. Tiap satu memuat pra-daftarnya sendiri: apa yang diuji,
 * apa yang diharapkan, dan angka berapa yang akan dianggap menjawab.
 */
const PERCOBAAN = {
  'prompt-aritmetika': {
    judul: 'Apakah system prompt gerbang sendiri yang merusak konversi satuan?',
    hipotesis: 'v11 gagal 12/12 pada ton-harga DENGAN system prompt gerbang, tapi benar TANPA-nya. '
      + 'Kalau benar, sebagian "kerusakan konversi" dipicu prompt gerbang, bukan data latih.',
    dasar: 'Satu pengamatan di playground + T6 (satu kalimat prompt memotong aritmetika 94%->50%).',
    ukuranPemutus: 'jenis "ton-harga", dipecah per jenis — bukan agregat',
    ambang: 'selisih ton-harga antara dua lengan harus BEDA NYATA (Fisher p<0,05) untuk mendukung hipotesis',
    kalauGagal: 'Kalau tidak beda nyata, prompt BUKAN sebabnya; kembali ke penjelasan data latih dan '
      + 'jangan mengubah prompt gerbang — mengubahnya berarti mengganti alat ukur tanpa alasan.',
    model: ['migancore:0.11-4b', 'migancore:0.4-qwen3'],
    // Dua model dipakai untuk MEMBEDAKAN SEBAB, bukan untuk kelengkapan:
    // prompt merusak keduanya  -> itu sifat prompt
    // prompt merusak v11 saja  -> itu interaksi prompt dengan latihan kami
    lengan: {
      dengan: 'Kerjakan bertahap dan tunjukkan angka antaranya. Jawab dengan angka yang jelas.',
      tanpa: null,      // null = pesan system TIDAK dikirim sama sekali
    },
    suhu: [0, 0.3],
    soal: () => {
      const b = JSON.parse(fs.readFileSync(path.join(DIR, 'soal-aritmetika-bersih.json'), 'utf8'));
      return b.soal.map((s) => ({ teks: s.soal, kunci: s.kunci, jenis: s.jenis }));
    },
  },
};

// ─────────────────────────────────────────── penilaian ──
function angkaDalam(teks) {
  const out = new Set();
  const t = String(teks);
  for (const m of t.matchAll(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?/g)) out.add(Number(m[0].replace(/\./g, '').replace(',', '.')));
  for (const m of t.matchAll(/-?\d+(?:[.,]\d+)?/g)) {
    const s = m[0];
    if (/\.\d{3}$/.test(s)) continue;
    out.add(Number(s.replace(',', '.')));
  }
  return [...out].filter(Number.isFinite);
}
const benarkah = (teks, n) => angkaDalam(teks).some((x) => Math.abs(x - n) < Math.max(0.02, Math.abs(n) * 0.001));

// ─────────────────────────────────────────── uji instrumen ──
if (process.argv.includes('--uji-instrumen')) {
  console.log('# Uji instrumen — ab-percobaan.mjs\n');
  const kasus = [
    { nama: 'penilai menerima jawaban benar', f: () => benarkah('Totalnya Rp598.500.000.', 598500000), harus: true },
    { nama: 'penilai menolak jawaban salah', f: () => benarkah('Totalnya Rp600.500.000.', 598500000), harus: false },
    { nama: 'penilai menolak yang meleset satu nol', f: () => benarkah('Rp59.850.000', 598500000), harus: false },
    { nama: 'penilai menerima angka tanpa titik ribuan', f: () => benarkah('hasilnya 598500000', 598500000), harus: true },
    // Selang-seling: urutan percobaan harus BERGANTIAN, bukan berkelompok.
    { nama: 'urutan percobaan selang-seling, bukan berurutan',
      f: () => {
        const urut = susunUrutan(['a', 'b'], 3);
        return urut.slice(0, 6).map((x) => x.lengan).join('') === 'ababab';
      }, harus: true },
    { nama: 'kedua lengan mendapat jumlah percobaan yang sama',
      f: () => {
        const urut = susunUrutan(['a', 'b'], 4);
        return urut.filter((x) => x.lengan === 'a').length === urut.filter((x) => x.lengan === 'b').length;
      }, harus: true },
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

/** Urutan selang-seling: a,b,a,b,… supaya waktu tidak menyamar jadi lengan. */
function susunUrutan(lengan, ulang) {
  const urut = [];
  for (let r = 0; r < ulang; r++) for (const l of lengan) urut.push({ lengan: l, ulangan: r });
  return urut;
}

// ─────────────────────────────────────────── jalankan ──
if (process.argv.includes('--daftar')) {
  console.log('# Percobaan terdaftar\n');
  for (const [k, p] of Object.entries(PERCOBAAN)) {
    console.log(`  ${k}\n    ${p.judul}\n    ambang: ${p.ambang}\n`);
  }
  process.exit(0);
}

const nama = process.argv[2];
const ULANG = Number(process.argv[3]) || 3;
const P = PERCOBAAN[nama];
if (!P) {
  console.error(`percobaan "${nama || '?'}" tidak dikenal. Lihat: node ab-percobaan.mjs --daftar`);
  process.exit(2);
}

async function tanya(model, sistem, teks, suhu) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model, stream: false,
      // `sistem: null` berarti pesan system TIDAK DIKIRIM. Mengirim string
      // kosong bukan hal yang sama bagi model, dan mencampurnya berarti
      // mengukur sesuatu yang lain tanpa sadar.
      messages: [...(sistem ? [{ role: 'system', content: sistem }] : []), { role: 'user', content: teks }],
      options: { temperature: suhu, num_predict: 400 },
    }),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  return (await r.json()).message?.content ?? '';
}

console.log(`# Percobaan A/B — ${nama}\n`);
console.log(`  ${P.judul}\n`);
console.log('## Pra-daftar (ditulis sebelum dijalankan)');
console.log(`  hipotesis    : ${P.hipotesis}`);
console.log(`  dasar        : ${P.dasar}`);
console.log(`  memutus lewat: ${P.ukuranPemutus}`);
console.log(`  ambang       : ${P.ambang}`);
console.log(`  kalau gagal  : ${P.kalauGagal}\n`);

const soal = P.soal();
const namaLengan = Object.keys(P.lengan);
const urutan = susunUrutan(namaLengan, ULANG);
console.log(`## Rancangan`);
console.log(`  model   : ${P.model.join(', ')}`);
console.log(`  lengan  : ${namaLengan.join(' vs ')}`);
console.log(`  soal    : ${soal.length} · suhu ${P.suhu.join(' & ')} · ulangan ${ULANG}`);
console.log(`  urutan  : ${urutan.map((x) => x.lengan[0]).join('')} (selang-seling — waktu mengenai kedua lengan sama rata)`);
console.log(`  total   : ${P.model.length * urutan.length * soal.length * P.suhu.length} percobaan\n`);

const catatan = [];
for (const model of P.model) {
  process.stdout.write(`  ${model.padEnd(24)} `);
  for (const { lengan, ulangan } of urutan) {
    for (const suhu of P.suhu) {
      for (const s of soal) {
        let jawab = '', ok = false;
        try {
          jawab = await tanya(model, P.lengan[lengan], s.teks, suhu);
          ok = benarkah(jawab, s.kunci);
        } catch (e) { jawab = `(gagal: ${e.message})`; }
        catatan.push({ model, lengan, ulangan, suhu, jenis: s.jenis, soal: s.teks, kunci: s.kunci, ok, jawab });
      }
    }
    process.stdout.write('.');
  }
  console.log(' selesai');
}

// ─────────────────────────────────────────── analisis ──
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;
const L = [`# Percobaan A/B — ${nama}`, '', `**${P.judul}**`, '',
  '## Pra-daftar', `- hipotesis: ${P.hipotesis}`, `- ambang: ${P.ambang}`,
  `- kalau gagal: ${P.kalauGagal}`, '',
  `## Rancangan`, `- ${catatan.length} percobaan · selang-seling · soal blok sama`, ''];

let adaBedaNyata = false;
for (const model of P.model) {
  const m = catatan.filter((c) => c.model === model);
  const jenis = [...new Set(m.map((c) => c.jenis))];
  L.push(`## ${model}`, '', '| Jenis | dengan | tanpa | selisih | selang 95% | Fisher p | Vonis |', '|---|---|---|---|---|---|---|');
  console.log(`\n### ${model}`);
  for (const j of [...jenis, '**SEMUA**']) {
    const sel = j === '**SEMUA**' ? m : m.filter((c) => c.jenis === j);
    const a = sel.filter((c) => c.lengan === namaLengan[0]);
    const b = sel.filter((c) => c.lengan === namaLengan[1]);
    const ka = a.filter((c) => c.ok).length, kb = b.filter((c) => c.ok).length;
    const v = vonis(ka, a.length, kb, b.length);
    if (v.nyata && j !== '**SEMUA**') adaBedaNyata = true;
    const teksVonis = v.nyata ? (v.selisih > 0 ? `**${namaLengan[1]} LEBIH BAIK**` : `**${namaLengan[0]} LEBIH BAIK**`) : 'belum terbukti beda';
    const baris = `| ${j} | ${ka}/${a.length} | ${kb}/${b.length} | ${pct(v.selisih)} | ${pct(v.lo)} … ${pct(v.hi)} | ${v.p < 0.0001 ? '<0,0001' : v.p.toFixed(4)} | ${teksVonis} |`;
    L.push(baris);
    console.log(`  ${j.padEnd(18)} ${String(ka + '/' + a.length).padStart(6)} vs ${String(kb + '/' + b.length).padEnd(6)} p=${v.p.toFixed(4)}  ${teksVonis.replace(/\*/g, '')}`);
    if (!v.nyata && Math.abs(v.selisih) >= 0.1) {
      const perlu = ukuranSampelPerlu(ka / (a.length || 1), kb / (b.length || 1));
      if (Number.isFinite(perlu)) L.push(`| | | | | _butuh ${perlu}/lengan untuk memutus_ | | |`);
    }
  }
  L.push('');
}

const putusan = adaBedaNyata
  ? 'HIPOTESIS DIDUKUNG di setidaknya satu jenis — periksa jenis mana, dan apakah polanya sama di kedua model.'
  : 'HIPOTESIS TIDAK DIDUKUNG — system prompt bukan sebabnya. Jangan ubah prompt gerbang; '
    + 'mengubah alat ukur tanpa alasan justru membatalkan seluruh pembanding lama.';
L.push('## PUTUSAN', '', putusan, '');
console.log(`\n## PUTUSAN: ${putusan}`);

fs.writeFileSync(path.join(DIR, `AB-${nama}.md`), L.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(DIR, `ab-${nama}.json`),
  JSON.stringify({ percobaan: nama, praDaftar: { hipotesis: P.hipotesis, ambang: P.ambang, kalauGagal: P.kalauGagal },
                   ulang: ULANG, catatan }, null, 2), 'utf8');
console.log(`\ntertulis: AB-${nama}.md + ab-${nama}.json`);
