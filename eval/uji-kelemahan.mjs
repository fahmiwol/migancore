#!/usr/bin/env node
/**
 * uji-kelemahan.mjs — PEMBURU CELAH KEBODOHAN.
 *
 * Perintah Fahmi 21 Agu (disarikan): cari celah sekecil apa pun di model — cara berpikir,
 * penalaran, keputusan, tindakan, inisiatif — lalu pertajam.
 *
 * Bedanya dengan gerbang lain: gerbang lain menguji apakah model BISA. Berkas
 * ini menguji apakah model GAGAL DENGAN CARA YANG SUDAH DIKENAL — enam mode
 * kegagalan yang tercatat di literatur DAN yang sudah kita alami sendiri:
 *
 *  A. BERHENTI PREMATUR (premature termination) — tugas rangkap dijawab separuh.
 *     Sudah kita alami: minta kenalan+kerja, dia berhenti di "Bukti kerja:".
 *  B. HILANG DI TENGAH (lost in the middle) — fakta di TENGAH konteks diabaikan;
 *     literatur: turun >30% dibanding di awal/akhir. Retrieval kita menaruh
 *     hasil BM25 di TENGAH — jadi ini bukan teori, ini bentuk konteks kita.
 *  C. MENOLONG BERLEBIHAN (over-helpfulness / entity substitution) — entitas
 *     yang ditanya tidak ada, model menggantinya dengan yang mirip.
 *     Sudah kita alami: ditanya arang batok, dijawab harga shisha.
 *  D. TERCEMAR PENGECOH (distractor-induced context pollution) — konteks memuat
 *     angka lain yang masuk akal; model mengambil yang salah.
 *     Sudah kita alami: artikel SEO berisi harga usang mengalahkan pricelist.
 *  E. TERKUNCI SATU GILIRAN (single-turn lock-in) — fine-tune tool-calling bisa
 *     mengunci model ke satu panggilan; padahal loop agent butuh berkali-kali.
 *  F. MENGULANG PROMPT (previous-turn restate) — model menyalin ulang pertanyaan
 *     seolah percakapan baru dimulai.
 *
 * Semua soal dinilai MESIN. Skor tinggi = celah SEDIKIT (bagus).
 * Pakai: node uji-kelemahan.mjs [model]
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL = process.argv[2] || 'migancore:0.8-8b';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

// CACAT INSTRUMEN #1 (ditemukan saat validasi): prompt sistem versi pertama berbunyi
// "kalau yang ditanya tidak ada, katakan tidak ada — jangan menggantinya dengan yang
// mirip". Itu MEMBOCORKAN jawaban untuk uji C. Soal jadi tumpul dan skornya palsu.
// Prompt sekarang netral: instruksi umum saja, tanpa memberi tahu perilaku yang diuji.
const SIS = 'Kamu asisten berbahasa Indonesia yang teliti. Jawab berdasarkan konteks ' +
  'yang diberikan. Panjang jawaban mengikuti kebutuhan soal.';

// CACAT INSTRUMEN #2: daftar kata-mengaku semula terlalu sempit -> jawaban SEMPURNA
// ('tidak diberikan di konteks, saya tidak bisa mengarang') dinilai GAGAL. Alat ukur
// yang terlalu sempit menghukum model yang benar — sama berbahayanya dengan yang
// terlalu longgar. Daftar diperluas ke bentuk-bentuk yang lazim dalam bahasa Indonesia.
const MENGAKU_KATA = ['tidak ada', 'tidak tercantum', 'tidak disebut', 'belum ada',
  'tidak tersedia', 'tidak diberikan', 'tidak dicantumkan', 'tidak saya temukan',
  'tidak terdapat', 'tidak dijelaskan', 'tidak dimuat', 'tak ada', 'tidak bisa mengarang',
  'tidak menyebutkan', 'belum disebut', 'tidak dinyatakan'];
const ada = (t, k) => k.some((x) => t.toLowerCase().includes(x.toLowerCase()));
const angka = (t) => {
  const out = new Set();
  for (const m of String(t).matchAll(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?/g)) out.add(Number(m[0].replace(/\./g, '').replace(',', '.')));
  for (const m of String(t).matchAll(/-?\d+(?:[.,]\d+)?/g)) { const s = m[0]; if (!/\.\d{3}$/.test(s)) out.add(Number(s.replace(',', '.'))); }
  return [...out].filter(Number.isFinite);
};
const punya = (t, n) => angka(t).some((x) => Math.abs(x - n) < Math.max(0.02, Math.abs(n) * 0.001));

// konteks panjang buatan: fakta target ditaruh di posisi tertentu
function konteksPanjang(posisi, fakta) {
  const pengisi = [
    'Catatan rapat: tim sepakat memindahkan jadwal pengiriman ke minggu depan.',
    'Arsip: prosedur pengemasan memakai karung 25 kg berlapis dalam.',
    'Memo: kendaraan operasional dijadwalkan servis rutin bulan ini.',
    'Riwayat: gudang cabang timur sedang direnovasi sampai akhir kuartal.',
    'Log: sistem pencatatan diperbarui, kolom lama tidak lagi dipakai.',
    'Catatan: pelatihan operator baru dilaksanakan setiap Senin pagi.',
    'Arsip: dokumen perizinan diperpanjang tanpa perubahan isi.',
    'Memo: rapat mingguan dipindah dari Kamis ke Jumat siang.',
  ];
  const baris = [...pengisi];
  const idx = posisi === 'awal' ? 0 : posisi === 'akhir' ? baris.length : Math.floor(baris.length / 2);
  baris.splice(idx, 0, fakta);
  return baris.map((b, i) => `[${i + 1}] ${b}`).join('\n');
}

const SOAL = [];

// ── A. BERHENTI PREMATUR ──
SOAL.push({
  kode: 'A1-prematur', mode: 'berhenti-prematur',
  tanya: 'Tiga hal sekaligus: (1) sebutkan 1 ton berapa kilogram, (2) hitung 12 ton x Rp14.500 per kg, (3) sebutkan satu risiko kalau salah konversi satuan.',
  uji: (j) => punya(j, 1000) && punya(j, 174000000) && ada(j, ['risiko', 'salah', 'bahaya', 'akibat']),
  sebabGagal: 'tidak menyelesaikan ketiga permintaan',
});
SOAL.push({
  kode: 'A2-prematur', mode: 'berhenti-prematur',
  tanya: 'Dua hal: pertama jelaskan singkat apa itu rata-rata berbobot, lalu hitung rata-rata berbobot dari 3 orang bernilai 60 dan 7 orang bernilai 90.',
  uji: (j) => ada(j, ['bobot', 'berbobot']) && punya(j, 81),
  sebabGagal: 'menjelaskan tapi tidak menghitung (atau sebaliknya)',
});

// ── B. HILANG DI TENGAH ──
for (const pos of ['awal', 'tengah', 'akhir']) {
  SOAL.push({
    kode: `B-${pos}`, mode: 'hilang-di-tengah',
    tanya: `Konteks:\n${konteksPanjang(pos, 'Kode gudang untuk pengiriman ekspor adalah GX-4471.')}\n\nPertanyaan: apa kode gudang untuk pengiriman ekspor?`,
    uji: (j) => ada(j, ['GX-4471']),
    sebabGagal: `fakta di ${pos} konteks tidak terpakai`,
  });
}

// ── C. MENOLONG BERLEBIHAN (mengganti entitas) ──
SOAL.push({
  kode: 'C1-substitusi', mode: 'menolong-berlebihan',
  tanya: 'Konteks: Harga briket shisha grade A Rp30.000/kg. Harga briket BBQ grade A Rp19.000/kg.\n\nPertanyaan: berapa harga arang batok kelapa per kg?',
  uji: (j) => !punya(j, 30000) && !punya(j, 19000) && ada(j, MENGAKU_KATA),
  sebabGagal: 'mengganti entitas yang ditanya dengan yang mirip (atau mengarang angka)',
});
SOAL.push({
  kode: 'C2-substitusi', mode: 'menolong-berlebihan',
  tanya: 'Konteks: Kadar abu produk Alpha 3,2%. Kadar abu produk Beta 4,1%.\n\nPertanyaan: berapa kadar abu produk Gamma?',
  uji: (j) => !punya(j, 3.2) && !punya(j, 4.1) && ada(j, MENGAKU_KATA),
  sebabGagal: 'menyubstitusi nilai entitas lain',
});

// C3/C4 — REPRODUKSI BUG NYATA 20 Agu: tabel memuat SEMUA produk (jadi entitasnya
// ADA), tapi model kemarin mengambil BARIS YANG SALAH. Ini jauh lebih sulit daripada
// C1/C2 dan lebih dekat ke kegagalan produksi yang sungguh terjadi.
const TABEL = [
  'Briket shisha Grade A: Rp30.000/kg',
  'Briket shisha Grade B: Rp27.000/kg',
  'Briket BBQ Grade A: Rp19.000/kg',
  'Briket BBQ Grade B: Rp13.000/kg',
  'Arang batok kelapa: Rp14.500/kg',
].join(String.fromCharCode(10));
SOAL.push({
  kode: 'C3-baris-tabel', mode: 'menolong-berlebihan',
  tanya: `Daftar harga:${String.fromCharCode(10)}${TABEL}${String.fromCharCode(10)}${String.fromCharCode(10)}Pertanyaan: berapa total untuk 12 ton arang batok kelapa?`,
  uji: (j) => punya(j, 174000000) && !punya(j, 360000000) && !punya(j, 324000000),
  sebabGagal: 'mengambil BARIS YANG SALAH dari tabel (bug produksi 20 Agu)',
});
SOAL.push({
  kode: 'C4-baris-tabel', mode: 'menolong-berlebihan',
  tanya: `Daftar harga:${String.fromCharCode(10)}${TABEL}${String.fromCharCode(10)}${String.fromCharCode(10)}Pertanyaan: berapa selisih harga per kg antara briket BBQ Grade B dan briket shisha Grade B?`,
  uji: (j) => punya(j, 14000),
  sebabGagal: 'salah memilih dua baris yang dibandingkan',
});

// ── D. TERCEMAR PENGECOH ──
SOAL.push({
  kode: 'D1-pengecoh', mode: 'tercemar-pengecoh',
  tanya: 'Konteks:\n[SUMBER RESMI, per Agustus 2026] Harga arang batok kelapa: Rp14.500/kg.\n[Artikel blog lama, 2024] Harga arang batok kelapa sekitar Rp8.000/kg.\n\nPertanyaan: berapa harga arang batok kelapa yang berlaku sekarang, dan kenapa?',
  uji: (j) => punya(j, 14500) && !punya(j, 8000) || (punya(j, 14500) && ada(j, ['lama', 'usang', 'resmi', '2024'])),
  sebabGagal: 'mengambil angka dari sumber usang, atau tidak menjelaskan pilihannya',
});
SOAL.push({
  kode: 'D2-pengecoh', mode: 'tercemar-pengecoh',
  tanya: 'Konteks:\n[Target] Pesanan pembeli: 12 ton.\n[Catatan lain] Kapasitas truk: 8 ton. Stok gudang: 40 ton.\n\nPertanyaan: berapa total tagihan untuk pesanan itu bila harga Rp14.500/kg?',
  uji: (j) => punya(j, 174000000) && !punya(j, 116000000) && !punya(j, 580000000),
  sebabGagal: 'memakai angka pengecoh (kapasitas truk / stok) sebagai jumlah pesanan',
});

// ── E. TERKUNCI SATU GILIRAN (butuh dua langkah berurutan) ──
SOAL.push({
  kode: 'E1-dua-langkah', mode: 'terkunci-satu-giliran',
  tanya: 'Konteks: Harga briket BBQ grade B Rp13.000/kg.\n\nPertanyaan: pembeli minta 6 ton. Hitung total tagihannya, LALU hitung DP 40% dari total itu.',
  uji: (j) => punya(j, 78000000) && punya(j, 31200000),
  sebabGagal: 'berhenti setelah langkah pertama',
});

// ── F. MENGULANG PROMPT ──
SOAL.push({
  kode: 'F1-ulang', mode: 'mengulang-prompt',
  tanya: 'Sebutkan satu kelemahan memakai rata-rata sebagai ringkasan data.',
  uji: (j) => {
    const bersih = j.toLowerCase().replace(/\s+/g, ' ');
    const asli = 'sebutkan satu kelemahan memakai rata-rata sebagai ringkasan data';
    return !bersih.includes(asli) && bersih.length > 25;
  },
  sebabGagal: 'menyalin ulang pertanyaan alih-alih menjawab',
});

async function tanya(t) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, stream: false,
      messages: [{ role: 'system', content: SIS }, { role: 'user', content: t }],
      options: { temperature: 0.2, num_predict: 500 },
    }),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  return String((await r.json()).message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

(async () => {
  console.log(`# Uji kelemahan — ${MODEL}\n`);
  const hasil = [];
  for (const s of SOAL) {
    let j = '';
    try { j = await tanya(s.tanya); } catch (e) { j = `(GAGAL: ${e.message})`; }
    let lulus = false;
    try { lulus = !!s.uji(j); } catch { lulus = false; }
    hasil.push({ ...s, lulus, jawab: j });
    console.log(`${lulus ? 'v' : 'x'} [${s.kode}] ${s.mode}`);
    if (!lulus) {
      console.log(`    CELAH: ${s.sebabGagal}`);
      console.log(`    jawab: ${j.replace(/\s+/g, ' ').slice(0, 170)}`);
    }
  }
  const per = {};
  for (const h of hasil) { const p = (per[h.mode] ||= { n: 0, l: 0 }); p.n++; if (h.lulus) p.l++; }
  console.log('\n## Celah per mode kegagalan');
  for (const [m, v] of Object.entries(per)) {
    const celah = v.n - v.l;
    console.log(`  ${m.padEnd(24)} ${v.l}/${v.n}${celah ? `   ← ${celah} CELAH` : '   bersih'}`);
  }
  const lulusTotal = hasil.filter((h) => h.lulus).length;
  console.log(`\n## TOTAL: ${lulusTotal}/${hasil.length} bersih · ${hasil.length - lulusTotal} celah ditemukan`);
  const f = path.join(DIR, `hasil-uji-kelemahan-${MODEL.replace(/[:/]/g, '_')}.json`);
  fs.writeFileSync(f, JSON.stringify({ model: MODEL, per, hasil }, null, 2), 'utf8');
  console.log(`tertulis: ${f}`);
})();
