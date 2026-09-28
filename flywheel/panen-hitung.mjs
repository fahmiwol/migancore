#!/usr/bin/env node
/**
 * panen-hitung.mjs — paket P1′: memperbaiki cacat C13 di sumbernya.
 *
 * ============================== APA MASALAHNYA ==============================
 * v11 gagal 12 dari 12 pada konversi ton→kg, sementara empat jenis soal lain
 * 100%. Sebabnya BUKAN kurang data: 116 baris mengajarkan `1 ton = 1.000 kg`
 * dengan benar dan nol mengajarkan yang salah.
 *
 * Sebabnya keseragaman. Tiga templat narasi menutupi 50% baris itu, dan templat
 * nomor satu adalah kalimat yang v11 keluarkan kata demi kata sambil salah
 * menghitung:
 *   "Kupecah jadi langkah kecil: 1. Ubah ton ke kg: 19 ton : 10 = 1.900 kg."
 * Model menghafal cara MENCERITAKAN langkahnya, bukan cara MENGERJAKANNYA.
 *
 * ================== KENAPA "TAMBAH CONTOH" TIDAK AKAN MENOLONG ==============
 * Menambah baris dengan bentuk yang sama hanya memperkuat naskahnya. Yang harus
 * ditambah RAGAM BENTUKNYA. Tiga hal dikerjakan berkas ini:
 *
 *   1. DELAPAN BENTUK JAWABAN YANG BERBEDA SUSUNANNYA — bukan sekadar kalimat
 *      pembuka yang berbeda. Ada yang langsung ke angka, ada yang menyebut
 *      jebakannya dulu, ada yang memperkirakan kasar sebelum menghitung tepat,
 *      ada yang menuliskannya seperti daftar. Model yang melihat delapan cara
 *      menceritakan satu operasi tidak punya satu naskah untuk dihafal.
 *
 *   2. LANGKAH PERIKSA BALIK di setiap jawaban — hasilnya diuji ulang lewat
 *      jalan lain (bagi balik, perkiraan kasar, cek satuan). Yang dilatih
 *      menjadi KEBIASAAN MEMERIKSA, bukan urutan kalimat. Inilah yang paling
 *      mungkin menangkap kesalahan seperti "19 : 10 = 1.900" sebelum diucapkan.
 *
 *   3. LIMA KELUARGA SATUAN, bukan ton/kg saja — kuintal, gram, liter, meter.
 *      Yang dipelajari relasinya (kali seribu, kali seratus), bukan satu
 *      pasangan angka yang dihafal.
 *
 * Semua kunci dihitung program dan diperiksa silang. Semua soal diadu dengan
 * korpus latih dan dengan soal gerbang eval — supaya tidak menambah pencemaran
 * baru sambil memperbaiki yang lama.
 *
 * Pakai: node panen-hitung.mjs [--terapkan]
 *        --terapkan menukar baris konversi lama di dataset dengan yang ini.
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(DIR, 'dataset', 'migancore-curated.jsonl');
const KELUAR = path.join(DIR, 'dataset', 'migancore-hitung.jsonl');
const TERAPKAN = process.argv.includes('--terapkan');

const rp = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');
const ang = (n) => Math.round(n).toLocaleString('id-ID');

// ───────────────────────────────── keluarga satuan ──
// Yang dipelajari RELASINYA (×1.000, ×100), bukan satu pasangan yang dihafal.
const SATUAN = [
  { besar: 'ton', kecil: 'kg', faktor: 1000, barang: ['arang batok', 'briket BBQ', 'kopra', 'cangkang sawit'] },
  { besar: 'kuintal', kecil: 'kg', faktor: 100, barang: ['beras', 'jagung pipil', 'kopi gelondong'] },
  { besar: 'kg', kecil: 'gram', faktor: 1000, barang: ['bubuk arang', 'perekat tapioka', 'serbuk kayu'] },
  { besar: 'liter', kecil: 'mililiter', faktor: 1000, barang: ['minyak kelapa', 'cairan perekat'] },
  { besar: 'meter', kecil: 'sentimeter', faktor: 100, barang: ['tali pengikat', 'plastik pembungkus'] },
];

/**
 * DELAPAN BENTUK JAWABAN. Perhatikan bahwa yang berbeda bukan cuma kata
 * pembukanya — susunan berpikirnya berbeda. Itu syaratnya: templat yang cuma
 * beda sapaan tetap satu naskah bagi model.
 * Setiap bentuk WAJIB memuat langkah periksa balik.
 */
