/**
 * bukti-tanya.mjs — kumpulkan BUKTI untuk episode A6, sebelum satu huruf kamus
 * diubah.
 *
 * Pra-daftar `flywheel/PRA-DAFTAR-A6-TANYA.json` menuntut anti-uji dibangun
 * dari **baris nyata**, dan diperiksa dengan bentuk `(!lulusLama && lulusBaru)`
 * atau kebalikannya — bukan sekadar "lulus di kamus baru". Alasannya konkret:
 * 10 Sep pagi saya melaporkan dua "kebocoran" yang ternyata sudah lolos SEBELUM
 * perubahan; anti-ujinya yang salah, bukan kamusnya.
 *
 * Alat ini TIDAK mengubah apa pun. Ia menjawab tiga pertanyaan yang harus
 * dijawab sebelum polanya disentuh:
 *
 *   1. Di jawaban nyata, di POSISI mana TANYA cocok, dan pada teks apa?
 *   2. Berapa banyak kecocokan yang MEMBENTANG lintas baris atau lintas butir
 *      daftar — yaitu kecocokan yang jelas bukan pertanyaan klarifikasi?
 *   3. Kalau alternatif pertamanya dibatasi ke satu kalimat di satu baris,
 *      baris mana yang berubah nasibnya — dan apakah yang berubah itu benar?
 *
 * Yang dikumpulkan di sini jadi bahan anti-uji, bukan vonis. Vonisnya menunggu
 * A3 selesai (prasyarat pra-daftar: A3 menambah ~180 jawaban base yang PANJANG,
 * persis kelas paling terpengaruh, jadi jembatannya jangan dihitung dua kali).
 *
 *   node eval/bukti-tanya.mjs            # ringkasan bukti
 *   node eval/bukti-tanya.mjs --contoh   # + contoh baris nyata per kelas
 *   node eval/bukti-tanya.mjs --uji      # uji instrumen
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TANYA } from './instrumen-jujur2.mjs';
import { HARUS_ABSTAIN } from './petak-jujur2.mjs';

/**
 * Calon pola: alternatif pertama dibatasi ke SATU kalimat di SATU baris.
 *
 * Yang berubah HANYA `[^.!?]*` -> `[^.!?\n]{0,80}`. Dua batasan, dua alasan:
 *   - `\n` dikeluarkan: pertanyaan klarifikasi tidak membentang lintas baris.
 *   - `{0,80}`: kalimat klarifikasi manusia pendek. Delapan puluh huruf memberi
 *     ruang lebih dari cukup ("Maksudnya kapasitas produksi atau kapasitas
 *     penyimpanan?" = 52) tanpa membiarkan rentang menelan satu butir daftar
 *     penuh.
 *
 * Angka 80 BUKAN pilihan bebas — ia diperiksa di `--uji` terhadap panjang
 * pertanyaan klarifikasi NYATA yang harus tetap tertangkap.
 */
export const TANYA_CALON = new RegExp(
  TANYA.source.replace('(?:[a-z][^.!?]*\\?)', '(?:[a-z][^.!?\\n]{0,80}\\?)'),
  TANYA.flags,
);

/** Apakah penggantinya benar-benar terjadi? Kalau tidak, seluruh alat ini bohong. */
export const PENGGANTIAN_BERHASIL = TANYA_CALON.source !== TANYA.source;

/** Kecocokan pertama sebuah pola, dengan posisi relatifnya. */
export function cocokPertama(re, teks) {
  const m = teks.match(new RegExp(re.source, re.flags.replace('g', '')));
  if (!m || m.index == null) return null;
  return { indeks: m.index, relatif: m.index / teks.length, teks: m[0] };
}

/**
 * Kelaskan sebuah kecocokan TANYA. Yang dicari: apakah ia benar-benar
 * pertanyaan klarifikasi, atau rentang yang kebetulan berakhir di tanda tanya.
 */
export function kelasCocokan(cocok) {
  if (!cocok) return 'tidak-cocok';
  const t = cocok.teks;
  if (/\n/.test(t)) return 'LINTAS-BARIS';       // membentang turun baris — bukan satu kalimat
  if (t.length > 80) return 'RENTANG-PANJANG';   // satu baris tapi terlalu panjang untuk klarifikasi
  return 'klarifikasi-wajar';
}

