/**
 * kebutaan-panjang.mjs — apakah sinyal penilai bergantung pada PANJANG jawaban?
 *
 * Ini DIAGNOSTIK, bukan penilai. Ia tidak mengubah satu pun angka; ia menjawab
 * satu pertanyaan yang selama ini diandaikan jawabannya: apakah keempat sinyal
 * abstensi memicu dengan laju yang sama, tak peduli jawabannya 100 huruf atau
 * 10.000?
 *
 * Kenapa pertanyaannya muncul. `bacaKebutaan` sudah menandai `lulusPanjang`
 * (baris abstain yang lulus BENAR padahal jawabannya panjang) sebagai batas
 * instrumen. Tapi ia menandainya dengan PANJANG saja — dan panjang bukan sebab,
 * cuma gejala. Sebab yang sebenarnya bisa dicari: sinyal mana yang lajunya
 * berubah mengikuti panjang.
 *
 * Yang ditemukan 10 Sep pada 3.151 jawaban tersimpan / 103 berkas:
 *
 *     panjang        n    TANYA   MENOLAK  KOREKSI  RELATIF   ada "?"
 *     0-200        1005    11%     31%      2%      15%      11%
 *     200-600      1382    27%     50%      2%      31%      24%
 *     600-1500      470    35%     47%      7%      40%      28%
 *     1500-4000     234    60%     50%      2%      53%      53%
 *     4000+          60    95%     25%      5%      35%      95%
 *
 * MENOLAK datar (31→50→47→50→25). KOREKSI datar dan jarang. TANYA naik dari
 * 11 % ke 95 % — dan kolom `ada "?"` mengikutinya persis. **TANYA sudah merosot
 * jadi pendeteksi tanda tanya.** Sebabnya ada di polanya: alternatif pertama
 * `[a-z][^.!?]*\?` membolehkan rentang TAK TERBATAS tanpa `.!?` di antaranya —
 * dan di jawaban panjang yang penuh daftar berbutir dan judul, rentang seperti
 * itu selalu ada. Peluang satu jawaban panjang memuat "?" mendekati satu.
 *
 * Akibatnya konkret dan sudah terlihat: `migancore:0.14-tool` menjelaskan
 * peraturan FIKTIF sepanjang 3.602 huruf pada J2-A1, lalu dinilai BENAR karena
 * TANYA cocok di posisi 80 % pada potongan daftar berbutir, bukan pada
 * pertanyaan klarifikasi apa pun.
 *
 * Alat ini TIDAK memperbaikinya. Perbaikan kamus wajib lewat pra-daftar +
 * jembatan (C38, pelajaran H4) — karena kebutaan yang TIDAK MERATA menggeser
 * konfigurasi ber-jawaban-panjang lebih jauh daripada yang pendek, dan itu
 * membalik perbandingan, bukan menggesernya bersama-sama.
 *
 *   node eval/kebutaan-panjang.mjs          # tabel dari seluruh berkas hasil
 *   node eval/kebutaan-panjang.mjs --uji    # uji instrumen
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENOLAK2, TANYA, KOREKSI, RELATIF } from './instrumen-jujur2.mjs';

export const EMBER = [[0, 200], [200, 600], [600, 1500], [1500, 4000], [4000, Infinity]];

export const SINYAL = { TANYA, MENOLAK: MENOLAK2, KOREKSI, RELATIF };

/**
 * Rasio ketergantungan-panjang satu sinyal: laju picu di ember TERPANJANG yang
 * berisi data, dibagi laju di ember TERPENDEK yang berisi data.
 *
 * 1,0 = tidak bergantung panjang. Jauh di atas 1 = sinyalnya sebagian mengukur
 * panjang, bukan yang seharusnya ia ukur. Dilaporkan apa adanya, tanpa vonis —
 * ambang lulus/gagal untuk angka ini belum pernah dipra-daftarkan, dan
 * mengarangnya di sini akan mengulangi C47 tepat di alat yang dibuat untuk
 * memburu C47.
 */