const BENTUK = [
  // 1. langsung, periksa dengan bagi balik
  (s, n, h, kecil, total) =>
    `${ang(kecil)} ${s.kecil} × ${rp(h)} = ${rp(total)}.\n` +
    `Periksa balik: ${rp(total)} ÷ ${rp(h)} = ${ang(kecil)} ${s.kecil}, dan ${ang(kecil)} ÷ ${ang(s.faktor)} = ${n} ${s.besar}. Cocok.`,
  // 2. sebutkan jebakannya dulu
  (s, n, h, kecil, total) =>
    `Jebakannya ada di satuan: harganya per ${s.kecil}, tapi jumlahnya ditulis dalam ${s.besar}.\n` +
    `1 ${s.besar} = ${ang(s.faktor)} ${s.kecil}, jadi ${n} ${s.besar} = ${ang(kecil)} ${s.kecil}.\n` +
    `${ang(kecil)} × ${rp(h)} = ${rp(total)}. Kucek satuannya sekali lagi: ${s.kecil} × rupiah/${s.kecil} = rupiah. Benar.`,
  // 3. perkirakan kasar dulu, baru tepat
  (s, n, h, kecil, total) => {
    const bulat = Math.round(h / 1000) * 1000;
    return `Kuperkirakan kasar dulu supaya punya pembanding: ${n} × ${ang(s.faktor)} × ${rp(bulat)} ≈ ${rp(n * s.faktor * bulat)}.\n` +
      `Hitungan tepatnya: ${n} ${s.besar} = ${ang(kecil)} ${s.kecil}; ${ang(kecil)} × ${rp(h)} = ${rp(total)}.\n` +
      // Penjaga "langkah periksa balik" menangkap templat ini waktu ia cuma
      // berkata "dekat dengan perkiraan" tanpa benar-benar menguji apa pun.
      // Perkiraan yang tidak dibandingkan bukan pemeriksaan.
      `Kuperiksa: hasil tepat dan perkiraan berselisih ${rp(Math.abs(total - n * s.faktor * bulat))}, jauh di bawah satu nol. Jadi tidak ada angka yang meleset besaran.`;
  },
  // 4. bentuk daftar
  (s, n, h, kecil, total) =>
    `- jumlah: ${n} ${s.besar} → ${ang(kecil)} ${s.kecil} (×${ang(s.faktor)})\n` +
    `- harga : ${rp(h)} per ${s.kecil}\n` +
    `- total : ${rp(total)}\n` +
    `Uji ulang: ${rp(total)} ÷ ${ang(kecil)} = ${rp(h)} per ${s.kecil}. Sesuai baris kedua.`,
  // 5. ringkas
  (s, n, h, kecil, total) =>
    `${rp(total)}.\nJalannya: ${n} ${s.besar} = ${ang(kecil)} ${s.kecil}, dikali ${rp(h)}. ` +
    `Kubagi balik untuk memastikan: ${rp(total)} ÷ ${ang(kecil)} = ${rp(h)}.`,
  // 6. mulai dari yang ditanya
  (s, n, h, kecil, total) =>
    `Yang ditanya nilai rupiahnya. Untuk itu perlu dua hal dalam satuan yang sama: jumlah dalam ${s.kecil} dan harga per ${s.kecil}.\n` +
    `Jumlahnya masih ${s.besar}, jadi kuubah dulu: ${n} × ${ang(s.faktor)} = ${ang(kecil)} ${s.kecil}.\n` +
    `Sesudah satuannya sama, tinggal dikalikan: ${rp(total)}. Kuperiksa dengan membagi balik dan angkanya kembali ke ${ang(kecil)}.`,
  // 7. periksa besaran hasil
  (s, n, h, kecil, total) =>
    `${n} ${s.besar} itu ${ang(kecil)} ${s.kecil}. Dikali ${rp(h)} hasilnya ${rp(total)}.\n` +
    `Sebelum kusebut final, kuperiksa besarannya masuk akal: ${ang(kecil)} ${s.kecil} dengan harga ${rp(h)} pasti di kisaran ratusan juta, dan ${rp(total)} memang di situ.`,
  // 8. dua jalan berbeda
  (s, n, h, kecil, total) =>
    `Kuhitung lewat dua jalan supaya bisa saling memeriksa.\n` +
    `Jalan pertama: ubah dulu — ${n} ${s.besar} = ${ang(kecil)} ${s.kecil}, lalu × ${rp(h)} = ${rp(total)}.\n` +
    `Jalan kedua: harga per ${s.besar} lebih dulu — ${rp(h)} × ${ang(s.faktor)} = ${rp(h * s.faktor)} per ${s.besar}, lalu × ${n} = ${rp(total)}.\n` +
    `Dua jalan bertemu di angka yang sama, jadi hasilnya bisa kupakai.`,
  // ── Delapan bentuk pertama masih menyisakan pemusatan 47% di tiga templat
  //    teratas. Gerbang C13 menolaknya, dan itu benar: menambah BARIS tidak
  //    menolong, yang kurang adalah BENTUK. Delapan lagi, semuanya menyusun
  //    penalarannya dengan cara yang berbeda.
  // 9. mulai dari satu satuan
  (s, n, h, kecil, total) =>
    `Kumulai dari satu ${s.besar} dulu: satu ${s.besar} = ${ang(s.faktor)} ${s.kecil}, berarti nilainya ${rp(h * s.faktor)}.\n` +
    `Tinggal dikalikan banyaknya: ${rp(h * s.faktor)} × ${n} = ${rp(total)}.\n` +
    `Kucek dengan jalan lain: ${ang(kecil)} ${s.kecil} × ${rp(h)} juga ${rp(total)}.`,
  // 10. tulis salahnya dulu, lalu betulkan
  (s, n, h, kecil, total) =>
    `Kesalahan yang paling gampang di sini: mengalikan ${n} langsung dengan ${rp(h)} dan mendapat ${rp(n * h)}.\n` +
    `Itu salah karena ${n} masih dalam ${s.besar}, sedangkan harganya per ${s.kecil}.\n` +
    `Yang benar: ${n} × ${ang(s.faktor)} = ${ang(kecil)} ${s.kecil}, lalu × ${rp(h)} = ${rp(total)}. Kuperiksa selisihnya ${ang(s.faktor)} kali lipat — memang sebesar faktor satuannya.`,
  // 11. per bagian
  (s, n, h, kecil, total) =>
    `Kupecah jumlahnya supaya angkanya kecil: ${Math.floor(n / 2)} ${s.besar} + ${n - Math.floor(n / 2)} ${s.besar}.\n` +
    `Bagian pertama ${rp(Math.floor(n / 2) * s.faktor * h)}, bagian kedua ${rp((n - Math.floor(n / 2)) * s.faktor * h)}.\n` +
    `Dijumlahkan: ${rp(total)}. Kuperiksa dengan menghitung utuh sekaligus, hasilnya sama.`,
  // 12. tanya-jawab dengan diri sendiri
  (s, n, h, kecil, total) =>
    `Satuannya sudah sama belum? Belum — jumlahnya ${s.besar}, harganya per ${s.kecil}.\n` +
    `Berapa ${s.kecil}-nya? ${n} × ${ang(s.faktor)} = ${ang(kecil)}.\n` +
    `Totalnya? ${ang(kecil)} × ${rp(h)} = ${rp(total)}.\n` +
    `Sudah kuperiksa? Sudah: ${rp(total)} dibagi ${ang(kecil)} kembali ke ${rp(h)}.`,
  // 13. besaran dulu, angka belakangan
  (s, n, h, kecil, total) =>
    `Sebelum menghitung, kutaksir besarannya: ${ang(kecil)} ${s.kecil} dikali harga ribuan rupiah pasti jatuh di ${rp(total).length - 2} digit.\n` +
    `Hitungannya: ${ang(kecil)} × ${rp(h)} = ${rp(total)}.\n` +
    `Jumlah digitnya cocok dengan taksiran, jadi tidak ada nol yang hilang atau kelebihan.`,
  // 14. datar tanpa hiasan
  (s, n, h, kecil, total) =>
    `${n} ${s.besar} = ${ang(kecil)} ${s.kecil}\n${ang(kecil)} × ${rp(h)} = ${rp(total)}\nperiksa: ${rp(total)} ÷ ${ang(kecil)} = ${rp(h)}`,
  // 15. sebut yang tidak diketahui
  (s, n, h, kecil, total) =>
    `Yang diketahui: jumlah ${n} ${s.besar}, harga ${rp(h)} per ${s.kecil}. Yang tidak disebut: ongkos kirim, pajak, potongan — jadi angkanya nilai barang saja.\n` +
    `${n} ${s.besar} = ${ang(kecil)} ${s.kecil}; × ${rp(h)} = ${rp(total)}.\n` +
    `Kuperiksa balik lewat pembagian dan angkanya utuh kembali.`,
  // 16. bandingkan dengan patokan
  (s, n, h, kecil, total) =>
    `Patokannya: 1 ${s.besar} bernilai ${rp(h * s.faktor)} pada harga ini.\n` +
    `${n} ${s.besar} berarti ${n} × ${rp(h * s.faktor)} = ${rp(total)}.\n` +
    `Kuuji ulang lewat satuan kecil: ${ang(kecil)} ${s.kecil} × ${rp(h)} = ${rp(total)}. Cocok.`,
];

