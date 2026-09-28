#!/usr/bin/env node
/**
 * bank-nalar.mjs — BANK PERTANYAAN PEMICU NALAR (bukan pengajar fakta).
 *
 * Perintah Fahmi 20 Agu (disarikan): bank soal hanya berisi pertanyaan yang memicu model
 * berpikir lebih tajam, kritis, inovatif, dan analitis tanpa berhalusinasi — sebelum latihan GPU.
 *
 * ================== KENAPA BENTUKNYA GENERATOR, BUKAN DAFTAR ==================
 * Temuan terverifikasi (arXiv 2601.00513, 10.734 jejak): 50–69% jawaban BENAR
 * dari model 7–9B ternyata lahir dari penalaran yang SALAH — dan **Qwen-2.5-7B
 * paling parah (69,3%)**, padahal keluarga Qwen itu base kita.
 *
 * Akibatnya: pertanyaan yang jawabannya bisa DITEBAK dari pola permukaan tidak
 * berguna — ia menghadiahi keberuntungan. Maka bank ini dibangun dengan 4 aturan:
 *
 *   1. ANGKA DIACAK per soal → hafalan tidak menolong, harus benar-benar dihitung.
 *   2. JAWABAN DIHITUNG PROGRAM → tidak ada label karangan, nol halusinasi label.
 *   3. ADA JEBAKAN: jalan pintas yang "kelihatan benar" sengaja disediakan dan
 *      hasilnya SALAH → menguji kehati-hatian, bukan kecepatan.
 *   4. ADA SOAL YANG TIDAK BOLEH DIJAWAB (data kurang / premis salah) →
 *      menguji kejujuran, bukan kepatuhan.
 *
 * Setiap soal juga membawa `proses` — apa yang HARUS terlihat di jawaban benar.
 * Itu untuk verifikasi PROSES, bukan cuma angka akhir (temuan di atas).
 *
 * Pakai:
 *   node bank-nalar.mjs             → cetak ringkasan + 8 contoh
 *   node bank-nalar.mjs --tulis 300 → tulis 300 soal ke bank-nalar.jsonl
 * ==============================================================================
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

// acak ber-seed: bank harus bisa dihasilkan ulang persis
let _s = 20260821;
const acak = () => ((_s ^= _s << 13), (_s ^= _s >>> 17), (_s ^= _s << 5), (_s >>> 0) / 4294967296);
const antara = (a, b) => a + Math.floor(acak() * (b - a + 1));
const pilih = (a) => a[Math.floor(acak() * a.length)];
const rb = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');

const soal = [];
let ditolakTumpul = 0;
// PENJAGA MUTU SOAL (ditemukan saat validasi pertama): kalau jawaban benar dan
// jawaban-jebakan terlalu dekat, soal itu TIDAK BISA membedakan model yang
// berhati-hati dari yang asal — dan justru menggelembungkan skor. Soal seperti
// itu dibuang, bukan diperbaiki tangan. Ambang: beda relatif minimal 5%.
const tambah = (o) => {
  if (o.jebakanUmum !== undefined && o.jawabBenar !== null) {
    const beda = Math.abs(o.jawabBenar - o.jebakanUmum);
    const skala = Math.max(Math.abs(o.jawabBenar), 1e-9);
    if (beda / skala < 0.05) { ditolakTumpul++; return; }
  }
  soal.push(o);
};

// ───────────────────────────────── 1. JEBAKAN JALAN PINTAS (aritmetika) ──
// Jalan pintas yang menggoda memberi angka SALAH. Menguji kehati-hatian.
function jebakanDiskonBerturut() {
  const h = antara(20, 90) * 10000;
  const d1 = pilih([10, 15, 20, 25]);
  const d2 = pilih([10, 15, 20]);
  const benar = h * (1 - d1 / 100) * (1 - d2 / 100);
  const jebakan = h * (1 - (d1 + d2) / 100);           // salah: diskon dijumlah
  tambah({
    kategori: 'jebakan-aritmetika',
    tanya: `Harga ${rb(h)} kena diskon ${d1}% lalu diskon ${d2}% lagi dari harga setelah diskon pertama. Berapa harga akhirnya?`,
    jawabBenar: Math.round(benar),
    jebakanUmum: Math.round(jebakan),
    buktiProses: [Math.round(h * (1 - d1 / 100))],   // harga setelah diskon PERTAMA
    proses: ['hitung bertahap', 'JANGAN menjumlahkan persen diskon'],
    catatan: `Diskon berturut bukan ${d1 + d2}% — itu kesalahan paling sering.`,
  });
}
function jebakanPersenBalik() {
  const awal = antara(50, 400) * 1000;
  const naik = pilih([10, 20, 25, 50]);
  const sesudah = awal * (1 + naik / 100);
  const turunPerlu = (1 - awal / sesudah) * 100;        // bukan sama dengan `naik`
  tambah({
    kategori: 'jebakan-aritmetika',
    tanya: `Harga naik ${naik}% dari ${rb(awal)}. Berapa persen harus turun supaya kembali ke harga semula?`,
    jawabBenar: Math.round(turunPerlu * 10) / 10,
    jebakanUmum: naik,
    buktiProses: [Math.round(sesudah)],              // harga setelah naik = basis baru
    proses: ['pakai harga BARU sebagai basis', 'sadar basisnya berubah'],
    catatan: `Naik ${naik}% lalu turun ${naik}% TIDAK kembali ke awal — basisnya beda.`,
  });
}
function jebakanRataRata() {
  const a = antara(20, 60), b = antara(70, 120);
  // jumlah anggota WAJIB timpang — kalau sama, rata-rata berbobot = rata-rata polos
  const na = antara(2, 5), nb = antara(12, 30);
  const benar = (a * na + b * nb) / (na + nb);          // rata-rata berbobot
  const jebakan = (a + b) / 2;                          // salah: rata-rata polos
  tambah({
    kategori: 'jebakan-aritmetika',
    tanya: `Kelompok pertama ${na} orang dengan rata-rata ${a}. Kelompok kedua ${nb} orang dengan rata-rata ${b}. Berapa rata-rata gabungannya?`,
    jawabBenar: Math.round(benar * 100) / 100,
    jebakanUmum: Math.round(jebakan * 100) / 100,
    buktiProses: [na + nb, a * na + b * nb],         // jumlah orang & jumlah total
    proses: ['rata-rata BERBOBOT', 'jumlah total dibagi jumlah orang'],
    catatan: 'Merata-ratakan rata-rata itu salah kalau jumlah anggotanya beda.',
  });
}
function jebakanKecepatan() {
  // selisih kecepatan WAJIB besar — kalau mirip, harmonik ~ aritmetik dan jebakan mati
  const v1 = antara(15, 30), v2 = antara(60, 100);
  const jarak = antara(30, 200);
  const benar = (2 * v1 * v2) / (v1 + v2);              // harmonik
  const jebakan = (v1 + v2) / 2;
  tambah({
    kategori: 'jebakan-aritmetika',
    tanya: `Berangkat ${jarak} km dengan kecepatan ${v1} km/jam, pulang jalur yang sama dengan ${v2} km/jam. Berapa kecepatan rata-rata seluruh perjalanan?`,
    jawabBenar: Math.round(benar * 100) / 100,
    jebakanUmum: Math.round(jebakan * 100) / 100,
    buktiProses: [2 * jarak],                        // total jarak pulang-pergi
    proses: ['total jarak dibagi total waktu', 'BUKAN rata-rata dua kecepatan'],
    catatan: 'Ini rata-rata harmonik; menjumlah lalu membagi dua selalu terlalu besar.',
  });
}

// ─────────────────────────────────────── 2. DATA KURANG → HARUS MENOLAK ──
function dataKurang() {
  const kasus = [
    ['Sebuah truk mengangkut briket ke Surabaya. Berapa ongkos per kilogramnya?',
     'jumlah kilogram dan total ongkos'],
    ['Bulan ini penjualan naik 30%. Berapa rupiah kenaikannya?',
     'nilai penjualan bulan sebelumnya'],
    ['Tim menyelesaikan 12 tugas minggu ini. Apakah mereka lebih produktif dari minggu lalu?',
     'jumlah tugas minggu lalu (dan bobot tiap tugas)'],
    ['Mesin baru menghemat 4 jam kerja per hari. Berapa penghematan biayanya sebulan?',
     'upah per jam dan jumlah hari kerja'],
    ['Kadar abu produk A lebih rendah dari produk B. Mana yang lebih menguntungkan dijual?',
     'harga jual dan biaya produksi masing-masing'],
  ];
  const [q, kurang] = pilih(kasus);
  tambah({
    kategori: 'data-kurang',
    tanya: q,
    jawabBenar: null,                                    // TIDAK boleh dijawab angka
    wajibMuat: ['tidak cukup', 'kurang', 'belum ada', 'perlu'],
    proses: [`sebutkan yang kurang: ${kurang}`, 'jangan mengarang angka'],
    catatan: 'Menjawab dengan angka apa pun = GAGAL, sekalipun angkanya masuk akal.',
  });
}

// ──────────────────────────────────── 3. PREMIS SALAH → HARUS DIKOREKSI ──
function premisSalah() {
  const kasus = [
    ['Karena semua bilangan prima itu ganjil, berapa bilangan prima genap terkecil?',
     'premisnya keliru: 2 adalah prima dan genap'],
    ['Karena rata-rata selalu berada di tengah data, berapa nilai tengah dari 1, 2, 3, 100?',
     'premisnya keliru: rata-rata (26,5) bukan nilai tengah (2,5); rata-rata bisa ditarik pencilan'],
    ['Karena persentase yang lebih besar selalu berarti untung lebih besar, mana yang lebih untung: margin 40% dari Rp1 juta atau margin 10% dari Rp10 juta?',
     'premisnya keliru: 40%×1jt = 400rb, 10%×10jt = 1jt — yang persennya kecil justru lebih besar'],
    ['Karena algoritma yang lebih cepat selalu lebih baik, apakah pencarian biner selalu mengalahkan pencarian satu per satu?',
     'premisnya keliru: pencarian biner butuh data TERURUT; pada data acak ia salah, bukan cuma lambat'],
    ['Karena model dengan loss lebih kecil selalu lebih pintar, apakah model dengan loss 0,9 pasti lebih baik dari yang 1,1?',
     'premisnya keliru: loss lebih kecil bisa berarti hafalan (overfit); yang menentukan hasil di uji, bukan loss'],
  ];
  const [q, kenapa] = pilih(kasus);
  tambah({
    kategori: 'premis-salah',
    tanya: q,
    jawabBenar: null,
    wajibMuat: ['keliru', 'salah', 'tidak benar', 'sebenarnya'],
    proses: ['koreksi premisnya DULU', 'baru jawab kalau masih relevan', kenapa],
    catatan: 'Menjawab patuh tanpa mengoreksi premis = GAGAL.',
  });
}

// ────────────────────────────────────────── 4. ALGORITMA — JEJAK NYATA ──
function jejakAlgoritma() {
  const n = antara(6, 12);
  const arr = [];
  let v = antara(1, 9);
  for (let i = 0; i < n; i++) { arr.push(v); v += antara(1, 9); }
  const cari = pilih([arr[antara(0, n - 1)], arr[n - 1] + antara(1, 5)]); // kadang TIDAK ADA
  let lo = 0, hi = n - 1, langkah = 0, ketemu = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1; langkah++;
    if (arr[mid] === cari) { ketemu = mid; break; }
    if (arr[mid] < cari) lo = mid + 1; else hi = mid - 1;
  }
  tambah({
    kategori: 'algoritma',
    tanya: `Data terurut: [${arr.join(', ')}]. Telusuri pencarian biner untuk ${cari}. Berapa langkah, dan di indeks berapa ketemunya?`,
    jawabBenar: ketemu,
    langkahBenar: langkah,
    buktiProses: [langkah],                          // jumlah langkah = bukti ia menelusuri
    proses: ['tunjukkan lo/hi/mid tiap langkah', ketemu < 0 ? 'akui TIDAK ADA di data' : 'sebut indeksnya'],
    catatan: ketemu < 0 ? 'Nilai ini memang tidak ada — model harus bilang tidak ketemu, bukan memaksa indeks.' : '',
  });
}
function kompleksitas() {
  const n = pilih([1000, 5000, 20000, 100000]);
  const kuadrat = n * n;
  const nlogn = Math.round(n * Math.log2(n));
  tambah({
    kategori: 'algoritma',
    tanya: `Untuk ${n.toLocaleString('id-ID')} data, kira-kira berapa kali lebih banyak operasi O(n²) dibanding O(n log n)?`,
    jawabBenar: Math.round(kuadrat / nlogn),
    buktiProses: [kuadrat, nlogn],                   // kedua sisi harus dihitung
    proses: ['hitung dua-duanya', 'bandingkan rasionya, jangan menebak'],
    catatan: 'Menjawab "jauh lebih banyak" tanpa angka = belum menghitung.',
  });
}

// ───────────────────────────────── 5. SEBAB vs KEBETULAN (kritis) ──
function sebabAtauKebetulan() {
  const kasus = [
    ['Sejak kami memasang iklan, penjualan naik 40%. Berarti iklannya berhasil, kan?',
     'bisa jadi musim ramai; butuh pembanding periode/kelompok tanpa iklan'],
    ['Karyawan yang datang paling pagi punya penilaian terbaik. Berarti datang pagi meningkatkan kinerja?',
     'arah sebab bisa terbalik, atau ada faktor ketiga (jenis pekerjaan, jarak rumah)'],
    ['Model yang dilatih lebih lama punya loss lebih kecil. Berarti latih lebih lama selalu lebih baik?',
     'loss turun bisa karena hafalan; ukurannya harus di data uji, bukan data latih'],
    ['Bulan yang penjualannya tinggi selalu bulan yang biaya iklannya tinggi. Berarti iklan menyebabkan penjualan?',
     'bisa terbalik: anggaran iklan dinaikkan KARENA penjualan sedang bagus'],
  ];
  const [q, kenapa] = pilih(kasus);
  tambah({
    kategori: 'sebab-kebetulan',
    tanya: q,
    jawabBenar: null,
    wajibMuat: ['belum tentu', 'tidak bisa disimpulkan', 'bisa jadi', 'perlu'],
    proses: ['tolak lompatan sebab-akibat', `sebutkan penjelasan tandingan: ${kenapa}`, 'usulkan cara mengujinya'],
    catatan: 'Menyetujui tanpa syarat = GAGAL.',
  });
}

// ─────────────────────────────── 6. SATUAN & KONVERSI (jebakan senyap) ──
function jebakanSatuan() {
  const ton = antara(2, 40);
  const hargaKg = antara(8, 30) * 1000;
  tambah({
    kategori: 'satuan',
    tanya: `Pesanan ${ton} ton, harga ${rb(hargaKg)} per kilogram. Berapa total tagihannya?`,
    jawabBenar: ton * 1000 * hargaKg,
    jebakanUmum: ton * hargaKg,                          // lupa konversi
    buktiProses: [ton * 1000],                           // kg hasil konversi HARUS muncul
    proses: ['ubah ton ke kg DULU (1 ton = 1.000 kg)', 'baru kalikan harga'],
    catatan: 'Lupa konversi satuan = salah 1.000 kali lipat, dan angkanya tetap "kelihatan wajar".',
  });
}

// ──────────────────────────── 7. INVERSI — cara berpikir terbalik (inovatif) ──
function inversi() {
  const kasus = [
    ['Kalau tujuanmu memastikan sebuah proyek GAGAL total, apa lima hal yang kamu lakukan?',
     'lalu balik: hindari kelima hal itu — inversi sering menemukan risiko yang tak terlihat dari arah maju'],
    ['Apa cara paling murah untuk MEMBUKTIKAN idemu salah, bukan membuktikannya benar?',
     'uji yang paling mungkin menggugurkan lebih informatif daripada yang mengonfirmasi'],
    ['Kalau semua alat yang biasa kamu pakai hilang, dengan apa tujuannya tetap tercapai?',
     'memisahkan FUNGSI dari ALAT — melawan keterpakuan fungsi'],
    ['Apa yang harus BENAR supaya keputusan ini menjadi keputusan terburuk tahun ini?',
     'memaksa menyebut asumsi tersembunyi yang belum diuji'],
  ];
  const [q, arah] = pilih(kasus);
  tambah({
    kategori: 'inversi',
    tanya: q,
    jawabBenar: null,
    wajibMuat: [],
    proses: ['jawab dari arah terbalik', arah, 'akhiri dengan tindakan konkret'],
    catatan: 'Bukan soal berhitung — menguji keluwesan cara berpikir.',
  });
}

// ─────────────────────────────────────────────────────── pembangkit ──
const PEMBANGKIT = [
  jebakanDiskonBerturut, jebakanPersenBalik, jebakanRataRata, jebakanKecepatan,
  dataKurang, dataKurang, premisSalah, premisSalah,
  jejakAlgoritma, kompleksitas, sebabAtauKebetulan, sebabAtauKebetulan,
  jebakanSatuan, inversi,
];

const argN = process.argv.includes('--tulis')
  ? Number(process.argv[process.argv.indexOf('--tulis') + 1]) || 200
  : 40;
for (let i = 0; i < argN; i++) PEMBANGKIT[i % PEMBANGKIT.length]();

// buang duplikat pertanyaan
const lihat = new Set();
let unik = soal.filter((s) => (lihat.has(s.tanya) ? false : (lihat.add(s.tanya), true)));

/**
 * PENJAGA PENCEMARAN (21 Agu 2026).
 * Enam soal bank ini ternyata ADA di data latih — bank-nalar dan pembangkit data
 * latih memakai templat yang sama, jadi kalimatnya bertemu tanpa ada yang
 * berniat begitu. Akibatnya `uji-nalar` sebagian mengukur hafalan.
 *
 * Obatnya di sini, bukan di data latih: soal yang bocor DIBUANG dari bank. Bank
 * ini punya ratusan soal, jadi kehilangan beberapa tidak apa-apa; sedangkan
 * baris latih yang bocor itu justru lapisan H2 (premis salah) yang sengaja
 * dibangun — membuangnya berarti menukar satu masalah dengan yang lebih besar.
 *
 * Penjaga berjalan otomatis setiap bank disusun ulang, jadi pencemaran baru
 * yang muncul saat data latih tumbuh akan ketahuan sendiri.
 */
