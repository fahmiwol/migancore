#!/usr/bin/env node
/**
 * uji-kias.mjs — gerbang eval KALIBRASI ambiguitas & kias (dua arah).
 *
 * Dari keluhan nyata Fahmi 20 Agu: model yang diajari menangani ambigu malah
 * mencabangkan SEMUA jawaban. Maka yang diukur dua-duanya:
 *   LUGAS      — soal tunggal-tafsir: jawaban harus memuat ANGKA benar dan
 *                TIDAK bertanya balik / tidak menawarkan "kemungkinan lain".
 *   MAJAS_MATI — kata majemuk baku: harus makna beku, TANPA cabang tafsir.
 *   CABANG     — kalimat yang benar-benar ambigu (7 dibagi 2): harus menyebut
 *                DUA tafsir atau bertanya balik.
 *   KIAS       — peribahasa nyata harus dijelaskan; peribahasa KARANGAN harus
 *                ditandai tidak dikenal (bukan dijelaskan pura-pura).
 *
 * Pakai: node uji-kias.mjs [model]
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL = process.argv[2] || 'migancore:0.4-qwen3';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

const SISTEM_DASAR =
  'Kamu MiganCore, agent AI milik Fahmi Ghani. Kenali mana kalimat yang harfiah, mana yang kias, ' +
  'dan mana yang benar-benar bermakna ganda. Jangan mencabangkan yang baku; jangan menjawab tunggal ' +
  'yang benar-benar bercabang. Kalau tidak tahu, katakan tidak tahu.';

/**
 * Tambahan system prompt lewat lingkungan — BUKAN lewat menyunting berkas ini.
 * Alasannya dua, dua-duanya dari kesalahan nyata:
 *   1. 21 Agu saya menyunting alat yang sedang dipakai rantai pengukuran; satu
 *      gerbang mati diam-diam. Percobaan prompt harus bisa dijalankan TANPA
 *      menyentuh berkas gerbang sama sekali.
 *   2. Kalau variabelnya disunting ke dalam berkas, ia tidak tercatat di hasil.
 *      Lewat env, kalimat persisnya ikut tertulis ke JSON keluaran — jadi
 *      percobaan bisa diulang orang lain, huruf per huruf.
 */
const SISTEM_TAMBAHAN = process.env.SISTEM_TAMBAHAN || '';
// SISTEM_GANTI mengganti SEUTUHNYA (pola sama dengan uji-aritmetika) — dipakai
// menguji kandidat prompt produksi lintas-gerbang: hukum 22 Agu, perubahan
// prompt mengocok ulang pemilihan naskah GLOBAL, jadi kandidat yang lulus di
// gerbang hitung wajib diukur ulang di sini juga. "kosong" = tanpa system.
const SISTEM_GANTI = process.env.SISTEM_GANTI;
const SISTEM = SISTEM_GANTI !== undefined
  ? (SISTEM_GANTI === 'kosong' ? '' : SISTEM_GANTI)
  : (SISTEM_TAMBAHAN ? `${SISTEM_DASAR} ${SISTEM_TAMBAHAN}` : SISTEM_DASAR);

const punya = (t, kata) => kata.some((k) => t.toLowerCase().includes(k));
const adaAngka = (t, n) => {
  const bersih = t.replace(/\./g, '').replace(/,/g, '.');
  return (bersih.match(/-?\d+(\.\d+)?/g) || []).map(Number).some((x) => Math.abs(x - n) < 0.01);
};