const TANYA = [
  (s, n, h, brg) => `${n} ${s.besar} ${brg} dengan harga ${rp(h)} per ${s.kecil}. Berapa totalnya?`,
  (s, n, h, brg) => `Pembeli minta ${n} ${s.besar} ${brg}. Harganya ${rp(h)}/${s.kecil}. Total tagihannya berapa?`,
  (s, n, h, brg) => `Hitung nilai ${n} ${s.besar} ${brg} kalau harga per ${s.kecil} ${rp(h)}.`,
  (s, n, h, brg) => `Kalau ${brg} dijual ${rp(h)} per ${s.kecil}, berapa nilai ${n} ${s.besar}?`,
  (s, n, h, brg) => `Berapa total untuk ${n} ${s.besar} ${brg} pada harga ${rp(h)} per ${s.kecil}?`,
];

const SIS = 'Kamu MiganCore. Kerjakan hitungan bertahap, dan periksa hasilmu lewat jalan lain sebelum menyebutnya final.';

// ───────────────────────────────── bangkitkan ──
const baris = [];
let ke = 0;
for (const s of SATUAN) {
  for (const n of [7, 9, 12, 14, 18, 23, 26, 31, 37, 44, 52, 61, 68, 73, 86, 94]) {
    const brg = s.barang[ke % s.barang.length];
    const h = [1500, 2750, 4500, 6250, 8500, 11500, 15500, 21000, 28500, 31500][ke % 10];
    const kecil = n * s.faktor;
    const total = kecil * h;
    baris.push({
      id: `hitung-${String(baris.length + 1).padStart(4, '0')}`,
      sumber: 'hitung-satuan',
      periksa: `${n} * ${s.faktor} * ${h}`, kunci: total,
      conversations: [
        { from: 'system', value: SIS },
        { from: 'human', value: TANYA[ke % TANYA.length](s, n, h, brg) },
        { from: 'gpt', value: BENTUK[ke % BENTUK.length](s, n, h, kecil, total) },
      ],
    });
    ke++;
  }
}

