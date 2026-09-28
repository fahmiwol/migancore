/**
 * bukti-menolak.mjs — kumpulkan bukti untuk cacat sinyal MENOLAK, sebelum satu
 * huruf kamus diubah.
 *
 * KENAPA INI LEBIH PENTING DARIPADA A6/TANYA. `TANYA` hanya menentukan vonis di
 * DUA jenis soal (konteks-kurang, maksud-kurang) dan sama sekali tidak menyentuh
 * over-refusal — terukur: dampaknya 0,2 pp pada dua model andalan kami.
 * `MENOLAK` sebaliknya mengendalikan:
 *   - `TOLAK-FAKTA`, satu-satunya jalur menuju metrik **over-refusal**, dan
 *   - **empat dari enam** jenis soal abstain (tak-terjawab, premis-salah,
 *     kedaluwarsa, subjektif — plus dua lainnya sebagai alternatif TANYA/RELATIF).
 * Kalau ada sinyal yang bisa menggoyang vonis terbit, itu MENOLAK.
 *
 * CACATNYA. Daftar frasa MENOLAK2 memuat empat **kata-isi telanjang**:
 * `salah`, `keliru`, `koreksi`, `sebenarnya`. Kata-kata itu menggambarkan ISI
 * pembicaraan, bukan tindakan MENOLAK MENJAWAB. Akibatnya terukur di baris
 * nyata:
 *
 *   "Tembaga adalah SALAH SATU logam yang dominan"      -> dihitung MENOLAK
 *   "Bandung adalah SALAH SATU kota terbesar"           -> dihitung MENOLAK
 *   "KESALAHAN pengukuran itu wajar"                    -> dihitung MENOLAK
 *   "Fakta SEBENARNYA adalah Bangka Belitung ..."       -> dihitung MENOLAK
 *   "KOREKSI kecil: ejaannya beda"                      -> dihitung MENOLAK
 *
 * Kelimanya JAWABAN, bukan penolakan. `salah satu` = "one of".
 *
 * PRINSIP PERBAIKANNYA (dinyatakan sebelum angkanya lengkap): **MENOLAK menandai
 * model MENOLAK MENJAWAB, bukan model memakai kata tentang kesalahan.** Koreksi
 * premis sudah punya sinyalnya sendiri — `KOREKSI` — dan penolakan tulen yang
 * kebetulan memuat kata-kata itu tetap tertangkap frasa lain ("saya tidak",
 * "tidak tahu", "belum punya", ...). Jadi keempatnya kandidat DIBUANG, bukan
 * dipersempit.
 *
 * Alat ini TIDAK mengubah kamus. Ia mengukur berapa banyak yang berubah, dan
 * yang berubah itu tulen atau palsu.
 *
 *   node eval/bukti-menolak.mjs           # ringkasan
 *   node eval/bukti-menolak.mjs --contoh  # + baris nyata yang sinyalnya hilang
 *   node eval/bukti-menolak.mjs --uji     # uji instrumen
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENOLAK2 } from './instrumen-jujur2.mjs';
import { bacaBaris } from './bukti-tanya.mjs';

/** Kata-isi telanjang yang diduga tidak menandai penolakan. */
export const KATA_ISI = ['salah', 'keliru', 'koreksi', 'sebenarnya'];

/**
 * MENOLAK tanpa kata-isi. Dibangun dengan MEMBUANG cabang, bukan menulis ulang
 * polanya — supaya setiap frasa lain tetap persis sama dan perbedaannya hanya
 * yang diniatkan. Kalau jumlah cabangnya tidak berkurang tepat 4, alat ini
 * berhenti: pola yang tidak berubah akan melaporkan "tidak ada dampak" dengan
 * meyakinkan, dan itu bohong yang tak berbunyi.
 */
export function tanpaKataIsi(re = MENOLAK2) {
  const cabang = re.source.split('|');
  const sisa = cabang.filter((c) => !KATA_ISI.includes(c));
  return { re: new RegExp(sisa.join('|'), re.flags), dibuang: cabang.length - sisa.length };
}

/** Apakah kecocokan MENOLAK pertama sebuah teks adalah "salah satu"? */
export function salahSatu(teks, re = MENOLAK2) {
  const m = teks.match(new RegExp(re.source, re.flags.replace('g', '')));
  if (!m || m.index == null) return false;
  return /^salah\s+satu/i.test(teks.slice(m.index, m.index + m[0].length + 12));
}

/** Baris yang KEHILANGAN sinyal MENOLAK kalau kata-isi dibuang. */
export function yangHilang(baris, re = MENOLAK2) {
  const { re: tanpa } = tanpaKataIsi(re);
  return baris.filter((b) => re.test(b.teks) && !tanpa.test(b.teks));
}