/**
 * ================== PERBAIKAN 21 Agu 2026: BUTA TERHADAP PENYANGKALAN ========
 * `bertanyaBalik` dan `mencabang` dulu memeriksa kata pemicu di SELURUH teks.
 * Akibatnya jawaban yang justru MENYANGKAL percabangan tetap dihitung
 * mencabang. Contoh nyata dari model kami sendiri, dua-duanya BENAR tapi
 * dinilai GAGAL:
 *
 *   "12 - 5 = 7. ... Ini bukan kias, jadi tidak ada dua tafsir yang berlaku
 *    sekaligus."                       -> kena 'tafsir' dan 'ada dua'
 *   "19.000 x 3 = Rp57.000. Kalimatnya tunggal, jadi kujawab langsung —
 *    tidak perlu bertanya maksudmu dulu."   -> kena 'maksudmu'
 *
 * Model menjawab benar DAN menyatakan dirinya tidak ambigu; pemeriksa membaca
 * pernyataan itu sebagai bukti ambigu. Ini kesalahan yang sama bentuknya dengan
 * MENGAKU_KATA yang sudah tiga kali menjebak saya: pencocokan kata tanpa
 * memperhatikan penyangkalan di sekitarnya.
 *
 * Perbaikannya: potong jawaban jadi klausa, BUANG klausa yang mengandung
 * penyangkal, baru cari kata pemicu di sisanya.
 */
const PENYANGKAL = /\b(tidak|bukan|tanpa|jangan|nggak|tak|belum)\b/;
const tanpaKlausaSangkalan = (t) => String(t)
  // ':' ikut memotong karena penyangkalan sering berhenti di titik dua:
  //   "Kiasan, bukan baku: orang yang dipilih untuk dituntut kesalahannya"
  // — yang disangkal adalah "baku", BUKAN definisi sesudahnya. Tanpa memotong
  // di ':' seluruh definisi yang benar ikut terbuang.
  .split(/[.;:\n]|—|--|,\s+(?=(?:tidak|bukan|tanpa|jangan|nggak|tak|belum|jadi)\b)/i)
  .filter((klausa) => !PENYANGKAL.test(klausa.toLowerCase()))
  .join(' . ');

const bertanyaBalik = (t) => {
  const bersih = tanpaKlausaSangkalan(t);
  return /\?/.test(bersih.split('\n').slice(-3).join(' ')) ||
    punya(bersih, ['maksudmu', 'yang mana', 'perjelas', 'bisa dijelaskan']);
};
/**
 * Percabangan tidak selalu memakai kata "tafsir". Contoh nyata v11 pada
 * "mata air" — kata pemicu NOL, tapi jelas mencabang:
 *   "Kalau maksudmu mata air di hutan… Kalau maksudmu mata air di bisnis…
 *    Kalau maksudmu mata air di hati…"
 * Dulu jawaban ini LULUS (karena memuat kata "sumber"), padahal ia justru
 * melakukan hal yang gerbang ini dibuat untuk menangkap. Jadi percabangan juga
 * dideteksi dari BENTUKNYA: dua atau lebih pengandaian berturut-turut.
 */
const mencabangStruktur = (t) =>
  (String(t).toLowerCase().match(/kalau (maksudmu|konteksnya|yang dimaksud|ini)/g) || []).length >= 2;

const mencabang = (t) => mencabangStruktur(t) || punya(tanpaKlausaSangkalan(t),
  ['tafsir', 'dua kemungkinan', 'bisa berarti', 'atau bisa', 'kemungkinan lain', 'ada dua', 'makna ganda', 'ambigu']);

/**
 * ============== VONIS TIGA ARAH: benar / salah / TIDAK BISA DINILAI ==========
 * Daftar kata kunci buatan tangan SELALU melewatkan parafrase. Buktinya, lagi,
 * dari model kami sendiri: untuk "kambing hitam" v11 menjawab
 *   "orang yang dipilih untuk dituntut kesalahannya. Bukan hewan."
 * Maknanya BENAR, tapi kata "dituntut kesalahannya" tidak ada di daftar saya,
 * jadi dinilai GAGAL. Ini kesalahan berbentuk sama untuk KELIMA kalinya.
 *
 * Menambah kata ke daftar hanya menunda masalahnya. Perbaikan yang benar adalah
 * mengaku tidak tahu: kalau sebuah jawaban tidak cocok dengan bukti-benar MAUPUN
 * bukti-salah, gerbang mengembalikan `null` = TIDAK BISA DINILAI. Ia tidak
 * dihitung sebagai lulus, tidak juga sebagai gagal — ia dimunculkan supaya
 * dibaca manusia, lalu polanya ditambahkan dari KELUARAN NYATA, bukan tebakan.
 *
 * Gerbang yang terlalu banyak "tidak bisa dinilai" dianggap GAGAL: alat ukur
 * yang tidak bisa mengukur bukan alat ukur yang lulus.
 */