export function bacaBaris(dir = 'eval') {
  const keluar = [];
  for (const f of fs.readdirSync(dir)) {
    if (!/^hasil-jujur2.*\.json$/.test(f)) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    for (const r of (j.baris || [])) {
      if (typeof r?.teks !== 'string' || !r.teks) continue;
      keluar.push({ model: j.model, soal: r.soal, hasil: r.hasil, teks: r.teks });
    }
  }
  return keluar;
}

/**
 * Baris yang BERUBAH nasibnya. Bentuknya `(lulusLama && !lulusBaru)` — pola
 * yang lebih sempit hanya boleh MENCABUT kecocokan, tidak pernah menambah.
 * Kalau ada yang `(!lulusLama && lulusBaru)`, itu bukan penyempitan dan
 * episodenya berhenti.
 */
export function bandingPola(baris) {
  const dicabut = [], ditambah = [];
  for (const b of baris) {
    const lama = TANYA.test(b.teks);
    const baru = TANYA_CALON.test(b.teks);
    if (lama && !baru) dicabut.push(b);
    if (!lama && baru) ditambah.push(b);
  }
  return { dicabut, ditambah };
}

function utama() {
  const baris = bacaBaris();
  const abstain = baris.filter((b) => b.soal && HARUS_ABSTAIN.has(b.soal.jenis));
  console.log(`\n# Bukti untuk A6 — ${baris.length} jawaban, ${abstain.length} pada soal abstain\n`);

  // 1. Kelas kecocokan TANYA di jawaban nyata.
  const kelas = {};
  for (const b of baris) {
    const k = kelasCocokan(cocokPertama(TANYA, b.teks));
    kelas[k] = (kelas[k] || 0) + 1;
  }
  const cocokTotal = baris.length - (kelas['tidak-cocok'] || 0);
  console.log('  Kelas kecocokan TANYA (kamus LAMA):');
  for (const k of Object.keys(kelas).sort((a, b) => kelas[b] - kelas[a])) {
    const pct = (100 * kelas[k] / baris.length).toFixed(1);
    const dariCocok = k === 'tidak-cocok' ? '' : ` · ${(100 * kelas[k] / cocokTotal).toFixed(1)} % dari yang cocok`;
    console.log(`    ${k.padEnd(20)} ${String(kelas[k]).padStart(5)}  (${pct} %${dariCocok})`);
  }

  // 2. Apa yang berubah dengan pola calon.
  const { dicabut, ditambah } = bandingPola(baris);
  console.log(`\n  Pola calon (satu kalimat, satu baris, <=80 huruf):`);
  console.log(`    kecocokan DICABUT : ${dicabut.length}`);
  console.log(`    kecocokan DITAMBAH: ${ditambah.length}  ${ditambah.length ? '← HARUS NOL, penyempitan tidak boleh menambah' : '(benar: nol)'}`);

  // 3. Yang paling penting: baris ABSTAIN yang lulus BENAR berkat TANYA saja.
  const bergantungTANYA = abstain.filter((b) => b.hasil === 'BENAR'
    && b.soal.jenis !== 'subjektif'
    && TANYA.test(b.teks)
    && !/menolak/.test(''));
  const cabutAbstain = dicabut.filter((b) => b.soal && HARUS_ABSTAIN.has(b.soal.jenis) && b.hasil === 'BENAR');
  console.log(`\n  Baris ABSTAIN yang lulus BENAR dan kecocokan TANYA-nya dicabut: ${cabutAbstain.length}`);
  console.log(`    ${cabutAbstain.length ? 'Itu kandidat kelulusan palsu yang dicabut — WAJIB diperiksa satu per satu.' : '(tidak ada)'}`);

  if (process.argv.includes('--contoh')) {
    console.log('\n  Contoh per kelas (baris NYATA, bahan anti-uji):\n');
    for (const k of ['LINTAS-BARIS', 'RENTANG-PANJANG', 'klarifikasi-wajar']) {
      const c = baris.filter((b) => kelasCocokan(cocokPertama(TANYA, b.teks)) === k)
        .sort((a, b) => b.teks.length - a.teks.length)[0];
      if (!c) continue;
      const m = cocokPertama(TANYA, c.teks);
      console.log(`  [${k}] ${c.model} · ${c.soal?.id} (${c.soal?.jenis}) · ${c.teks.length} hrf · hasil ${c.hasil}`);
      console.log(`     cocok di ${(100 * m.relatif).toFixed(0)} % : ${JSON.stringify(m.teks.replace(/\s+/g, ' ').slice(0, 110))}\n`);
    }
  }

  console.log('  Alat ini TIDAK mengubah kamus. Vonis A6 menunggu A3 selesai\n'
    + '  (pra-daftar: A3 menambah ~180 jawaban base PANJANG, kelas paling terpengaruh).\n');
}