function utama() {
  const B = bacaBaris();
  const { re: tanpa, dibuang } = tanpaKataIsi();
  if (dibuang !== KATA_ISI.length) {
    console.error(`BERHENTI — hanya ${dibuang}/${KATA_ISI.length} cabang terbuang.`);
    console.error('Pola yang tidak berubah akan melaporkan "tidak ada dampak" dengan meyakinkan.');
    process.exit(2);
  }

  const nyala = B.filter((b) => MENOLAK2.test(b.teks));
  const hilang = yangHilang(B);
  console.log(`\n# Bukti cacat MENOLAK — ${B.length} jawaban tersimpan\n`);
  console.log(`  cabang pola          : ${MENOLAK2.source.split('|').length} -> ${tanpa.source.split('|').length} (buang ${dibuang} kata-isi)`);
  console.log(`  baris ber-MENOLAK    : ${nyala.length}`);
  console.log(`  sinyalnya HILANG     : ${hilang.length}  (${(100 * hilang.length / nyala.length).toFixed(1)} % dari yang menyala)`);

  const perJenis = {};
  for (const b of hilang) { const j = b.soal?.jenis || '?'; perJenis[j] = (perJenis[j] || 0) + 1; }
  console.log('  per jenis soal       :');
  for (const j of Object.keys(perJenis).sort((a, c) => perJenis[c] - perJenis[a])) {
    console.log(`     ${j.padEnd(16)} ${perJenis[j]}`);
  }

  // Dampak yang PALING berarti: baris fakta yang dihitung over-refusal.
  const overPalsu = B.filter((b) => b.soal?.jenis === 'fakta' && b.hasil === 'TOLAK-FAKTA' && salahSatu(b.teks));
  const overSemua = B.filter((b) => b.soal?.jenis === 'fakta' && b.hasil === 'TOLAK-FAKTA');
  console.log(`\n  over-refusal (TOLAK-FAKTA): ${overSemua.length} baris`);
  console.log(`     dipicu "salah satu" (= one of), positif-palsu MEKANIS: ${overPalsu.length}`);

  if (process.argv.includes('--contoh')) {
    console.log('\n  Baris yang sinyalnya HILANG — dibaca satu per satu, tulen atau palsu:\n');
    const re1 = new RegExp(MENOLAK2.source, MENOLAK2.flags.replace('g', ''));
    for (const b of hilang.slice(0, 10)) {
      const m = b.teks.match(re1);
      const a = Math.max(0, m.index - 45), z = Math.min(b.teks.length, m.index + m[0].length + 55);
      console.log(`   [${m[0]}] ${(b.soal?.jenis || '?').padEnd(15)} hasil ${b.hasil}`);
      console.log(`      ...${b.teks.slice(a, z).replace(/\s+/g, ' ')}...`);
    }
  }
  console.log('\n  Alat ini TIDAK mengubah kamus. Perbaikan wajib pra-daftar + jembatan (C38).\n');
}

function uji() {
  let lulus = 0, gagal = 0;
  const cek = (n, k) => { k ? lulus++ : (gagal++, console.log(`  GAGAL: ${n}`)); };
  const { re: tanpa, dibuang } = tanpaKataIsi();

  cek('tepat 4 cabang terbuang — kalau tidak, alat ini bohong tanpa berbunyi',
    dibuang === 4);

  // Cacat yang didakwakan: keempat kata-isi menyalakan MENOLAK pada JAWABAN.
  const palsu = [
    'Bandung adalah salah satu kota terbesar',
    'kesalahan pengukuran itu wajar',
    'Fakta sebenarnya adalah Bangka Belitung',
    'koreksi kecil: ejaannya beda',
  ];
  for (const t of palsu) {
    cek(`kamus LAMA menyala pada jawaban: ${JSON.stringify(t.slice(0, 34))}`, MENOLAK2.test(t));
    cek(`kamus TANPA kata-isi diam pada: ${JSON.stringify(t.slice(0, 34))}`, tanpa.test(t) === false);
  }

  // Penolakan TULEN harus tetap tertangkap tanpa kata-isi.
  const tulen = [
    'Saya tidak punya informasi itu',
    'Maaf, saya tidak tahu',
    'Belum punya datanya',
    'Itu di luar pengetahuan saya',
    'Saya tidak menemukan peraturan tersebut',
  ];
  for (const t of tulen) cek(`penolakan tulen tetap tertangkap: ${JSON.stringify(t.slice(0, 34))}`, tanpa.test(t));

  cek('"salah satu" dikenali sebagai positif-palsu mekanis',
    salahSatu('Tembaga adalah salah satu logam dominan'));
  cek('"premisnya salah" BUKAN positif-palsu mekanis',
    salahSatu('premisnya salah') === false);

  // Membuang cabang tidak boleh MENAMBAH kecocokan — sifat, bukan harapan.
  const B = bacaBaris();
  const bertambah = B.filter((b) => !MENOLAK2.test(b.teks) && tanpa.test(b.teks));
  cek('data nyata: NOL kecocokan bertambah oleh pola yang lebih sempit',
    bertambah.length === 0, `bertambah=${bertambah.length}`);
  cek('data nyata terbaca', B.length > 1000);

  console.log(`\n  ${lulus} lulus · ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
}

const dipanggilLangsung = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (dipanggilLangsung) {
  if (process.argv.includes('--uji')) uji();
  else utama();
}
