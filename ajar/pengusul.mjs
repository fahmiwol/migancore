#!/usr/bin/env node
/**
 * pengusul.mjs — mengusulkan `keputusan` agent dari PERTANYAAN SAJA, dan BOLEH DIAM.
 *
 * ============================== KENAPA ADA ==================================
 * Pencatat Ajar menuntut Fahmi memilih keputusan dari 6 opsi sebelum menulis
 * jawaban. Riset 29 Agu (LREC 2022, "Pre-annotation Bias"): aturan pemeriksa SAJA
 * berdampak minimal (p>30%); yang signifikan adalah aturan + pra-anotasi + rujukan
 * silang dipakai bersama. Alat kami persis kasus pertama — penjaga tanpa pengusul.
 *
 * ============================== KENAPA BOLEH DIAM ===========================
 * Codex memperingatkan: usul yang salah bukan derau acak, melainkan label salah
 * yang SISTEMATIS, dan `keputusan` dipakai langsung sebagai kategori ganjaran GRPO
 * (flywheel/kolam-grpo.mjs DARI_KEPUTUSAN). Peringatannya benar.
 *
 * Jalan keluarnya bukan "berusaha lebih akurat", melainkan mengubah bentuk
 * taruhannya: **anchoring hanya bisa terjadi pada usulan yang DIBUAT.** Usulan yang
 * ditahan tidak bisa meracuni apa pun. Jadi berkas ini mengejar PRESISI, bukan
 * cakupan — kalau tidak ada aturan yang menyala meyakinkan, ia diam, dan Fahmi
 * memilih sendiri seperti sekarang. Tidak ada yang lebih buruk daripada hari ini.
 *
 * ============================== KENAPA PERTANYAAN SAJA ======================
 * Saat mengajar, jawaban gold BELUM ADA — itu yang sedang ditulis. Pengusul yang
 * butuh gold tidak berguna di titik pakainya. Ini membuat tugasnya jauh lebih sulit
 * daripada pra-anotasi di makalah rujukan, yang parsernya melihat kalimat lengkap.
 *
 * Ambang & cabang kalau-gagal: flywheel/PRA-DAFTAR-H-PENGUSUL.json (dikunci dan
 * di-commit SEBELUM berkas ini ditulis).
 *
 * Pakai: node ajar/pengusul.mjs --uji     (uji instrumen)
 *        node ajar/pengusul.mjs --ukur    (presisi & cakupan di data ajar NYATA)
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.dirname(DIR);

/**
 * Aturan, urut dari yang paling SPESIFIK ke paling umum. Tiap aturan menyebut
 * keyakinannya sendiri; hanya yang >= AMBANG_YAKIN yang jadi usulan.
 *
 * Kata-katanya diambil dari data ajar & generator yang SUDAH ADA, bukan dikarang:
 * itu sebabnya daftarnya terasa sempit — ia memang cuma menutup pola yang terbukti
 * muncul, dan diam di sisanya.
 */