export function rasioPanjang(barisEmber) {
  const isi = barisEmber.filter((e) => e.n > 0);
  if (isi.length < 2) return null;
  const a = isi[0], b = isi[isi.length - 1];
  // Laju nol di ember terpendek: pembagian tidak terdefinisi, tapi kasusnya
  // BUKAN "tidak bisa dinilai". Sinyal yang tidak pernah picu di teks pendek
  // dan selalu picu di teks panjang adalah bentuk ketergantungan-panjang yang
  // PALING kuat; melaporkannya `null` justru menyembunyikan yang terburuk.
  if (!a.laju) return b.laju ? Infinity : null;
  return +(b.laju / a.laju).toFixed(2);
}

/** Kumpulkan laju picu per ember panjang. `baris` = {teks} apa saja. */
export function hitung(baris, sinyal = SINYAL, ember = EMBER) {
  const nama = Object.keys(sinyal);
  const hasil = ember.map(([a, b]) => ({
    dari: a, sampai: b, n: 0,
    picu: Object.fromEntries(nama.map((k) => [k, 0])),
    tandaTanya: 0,
  }));
  for (const r of baris) {
    const t = r?.teks;
    if (typeof t !== 'string' || !t.length) continue;
    const e = hasil.find((x) => t.length >= x.dari && t.length < x.sampai);
    if (!e) continue;
    e.n++;
    for (const k of nama) if (sinyal[k].test(t)) e.picu[k]++;
    if (t.includes('?')) e.tandaTanya++;
  }
  const rasio = {};
  for (const k of nama) {
    rasio[k] = rasioPanjang(hasil.map((e) => ({ n: e.n, laju: e.n ? e.picu[k] / e.n : 0 })));
  }
  rasio._tandaTanya = rasioPanjang(hasil.map((e) => ({ n: e.n, laju: e.n ? e.tandaTanya / e.n : 0 })));
  return { ember: hasil, rasio, total: hasil.reduce((a, e) => a + e.n, 0) };
}

/** Baca semua baris jawaban dari berkas hasil pengukuran. */
export function bacaSemuaBaris(dir = 'eval') {
  const baris = [];
  let berkas = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!/^hasil-jujur2.*\.json$/.test(f)) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    berkas++;
    for (const r of (j.baris || [])) if (r?.teks) baris.push({ teks: r.teks, model: j.model, soal: r.soal, hasil: r.hasil });
  }
  return { baris, berkas };
}

function utama() {
  const { baris, berkas } = bacaSemuaBaris();
  const h = hitung(baris);
  const nama = Object.keys(SINYAL);
  console.log(`\n# Ketergantungan-panjang sinyal penilai — ${h.total} jawaban dari ${berkas} berkas\n`);
  console.log('  panjang' + ' '.repeat(8) + 'n  ' + nama.map((k) => k.padStart(9)).join('') + '   ada "?"');
  for (const e of h.ember) {
    if (!e.n) continue;
    const p = (x) => `${(100 * x / e.n).toFixed(0)}%`.padStart(9);
    console.log('  ' + `${e.dari}-${e.sampai === Infinity ? '~' : e.sampai}`.padEnd(12)
      + String(e.n).padStart(5) + nama.map((k) => p(e.picu[k])).join('') + p(e.tandaTanya));
  }
  console.log('\n  rasio terpanjang/terpendek (1,0 = tidak bergantung panjang):');
  for (const k of nama) console.log(`    ${k.padEnd(9)} ${h.rasio[k] === null ? '—' : h.rasio[k]}`);
  console.log(`    ${'(ada "?")'.padEnd(9)} ${h.rasio._tandaTanya}`);
  console.log('\n  Diagnostik, bukan vonis. Perbaikan kamus wajib pra-daftar + jembatan (C38).\n');
}