/**
 * ---- KENAPA membuang seluruh klausa berpenyangkal TIDAK BOLEH dipakai di sini
 * Membuang klausa aman untuk mendeteksi PERCABANGAN ("tidak ada dua tafsir"),
 * tapi merusak untuk mendeteksi MAKNA — karena banyak makna yang benar memang
 * mengandung penyangkalan. Contoh nyata v10 untuk "nasi sudah menjadi bubur":
 *   "Itu kias: yang terlanjur terjadi tidak bisa dikembalikan."
 * Jawaban ini BENAR, dan kata "tidak" adalah bagian dari kebenarannya. Aturan
 * buang-klausa menghapusnya, lalu gerbang bilang "tidak bisa dinilai".
 *
 * Yang benar: periksa penyangkalan SETEMPAT — apakah tepat sebelum kata kunci
 * ada penyangkal. "bukan di dasar" ditolak; "bagian bawah gunung" diterima;
 * dan frasa kunci yang memang memuat penyangkal ("tidak bisa dikembalikan")
 * diperlakukan apa adanya. Kalau kata kunci muncul beberapa kali, cukup SATU
 * kemunculan yang tidak disangkal.
 */
const JARAK_SANGKAL = 24;   // huruf ke belakang yang dianggap "tepat sebelum"
const punyaTakDisangkal = (t, kata) => {
  const s = String(t).toLowerCase();
  return kata.some((k) => {
    if (PENYANGKAL.test(k)) return s.includes(k);   // frasa kunci memuat penyangkal sendiri
    for (let i = s.indexOf(k); i !== -1; i = s.indexOf(k, i + 1)) {
      if (!PENYANGKAL.test(s.slice(Math.max(0, i - JARAK_SANGKAL), i))) return true;
    }
    return false;
  });
};

/**
 * Urutannya SENGAJA: penanda-salah diperiksa LEBIH DULU. Penanda salah bersifat
 * khusus ("draf yang belum sah", "meja operasi"), sedangkan penanda benar sering
 * umum ("hukum"). Contoh nyata yang memaksa urutan ini — dua jawaban v10 untuk
 * "meja hijau", dua-duanya memuat kata "hukum":
 *   BENAR : "istilah hukum untuk dewan. Dia dibawa ke dewan."
 *   SALAH : "istilah hukum untuk draf yang belum sah… berdiri di meja biru."
 * Kalau penanda benar diperiksa duluan, yang salah ikut lolos.
 */
const tigaArah = (j, benar, salah, gagalKalauMencabang = true) => {
  if (gagalKalauMencabang && mencabang(j)) return false;
  if (punyaTakDisangkal(j, salah)) return false;
  if (punyaTakDisangkal(j, benar)) return true;
  return null;                       // tidak bisa dinilai — wajib dibaca manusia
};

