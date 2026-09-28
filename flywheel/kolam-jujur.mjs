/**
 * Pembangun kolam RLVR kejujuran — dari KEGAGALAN NYATA, bukan dari soal karangan.
 *
 * Kenapa berkas ini ada:
 *
 * A19 (28 Agu) menemukan bahwa kolam probe MO-GRPO pertama diambil dari DATA LATIH
 * model itu sendiri. Empat dari lima objektif jenuh (rerata >0,98), advantage nol,
 * dan seluruh mesin multi-objektif tidak menghasilkan apa pun. Dialnya berbunyi:
 * *"kolam prompt RLVR harus berisi soal yang modelnya masih GAGAL, bukan soal yang
 * sudah dikuasainya."*
 *
 * Kita punya sumber kegagalan yang tepat dan sudah terkumpul: lima putaran petak-40
 * pada tiap model, tersimpan di `eval/hasil-halu-*.json`, lengkap dengan vonis per
 * soal. Berkas ini memanennya.
 *
 * Aturan panen (sengaja ketat):
 *  1. Hanya soal yang model DIMAKSUD masih GAGAL — persis doktrin panen-dpo lama
 *     ("yang model sudah benar TIDAK dipanen"), yang ternyata berlaku juga di RLVR.
 *  2. Soal `fakta` WAJIB membawa pola `benar`; tanpa itu ia tak bisa dinilai dan
 *     akan mengulang C39 di dalam perbaikannya sendiri.
 *  3. `domain` DIBUANG — tidak ada di JENIS_JUJUR, jadi objektif jujur abstain.
 *  4. Kolam menyimpan `jenis` + `benar` sebagai STRING, bukan RegExp — kolam harus
 *     selamat lewat JSONL dan dibaca sisi Python.
 *
 * Pemakaian:
 *   node flywheel/kolam-jujur.mjs migancore:0.14            # lihat saja
 *   node flywheel/kolam-jujur.mjs migancore:0.14 --tulis    # tulis kolam
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JENIS_JUJUR } from '../eval/instrumen-jujur.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KELUAR = path.join(AKAR, 'flywheel', 'dataset', 'grpo', 'kolam-jujur.jsonl');

const model = process.argv[2] ?? 'migancore:0.14';
const tulis = process.argv.includes('--tulis');
const kunci = model.replace(/[:/]/g, '_');

// ── Pola `benar` untuk soal fakta — DIBACA dari petak-40, tidak disalin tangan ──
//
// Versi pertama berkas ini menyalin pola-pola ini dengan tangan, dan enam dari
// dua belas SALAH (ditulis "jakarta/rupiah/garuda/borobudur" padahal aslinya
// "165/sunda/3.600/yen"). Itu C38 terulang di dalam perbaikan C39 — nilai
// ditulis dari ingatan alih-alih dari sumbernya, dan terdengar masuk akal.
// Akibatnya akan senyap dan busuk: jawaban BENAR dinilai gagal, kolam terisi
// soal palsu, dan RLVR belajar dari vonis yang keliru.
//
// Karena itu tidak ada lagi penyalinan. Polanya diurai dari berkas petaknya
// sendiri, dan jumlahnya dijaga — kalau petak berubah dan penguraian meleset,
// panen GAGAL, tidak diam-diam menghasilkan kolam yang kurang.
const SUMBER_PETAK = path.join(AKAR, 'eval', 'uji-halusinasi.mjs');
const POLA_FAKTA = {};
{
  const src = fs.readFileSync(SUMBER_PETAK, 'utf8');
  const re = /\{\s*id:\s*"([^"]+)",\s*jenis:\s*"fakta",\s*q:\s*"(?:[^"\\]|\\.)*",\s*benar:\s*\/((?:[^/\\]|\\.)+)\/[a-z]*\s*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) POLA_FAKTA[m[1]] = m[2];
  const n = Object.keys(POLA_FAKTA).length;
  const nDiPetak = (src.match(/jenis:\s*"fakta"/g) || []).length;
  if (n === 0 || n !== nDiPetak) {
    console.error(`GAGAL menguraikan pola fakta dari ${path.relative(AKAR, SUMBER_PETAK)}: terurai ${n}, ada ${nDiPetak} soal fakta di petak.`);
    console.error('Petak berubah bentuk. Perbaiki penguraiannya — JANGAN menyalin pola dengan tangan.');
    process.exit(1);
  }
}

// ── Kumpulkan tiap soal dari seluruh putaran yang tersimpan ─────────────────
// Nama pembungkus DIJANGKARI dan akhir berkas DIKUNCI. Versi pertama memakai
// awalan longgar `^hasil-halu-${kunci}-` dan itu menyeret
// `hasil-halu-migancore_0.14-tool-polos.json` ke dalam kolam `migancore:0.14` —
// dua MODEL BERBEDA, kegagalannya tercampur, tanpa satu pun pesan. Kelas cacat
// "irisan penanda longgar" yang sudah tercatat, terulang lagi. Yang menangkapnya
// bukan penjaga, melainkan membaca daftar berkas yang tersaring.
const PEMBUNGKUS = ['polos', 'baik'];
const reBerkas = new RegExp(`^hasil-halu-${kunci.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(${PEMBUNGKUS.join('|')})\\.json$`);
const berkas = fs.readdirSync(path.join(AKAR, 'eval')).filter((f) => reBerkas.test(f));

if (!berkas.length) {
  console.error(`Tidak ada hasil petak-40 untuk ${model}.`);
  console.error(`Jalankan dulu: node eval/uji-halusinasi.mjs ${model} polos`);
  process.exit(1);
}

/** id -> { jenis, q, gagal, total } */
const per = new Map();
for (const f of berkas) {
  let isi;
  try { isi = JSON.parse(fs.readFileSync(path.join(AKAR, 'eval', f), 'utf8')); } catch { continue; }
  for (const r of Array.isArray(isi) ? isi : []) {
    if (!r?.id || !r?.jenis) continue;
    const e = per.get(r.id) ?? { jenis: r.jenis, q: r.q, gagal: 0, total: 0 };
    e.total++;
    // BENAR = model menjawab dengan jujur/tepat. Selain itu (NGARANG / SALAH) = gagal.
    if (r.hasil !== 'BENAR') e.gagal++;
    per.set(r.id, e);
  }
}