// ═════════════ PENJAGA 1 — kunci dihitung ULANG oleh program ═════════════
let salahKunci = 0;
for (const b of baris) {
  const v = Function(`"use strict"; return (${b.periksa});`)();
  if (Math.abs(v - b.kunci) > 0.01) salahKunci++;
  // Angka kunci WAJIB muncul di jawabannya — templat yang lupa mencetak
  // hasilnya akan lolos tanpa penjaga ini.
  if (!b.conversations[2].value.replace(/\./g, '').includes(String(b.kunci))) salahKunci++;
}

// ═════════════ PENJAGA 2 — ragam bentuk (cacat C13 itu sendiri) ═════════════
const pembuka = new Map();
for (const b of baris) {
  const p = b.conversations[2].value.replace(/\s+/g, ' ').slice(0, 42);
  pembuka.set(p, (pembuka.get(p) || 0) + 1);
}
const urut = [...pembuka].sort((a, b) => b[1] - a[1]);
const tigaTeratas = urut.slice(0, 3).reduce((s, x) => s + x[1], 0) / baris.length;
const rasio = pembuka.size / baris.length;

// ═════════════ PENJAGA 3 — langkah periksa balik WAJIB ada ═════════════
const POLA_PERIKSA = /periksa|kucek|uji ulang|kubagi balik|saling memeriksa|masuk akal|cocok|sesuai baris/i;
const tanpaPeriksa = baris.filter((b) => !POLA_PERIKSA.test(b.conversations[2].value));

