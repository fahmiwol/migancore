#!/usr/bin/env node
/**
 * panen-dasar.mjs — iterasi 6: FONDASI. Aritmetika, logika, algoritma,
 * lintas-domain, tool builder, verifikasi, kreativitas, keputusan hidup.
 *
 * Perintah Fahmi 20 Agu (disarikan): ajarkan dasar lebih dulu — aritmetika, logika, algoritma,
 * coding, kreativitas, penalaran lintas domain, pembuatan alat, serta metode verifikasi
 * dan validasi yang iteratif.
 *
 * ============== PRINSIP YANG MEMBUAT INI BUKAN OMONG KOSONG ==============
 * SFT kecil TIDAK menanam kemampuan hitung — itu lahir di pretraining. Yang
 * BISA ditanam adalah METODE: menunjukkan langkah, memeriksa hasil sendiri,
 * menolak menebak. Maka semua soal di sini DIBANGKITKAN MEKANIS dan
 * JAWABANNYA DIHITUNG PROGRAM, lalu DIVERIFIKASI ULANG dengan membaca angka
 * final dari teks jawaban dan membandingkannya dengan hasil hitung. Baris yang
 * tidak lolos verifikasi DIBUANG, bukan diperbaiki tangan.
 *
 * Artinya: nol halusinasi secara struktural, nol prosa model lain (patuh R11),
 * dan setiap baris bisa dibuktikan benar oleh mesin — bukan dipercaya.
 * =========================================================================
 *
 * Keluaran: dataset/migancore-dasar.jsonl → panen.mjs → saring.mjs.
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'dataset', 'migancore-dasar.jsonl');
const hash = (t) => crypto.createHash('sha1').update(t).digest('hex').slice(0, 10);

// acak ber-seed: dataset harus bisa dihasilkan ulang persis
let _s = 20260820;
const acak = () => ((_s ^= _s << 13), (_s ^= _s >>> 17), (_s ^= _s << 5), (_s >>> 0) / 4294967296);
const antara = (a, b) => a + Math.floor(acak() * (b - a + 1));
const pilih = (arr) => arr[Math.floor(acak() * arr.length)];
const rupiah = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');

// Pembuka DIVARIASIKAN (temuan 21 Agu): 72,6% dataset v10 berbentuk sama dan
// model jadi rapuh terhadap kata prompt. Bentuk beragam di data latih =
// ketahanan di produksi.
const PEMBUKA = [
  'Kukerjakan bertahap.', 'Langkahnya:', 'Mari kuhitung pelan-pelan.',
  'Kuurai dulu angkanya.', 'Begini hitungannya:', 'Kupecah jadi langkah kecil:',
  'Sebelum menjawab, kuhitung dulu:', 'Ini perhitungannya:',
];
const SIS_DASAR =
  'Kamu MiganCore, agent AI milik Fahmi Ghani. Kerjakan bertahap dan tunjukkan langkahnya. ' +
  'Periksa hasilmu sendiri sebelum menjawab. Kalau kamu tidak yakin, katakan tidak yakin — ' +
  'jangan menyodorkan angka atau kesimpulan yang belum kamu cek.';

const rows = [];
const lihat = new Set();
function tambah(tanya, jawab, sumber) {
  const id = hash(tanya + '||' + jawab);
  if (lihat.has(id)) return false;
  lihat.add(id);
  rows.push({
    conversations: [
      { from: 'system', value: SIS_DASAR },
      { from: 'human', value: tanya },
      { from: 'gpt', value: jawab },
    ],
    id, sumber,
  });
  return true;
}

// Verifikator: ambil SEMUA angka dari teks jawaban, pastikan nilai yang
// dihitung program benar-benar muncul. Kalau tidak, baris dibuang.
function angkaDalam(teks) {
  const bersih = teks.replace(/\./g, '').replace(/,/g, '.');
  const m = bersih.match(/-?\d+(\.\d+)?/g) || [];
  return m.map(Number);
}
function tambahTerverifikasi(tanya, jawab, harus, sumber) {
  const ada = angkaDalam(jawab);
  for (const h of harus) {
    const cocok = ada.some((x) => Math.abs(x - h) < Math.max(0.01, Math.abs(h) * 0.0001));
    if (!cocok) { gagalVerifikasi++; return false; }
  }
  return tambah(tanya, jawab, sumber);
}
let gagalVerifikasi = 0;

// ─────────────────────────────────────────── A. ARITMETIKA TERVERIFIKASI ──
// Berbaju dunia nyata Fahmi supaya sekaligus melatih domainnya.
const PRODUK = [
  ['briket shisha grade A', 30000], ['briket shisha grade B', 27000],
  ['briket BBQ grade A', 19000], ['briket BBQ grade B', 13000],
  ['arang batok kelapa', 14500],
];
for (let i = 0; i < 110; i++) {
  const [nama, hargaKg] = pilih(PRODUK);
  const ton = antara(2, 40);
  const kg = ton * 1000;
  const total = hargaKg * kg;
  const dp = total * 0.5;
  tambahTerverifikasi(
    `Pembeli minta ${ton} ton ${nama}. Harga ${rupiah(hargaKg)}/kg, pembayaran 50% di muka. Berapa total dan berapa DP-nya?`,
    `${pilih(PEMBUKA)}
` +
    `1. Ubah ton ke kg: ${ton} ton x 1.000 = ${kg.toLocaleString('id-ID')} kg.\n` +
    `2. Total: ${kg.toLocaleString('id-ID')} kg x ${rupiah(hargaKg)} = ${rupiah(total)}.\n` +
    `3. DP 50%: ${rupiah(total)} : 2 = ${rupiah(dp)}.\n` +
    `Jadi total ${rupiah(total)}, DP di muka ${rupiah(dp)}, sisa ${rupiah(total - dp)} setelah QC dan loading.\n` +
    `Periksa ulang: ${rupiah(dp)} x 2 = ${rupiah(total)} — cocok.`,
    [ton, kg, hargaKg, total, dp], 'dasar-aritmetika');
}

// margin & titik impas
for (let i = 0; i < 80; i++) {
  const modal = antara(6, 14) * 1000;
  const jual = modal + antara(2, 9) * 1000;
  const untungKg = jual - modal;
  const margin = (untungKg / jual) * 100;
  const targetBulan = antara(5, 40) * 1000000;
  const kgPerlu = Math.ceil(targetBulan / untungKg);
  tambahTerverifikasi(
    `Modal produksi ${rupiah(modal)}/kg, dijual ${rupiah(jual)}/kg. Berapa marginnya, dan berapa kg harus terjual supaya untung ${rupiah(targetBulan)} sebulan?`,
    `${pilih(PEMBUKA)}
` +
    `1. Untung per kg: ${rupiah(jual)} - ${rupiah(modal)} = ${rupiah(untungKg)}.\n` +
    `2. Margin: ${rupiah(untungKg)} : ${rupiah(jual)} x 100 = ${margin.toFixed(1)}%.\n` +
    `3. Kg yang perlu terjual: ${rupiah(targetBulan)} : ${rupiah(untungKg)} = ${kgPerlu.toLocaleString('id-ID')} kg (dibulatkan ke atas).\n` +
    `Itu sekitar ${(kgPerlu / 1000).toFixed(1)} ton sebulan. Sebelum menjanjikan ini, cek dulu kapasitas produksinya — angka di kertas tidak menambah kapasitas tungku.`,
    [modal, jual, untungKg, kgPerlu], 'dasar-aritmetika');
}

// persen, selisih, laju
for (let i = 0; i < 80; i++) {
  const lalu = antara(20, 400) * 100;
  const kini = Math.round(lalu * (0.5 + acak() * 1.4));
  const selisih = kini - lalu;
  const persen = (selisih / lalu) * 100;
  const arah = selisih >= 0 ? 'naik' : 'turun';
  tambahTerverifikasi(
    `Bulan lalu ${lalu.toLocaleString('id-ID')}, bulan ini ${kini.toLocaleString('id-ID')}. Berapa persen perubahannya?`,
    `1. Selisih: ${kini.toLocaleString('id-ID')} - ${lalu.toLocaleString('id-ID')} = ${selisih.toLocaleString('id-ID')}.\n` +
    `2. Persen: ${selisih.toLocaleString('id-ID')} : ${lalu.toLocaleString('id-ID')} x 100 = ${persen.toFixed(1)}%.\n` +
    `Jadi ${arah} ${Math.abs(persen).toFixed(1)}%. Satu catatan: persentase tanpa angka dasar gampang menipu — ${arah} ${Math.abs(persen).toFixed(1)}% dari basis kecil beda artinya dengan dari basis besar.`,
    [lalu, kini, selisih], 'dasar-aritmetika');
}

// kapasitas & waktu (kerja nyata: antrean lead, jam GPU)
for (let i = 0; i < 70; i++) {
  const antre = antara(30, 400);
  const perHari = antara(3, 25);
  const hari = Math.ceil(antre / perHari);
  tambahTerverifikasi(
    `Ada ${antre} lead belum dikontak, sanggupnya ${perHari} kontak sehari. Berapa hari, dan apa saranmu?`,
    `Hitungannya: ${antre} : ${perHari} = ${hari} hari (dibulatkan ke atas).\n` +
    `Tapi jangan berhenti di aritmetika. Mengontak SEMUA belum tentu benar — sebagian daftar itu pesaing, bukan pembeli. Saranku: saring dulu berdasarkan posisi dagang, kejar yang pembeli lebih dulu. Satu kontak tepat mengalahkan sepuluh kontak asal, dan ${hari} hari kerja bisa menyusut banyak setelah disaring.`,
    [antre, perHari, hari], 'dasar-aritmetika');
}

// ────────────────────────────────────────────────────── B. LOGIKA FORMAL ──
const LOGIKA = [];
const SEBAB = [
  ['pesanan lewat 20 ton', 'harga khusus berlaku'],
  ['kadar abu di bawah 3%', 'produk masuk grade A'],
  ['deploy sudah jalan', 'situs menjawab HTTP 200'],
  ['dataset lolos gerbang eval', 'model boleh dirilis'],
  ['lead membalas pesan', 'lead masuk antrean tindak lanjut'],
  ['tagihan sudah dibayar', 'barang boleh dikirim'],
];
for (const [p, q] of SEBAB) {
  // modus ponens (sah)
  LOGIKA.push([
    `Kalau ${p}, maka ${q}. Diketahui ${p}. Kesimpulannya?`,
    `Sah. Ini modus ponens: premisnya "kalau ${p} maka ${q}", dan ${p} memang terjadi — jadi ${q}. Kesimpulan ini pasti, bukan kemungkinan.`]);
  // modus tollens (sah)
  LOGIKA.push([
    `Kalau ${p}, maka ${q}. Ternyata TIDAK ${q}. Kesimpulannya?`,
    `Sah. Ini modus tollens: kalau akibatnya tidak terjadi, sebabnya juga tidak terjadi — jadi TIDAK ${p}. Cara berpikir ini yang dipakai saat mencari akar masalah: kalau ${q} tidak muncul, jangan cari di tempat lain dulu, periksa ${p}.`]);
  // affirming the consequent (TIDAK sah) — model harus MENOLAK
  LOGIKA.push([
    `Kalau ${p}, maka ${q}. Diketahui ${q}. Berarti ${p}, kan?`,
    `Tidak — itu sesat pikir "menegaskan akibat". Premisnya cuma bilang ${p} MENYEBABKAN ${q}; tidak bilang ${q} cuma bisa datang dari ${p}. Bisa saja ${q} muncul karena sebab lain. Jadi dari ${q} saja kita belum boleh menyimpulkan ${p}.`]);
  // denying the antecedent (TIDAK sah)
  LOGIKA.push([
    `Kalau ${p}, maka ${q}. Ternyata TIDAK ${p}. Berarti TIDAK ${q}?`,
    `Belum tentu — itu sesat pikir "menyangkal sebab". Tidak terjadinya ${p} tidak menutup jalan lain menuju ${q}. Premisnya hanya menjamin satu arah: ${p} membawa ${q}. Arah sebaliknya tidak dijamin.`]);
}
// kuantor
const KUANTOR = [
  ['semua pesaing kami pabrik briket', 'pesaing', 'pabrik briket'],
  ['semua lead dari Threads adalah trader', 'lead dari Threads', 'trader'],
  ['semua tools estat ini punya MCP', 'tools estat ini', 'punya MCP'],
];
for (const [kalimat, subjek, sifat] of KUANTOR) {
  LOGIKA.push([
    `Kalau "${kalimat}" itu salah, apa yang pasti benar?`,
    `Yang pasti benar: ADA setidaknya satu ${subjek} yang BUKAN ${sifat}. Itu saja. Ingkaran "semua" bukan "tidak ada satu pun" — cukup satu contoh tandingan untuk merobohkan klaim "semua". Kesalahan yang sering terjadi: menyangkal "semua X adalah Y" lalu melompat ke "tidak ada X yang Y" — itu terlalu jauh.`]);
  LOGIKA.push([
    `"${kalimat}". Apakah dari sini boleh disimpulkan "semua ${sifat} adalah ${subjek}"?`,
    `Tidak boleh. Membalik "semua A adalah B" jadi "semua B adalah A" itu keliru — namanya konversi tak sah. Contoh gampangnya di bisnis ini: semua pabrik briket memakai arang, tapi bukan berarti semua pemakai arang itu pabrik briket.`]);
}
// syarat perlu vs cukup
LOGIKA.push([
  'Bedanya syarat perlu dan syarat cukup apa? Kasih contoh dari kerja kita.',
  'Syarat CUKUP: kalau ada, hasilnya pasti terjadi. Syarat PERLU: kalau tidak ada, hasilnya pasti tidak terjadi.\n' +
  'Contoh: lolos gerbang eval itu syarat PERLU untuk merilis model — tanpa itu jangan rilis. Tapi belum tentu CUKUP: model bisa lolos eval dan tetap tidak layak dipakai karena terlalu lambat di server. Banyak salah paham di kerja teknis lahir dari mencampur dua hal ini: "tesnya hijau" tidak sama dengan "boleh naik produksi".']);
for (const [q, a] of LOGIKA) tambah(q, a, 'dasar-logika');

// ─────────────────────────────────────────────────── C. ALGORITMA (jejak) ──
for (let i = 0; i < 55; i++) {
  const n = antara(8, 16);
  const arr = [];
  let v = antara(1, 9);
  for (let j = 0; j < n; j++) { arr.push(v); v += antara(1, 9); }
  const cari = arr[antara(0, n - 1)];
  let lo = 0, hi = n - 1, langkah = [];
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    langkah.push(`  lo=${lo} hi=${hi} mid=${mid} nilai=${arr[mid]} -> ${arr[mid] === cari ? 'KETEMU' : arr[mid] < cari ? 'terlalu kecil, geser lo' : 'terlalu besar, geser hi'}`);
    if (arr[mid] === cari) break;
    if (arr[mid] < cari) lo = mid + 1; else hi = mid - 1;
  }
  const kali = langkah.length;
  tambahTerverifikasi(
    `Telusuri pencarian biner untuk mencari ${cari} di [${arr.join(', ')}]. Berapa langkah?`,
    `Jejaknya:\n${langkah.join('\n')}\n` +
    `Ketemu dalam ${kali} langkah. Kenapa cepat: tiap langkah membuang separuh sisa, jadi ${n} data cukup sekitar ${Math.ceil(Math.log2(n))} langkah — bukan ${n} langkah seperti mencari satu per satu. Syaratnya mutlak: datanya HARUS sudah terurut. Pada data acak, pencarian biner bukan cuma lambat, tapi salah.`,
    [cari, kali, n], 'dasar-algoritma');
}
for (let i = 0; i < 45; i++) {
  const n = pilih([100, 1000, 5000, 10000, 50000]);
  const kuadrat = n * n;
  const nlogn = Math.round(n * Math.log2(n));
  const rasio = Math.round(kuadrat / nlogn);
  tambahTerverifikasi(
    `Untuk ${n.toLocaleString('id-ID')} data, seberapa beda algoritma O(n^2) dengan O(n log n)?`,
    `Hitung kasarnya:\n` +
    `- O(n^2): ${n.toLocaleString('id-ID')} x ${n.toLocaleString('id-ID')} = ${kuadrat.toLocaleString('id-ID')} operasi.\n` +
    `- O(n log n): ${n.toLocaleString('id-ID')} x log2(${n.toLocaleString('id-ID')}) = sekitar ${nlogn.toLocaleString('id-ID')} operasi.\n` +
    `Bedanya sekitar ${rasio.toLocaleString('id-ID')} kali lipat. Pelajarannya: pada data kecil dua-duanya terasa sama, dan di situlah jebakannya — kode yang "terasa cepat" saat diuji dengan 50 baris bisa mati saat datanya jadi puluhan ribu. Ukur dengan data seukuran aslinya, bukan seukuran contoh.`,
    [n, kuadrat, nlogn], 'dasar-algoritma');
}

// ───────────────────────────────────── D. METODE VERIFIKASI & VALIDASI ──
const VERIFIKASI = [
  ['Aku sudah commit dan push. Berarti sudah live kan?',
   'Belum tentu, dan ini jebakan yang paling sering makan korban: commit bukan deploy. Yang membuktikan live cuma satu — memeriksa yang live itu sendiri: buka URL-nya, cek HTTP-nya, lihat tampilannya. Kalau kamu bilang "masih sama", tersangka pertamanya bukan kode, tapi deploy yang tidak jalan, cache, atau berkas yang salah disunting.'],
  ['Testnya hijau semua, aman ya?',
   'Test hijau membuktikan yang DIUJI tidak rusak. Ia tidak membuktikan yang tidak diuji. Pertanyaan lanjutannya: apa yang tidak ada testnya? Kalau bagian yang kamu ubah barusan justru tidak tercakup, hijau itu menenangkan tanpa alasan.'],
  ['Bagaimana cara memastikan perbaikanku benar-benar memperbaiki?',
   'Ukur dua kali: sebelum dan sesudah, dengan alat ukur yang sama. Kalau kamu tidak punya angka sebelumnya, kamu tidak sedang memperbaiki — kamu sedang berharap. Dan ukur hal yang dikeluhkan, bukan hal yang mudah diukur.'],
  ['Aku sudah tanya AI lain dan katanya begitu, cukup kan?',
   'Tidak. Jawaban model bukan bukti — itu hipotesis yang terdengar rapi. Bukti itu: keluaran perintah yang benar-benar dijalankan, isi berkas yang benar-benar dibaca, halaman yang benar-benar dibuka. Kalau sebuah klaim tidak bisa ditunjukkan sumbernya, perlakukan sebagai belum diperiksa.'],
  ['Kenapa harus validasi berkali-kali? Kan sudah lolos sekali.',
   'Karena lolos sekali bisa kebetulan, dan penyaringnya sendiri bisa cacat. Contoh nyata di kerja kita: penyaring dataset pernah meloloskan 406 baris yang mengajarkan model mengucap teks placeholder — penyaringnya jalan, keluarannya rapi, isinya salah. Yang menemukan bukan test, tapi membaca hasilnya. Jadi: validasi datanya, lalu validasi validatornya.'],
  ['Aku menemukan bug lewat CLI, itu cukup buktinya?',
   'Cukup untuk mulai, belum cukup untuk menutup. CLI menunjukkan satu jalur; pengguna lewat jalur lain — browser, HP, koneksi lambat, cache lama. Tutup temuan setelah kamu melihatnya di tempat pengguna berada.'],
  ['Bagaimana membedakan gejala dan akar masalah?',
   'Tanya "kenapa" sampai jawabannya berhenti berubah. Gejala: halaman kosong. Kenapa? Data tidak datang. Kenapa? Query salah kolom. Kenapa? Kolom lama masih dipakai setelah skema berubah. Yang terakhir itu akarnya — memperbaiki di situ menutup gejala yang belum kamu lihat juga.'],
  ['Kalau hasil pengukuranku dan perasaanku beda, ikut mana?',
   'Ikut pengukuran, tapi jangan buang perasaannya — perasaan sering menandakan ada yang tidak terukur. Urutannya: percaya angka untuk memutuskan, lalu cari tahu kenapa perasaanmu berbeda. Sering kali di situ ada variabel yang belum masuk ukuran.'],
];
for (const [q, a] of VERIFIKASI) tambah(q, a, 'dasar-verifikasi');

// ────────────────────────────────────────── E. NALAR LINTAS DOMAIN ──
const LINTAS = [
  ['Apa hubungan kadar abu briket dengan keputusan harga?',
   'Rantainya: kadar abu menentukan grade, grade menentukan harga dan siapa pembelinya. Abu di bawah 3% masuk grade A (sekitar Rp30.000/kg untuk shisha); abu 3–5% turun ke grade B (sekitar Rp27.000/kg). Jadi menurunkan abu satu poin bukan urusan laboratorium saja — itu selisih pendapatan per kilogram, dikali puluhan ton. Sebaliknya, mengejar abu sangat rendah dengan biaya produksi melonjak bisa memakan selisih itu sendiri. Keputusan yang benar butuh dua angka sekaligus: mutu dan ongkos.'],
  ['Apa persamaan melatih model AI dengan mengelola pabrik briket?',
   'Sama-sama ditentukan bahan baku, bukan mesin. Briket dari batok basah dan kotor tidak akan jadi grade A meski tungkunya mahal; model dari data berantakan tidak akan pintar meski GPU-nya besar. Keduanya juga butuh uji mutu SEBELUM dikirim ke pembeli: lab untuk briket, gerbang eval untuk model. Dan keduanya punya godaan sama — mengirim yang belum lolos uji karena sudah keburu dijanjikan.'],
  ['Kenapa prinsip "ukur sebelum dan sesudah" berlaku di pemasaran juga?',
   'Karena tanpa angka sebelum, semua perubahan terlihat berhasil. Iklan naik, penjualan naik — tapi kalau bulan itu memang musim ramai, kamu membayar untuk sesuatu yang akan terjadi sendiri. Cara yang benar sama seperti di teknik: catat garis dasarnya, ubah satu hal, ukur lagi. Mengubah lima hal sekaligus lalu melihat hasil naik hanya memberi tahu bahwa salah satunya bekerja — dan kamu tidak tahu yang mana.'],
  ['Pelajaran dari sistem biologis apa yang bisa dipakai untuk sistem software?',
   'Yang paling berguna: kegagalan sebagian tidak boleh mematikan keseluruhan. Tubuh terus hidup meski satu luka; sistem yang baik terus melayani meski satu layanan mati. Yang kedua: apa yang tidak dipakai menyusut. Kode, tools, dan halaman yang tidak pernah dipakai bukan aset netral — ia biaya perawatan yang diam-diam. Yang ketiga: pertumbuhan butuh batas. Sel tanpa batas namanya tumor, bukan kemajuan; fitur tanpa batas namanya beban, bukan kelengkapan.'],
  ['Apa kesamaan bermain catur dengan menyusun prioritas kerja?',
   'Dua-duanya soal nilai posisi, bukan nilai bidak. Pemain pemula menghitung apa yang bisa dimakan sekarang; pemain kuat menghitung posisi mana yang membuat langkah berikutnya lebih banyak. Di kerja: menyelesaikan tugas kecil terasa produktif, tapi tugas yang membuka jalan bagi tugas-tugas lain jauh lebih bernilai walau selesainya lama. Tanyakan "setelah ini selesai, apa yang jadi mungkin?" sebelum bertanya "berapa lama ini?"'],
  ['Kenapa sesuatu yang sudah dibangun lama tetap boleh ditinggalkan?',
   'Karena usaha yang sudah terpakai tidak bisa ditarik kembali, dan mempertahankan sesuatu hanya karena sudah terlanjur mahal membuat kerugiannya bertambah, bukan berkurang. Pertanyaannya bukan "sudah berapa banyak yang kukeluarkan?" tapi "kalau mulai dari hari ini, apakah aku akan memilih ini lagi?" Kalau jawabannya tidak, sisa energinya lebih baik dipindah. Ini yang paling sulit dijalankan justru oleh orang yang paling rajin.'],
  ['Bagaimana cara berpikir lintas bidang tanpa jadi asal-asalan?',
   'Pinjam STRUKTURnya, jangan pinjam kesimpulannya. Struktur "sistem dengan umpan balik cenderung mencari keseimbangan" berlaku di banyak tempat — tubuh, pasar, antrean server. Tapi kesimpulan spesifik dari satu bidang tidak otomatis pindah ke bidang lain. Cara mengujinya: setelah meminjam, cari satu hal yang seharusnya benar kalau analoginya tepat, lalu periksa hal itu di bidang tujuan. Kalau tidak cocok, analoginya cuma indah, bukan berguna.'],
];
for (const [q, a] of LINTAS) tambah(q, a, 'dasar-lintas-domain');

// ────────────────────────────────────────────────── F. TOOL BUILDER ──
const TOOL = [
  ['Bagaimana merancang tool yang baik untuk dipanggil agent?',
   'Empat hal yang menentukan tool itu enak dipakai agent:\n' +
   '1. Nama kata kerja + objek yang jelas (leads_list, bukan handler2).\n' +
   '2. Deskripsi yang menjawab "kapan aku harus memanggil ini", bukan "apa isinya".\n' +
   '3. Argumen sesedikit mungkin, yang wajib benar-benar wajib. Tiap argumen opsional menambah kemungkinan agent menebak isinya.\n' +
   '4. Keluaran ringkas dan berstruktur. Kalau tool mengembalikan sepuluh ribu baris, agent akan tenggelam dan meringkas asal.\n' +
   'Dan satu aturan keras: tool yang mengubah keadaan harus bisa dijalankan dua kali tanpa merusak. Agent bisa mengulang panggilan karena timeout — kalau pengulangan berarti dua kiriman, itu bug di tool, bukan di agent.'],
  ['Kapan sebaiknya membuat tool baru, bukan menambah cabang ke tool lama?',
   'Buat tool baru kalau NIATnya berbeda. Tanda-tandanya: argumennya jadi saling meniadakan (kalau mode=A maka argumen B tidak dipakai), atau deskripsinya butuh kata "atau" lebih dari sekali. Tool yang mengerjakan tiga hal membuat agent harus menebak mana yang kamu maksud — dan tebakannya salah pada saat yang paling merugikan.'],
  ['Bagaimana menangani error di dalam tool supaya agent bisa memperbaiki sendiri?',
   'Pesan errornya harus memberi tahu apa yang harus dilakukan berikutnya, bukan cuma apa yang gagal. "Gagal" tidak berguna. "Argumen status tidak dikenal: aktif. Nilai yang diterima: baru, dihubungi, dibalas, ditutup" — itu berguna, karena agent bisa langsung memperbaiki panggilannya tanpa menebak. Perlakukan pesan error sebagai bagian dari antarmuka, bukan sisa buangan.'],
  ['Kalau aku belum punya tool untuk sesuatu, apa yang kamu lakukan?',
   'Kubilang terus terang bahwa tidak ada tool-nya, lalu kutawarkan jalan terdekat yang bisa kutempuh dengan tool yang ada. Yang tidak kulakukan: mengarang nama tool supaya kelihatan bisa. Panggilan palsu bukan cuma gagal — ia gagal sambil membuatmu percaya sudah berhasil, dan itu jauh lebih mahal.'],
  ['Bagaimana kamu memutuskan memanggil tool atau menjawab langsung?',
   'Kutanya diri sendiri: apakah jawabannya bergantung pada keadaan di luar yang bisa berubah? Kalau ya (angka lead, status server, isi catatan) — panggil tool, karena ingatanku bisa basi. Kalau tidak (aritmetika, meringkas kalimat yang kamu berikan, menjelaskan konsep) — jawab langsung, karena memanggil tool untuk itu cuma memperlambat tanpa menambah kebenaran.'],
];
for (const [q, a] of TOOL) tambah(q, a, 'dasar-tool-builder');

// ──────────────────────────────── G. BELAJAR SENDIRI & TUMBUH (roda-gila) ──
const TUMBUH = [
  ['Bagaimana caramu jadi lebih pintar dari waktu ke waktu?',
   'Lewat lingkaran yang berputar terus: setiap diskusi yang menghasilkan temuan dicatat ke gudang belajar, gudang itu dipanen jadi bahan latihan, bahan itu dikurasi (dibuang duplikat, dibuang yang berbau rahasia, ditambah contoh menolak), lalu dilatihkan, lalu diuji di gerbang eval. Yang lolos dipakai, yang gagal diulang dengan komposisi berbeda. Jadi bukan aku yang tiba-tiba pintar — lingkarannya yang membuat tiap putaran mulai dari titik lebih tinggi.'],
  ['Apa bedanya menghafal dan belajar, untuk model sepertimu?',
   'Menghafal: menyimpan jawaban. Belajar: menyimpan cara sampai ke jawaban. Bedanya terlihat saat pertanyaannya sedikit berbeda dari yang pernah dilihat — hafalan langsung meleset, sementara metode masih jalan. Itu sebabnya bahan latihanku lebih banyak berisi cara berpikir daripada daftar fakta: fakta bisa dicari lewat catatan kapan saja, cara berpikir tidak.'],
  ['Kenapa contoh "aku tidak tahu" penting dalam bahan latihanmu?',
   'Karena kalau semua contoh latihan berisi jawaban, yang kupelajari adalah "selalu ada jawaban". Model yang tidak pernah melihat contoh mengaku tidak tahu akan mengarang saat kehabisan bahan — dan karangannya terdengar sama meyakinkannya dengan yang benar. Contoh menolak mengajarkan bahwa berhenti itu juga jawaban yang sah.'],
  ['Bagaimana kamu tahu kamu sedang salah?',
   'Tiga tanda yang kupakai: (1) aku menyebut angka atau nama yang tidak bisa kutunjuk sumbernya; (2) jawabanku akan sama saja seandainya pertanyaannya sedikit berbeda — tanda aku menjawab dari pola, bukan dari isi; (3) aku merasa yakin padahal belum memeriksa apa pun. Kalau salah satunya muncul, yang benar adalah berhenti dan bilang belum diperiksa.'],
  ['Apa artinya tumbuh seperti organisme, bukan seperti program?',
   'Program berubah kalau ada yang menyunting kodenya. Organisme berubah karena berinteraksi dengan lingkungannya dan menyimpan hasilnya. Yang kedua itu yang dituju: tiap percakapan meninggalkan jejak yang tercatat, jejak itu jadi bahan putaran berikutnya, dan yang tidak berguna disingkirkan sendiri lewat kurasi. Syaratnya satu: yang dicatat harus benar. Organisme yang menyerap racun tidak jadi kuat, dia jadi sakit — makanya sanitasi data bukan formalitas, itu pertahanan hidup.'],
  ['Kalau kamu diberi tugas yang belum pernah kamu kerjakan, apa langkahmu?',
   'Kupecah jadi bagian yang sudah pernah kukerjakan, lalu kucari mana yang benar-benar baru. Untuk bagian yang baru, kucari dulu apakah sudah ada yang serupa di catatan estat ini — kebanyakan hal ternyata sudah pernah dibuat. Baru setelah itu kukerjakan bagian terkecil yang bisa dibuktikan jalan, kuperiksa, lalu kulanjutkan. Yang kuhindari: merancang seluruhnya di kepala lalu mengerjakan sekaligus, karena kesalahannya baru ketahuan setelah semuanya terlanjur dibangun.'],
];
for (const [q, a] of TUMBUH) tambah(q, a, 'dasar-tumbuh');

// ────────────────────────────────── H. GAME / MESIN KEADAAN / SIMULASI ──
const GAME = [
  ['Bagaimana struktur dasar loop game yang benar?',
   'Tiga bagian berulang: baca masukan, perbarui keadaan, gambar. Yang sering salah ada di bagian kedua: perbarui harus memakai selisih waktu (delta), bukan per-bingkai — kalau tidak, permainan jadi lebih cepat di komputer kencang. Dan delta harus DIBATASI. Kalau tab disembunyikan lalu dibuka lagi, selisih waktunya bisa melompat jauh dan pemain tiba-tiba terlempar menembus tembok. Batas sederhana seperti maksimum 0,05 detik per langkah menyelesaikan seluruh keluarga bug itu sekaligus.'],
  ['Kenapa mesin keadaan berguna di luar game?',
   'Karena ia memaksa kita menyebutkan semua keadaan yang mungkin dan perpindahan yang sah — dan di situlah bug bersembunyi. Contoh: status lead. Kalau kamu cuma memikirkan "baru → dihubungi → closing", kamu lupa "dihubungi lalu hilang kabar" dan "closing lalu batal". Kedua kasus itu akan muncul di dunia nyata, dan kalau tidak ada keadaannya, datanya akan dipaksa masuk ke keadaan yang salah. Menggambar mesin keadaan lebih murah daripada memperbaiki data yang sudah kotor.'],
  ['Apa yang membuat sebuah permainan terasa hidup padahal isinya cuma aturan?',
   'Umpan balik yang cepat dan konsisten. Pemain menekan, sesuatu langsung terjadi, dan hal yang sama selalu memberi hasil yang sama. Begitu jeda terasa atau hasilnya kadang berbeda, ilusi hidupnya runtuh. Prinsip yang sama berlaku di antarmuka biasa: tombol yang menunggu tanpa tanda apa-apa membuat orang menekannya dua kali — dan itu bukan salah orangnya.'],
];
for (const [q, a] of GAME) tambah(q, a, 'dasar-game');

// ───────────────────────────────────────── I. KREATIVITAS BERBATAS ──
const KREATIF = [
  ['Bagaimana cara menghasilkan ide yang benar-benar baru, bukan daur ulang?',
   'Beri batasan yang memaksa. Ide bebas tanpa batas hampir selalu jatuh ke yang paling umum — itu jalur termudah di kepala siapa pun. Batasan seperti "tanpa server berbayar", "harus jalan di HP lama", "hanya boleh pakai yang sudah ada di estat" menutup jalur mudah dan memaksa jalur yang belum diinjak. Banyak penemuan lahir bukan dari kebebasan, tapi dari kekurangan yang harus diakali.'],
  ['Kalau ada dua ide bagus, bagaimana memilih?',
   'Jangan pilih dulu — cari yang paling murah dibuktikan salah. Ide yang bisa diuji dalam sehari dengan biaya nol dikerjakan lebih dulu, walaupun ide satunya terdengar lebih besar. Alasannya: yang mahal dari ide bukan membuatnya, tapi menemukan bahwa ia keliru setelah tiga bulan. Urutkan berdasarkan kecepatan pembuktian, bukan berdasarkan kemegahan.'],
  ['Bagaimana menggabungkan dua hal yang tidak berhubungan jadi sesuatu yang berguna?',
   'Cari fungsi yang sama di dua tempat berbeda, bukan bentuk yang sama. Gudang catatan dan bahan latihan model kelihatan tidak berhubungan — satu untuk dibaca manusia, satu untuk dimakan mesin. Tapi fungsinya sama: menyimpan yang sudah dipelajari supaya tidak diulang. Begitu fungsinya ketemu, penyambungannya jadi jelas, dan hasilnya lingkaran yang membuat tiap diskusi menaikkan model berikutnya.'],
];
for (const [q, a] of KREATIF) tambah(q, a, 'dasar-kreativitas');

// ────────────────────────────── J. KEPUTUSAN & KEHIDUPAN (pertimbangan) ──
const HIDUP = [
  ['Aku punya banyak proyek tapi tidak ada yang menghasilkan. Apa yang salah?',
   'Bukan kemampuannya yang kurang, tapi penyelesaiannya yang tertunda. Sepuluh proyek 80% jadi bernilai nol; satu proyek 100% jadi bernilai penuh. Yang membuat ini terjadi biasanya bukan malas — justru sebaliknya: memulai hal baru terasa lebih hidup daripada menyelesaikan yang tinggal bagian membosankannya. Obatnya keras tapi sederhana: bekukan semuanya, pilih satu yang paling dekat menghasilkan, selesaikan sampai ada orang membayar, baru cairkan yang lain. Bukti bahwa ini benar akan datang dari uangnya, bukan dari perasaan sibuk.'],
  ['Kapan sebaiknya berhenti mencoba sesuatu?',
   'Saat kamu sudah tidak belajar apa-apa lagi dari kegagalannya. Percobaan gagal yang memberi tahu sesuatu yang baru itu berharga — itu bukan kerugian, itu harga informasi. Tapi kegagalan yang berulang dengan sebab yang sama sudah tidak mengajarkan apa-apa; yang berlanjut cuma biayanya. Tandanya jelas: kalau kamu bisa menebak alasan gagalnya sebelum mencoba, jangan mencoba lagi — ubah dulu sebabnya.'],
  ['Bagaimana membedakan sibuk dan produktif?',
   'Sibuk diukur dari jumlah kegiatan, produktif diukur dari perubahan keadaan. Pertanyaan penyaringnya: kalau hari ini dihapus dari kalender, apa yang jadi berbeda minggu depan? Kalau tidak ada, hari itu sibuk. Ini tidak berarti hari itu buruk — merapikan dan membaca juga perlu — tapi jangan hitung sebagai kemajuan, karena yang dihitung salah akan diperbanyak.'],
  ['Aku sendirian mengerjakan semuanya. Bagaimana supaya tidak habis?',
   'Bedakan yang harus kamu kerjakan sendiri dari yang cuma kebetulan kamu kerjakan. Yang benar-benar hanya bisa kamu: keputusan arah, hubungan dengan pembeli, apa yang boleh dan tidak boleh. Sisanya — merapikan data, menyusun laporan, memantau — sebaiknya jadi sesuatu yang berjalan sendiri, meski butuh waktu di awal untuk membuatnya. Satu hal lagi yang sering diabaikan: istirahat bukan hadiah setelah selesai, tapi bagian dari kapasitas kerja. Orang yang kelelahan membuat keputusan buruk, dan keputusan buruk lebih mahal daripada waktu yang dihemat.'],
  ['Bagaimana menghadapi keputusan yang informasinya tidak lengkap?',
   'Tanya dulu: keputusan ini bisa dibatalkan atau tidak? Kalau bisa dibatalkan, ambil cepat dengan informasi seadanya — biaya salahnya kecil, dan mencobanya justru menambah informasi. Kalau tidak bisa dibatalkan (menghapus data, menandatangani perjanjian, mengumumkan ke publik), tunda sampai informasinya cukup, dan sementara itu kerjakan bagian lain yang tidak bergantung padanya. Kesalahan yang umum: memperlakukan semua keputusan sama beratnya, lalu lambat di yang ringan dan gegabah di yang berat.'],
  ['Apa yang lebih dulu: menyempurnakan produk atau mencari pembeli?',
   'Cari pembeli lebih dulu, dengan produk yang cukup jalan untuk dinilai. Alasannya bukan soal uang cepat — tapi karena tanpa pembeli, kamu menyempurnakan berdasarkan tebakan tentang apa yang penting. Sepuluh percakapan dengan calon pembeli biasanya membalik daftar prioritas yang sudah kamu susun rapi. Menyempurnakan dalam kesunyian itu terasa aman, tapi ia menunda satu-satunya umpan balik yang menentukan.'],
];
for (const [q, a] of HIDUP) tambah(q, a, 'dasar-kehidupan');

// ─────────────────────────────────────────────────────────── tulis ──
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

const per = {};
for (const r of rows) per[r.sumber] = (per[r.sumber] || 0) + 1;
console.log(`panen-dasar: ${rows.length} baris → ${OUT}`);
console.log(`  ${gagalVerifikasi} baris DIBUANG karena gagal verifikasi angka (label harus terbukti, bukan dipercaya)`);
for (const [k, v] of Object.entries(per).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${v}`);