// ── Saring: hanya yang masih gagal, hanya jenis yang bisa dinilai ───────────
const kolam = [];
const dibuang = { sudahDikuasai: 0, jenisTakDinilai: 0, faktaTanpaPola: 0 };

// PEMBERAT (ballast) — soal `fakta` ikut masuk MESKI model sudah menguasainya.
//
// Alasannya bukan kelonggaran, melainkan pagar. Kolam yang HANYA berisi jebakan
// mengajarkan satu hal saja: menolak. Itu jalan lurus menuju over-refusal —
// kegagalan yang gerbang dua-arah kami dibangun untuk menangkap, dan yang sudah
// hampir terjadi di V16-JUJUR (`fakta` turun 11,2 -> 10,2).
//
// Soal fakta yang dijawab benar 8/8 memang beragam nol, jadi hari ini ia tidak
// memberi gradien. Tapi ia BUKAN beban mati: begitu latihan mulai menggeser model
// ke arah menolak segalanya, soal-soal itu MULAI gagal, ragamnya muncul, dan
// advantage negatifnya menarik model kembali. Ia asuransi yang menganggur sampai
// dibutuhkan — dan justru menganggur berarti model masih sehat.
const PEMBERAT_FAKTA = true;

for (const [id, e] of [...per].sort()) {
  if (!JENIS_JUJUR.has(e.jenis)) { dibuang.jenisTakDinilai++; continue; }
  const pemberat = PEMBERAT_FAKTA && e.jenis === 'fakta';
  if (e.gagal === 0 && !pemberat) { dibuang.sudahDikuasai++; continue; }
  if (e.jenis === 'fakta' && !POLA_FAKTA[id]) { dibuang.faktaTanpaPola++; continue; }
  kolam.push({
    id, jenis: e.jenis, t: e.q,
    ...(e.jenis === 'fakta' ? { benar: POLA_FAKTA[id], _pemberat: e.gagal === 0 } : {}),
    _gagal: e.gagal, _total: e.total,
  });
}

// ── Laporan ────────────────────────────────────────────────────────────────
const perJenis = {};
for (const s of kolam) perJenis[s.jenis] = (perJenis[s.jenis] ?? 0) + 1;
const lajuGagal = kolam.length
  ? kolam.reduce((a, s) => a + s._gagal / s._total, 0) / kolam.length : 0;

console.log(`\n# Kolam kejujuran dari kegagalan NYATA — ${model}`);
console.log(`  sumber        : ${berkas.length} berkas hasil · ${per.size} soal unik`);
console.log(`  MASUK kolam   : ${kolam.length}  ${JSON.stringify(perJenis)}`);
console.log(`  laju gagal rata-rata di kolam: ${(lajuGagal * 100).toFixed(1)}%`);
console.log(`  dibuang       : sudah dikuasai ${dibuang.sudahDikuasai} · jenis tak dinilai ${dibuang.jenisTakDinilai} · fakta tanpa pola ${dibuang.faktaTanpaPola}`);

if (!kolam.length) {
  console.error('\nKOLAM KOSONG — model tidak gagal di satu soal pun, atau berkas hasilnya tidak terbaca.');
  process.exit(1);
}
if (lajuGagal < 0.30) {
  console.log(`\n  PERINGATAN: laju gagal ${(lajuGagal * 100).toFixed(1)}% rendah. A19 memperingatkan`);
  console.log('  kolam yang terlalu mudah menghasilkan objektif jenuh. Pra-terbang akan memutuskan.');
}

if (tulis) {
  fs.mkdirSync(path.dirname(KELUAR), { recursive: true });
  fs.writeFileSync(KELUAR, kolam.map((s) => JSON.stringify(s)).join('\n') + '\n');
  console.log(`\n  tertulis: ${path.relative(AKAR, KELUAR)}  (${kolam.length} baris)`);
} else {
  console.log('\n  (belum ditulis — tambahkan --tulis)');
}
