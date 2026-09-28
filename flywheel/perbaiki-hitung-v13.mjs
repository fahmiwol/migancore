#!/usr/bin/env node
/**
 * perbaiki-hitung-v13.mjs — bedah dua keluarga naskah di cluster-hitung:
 *
 * 1. Keluarga "hari-dibulatkan" (46 baris, 16% cluster): pembuka
 *    "Hitungannya: X : Y = Z hari" + EKOR VERBATIM 40-kata yang identik di
 *    semua baris. Isinya bagus (saring pembeli vs pesaing) — bentuknya beku.
 *    Per hukum memori parametrik, ekor 46x pasti melewati p>0,5 dan jadi
 *    naskah; kolonisasi v12 lahir dari pola persis seperti ini.
 *    Obat: sebar ke 9 bentuk struktural (urutan, gaya, panjang beda-beda;
 *    sebagian periksa-balik) + ~1/5 tetap bentuk asli. ANGKA tiap baris
 *    (X, Y, Z) dipertahankan verbatim — yang diubah hanya narasinya.
 *
 * 2. Pembuka "Kuperkirakan kasar dulu" (5 baris): 3 diganti pembuka lain.
 *
 * Penugasan bentuk deterministik (hash id) — bisa diulang siapa pun.
 *
 * Pakai: node perbaiki-hitung-v13.mjs           (tulis balik cluster-hitung.jsonl)
 *        node perbaiki-hitung-v13.mjs --uji-instrumen
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BERKAS = path.join(DIR, 'dataset', 'v13', 'cluster-hitung.jsonl');

const RE_HARI = /^Hitungannya: (\d+) : (\d+) = (\d+) hari \(dibulatkan ke atas\)\./;

// 9 bentuk + asli. Tiap bentuk fungsi (x,y,z) -> teks utuh. Inti pesan sama
// (saring posisi dagang, pembeli dulu, mutu > jumlah), redaksi & struktur beda.
export const BENTUK = [
  (x, y, z) => `${x} dibagi ${y} = ${z} hari, dibulatkan ke atas. Sebelum lari mengejar semua: saring dulu — yang pesaing keluarkan, yang pembeli dahulukan. Daftar tersaring memangkas ${z} hari itu jauh.`,
  (x, y, z) => `Sebelum menghitung, satu hal: tidak semua lead layak dikontak — pisahkan pembeli dari pesaing dulu. Baru angkanya: ${x} : ${y} ≈ ${z} hari (dibulatkan ke atas), dan itu batas atas; sesudah disaring biasanya jauh lebih pendek.`,
  (x, y, z) => `${x} : ${y} = ${z}, kuperiksa balik: ${z} × ${y} ≥ ${x}, cocok — jadi ${z} hari setelah dibulatkan ke atas. Catatan penting: kejar yang berposisi pembeli lebih dulu; kontak yang tepat sasaran membuat sebagian sisanya tidak perlu.`,
  (x, y, z) => `Dua pertanyaan di sini. Berapa lama: ${x} : ${y} = ${z} hari (bulat ke atas). Apakah semuanya perlu: tidak — sortir posisi dagang dulu, pembeli di depan. Sepuluh kontak asal kalah oleh satu yang tepat.`,
  (x, y, z) => `${z} hari (${x} : ${y}, dibulatkan ke atas). Saranku singkat: saring pesaing keluar, pembeli duluan — durasi efektifnya menyusut.`,
  (x, y, z) => `Kecepatanmu ${y} kontak per hari, antreannya ${x}. ${x} : ${y} = ${z} — genapkan ke atas jadi ${z} hari penuh. Tapi angka itu menganggap semua layak dikontak; kenyataannya sebagian pesaing. Saring berdasarkan posisi dagang, dan ${z} harinya mengecil sendiri.`,
  (x, y, z) => `Hati-hati membaca daftarnya mentah-mentah. Hitungan kasarnya ${x} : ${y} = ${z} hari (ke atas), tapi sebagian isi daftar itu pesaing, bukan pembeli. Prioritaskan pembeli; satu yang tepat menggantikan sepuluh yang asal.`,
  (x, y, z) => `Kira-kira dulu: ${x} dibagi ${y} itu sekitar ${z}-an. Persisnya ${z} hari setelah dibulatkan ke atas. Soal strateginya — jangan kontak membabi buta; posisi dagang menentukan urutan, pembeli selalu di depan.`,
  (x, y, z) => `Butuh ${z} hari (${x} : ${y}, bulat ke atas) kalau memang semua mau dikontak. Usulku: jangan. Pilah pembeli vs pesaing dulu; yang tersisa lebih pendek dan lebih berpeluang.`,
];

export const PEMBUKA_GANTI = [
  'Angka kasarnya kuambil dulu sebagai pembanding:',
  'Sebelum hitung persis, taksiran cepat:',
  'Cek kewajaran dulu — taksiran kasarnya:',
];
const PEMBUKA_ASLI = 'Kuperkirakan kasar dulu supaya punya pembanding:';

export function pilihBentuk(id, jumlahBentuk = BENTUK.length + 1) {
  // +1 = bentuk asli dipertahankan untuk sebagian baris
  return parseInt(crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 8), 16) % jumlahBentuk;
}

export function perbaikiHari(baris) {
  const g = baris.conversations.find((c) => c.from === 'gpt');
  const m = g && g.value.match(RE_HARI);
  if (!m) return { baris, diubah: false };
  const [, x, y, z] = m;
  const b = pilihBentuk(baris.id);
  if (b >= BENTUK.length) return { baris, diubah: false }; // pertahankan asli
  const teksBaru = BENTUK[b](x, y, z);
  const conversations = baris.conversations.map((c) =>
    c.from === 'gpt' ? { ...c, value: teksBaru } : c);
  return { baris: { ...baris, conversations, bentukNaskah: b }, diubah: true, x, y, z };
}

export function perbaikiPembuka(baris, urutan) {
  const g = baris.conversations.find((c) => c.from === 'gpt');
  if (!g || !g.value.startsWith(PEMBUKA_ASLI)) return { baris, diubah: false };
  if (urutan >= PEMBUKA_GANTI.length) return { baris, diubah: false }; // sisakan 2 asli
  const teksBaru = g.value.replace(PEMBUKA_ASLI, PEMBUKA_GANTI[urutan]);
  const conversations = baris.conversations.map((c) =>
    c.from === 'gpt' ? { ...c, value: teksBaru } : c);
  return { baris: { ...baris, conversations }, diubah: true };
}

// ────────────────────────────────────────────────── uji instrumen ──
function ujiInstrumen() {
  const kasus = [];
  const contoh = {
    id: 'uji-1',
    conversations: [
      { from: 'human', value: 'Ada 359 lead, sanggup 3 sehari?' },
      { from: 'gpt', value: 'Hitungannya: 359 : 3 = 120 hari (dibulatkan ke atas).\nTapi jangan berhenti di aritmetika.' },
    ],
  };
  // semua bentuk mempertahankan x,y,z verbatim
  let semuaAngka = true;
  for (const f of BENTUK) {
    const t = f('359', '3', '120');
    if (!(t.includes('359') && t.includes('3') && t.includes('120'))) semuaAngka = false;
  }
  kasus.push(['semua bentuk mempertahankan X,Y,Z', semuaAngka]);
  // bentuk-bentuk saling berbeda nyata (tak ada pasangan berbagi 8-gram)
  const gram8 = (t) => { const w = t.split(/\s+/); const s = new Set(); for (let i = 0; i + 8 <= w.length; i++) s.add(w.slice(i, i + 8).join(' ')); return s; };
  let adaKembar = false;
  for (let i = 0; i < BENTUK.length; i++) for (let j = i + 1; j < BENTUK.length; j++) {
    const A = gram8(BENTUK[i]('11', '2', '6')), B = gram8(BENTUK[j]('11', '2', '6'));
    for (const x of A) if (B.has(x)) adaKembar = true;
  }
  kasus.push(['antar-bentuk tidak berbagi 8-gram', !adaKembar]);
  // perbaikiHari mengubah baris yang cocok & mempertahankan human
  const h = perbaikiHari(contoh);
  kasus.push(['baris cocok pola tertangani (diubah atau sengaja-asli)',
    h.diubah === true || pilihBentuk('uji-1') >= BENTUK.length]);
  kasus.push(['human tak tersentuh', h.baris.conversations[0].value === contoh.conversations[0].value]);
  // baris tak cocok pola dibiarkan
  const lain = { id: 'x', conversations: [{ from: 'gpt', value: 'jawaban biasa 42' }] };
  kasus.push(['baris lain dibiarkan', perbaikiHari(lain).diubah === false]);
  // idempoten: hasil perbaikan tidak lagi cocok RE_HARI
  if (h.diubah) kasus.push(['idempoten (hasil tak cocok pola lagi)',
    !h.baris.conversations.find((c) => c.from === 'gpt').value.match(RE_HARI)]);
  // pembuka
  const p = perbaikiPembuka({ id: 'p', conversations: [{ from: 'gpt', value: PEMBUKA_ASLI + ' 12 × 1.000 ≈ x.\nSisa.' }] }, 0);
  kasus.push(['pembuka terganti, sisa utuh', p.diubah && p.baris.conversations[0].value.includes('12 × 1.000 ≈ x.\nSisa.')]);

  let gagal = 0;
  for (const [nama, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nama}`); if (!ok) gagal++; }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

const iniUtama = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (iniUtama) {
  if (process.argv.includes('--uji-instrumen')) ujiInstrumen();

  const baris = fs.readFileSync(BERKAS, 'utf8').trim().split('\n').map((b) => JSON.parse(b));
  let nHari = 0, nAsli = 0, nPembuka = 0, urutanPembuka = 0;
  const hasil = baris.map((b) => {
    const h = perbaikiHari(b);
    if (h.diubah) {
      nHari++;
      // verifikasi keras: angka baris asli tetap ada
      const g = h.baris.conversations.find((c) => c.from === 'gpt').value;
      if (!(g.includes(h.x) && g.includes(h.y) && g.includes(h.z))) {
        console.error(`ANGKA HILANG di ${b.id} — batal total`); process.exit(1);
      }
      return h.baris;
    }
    const gAsli = b.conversations.find((c) => c.from === 'gpt');
    if (gAsli && RE_HARI.test(gAsli.value)) nAsli++;
    const p = perbaikiPembuka(b, urutanPembuka);
    if (p.diubah) { nPembuka++; urutanPembuka++; return p.baris; }
    if (gAsli && gAsli.value.startsWith(PEMBUKA_ASLI)) urutanPembuka++;
    return b;
  });
  fs.writeFileSync(BERKAS, hasil.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');
  const sidik = crypto.createHash('sha256').update(fs.readFileSync(BERKAS)).digest('hex').slice(0, 16);
  console.log(`keluarga hari: ${nHari} disebar ke ${BENTUK.length} bentuk, ${nAsli} sengaja tetap asli`);
  console.log(`pembuka taksiran: ${nPembuka} diganti`);
  console.log(`sidik baru cluster-hitung: ${sidik}`);
}