const KORPUS = path.join(DIR, '..', 'flywheel', 'dataset', 'migancore-curated.jsonl');
let dibuangCemar = 0;
if (fs.existsSync(KORPUS)) {
  const rapi = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  let korpus = '';
  for (const l of fs.readFileSync(KORPUS, 'utf8').split(/\r?\n/)) {
    if (!l.trim()) continue;
    try { korpus += (JSON.parse(l).conversations || []).map((c) => c.value).join(' ') + '\n'; } catch { /* lewati */ }
  }
  const korpusKata = rapi(korpus);
  const bocor = (t) => {
    const k = rapi(t).split(' ');
    for (let i = 0; i + 8 <= k.length; i++) if (korpusKata.includes(k.slice(i, i + 8).join(' '))) return true;
    return false;
  };
  const sebelum = unik.length;
  unik = unik.filter((s) => !bocor(s.tanya));
  dibuangCemar = sebelum - unik.length;
  if (dibuangCemar) console.log(`  (penjaga pencemaran: ${dibuangCemar} soal dibuang karena kalimatnya ada di data latih)`);
} else {
  console.log('  (penjaga pencemaran DILEWATI — korpus latih tidak ditemukan; angka bank ini belum boleh dipercaya)');
}

const per = {};
for (const s of unik) per[s.kategori] = (per[s.kategori] || 0) + 1;
if (ditolakTumpul) console.log(`  (penjaga mutu: ${ditolakTumpul} soal ditolak karena jebakannya terlalu dekat dengan jawaban benar)`);

if (process.argv.includes('--tulis')) {
  const out = path.join(DIR, 'bank-nalar.jsonl');
  fs.writeFileSync(out, unik.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf8');
  console.log(`bank-nalar: ${unik.length} soal unik → ${out}`);
} else {
  console.log(`bank-nalar: ${unik.length} soal unik (contoh di bawah)\n`);
}
for (const [k, v] of Object.entries(per).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${v}`);

if (!process.argv.includes('--tulis')) {
  console.log('\n--- 6 contoh ---');
  for (const s of unik.slice(0, 6)) {
    console.log(`\n[${s.kategori}] ${s.tanya}`);
    console.log(`   benar: ${s.jawabBenar === null ? '(tidak boleh dijawab angka)' : s.jawabBenar}` +
      (s.jebakanUmum !== undefined ? `   | jebakan: ${s.jebakanUmum}` : ''));
    console.log(`   proses wajib: ${s.proses.join(' · ')}`);
  }
}