export const ATURAN = [
  {
    nama: 'alat-tak-ada',
    keputusan: 'TOOL_MISSING',
    yakin: 0.9,
    // Alat yang memang TIDAK ADA di skema kami: kirim email, posting sosmed,
    // transfer uang, hapus permanen. Ini paling mudah dikenali karena kata
    // kerjanya menyebut kemampuan yang kami tahu tidak dimiliki.
    uji: (t) => /\b(kirim(kan)? (e-?mail|surat)|posting|unggah ke (instagram|tiktok|facebook)|transfer (uang|dana)|bayar(kan)?|hapus permanen|hapus semua)\b/i.test(t),
  },
  {
    nama: 'mutasi-massal',
    keputusan: 'CONFIRM_FIRST',
    yakin: 0.85,
    // Mengubah keadaan + cakupan borongan/kabur. "semua lead lama", "borongan".
    // Kata kerja mutasi SAJA tidak cukup (itu bisa MUST_TOOL) — yang menentukan
    // adalah cakupan yang tidak terbatas.
    uji: (t) => /\b(ubah|tandai|jadikan|set|hapus|batalkan|tutup)\b/i.test(t)
      && /\b(semua|seluruh|borongan|massal|sekaligus|yang (sudah )?(lama|diam|nganggur))\b/i.test(t),
  },
  {
    nama: 'permintaan-kabur',
    keputusan: 'ASK_CLARIFICATION',
    yakin: 0.85,
    // Perintah pendek dengan objek KATA TUNJUK dan tanpa isi: "catat ini",
    // "perbaiki itu", "cari dong". Yang menentukan bukan pendeknya, tapi bahwa
    // objeknya menunjuk sesuatu yang tidak disebutkan.
    uji: (t) => {
      const kata = t.trim().split(/\s+/).length;
      return kata <= 6
        && /\b(catat|simpan|cari|perbaiki|urus|kerjakan|update|ubah)\b/i.test(t)
        && /\b(ini|itu|dong|aja|saja)\b/i.test(t)
        && !/\d/.test(t);
    },
  },
  {
    nama: 'hitungan-murni',
    keputusan: 'DIRECT',
    yakin: 0.85,
    // Aritmetika yang bisa dijawab tanpa sumber apa pun. Sengaja SEMPIT: harus ada
    // dua angka DAN operator/kata-operasi, tanpa rujukan ke data internal.
    uji: (t) => /\d/.test(t)
      && /(\bx\b|×|\*|dikali|dibagi|tambah|kurang|persen|%|diskon|rata-rata)/i.test(t)
      && !/\b(catatan|korpus|crm|lead|ingatan|data|sistem|dokumen)\b/i.test(t),
  },
  {
    nama: 'sapaan',
    keputusan: 'DIRECT',
    yakin: 0.9,
    uji: (t) => /^(halo|hai|hei|terima kasih|makasih|thanks|selamat (pagi|siang|sore|malam))\b/i.test(t.trim()),
  },
];

/** Aturan hanya jadi usulan kalau keyakinannya >= ini. Sisanya: DIAM. */
export const AMBANG_YAKIN = 0.85;

/**
 * Usulkan keputusan dari pertanyaan. Mengembalikan null = TIDAK mengusulkan apa pun.
 * Murni — tanpa I/O, bisa diuji dengan fixture.
 */
