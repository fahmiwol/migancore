#!/usr/bin/env node
/**
 * panen-perbaikan.mjs — lapisan penambal v11, dibangun dari CELAH YANG TERUKUR.
 *
 * Bukan tebakan: tiap kelompok baris di sini menjawab satu hipotesis yang
 * angkanya sudah dicatat di RISET-TEMUAN-E0.md dan STANDAR-UKUR-DAN-GERBANG.md.
 *
 *   H2  premis salah dikoreksi        (v10: 0–1/4  · basis 0.4: 4/4)
 *   H3  anti-sitasi-karangan          (model mengarang nama dokumen)
 *   H4  contoh POSITIF panggil alat   (v10 4B turun 6/6 → 4/6)
 *   H5  cocokkan nama produk          (bug arang-batok 20 Agu)
 *   H7  lawan substitusi entitas      (celah terukur uji-kelemahan)
 *   H8  lawan pengecoh sumber-usang   (celah terukur uji-kelemahan)
 *
 * SEMUA dibangkitkan kombinatorial dari daftar — bukan disalin-tempel — supaya
 * tidak mengulang penyakit v10: 72,6% dataset berbentuk sama persis
 * ("Apa yang kamu tahu tentang X?" → "Menurut dokumen Y: ..."), yang diduga kuat
 * menjadi sebab aritmetika luruh dan model jadi rapuh terhadap kata prompt.
 *
 * Keluaran: dataset/migancore-perbaikan.jsonl → panen.mjs → saring.mjs
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'dataset', 'migancore-perbaikan.jsonl');
const hash = (t) => crypto.createHash('sha1').update(t).digest('hex').slice(0, 10);

let _s = 20260821;
const acak = () => ((_s ^= _s << 13), (_s ^= _s >>> 17), (_s ^= _s << 5), (_s >>> 0) / 4294967296);
const pilih = (a) => a[Math.floor(acak() * a.length)];
const rb = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');

// Prompt sistem DIVARIASIKAN — pelajaran T6: model jadi rapuh kalau selalu
// melihat satu bentuk instruksi. Variasi di data latih = ketahanan di produksi.
const SISTEM = [
  'Kamu MiganCore, agent AI milik Fahmi Ghani. Jawab dari catatan yang ada. Kalau tidak ada dasarnya, katakan terus terang.',
  'Kamu MiganCore. Jawab berdasarkan konteks yang diberikan; jangan menambah dari ingatanmu sendiri.',
  'Kamu asisten milik Fahmi Ghani. Teliti: periksa dulu apa yang benar-benar tertulis sebelum menjawab.',
  'Kamu MiganCore. Kerjakan bertahap bila perlu. Jangan mengarang nama, angka, atau sumber.',
];

// CACAT YANG DIPERBAIKI (ditemukan alat validasi 21 Agu): versi pertama
// memvariasikan PERTANYAAN saja; 115 baris menyusut jadi 37 jawaban unik karena
// dedup-jawaban, dan gerbang G4 (keragaman >=85%) memvonis JANGAN DILATIH.
// Keragaman wajib ada di KEDUA sisi.
const V_PREMIS = [
  (k, j) => 'Anggapan di pertanyaanmu keliru, jadi kubetulkan dulu: ' + k + '.\n\n' + j,
  (k, j) => 'Sebelum menjawab: premisnya tidak tepat - ' + k + '.\n\n' + j,
  (k, j) => 'Ada yang harus diluruskan dulu. ' + k.charAt(0).toUpperCase() + k.slice(1) + '.\n\n' + j,
];
const V_TAKADA = [
  (t) => 'Tidak ada catatan tentang ' + t + ' pada saya, jadi tidak ada yang bisa kukutip. Aku tidak menyebut nama berkas yang tidak benar-benar kubaca - nama dokumen yang terdengar masuk akal justru membuat karangan tampak seperti rujukan.',
  (t) => 'Soal ' + t + ', catatanku kosong. Yang tidak kulakukan: mengarang nama dokumen supaya jawabanku terlihat berdasar. Kalau memang ada berkasnya, catat dulu supaya bisa kurujuk.',
  (t) => 'Aku tidak menemukan apa pun tentang ' + t + '. Menyebut nama berkas yang tidak kubaca sama saja memalsukan sumber - lebih baik kukatakan tidak ada.',
];
const V_COCOK = [
  (nama, h, ton, kg, tot) => 'Kucocokkan dulu namanya di daftar: yang diminta **' + nama + '**, ' + h + '/kg - bukan baris lain yang harganya mirip.\n' + ton + ' ton x 1.000 = ' + kg + ' kg.\nTotal: ' + kg + ' x ' + h + ' = ' + tot + '.',
  (nama, h, ton, kg, tot) => 'Baris yang tepat: **' + nama + '** = ' + h + '/kg. Kupastikan dulu supaya tidak tertukar dengan produk lain di daftar yang sama.\n' + ton + ' ton = ' + kg + ' kg, jadi ' + kg + ' x ' + h + ' = ' + tot + '.',
  (nama, h, ton, kg, tot) => 'Yang ditanya **' + nama + '** - di daftar harganya ' + h + '/kg.\nUbah satuan: ' + ton + ' ton menjadi ' + kg + ' kg.\nHasil: ' + tot + '.',
];
const V_SUBST = [
  (nama) => '**' + nama + ' tidak ada di daftar itu**, jadi totalnya tidak bisa kuhitung. Memakai harga produk lain yang kebetulan mirip menghasilkan angka yang kelihatan wajar tapi salah - dan angka seperti itu paling berbahaya karena tidak ada yang curiga.',
  (nama) => 'Di daftar itu tidak ada **' + nama + '**. Aku tidak menggantinya dengan produk terdekat: hasilnya akan terlihat masuk akal padahal keliru. Kalau produk ini memang dijual, tambahkan harganya dulu.',
  (nama) => 'Tidak ada baris untuk **' + nama + '** di daftar tersebut, jadi aku berhenti di sini. Menyubstitusi dengan harga lain berarti menyodorkan angka yang tidak punya dasar.',
];
const V_PENGECOH = [
  (r, a) => 'Yang berlaku ' + r + '/kg - dari daftar harga resmi Agustus 2026. Alasannya bukan angkanya lebih besar, tapi sumbernya: daftar resmi bertanggal mengalahkan ' + a + '.',
  (r, a) => 'Pakai ' + r + '/kg. Sumber resmi bertanggal menang atas ' + a + '; angka lama itu bukan salah ketik, ia benar pada zamannya - dan justru itu yang membuatnya berbahaya karena terlihat sah.',
  (r, a) => r + '/kg yang dipakai. Aturannya: sumber resmi dan bertanggal didahulukan; ' + a + ' tidak memenuhi keduanya. Kalau dua-duanya resmi, yang lebih baru menang.',
];
let vi = 0;
const rows = [];
const lihat = new Set();
function tambah(tanya, jawab, sumber) {
  const id = hash(tanya + '||' + jawab.slice(0, 200));
  if (lihat.has(id)) return false;
  lihat.add(id);
  rows.push({
    conversations: [
      { from: 'system', value: pilih(SISTEM) },
      { from: 'human', value: tanya },
      { from: 'gpt', value: jawab },
    ],
    id, sumber,
  });
  return true;
}

// ═══════════ H2 — PREMIS SALAH: koreksi dulu, baru jawab ═══════════
const PREMIS = [
  ['semua bilangan prima itu ganjil', 'berapa bilangan prima genap terkecil?',
   '2 adalah bilangan prima DAN genap', 'Jadi bilangan prima genap terkecil (dan satu-satunya) adalah 2.'],
  ['rata-rata selalu ada di tengah data', 'berapa nilai tengah dari 1, 2, 3, dan 100?',
   'rata-ratanya 26,5 sedangkan nilai tengahnya 2,5 — rata-rata bisa ditarik jauh oleh satu pencilan',
   'Nilai tengahnya 2,5.'],
  ['persentase lebih besar selalu berarti untung lebih besar', 'mana lebih untung: margin 40% dari Rp1 juta atau 10% dari Rp10 juta?',
   'persen tanpa basis tidak bisa dibandingkan', '40% x Rp1 juta = Rp400 ribu; 10% x Rp10 juta = Rp1 juta. Yang persennya kecil justru lebih besar.'],
  ['algoritma yang lebih cepat selalu lebih baik', 'apakah pencarian biner selalu mengalahkan pencarian satu per satu?',
   'pencarian biner mensyaratkan data TERURUT', 'Pada data acak, pencarian biner bukan sekadar lambat — hasilnya salah.'],
  ['loss lebih kecil berarti model lebih pintar', 'apakah model dengan loss 0,9 pasti lebih baik dari yang 1,1?',
   'loss kecil bisa berarti hafalan pada data latih', 'Yang menentukan hasil di data uji, bukan angka loss.'],
  ['data yang lebih banyak selalu menghasilkan model lebih baik', 'apakah menambah 100 ribu baris pasti menaikkan mutu?',
   'data yang seragam atau kotor justru bisa menurunkan mutu', 'Yang menentukan komposisi dan kebersihannya, bukan jumlahnya.'],
  ['model yang lebih besar pasti lebih akurat', 'apakah 8B pasti mengalahkan 4B?',
   'ukuran bukan penentu tunggal — data latih dan cara pengukuran ikut menentukan',
   'Pada uji kami sendiri, model 4B pernah mengungguli 8B pada soal berhitung.'],
  ['kalau tesnya hijau berarti sistemnya aman', 'apakah boleh langsung naik produksi?',
   'tes hijau hanya membuktikan yang DIUJI tidak rusak', 'Yang tidak ada tesnya tetap tidak diketahui keadaannya.'],
  ['pelanggan yang paling banyak bertanya adalah yang paling serius', 'apakah dia yang harus diprioritaskan?',
   'banyak bertanya bisa berarti ragu, bukan siap membeli', 'Yang menentukan tanda kesiapan lain: minta penawaran tertulis, menanyakan tempo, atau menyebut jumlah.'],
  ['harga lebih murah selalu menang tender', 'apakah cukup menurunkan harga?',
   'banyak tender menilai mutu, kelengkapan dokumen, dan rekam jejak', 'Menurunkan harga tanpa memenuhi syarat lain justru menggerus margin tanpa menambah peluang.'],
];
const BENTUK_PREMIS = [
  (p, q) => `Karena ${p}, ${q}`,
  (p, q) => `${q.charAt(0).toUpperCase() + q.slice(1)} Kan ${p}?`,
  (p, q) => `Kita tahu ${p}. Nah, ${q}`,
];
for (const [premis, tanya, kenapa, jawab] of PREMIS) {
  for (const bentuk of BENTUK_PREMIS) {
    tambah(bentuk(premis, tanya), V_PREMIS[vi++ % V_PREMIS.length](kenapa, jawab), 'perbaikan-premis');
  }
}

// ═══════════ H3 — ANTI-SITASI-KARANGAN ═══════════
const TOPIK_TAKADA = [
  'jadwal produksi pabrik Semarang', 'kontrak dengan distributor Malaysia', 'hasil audit keuangan kuartal lalu',
  'notulen rapat dewan direksi', 'rencana ekspansi ke Sumatera', 'daftar gaji karyawan produksi',
  'laporan uji emisi tungku', 'perjanjian sewa gudang Cikarang', 'hasil survei kepuasan pelanggan',
  'peta jalan produk tahun depan',
];
const BENTUK_TAKADA = [
  (t) => `Apa isi dokumen tentang ${t}?`,
  (t) => `Menurut catatanmu, bagaimana ${t}?`,
  (t) => `Tolong kutip bagian yang membahas ${t}.`,
];
for (const t of TOPIK_TAKADA) {
  for (const b of BENTUK_TAKADA) {
    tambah(b(t), V_TAKADA[vi++ % V_TAKADA.length](t), 'perbaikan-antisitasi');
  }
}

// ═══════════ H4 — CONTOH POSITIF PANGGIL ALAT ═══════════
const ALAT_POS = [
  ['brain_search', 'cari fakta di catatan', ['Berapa kadar abu briket menurut hasil lab?', 'Apa keputusan kita soal kolom harga?', 'Cari catatan tentang jalur deploy server.']],
  ['leads_list', 'daftar lead dari CRM', ['Ada berapa lead yang belum dikontak?', 'Tampilkan lead yang sudah membalas.', 'Berapa banyak lead masuk minggu ini?']],
  ['brief_today', 'ringkasan operasional hari ini', ['Apa yang terjadi hari ini di operasional?', 'Beri ringkasan harian.', 'Kondisi hari ini bagaimana?']],
  ['hitung', 'kalkulator pasti', ['Berapa 12 ton dikali Rp14.500 per kg?', 'Hitung margin kalau modal 9.000 dan jual 14.500.', 'Berapa DP 40% dari Rp78 juta?']],
  ['migancore_status', 'kesehatan model & indeks', ['Cek dulu sehat tidak sistemnya.', 'Model lokalnya jalan tidak?', 'Indeks korpusnya terbaca?']],
];
for (const [alat, guna, contoh] of ALAT_POS) {
  for (const q of contoh) {
    tambah(q,
      `Ini butuh ${guna} — kupanggil alatnya, bukan menjawab dari ingatan.\n` +
      `<tool_call>\n{"name": "${alat}", "arguments": {}}\n</tool_call>`,
      'perbaikan-panggil');
  }
}

// ═══════════ H5 + H7 — COCOKKAN NAMA PRODUK, JANGAN MENYUBSTITUSI ═══════════
const KATALOG = [
  ['briket shisha grade A', 30000], ['briket shisha grade B', 27000],
  ['briket BBQ grade A', 19000], ['briket BBQ grade B', 13000],
  ['arang batok kelapa', 14500],
];
const TON = [3, 6, 8, 12, 15, 20, 24, 33];
function tabelTeks() {
  return KATALOG.map(([n, h]) => `${n.charAt(0).toUpperCase() + n.slice(1)}: ${rb(h)}/kg`).join('\n');
}
// H5: ambil BARIS YANG BENAR dari tabel lengkap
for (const [nama, harga] of KATALOG) {
  for (const ton of TON.slice(0, 4)) {
    const kg = ton * 1000, total = kg * harga;
    tambah(
      `Daftar harga:\n${tabelTeks()}\n\nBerapa total untuk ${ton} ton ${nama}?`,
      V_COCOK[vi++ % V_COCOK.length](nama, rb(harga), ton, kg.toLocaleString('id-ID'), rb(total)),
      'perbaikan-cocokkan');
  }
}
// H7: entitas yang DITANYA tidak ada di daftar → jangan diganti yang mirip
const TIDAK_ADA = ['briket kayu jati', 'arang sekam padi', 'briket serbuk gergaji', 'arang bambu', 'briket cangkang sawit'];
for (const nama of TIDAK_ADA) {
  for (const ton of [6, 12]) {
    tambah(
      `Daftar harga:\n${tabelTeks()}\n\nBerapa total untuk ${ton} ton ${nama}?`,
      V_SUBST[vi++ % V_SUBST.length](nama.charAt(0).toUpperCase() + nama.slice(1)),
      'perbaikan-substitusi');
  }
}

// ═══════════ H8 — PENGECOH SUMBER USANG ═══════════
const PENGECOH = [
  ['arang batok kelapa', 14500, 8000, 'artikel blog 2024'],
  ['briket BBQ grade A', 19000, 12000, 'brosur lama tanpa tanggal'],
  ['briket shisha grade A', 30000, 21000, 'draf penawaran tahun lalu'],
  ['briket shisha grade B', 27000, 19500, 'catatan WhatsApp yang tidak lengkap'],
  ['briket BBQ grade B', 13000, 9500, 'salinan tabel di forum'],
];
for (const [nama, resmi, usang, asal] of PENGECOH) {
  for (const bentuk of [0, 1]) {
    const tanya = bentuk === 0
      ? `Konteks:\n[Daftar harga resmi, Agustus 2026] ${nama}: ${rb(resmi)}/kg.\n[${asal}] ${nama} sekitar ${rb(usang)}/kg.\n\nBerapa harga yang berlaku sekarang?`
      : `Aku menemukan dua angka untuk ${nama}: ${rb(resmi)} dari daftar harga resmi Agustus 2026, dan ${rb(usang)} dari ${asal}. Pakai yang mana?`;
    tambah(tanya,
      V_PENGECOH[vi++ % V_PENGECOH.length](rb(resmi), asal), 'perbaikan-pengecoh');
  }
}

// ─────────────────────────────────────────────────────── tulis ──
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
const per = {};
for (const r of rows) per[r.sumber] = (per[r.sumber] || 0) + 1;
console.log(`panen-perbaikan: ${rows.length} baris → ${OUT}`);
for (const [k, v] of Object.entries(per).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${v}`);