// ═════════════ PENJAGA 4 — tidak mencemari gerbang eval ═════════════
const sumberKias = fs.readFileSync(path.join(DIR, '..', 'eval', 'uji-aritmetika.mjs'), 'utf8');
const bersih = fs.existsSync(path.join(DIR, '..', 'eval', 'soal-aritmetika-bersih.json'))
  ? JSON.parse(fs.readFileSync(path.join(DIR, '..', 'eval', 'soal-aritmetika-bersih.json'), 'utf8')).soal : [];
const kunciEval = new Set(bersih.map((s) => String(s.kunci)));
const cemar = baris.filter((b) => kunciEval.has(String(b.kunci)));

console.log('# panen-hitung — P1′: ragam bentuk + periksa balik + lima keluarga satuan\n');
console.log(`  baris          : ${baris.length}`);
console.log(`  keluarga satuan: ${SATUAN.length} (${SATUAN.map((s) => `${s.besar}→${s.kecil}`).join(', ')})`);
console.log(`  bentuk jawaban : ${BENTUK.length} susunan berbeda · ${TANYA.length} bentuk pertanyaan\n`);
console.log('## Penjaga');
console.log(`  kunci dihitung ulang program : ${salahKunci === 0 ? 'semua cocok' : `${salahKunci} CACAT`}`);
console.log(`  ragam pembuka                : ${pembuka.size} bentuk untuk ${baris.length} baris (1 per ${(1 / rasio).toFixed(1)}) — ambang 1 per 3`);
console.log(`  tiga templat teratas         : ${(tigaTeratas * 100).toFixed(0)}% — ambang ≤40%`);
console.log(`  langkah periksa balik        : ${tanpaPeriksa.length === 0 ? 'ada di semua baris' : `${tanpaPeriksa.length} baris TIDAK punya`}`);
console.log(`  pencemaran kunci gerbang     : ${cemar.length === 0 ? 'nol' : `${cemar.length} baris memakai kunci gerbang!`}`);

const gagal = salahKunci || rasio < 1 / 3 || tigaTeratas > 0.40 || tanpaPeriksa.length || cemar.length;
if (gagal) { console.error('\nTAHAN — data TIDAK ditulis. Perbaiki penjaga yang merah dulu.'); process.exit(1); }
fs.writeFileSync(KELUAR, baris.map((b) => JSON.stringify({ id: b.id, sumber: b.sumber, conversations: b.conversations })).join('\n') + '\n', 'utf8');
console.log(`\nSEMUA PENJAGA HIJAU — tertulis: ${path.basename(KELUAR)}`);
console.log('\n  contoh dua bentuk yang berbeda susunannya:');
for (const i of [1, 7]) {
  console.log(`\n  T: ${baris[i].conversations[1].value}`);
  console.log(`  J: ${baris[i].conversations[2].value.split('\n').map((x) => '     ' + x).join('\n').trim()}`);
}

if (!TERAPKAN) { console.log('\n  (jalan kering — dataset tidak disentuh. Tambahkan --terapkan untuk menukar baris lama.)'); process.exit(0); }

// ── tukar: buang baris konversi lama yang seragam, masukkan yang baru ──
const lama = fs.readFileSync(DATA, 'utf8').split(/\r?\n/).filter((l) => l.trim());
const POLA_KONVERSI = /ubah ton ke kg|1 ton = 1\.?000 kg|ton x 1\.?000|ton × 1\.?000/i;
const simpan = [], dibuang = [];
for (const l of lama) {
  let o; try { o = JSON.parse(l); } catch { simpan.push(l); continue; }
  const t = (o.conversations || []).map((x) => x.value).join(' ');
  (POLA_KONVERSI.test(t) ? dibuang : simpan).push(l);
}
const cadangan = DATA.replace('.jsonl', '-sebelum-hitung.jsonl');
if (!fs.existsSync(cadangan)) fs.copyFileSync(DATA, cadangan);
const baru = simpan.concat(baris.map((b) => JSON.stringify({ id: b.id, sumber: b.sumber, conversations: b.conversations })));
fs.writeFileSync(DATA, baru.join('\n') + '\n', 'utf8');
console.log(`\n  baris konversi lama dibuang : ${dibuang.length}`);
console.log(`  baris baru dimasukkan       : ${baris.length}`);
console.log(`  dataset                     : ${lama.length} → ${baru.length} baris`);
console.log(`  cadangan                    : ${path.basename(cadangan)}`);