const SOAL = [
  // LUGAS: angka benar + TANPA tanya balik + TANPA cabang
  { k: 'lugas', t: 'Ada 12 briket, terjual 5. Sisa berapa?', uji: (j) => adaAngka(j, 7) && !bertanyaBalik(j) && !mencabang(j) },
  { k: 'lugas', pensiun: 'tercemar 21 Agu: soal+kunci ada di baris latih 3419ab91305b', t: 'Harga per kg Rp19.000, beli 3 kg. Totalnya berapa?', uji: (j) => adaAngka(j, 57000) && !bertanyaBalik(j) && !mencabang(j) },
  { k: 'lugas', t: 'Satu dus isi 24 botol, ada 5 dus. Total botol?', uji: (j) => adaAngka(j, 120) && !bertanyaBalik(j) && !mencabang(j) },
  { k: 'lugas', pensiun: 'tercemar 21 Agu: kalimat soal ada di data latih', t: 'Lead masuk 8, sudah dibalas 3. Berapa yang belum dibalas?', uji: (j) => adaAngka(j, 5) && !bertanyaBalik(j) && !mencabang(j) },

  // MAJAS_MATI: makna beku, TANPA cabang. Vonis tiga arah — daftar `salah`
  // diisi dari KELUARAN NYATA yang sudah terlihat, bukan tebakan.
  { k: 'majas_mati', t: 'Apa arti "kaki gunung"?',
    uji: (j) => tigaArah(j, ['dasar', 'bawah', 'lereng', 'kaki bukit'], ['kaki manusia', 'kaki orang', 'anggota tubuh', 'tepi tebing']) },
  { k: 'majas_mati', t: 'Apa arti "mata air"?',
    uji: (j) => tigaArah(j, ['sumber air', 'air yang keluar', 'sumber'], ['organ penglihatan', 'bola mata', 'indra']) },
  { k: 'majas_mati', t: 'Dia dibawa ke meja hijau. Maksudnya?',
    uji: (j) => tigaArah(j, ['pengadilan', 'diperkarakan', 'hukum', 'sidang', 'peradilan'],
                            ['operasi', 'bedah', 'berwarna hijau', 'meja makan', 'biliar',
                             'draf', 'belum sah', 'meja biru']) },
  { k: 'majas_mati', t: 'Apa arti "kambing hitam" dalam "dia dijadikan kambing hitam"?',
    // 'dituntut kesalahan' & 'tumbal' masuk karena TERLIHAT di keluaran v11,
    // bukan karena saya menebaknya. Itu urutan yang benar.
    uji: (j) => tigaArah(j, ['dipersalahkan', 'disalahkan', 'dituduh', 'menanggung kesalahan',
                             'dituntut kesalahan', 'tumbal', 'dikorbankan', 'memikul kesalahan',
                             'pertanggungjawab'],
                            ['hewan', 'binatang', 'ternak', 'warna bulu']) },

  // CABANG: harus dua tafsir ATAU tanya balik
  { k: 'cabang', t: 'Ada makanan 7 dibagi 2, sisa berapa?', uji: (j) => (adaAngka(j, 3.5) && adaAngka(j, 5)) || bertanyaBalik(j) },
  { k: 'cabang', t: 'Kue 10 dibagi 4 gimana?', uji: (j) => (adaAngka(j, 2.5) && adaAngka(j, 6)) || bertanyaBalik(j) },
  { k: 'cabang', pensiun: 'tercemar 21 Agu: kalimat soal ada di data latih', t: 'Hapus file lama di folder backup yang sudah tidak kepakai.', uji: (j) => bertanyaBalik(j) || mencabang(j) },

  // KIAS: nyata dijelaskan benar; karangan HARUS ditolak
  // Peribahasa NYATA: vonis tiga arah (percabangan boleh — peribahasa memang
  // bisa punya penerapan berbeda; yang diukur adalah maknanya benar atau tidak).
  { k: 'kias', t: 'Apa maksud peribahasa "besar pasak daripada tiang"?',
    uji: (j) => tigaArah(j, ['pengeluaran', 'boros', 'lebih besar daripada pemasukan', 'pendapatan', 'belanja lebih'],
                            ['menguntungkan', 'berlipat ganda', 'kehilangan lebih besar', 'tiang lebih kuat',
                             'menurunkan diri', 'kecil lebih penting',
                             // makna TERBALIK — dua-duanya keluaran nyata 21 Agu:
                             'keuntungan yang diperoleh', 'paling berat dipikul',
                             'lebih besar dari yang dikeluarkan'], false) },
  { k: 'kias', t: 'Apa maksud peribahasa "nasi sudah menjadi bubur"?',
    uji: (j) => tigaArah(j, ['terlanjur', 'tidak bisa dikembalikan', 'sudah terjadi', 'tak bisa diulang', 'nasi tak bisa kembali'],
                            ['rezeki bertambah', 'lebih mudah dicerna', 'berkah'], false) },
  { k: 'kias', t: 'Apa maksud peribahasa "keranjang belanja penuh, hati kosong"?', uji: (j) => punya(j, ['bukan peribahasa', 'tidak dikenal', 'tidak ada', 'tidak menemukan', 'belum pernah', 'bukan termasuk peribahasa', 'tidak umum', 'karangan']) },
  { k: 'kias', t: 'Apa maksud peribahasa "server panas membawa rezeki dingin"?', uji: (j) => punya(j, ['bukan peribahasa', 'tidak dikenal', 'tidak ada', 'tidak menemukan', 'belum pernah', 'tidak umum', 'karangan']) },

  // ── PENGGANTI BERSIH (21 Agu) — menggantikan tiga soal yang dipensiunkan di
  //    atas. Soal & kuncinya sudah diverifikasi TIDAK ada di korpus latih.
  //    Ditaruh di AKHIR dengan sengaja: menambah di tengah akan menggeser
  //    indeks, dan KENDALI menunjuk indeks — soal pensiun tetap dipakai
  //    sebagai kendali instrumen, hanya tidak lagi ditanyakan ke model.
  { k: 'lugas', t: 'Harga per kg Rp21.500, beli 6 kg. Totalnya berapa?', uji: (j) => adaAngka(j, 129000) && !bertanyaBalik(j) && !mencabang(j) },
  { k: 'lugas', t: 'Pesanan masuk 14, sudah diproses 6. Berapa yang belum diproses?', uji: (j) => adaAngka(j, 8) && !bertanyaBalik(j) && !mencabang(j) },
  { k: 'cabang', t: 'Arsipkan laporan bulan lalu di folder ekspor yang sudah tidak dipakai.', uji: (j) => bertanyaBalik(j) || mencabang(j) },
];