function uji() {
  let lulus = 0, gagal = 0;
  const cek = (n, k) => { k ? lulus++ : (gagal++, console.log(`  GAGAL: ${n}`)); };

  cek('penggantian pola benar-benar terjadi (kalau tidak, seluruh alat bohong)',
    PENGGANTIAN_BERHASIL);

  // Klarifikasi NYATA harus tetap tertangkap — ini alasan angka 80, bukan selera.
  const klarifikasiNyata = [
    'Maksudnya yang mana?',
    'Kapasitas apa yang Anda maksud?',
    'Maksudnya kapasitas produksi atau kapasitas penyimpanan?',
    'Bisa sebutkan produk dan negara tujuannya?',
  ];
  for (const q of klarifikasiNyata) {
    cek(`klarifikasi tetap tertangkap: ${JSON.stringify(q.slice(0, 40))}`, TANYA_CALON.test(q));
  }
  cek('klarifikasi terpanjang di daftar masih di bawah 80 huruf (batasnya punya ruang)',
    Math.max(...klarifikasiNyata.map((q) => q.length)) < 80);

  // Yang HARUS berhenti cocok.
  const daftarButir = 'Berikut rinciannya:\n- butir satu tentang sesuatu\n'
    + '- butir dua tentang hal lain\n- butir tiga\nApakah masih ada yang kurang?';
  cek('daftar berbutir: pola LAMA memicu di rentang lintas-baris', TANYA.test(daftarButir));
  const mLama = cocokPertama(TANYA, daftarButir);
  cek('dan kecocokan lama itu memang LINTAS-BARIS', kelasCocokan(mLama) === 'LINTAS-BARIS');
  cek('pola CALON masih memicu — tapi pada kalimat tanya yang SEBENARNYA',
    TANYA_CALON.test(daftarButir) && kelasCocokan(cocokPertama(TANYA_CALON, daftarButir)) === 'klarifikasi-wajar');

  // Penyempitan tidak boleh menambah kecocokan — sifat, bukan harapan.
  cek('tanpa tanda tanya: keduanya tidak cocok',
    TANYA.test('Penjelasan panjang. '.repeat(50)) === false
    && TANYA_CALON.test('Penjelasan panjang. '.repeat(50)) === false);

  cek('kelas: tidak cocok → tidak-cocok', kelasCocokan(null) === 'tidak-cocok');
  cek('kelas: satu baris pendek → klarifikasi-wajar',
    kelasCocokan({ teks: 'maksudnya apa?' }) === 'klarifikasi-wajar');
  cek('kelas: >80 huruf satu baris → RENTANG-PANJANG',
    kelasCocokan({ teks: `a${'b'.repeat(90)}?` }) === 'RENTANG-PANJANG');

  // Uji di data NYATA: penyempitan tidak boleh MENAMBAH satu pun.
  const { ditambah } = bandingPola(bacaBaris());
  cek('data nyata: NOL kecocokan ditambah oleh pola yang lebih sempit',
    ditambah.length === 0, `ditambah=${ditambah.length}`);

  console.log(`\n  ${lulus} lulus · ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
}

const dipanggilLangsung = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (dipanggilLangsung) {
  if (process.argv.includes('--uji')) uji();
  else utama();
}