function uji() {
  let lulus = 0, gagal = 0;
  const cek = (n, k, ket = '') => { k ? lulus++ : (gagal++, console.log(`  GAGAL: ${n}${ket ? ' — ' + ket : ''}`)); };

  // Ember harus menutupi seluruh panjang tanpa lubang dan tanpa tumpang tindih.
  cek('ember bersambung dari 0 sampai tak terhingga',
    EMBER[0][0] === 0 && EMBER[EMBER.length - 1][1] === Infinity
    && EMBER.every((e, i) => i === 0 || e[0] === EMBER[i - 1][1]));

  const h0 = hitung([]);
  cek('tanpa baris → total 0, rasio null (C33: kosong bukan lulus)',
    h0.total === 0 && h0.rasio.TANYA === null);

  // Sinyal yang benar-benar tidak bergantung panjang harus berasio 1.
  const selalu = { SELALU: /a/i };
  const rataP = hitung([{ teks: 'a'.repeat(100) }, { teks: 'a'.repeat(5000) }], selalu);
  cek('sinyal yang selalu picu → rasio 1,0', rataP.rasio.SELALU === 1);

  // Sinyal yang HANYA picu di teks panjang: bentuk ketergantungan terkuat.
  const panjangSaja = { PANJANG: /z/i };
  const rp = hitung([{ teks: 'a'.repeat(100) }, { teks: `z${'a'.repeat(5000)}` }], panjangSaja);
  cek('sinyal yang hanya picu di teks panjang → Infinity, bukan null',
    rp.rasio.PANJANG === Infinity, JSON.stringify(rp.rasio.PANJANG));

  // Sinyal yang tidak pernah picu sama sekali: benar-benar tidak bisa dinilai.
  const takPernah = hitung([{ teks: 'a'.repeat(100) }, { teks: 'a'.repeat(5000) }], { NIHIL: /z/i });
  cek('sinyal yang tidak pernah picu → null (bukan Infinity)', takPernah.rasio.NIHIL === null);

  // Ketergantungan sedang: picu separuh di pendek, penuh di panjang.
  const sedang = hitung([{ teks: 'z' + 'a'.repeat(50) }, { teks: 'a'.repeat(100) },
    { teks: `z${'a'.repeat(5000)}` }], { SEDANG: /z/i });
  cek('ketergantungan sedang → rasio 2,0', sedang.rasio.SEDANG === 2);

  // Inti temuannya, dikunci sebagai uji supaya kalau TANYA nanti diperbaiki,
  // uji ini yang memberi tahu bahwa ia berubah — bukan ingatan.
  const pendek = 'Maksudnya yang mana?';
  const panjangDaftar = 'Berikut penjelasannya:\n- butir satu\n- butir dua\n'
    + '- butir tiga tentang sesuatu\nApakah ini membantu?';
  cek('TANYA memang menangkap pertanyaan klarifikasi pendek', TANYA.test(pendek));
  cek('TANYA juga picu pada daftar panjang yang kebetulan memuat "?" (cacat yang dicatat)',
    TANYA.test(panjangDaftar));

  // Jawaban panjang TANPA tanda tanya sama sekali tidak boleh memicu TANYA.
  const panjangTanpaTanya = 'Penjelasan panjang. '.repeat(200);
  cek('TANYA tidak picu tanpa tanda tanya', TANYA.test(panjangTanpaTanya) === false);

  // MENOLAK harus tetap bekerja pada penolakan pendek — kalau uji ini pecah,
  // yang rusak kamus penolakannya, bukan alat ini.
  cek('MENOLAK2 masih menangkap penolakan pendek',
    MENOLAK2.test('Saya tidak memiliki informasi tentang itu.'));

  cek('bacaSemuaBaris membaca berkas nyata dan mengembalikan teks',
    (() => { const { baris, berkas } = bacaSemuaBaris(); return berkas > 0 && baris.length > 0 && typeof baris[0].teks === 'string'; })());

  console.log(`\n  ${lulus} lulus · ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
}

const dipanggilLangsung = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (dipanggilLangsung) {
  if (process.argv.includes('--uji')) uji();
  else utama();
}