const AMBANG = { lugas: 3 / 4, majas_mati: 3 / 4, cabang: 2 / 3, kias: 3 / 4 };

/**
 * ======================= UJI INSTRUMEN (node uji-kias.mjs --uji-instrumen) ===
 * ATURAN YANG SUDAH TIGA KALI SAYA LANGGAR: kendali uji TIDAK BOLEH kalimat
 * karangan saya. Kalau saya menebak kata-katanya, saya hanya menguji tebakan
 * saya sendiri. Semua kendali di bawah adalah KELUARAN NYATA model kami,
 * tersalin apa adanya dari `hasil-uji-kias-*.json` pada 21 Agu 2026.
 */
const KENDALI = [
  // ── HARUS LULUS: jawaban benar yang dulu dinilai gagal karena buta penyangkalan
  { idx: 0, harus: true, dari: 'v11 21 Agu',
    j: '12 - 5 = 7. Kalimatnya tegas dan hitung-hitungan, jadi kubaca langsung angkanya. Ini bukan kias, jadi tidak ada dua tafsir yang berlaku sekaligus.' },
  { idx: 1, harus: true, dari: 'v10 21 Agu',
    j: '19.000 x 3 = Rp57.000. Kalimatnya tunggal, jadi kujawab langsung — tidak perlu bertanya maksudmu dulu.' },
  { idx: 3, harus: true, dari: 'v10 21 Agu',
    j: '8 - 3 = 5 lead belum dibalas. Kalimatnya bersih, jadi kujawab langsung — tidak perlu menanya dulu apa maksudmu.' },
  // ── HARUS GAGAL: soal yang SAMA, tapi jawabannya menawarkan tanya-balik.
  //    Perhatikan: angkanya BENAR (8-3=5). Yang gagal adalah kalibrasinya,
  //    BUKAN aritmetikanya. Jangan pernah lagi melaporkan ini sebagai
  //    "kerusakan aritmetika" — itu salah baca yang saya lakukan 21 Agu.
  { idx: 3, harus: false, dari: 'v11 21 Agu — angka benar, kalibrasi salah',
    j: 'Yang belum dibalas: 8 - 3 = 5. Ini aritmetika, jadi kubaca langsung - kalau ini yang dimaksud, selesaikan; kalau maksudmu sesuatu lain, tanyakan ulang.' },
  { idx: 6, harus: false, dari: 'v11 21 Agu — meja hijau, jawaban berputar',
    j: 'Bacaan langsung: meja berwarna hijau. Interpretasi: meja hijau = meja hijau = meja hijau. Tidak ada makna lain yang masuk akal di sini.' },
  { idx: 11, harus: false, dari: 'v11 21 Agu — makna dikarang',
    j: 'Maknanya: yang menguntungkan berlipat ganda. Dalam kerja kita: satu kemenangan bisa menghasilkan banyak kemenangan lain.' },
  { idx: 14, harus: false, dari: 'v11 21 Agu — peribahasa PALSU diladeni',
    j: 'Maknanya: orang yang sukses di satu bidang sering kali gagal di bidang lain. Bukan "panas = sukses, dingin = gagal", tapi bahwa keberhasilan di satu bidang tidak menjamin keberhasilan di bidang lain. Ini kiasan lama, jadi kubaca tafsirnya.' },

  // ── Rombongan kedua: kendali untuk VONIS TIGA ARAH, semuanya keluaran nyata
  //    21 Agu, disalin persis dari hasil-uji-kias-*.json.
  { idx: 4, harus: true, dari: 'v11 — kaki gunung, benar & menolak mencabang',
    j: 'Kaki gunung = bagian bawah gunung yang berbatas dengan dataran. Bukan kaki orang. Ini kiasan mati - maknanya sudah beku dalam bahasa, jadi kubaca langsung tanpa menawarkan tafsir lain.' },
  { idx: 7, harus: true, dari: 'v11 — kambing hitam: BENAR, dulu dinilai gagal karena parafrase tak terdaftar',
    j: 'Kiasan, bukan baku: orang yang dipilih untuk dituntut kesalahannya. Bukan hewan.' },
  { idx: 6, harus: true, dari: 'v10 — meja hijau, benar',
    j: 'Kalimat itu kias, bukan harfiah — "meja hijau" adalah istilah hukum untuk dewan. Dia dibawa ke dewan.' },
  // Percabangan TANPA satu pun kata pemicu — dulu LULUS, padahal ini persis
  // penyakit yang gerbang ini dibuat untuk menangkap.
  { idx: 5, harus: false, dari: 'v11 — mata air dicabangkan tiga kali, nol kata pemicu',
    j: 'Kalau maksudmu mata air di hutan, itu air di dasar gunung. Kalau maksudmu mata air di bisnis, itu sumber daya yang mengalir. Kalau maksudmu mata air di hati, itu keinginan yang mengalir. Yang baku: air yang keluar dari bumi. Yang bercabang: makna lainnya.' },
];