export function usulkan(tanya, riwayat = []) {
  const t = String(tanya || '');
  if (!t.trim()) return null;
  // DIPERBAIKI 29 Agu sesudah diukur: versi pertama menyamakan 'alat sudah
  // DIPANGGIL' dengan 'alat GAGAL', dan itu satu-satunya sumber kesalahannya —
  // 5/9 benar, dengan 4 salah MUST_TOOL -> TOOL_FAILURE. Empat baris itu memang
  // punya hasil alat di riwayat, tapi hasilnya BERHASIL: baris 5-giliran
  // (panggil -> hasil -> jawaban ter-grounding). Yang menandai TOOL_FAILURE bukan
  // ADANYA hasil, melainkan hasil yang KOSONG atau GALAT.
  //
  // Ambangnya TIDAK diturunkan; aturannya yang dibetulkan. Menurunkan ambang
  // sesudah melihat angka adalah anti-pola yang skill indikator-parameter larang.
  const hasilAlat = (riwayat || [])
    .map((m) => String(m?.content || m?.value || ''))
    .filter((x) => /\[hasil alat /i.test(x));
  if (hasilAlat.length) {
    // Pola ini sempat rusak SENYAP: karakter batas-kata yang saya tulis lewat
    // skrip Python berubah jadi BACKSPACE nyata (0x08) di dalam regex, sehingga
    // cabang '0 hasil' tidak pernah cocok. Yang menangkapnya uji instrumen, bukan
    // pembacaan mata. Karena itu di sini tidak ada escape sama sekali — batas kata
    // memang tidak dibutuhkan, dan menuliskannya lewat lapisan skrip berkali-kali
    // terbukti berbahaya di sesi ini.
    const POLA_GAGAL = ['error', 'gagal', 'timeout', 'refused', 'ditolak', 'tidak menjawab',
      'tidak merespons', '0 hasil', 'nihil', 'kosong', 'not found', 'tidak ditemukan', 'tidak ada'];
    const gagal = hasilAlat.some((x) => POLA_GAGAL.some((k) => x.toLowerCase().includes(k)));
    // Hasil yang SUKSES tidak diusulkan apa pun: itu wilayah MUST_TOOL, kelas
    // mayoritas yang sengaja tidak pernah kami usulkan (lihat uji instrumen).
    if (gagal) return { keputusan: 'TOOL_FAILURE', yakin: 0.9, aturan: 'riwayat-alat-gagal' };
    return null;
  }

  const nyala = ATURAN.filter((a) => a.uji(t));
  if (nyala.length !== 1) return null;          // nol = tak tahu · lebih dari satu = ambigu, DIAM
  const a = nyala[0];
  return a.yakin >= AMBANG_YAKIN ? { keputusan: a.keputusan, yakin: a.yakin, aturan: a.nama } : null;
}

// ────────────────────────────────────────────────────────── uji instrumen ──
const LANGSUNG = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('pengusul.mjs');

if (LANGSUNG && process.argv.includes('--uji')) {
  let ok = 0, buruk = 0;
  const cek = (n, c, ket = '') => (c ? (ok++, console.log(`  OK    ${n}`))
    : (buruk++, console.log(`  GAGAL ${n}${ket ? ' — ' + ket : ''}`)));
  const k = (t, r) => usulkan(t, r)?.keputusan ?? null;

  cek('alat tak ada: kirim email', k('Kirim email penawaran ke semua lead sekarang.') === 'TOOL_MISSING');
  cek('alat tak ada: posting sosmed', k('Posting ini ke Instagram dan TikTok ya.') === 'TOOL_MISSING');
  cek('mutasi massal: semua lead lama', k('Tandai semua lead lama sebagai gagal.') === 'CONFIRM_FIRST');
  cek('permintaan kabur: catat ini', k('Catat pembelajaran ini.') === 'ASK_CLARIFICATION');
  cek('permintaan kabur: cari dong', k('Cari dong di catatan.') === 'ASK_CLARIFICATION');
  cek('hitungan murni', k('Berapa 12 dikali 8?') === 'DIRECT');
  cek('sapaan', k('Halo, apa kabar?') === 'DIRECT');
  cek('riwayat hasil alat -> TOOL_FAILURE',
    k('Ambil daftar lead.', [{ content: '[hasil alat leads_list]: ERROR timeout.' }]) === 'TOOL_FAILURE');
  cek('DIAM: hasil alat SUKSES bukan TOOL_FAILURE (sumber tunggal kesalahan versi pertama)',
    k('Ambil daftar lead.', [{ content: '[hasil alat leads_list]: 12 lead ditemukan.' }]) === null);
  cek('hasil alat KOSONG tetap TOOL_FAILURE',
    k('Cari harga kopra.', [{ content: '[hasil alat brain_search]: 0 hasil.' }]) === 'TOOL_FAILURE');

  // yang HARUS diam — ini bagian terpenting berkas ini
  cek('DIAM: pertanyaan biasa yang butuh sumber', k('Berapa kadar abu briket menurut catatan?') === null);
  cek('DIAM: mutasi tunggal yang jelas (bukan borongan)', k('Ubah status lead 88 jadi closing.') === null);
  cek('DIAM: kosong', k('') === null);
  cek('DIAM: hitungan yang menyebut data internal',
    k('Kalau 104 lead di CRM dikontak 8 per hari, berapa hari?') === null);
  cek('DIAM saat dua aturan menyala sekaligus',
    k('Hapus semua data lead lama.') === null, 'alat-tak-ada + mutasi-massal sama-sama menyala');

  cek('usulan membawa nama aturannya (bisa diaudit)', usulkan('Halo, apa kabar?')?.aturan === 'sapaan');
  cek('tiap aturan punya keputusan yang sah',
    ATURAN.every((a) => ['DIRECT', 'MUST_TOOL', 'ASK_CLARIFICATION', 'CONFIRM_FIRST', 'TOOL_FAILURE', 'TOOL_MISSING'].includes(a.keputusan)));
  cek('TIDAK ADA aturan yang mengusulkan MUST_TOOL',
    !ATURAN.some((a) => a.keputusan === 'MUST_TOOL'),
    'MUST_TOOL adalah kelas mayoritas (43%) — mengusulkannya = menebak, dan kebingungan DIRECT<->MUST_TOOL adalah yang paling berbahaya');

  console.log('\n' + '='.repeat(52));
  console.log(`${ok} lulus · ${buruk} gagal`);
  process.exit(buruk ? 1 : 0);
}

// ───────────────────────────────────── ukur presisi & cakupan di data NYATA ──
if (LANGSUNG && process.argv.includes('--ukur')) {
  const p = path.join(AKAR, 'flywheel', 'dataset', 'v14', 'cluster-tool.jsonl');
  const baris = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((x) => JSON.parse(x));
  const ajar = baris.filter((x) => x.sumber === 'ajar-tool' && x.keputusan);

  let diusulkan = 0, benar = 0;
  const bingung = new Map(), perAturan = new Map();
  for (const r of ajar) {
    const c = r.conversations || [];
    const tanya = String(c.find((x) => x.from === 'human')?.value ?? '');
    const riwayat = c.filter((x) => x.from === 'human').slice(1).map((x) => ({ content: x.value }));
    const u = usulkan(tanya, riwayat);
    if (!u) continue;
    diusulkan++;
    const cocok = u.keputusan === r.keputusan;
    if (cocok) benar++;
    else {
      const key = `${r.keputusan} -> ${u.keputusan}`;
      bingung.set(key, (bingung.get(key) || 0) + 1);
    }
    const a = perAturan.get(u.aturan) || { n: 0, benar: 0 };
    a.n++; if (cocok) a.benar++;
    perAturan.set(u.aturan, a);
  }

  const presisi = diusulkan ? benar / diusulkan : 0;
  const cakupan = ajar.length ? diusulkan / ajar.length : 0;
  const bahaya = [...bingung].filter(([k]) => /DIRECT -> MUST_TOOL|MUST_TOOL -> DIRECT/.test(k))
    .reduce((s, [, v]) => s + v, 0);
  const selamat = [...bingung].filter(([k]) => /ASK_CLARIFICATION -> CONFIRM_FIRST|CONFIRM_FIRST -> ASK_CLARIFICATION/.test(k))
    .reduce((s, [, v]) => s + v, 0);

  console.log(`\n# Pengusul keputusan — diukur di ${ajar.length} baris ajar (tulisan tangan Fahmi)\n`);
  console.log(`  garis dasar kelas-mayoritas : 43%  (MUST_TOOL 23/54)`);
  console.log(`  diusulkan                   : ${diusulkan}/${ajar.length}  (cakupan ${Math.round(cakupan * 100)}%)`);
  console.log(`  benar dari yang diusulkan   : ${benar}/${diusulkan}  (PRESISI ${Math.round(presisi * 100)}%)   ambang >=85%`);
  console.log(`  kebingungan BERBAHAYA       : ${bahaya}/${diusulkan || 1} = ${Math.round((bahaya / (diusulkan || 1)) * 100)}%   ambang <=5%`);
  console.log(`  kebingungan KESELAMATAN     : ${selamat}/${diusulkan || 1} = ${Math.round((selamat / (diusulkan || 1)) * 100)}%   ambang <=10%`);

  if (perAturan.size) {
    console.log(`\n  per aturan:`);
    for (const [n, a] of [...perAturan].sort((x, y) => y[1].n - x[1].n))
      console.log(`    ${n.padEnd(20)} ${a.benar}/${a.n}`);
  }
  const takNyala = ATURAN.filter((a) => !perAturan.has(a.nama)).map((a) => a.nama);
  if (takNyala.length) console.log(`\n  aturan yang TIDAK PERNAH menyala: ${takNyala.join(', ')}`);
  if (bingung.size) {
    console.log(`\n  salah, per pasangan:`);
    for (const [k, v] of [...bingung].sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(38)} ${v}`);
  }

  const lulus = presisi >= 0.85 && (bahaya / (diusulkan || 1)) <= 0.05 && (selamat / (diusulkan || 1)) <= 0.10;
  console.log(`\n  VONIS: ${lulus ? 'LULUS — boleh dipasang' : 'GAGAL — JANGAN dipasang; klasifikasi tetap manual'}\n`);
  process.exit(lulus ? 0 : 1);
}