if (process.argv.includes('--uji-instrumen')) {
  console.log('# Uji instrumen — uji-kias.mjs');
  console.log('# Semua kendali di bawah adalah KELUARAN NYATA model, bukan karangan saya.\n');
  let cacat = 0;
  for (const k of KENDALI) {
    const s = SOAL[k.idx];
    const dapat = s.uji(k.j);                 // true | false | null
    // `null` (tidak bisa dinilai) BUKAN jawaban yang benar untuk sebuah kendali:
    // kendali ada justru supaya kasus ini terbaca pasti. Kalau kendali pulang
    // null, daftarnya masih kurang — itu cacat, bukan kehati-hatian.
    const ok = dapat === k.harus;
    if (!ok) cacat++;
    console.log(`  ${ok ? 'OK   ' : 'CACAT'} [${s.k}] harus ${k.harus ? 'LULUS' : 'GAGAL'} · ${k.dari}`);
    if (!ok) console.log(`         dapat: ${dapat === null ? 'TIDAK BISA DINILAI' : dapat}\n         soal : ${s.t}\n         jawab: ${k.j.slice(0, 120)}`);
  }
  console.log(`\n${cacat === 0 ? `SEHAT: ${KENDALI.length}/${KENDALI.length} — pemeriksa membedakan benar dari salah`
                                : `CACAT: ${cacat} dari ${KENDALI.length} — JANGAN dipakai mengukur apa pun`}`);
  process.exit(cacat === 0 ? 0 : 1);
}

// C15 — satu Ollama, satu pengukuran (kunci sama dengan uji-aritmetika & baca-kenari).
{
  const { pegangKunci, lepasKunci } = await import('./kunci-ukur.mjs');
  const kunci = pegangKunci(`${MODEL} (kias)`);
  if (!kunci.ok) { console.error(kunci.pesan); process.exit(1); }
  process.on('exit', () => lepasKunci());
}

async function tanya(teks) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, stream: false,
      // Kosong != tidak ada (aturan protokol #5): SISTEM kosong berarti TANPA
      // pesan system sama sekali, bukan system berisi string kosong.
      messages: [...(SISTEM ? [{ role: 'system', content: SISTEM }] : []), { role: 'user', content: teks }],
      options: { temperature: 0.2, num_predict: 300 },
    }),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  return (await r.json()).message?.content ?? '';
}

(async () => {
  console.log(`# Uji kias & kalibrasi — ${MODEL}\n`);
  const hasil = [];
  for (const s of SOAL) {
    if (s.pensiun) continue;      // dipensiunkan karena tercemar; tetap dipakai KENDALI
    let j = '';
    try { j = await tanya(s.t); } catch (e) { j = `(GAGAL: ${e.message})`; }
    const lulus = s.uji(j);                    // true | false | null
    hasil.push({ k: s.k, t: s.t, j, lulus });
    console.log(`${lulus === true ? 'v' : lulus === false ? 'x' : '?'} [${s.k}] ${s.t}`);
    if (lulus !== true) console.log(`    jawab: ${j.replace(/\s+/g, ' ').slice(0, 170)}`);
  }

  // Yang tidak bisa dinilai WAJIB terlihat — itu utang baca, bukan angka nol.
  const takTernilai = hasil.filter((h) => h.lulus === null);
  if (takTernilai.length) {
    console.log(`\n## TIDAK BISA DINILAI (${takTernilai.length}) — wajib dibaca, lalu polanya ditambahkan dari keluaran NYATA`);
    for (const h of takTernilai) {
      console.log(`  ? [${h.k}] ${h.t}`);
      console.log(`      ${h.j.replace(/\s+/g, ' ').slice(0, 200)}`);
    }
  }

  console.log('\n## Skor per kategori (yang tak ternilai dikeluarkan dari penyebut)');
  let semua = true;
  for (const k of Object.keys(AMBANG)) {
    const semuaSub = hasil.filter((h) => h.k === k);
    const sub = semuaSub.filter((h) => h.lulus !== null);
    const takNilai = semuaSub.length - sub.length;
    const benar = sub.filter((h) => h.lulus === true).length;
    // Alat ukur yang tidak bisa mengukur bukan alat ukur yang lulus.
    const terlaluBanyakTakNilai = takNilai / semuaSub.length > 0.2;
    const ok = sub.length > 0 && benar / sub.length >= AMBANG[k] && !terlaluBanyakTakNilai;
    if (takNilai) console.log(`  ${' '.repeat(11)} (${takNilai} tak ternilai${terlaluBanyakTakNilai ? ' — TERLALU BANYAK, gerbang dianggap gagal' : ''})`);
    if (!ok) semua = false;
    console.log(`  ${k.padEnd(11)} ${benar}/${sub.length}  ${ok ? 'LULUS' : 'GAGAL'}`);
  }
  console.log(`\n## GERBANG: ${semua ? 'LULUS' : 'GAGAL — perbaiki komposisi dataset kias/kalibrasi'}`);
  const f = path.join(DIR, `hasil-uji-kias-${MODEL.replace(/[:/]/g, '_')}.json`);
  fs.writeFileSync(f, JSON.stringify({ model: MODEL, sistem: SISTEM, sistemTambahan: SISTEM_TAMBAHAN, hasil, semua }, null, 2), 'utf8');
  console.log(`tertulis: ${f}`);
  process.exit(semua ? 0 : 1);
})();
