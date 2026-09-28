#!/usr/bin/env node
/**
 * uji-aritmetika.mjs — instrumen terfokus untuk E1: memisahkan tiga dugaan
 * penyebab 8B kita kalah berhitung dari 4B kita.
 *
 * Dugaan (dari RISET-TEMUAN-E0.md T1, sebab BELUM diketahui):
 *   (a) kuantisasi ganda — 8B dilatih QLoRA nf4 lalu q4_k_m; 4B fp16 lalu q4_k_m
 *   (b) beda basis — Qwen3-8B vs Qwen3-4B-Instruct-2507
 *   (c) efek latihan
 *
 * Yang memisahkan: jalankan soal yang SAMA pada model DASAR yang belum disentuh,
 * pada kuantisasi yang sama.
 *   base-8B lemah juga  → kelemahan ada di BASIS (b) — bukan salah kita
 *   base-8B kuat        → latihan/kuantisasi kita yang merusak (a atau c)
 *
 * DISIPLIN (aturan baru 21 Agu): instrumen diuji lebih dulu.
 *   node uji-aritmetika.mjs --uji-instrumen   → kendali positif & negatif
 *   node uji-aritmetika.mjs <model> [ulang]   → jalankan pengukuran
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

// Soal TETAP (bukan diacak) supaya sel-sel percobaan benar-benar sebanding.
// Jawaban dihitung tangan lalu diperiksa ulang di --uji-instrumen.
/**
 * ============ SOAL LAMA DIPENSIUNKAN 21 Agu 2026 — TIGA KUNCINYA BOCOR ======
 * `periksa-pencemaran.mjs` menemukan 174.000.000, 240.000.000, dan 31.200.000
 * ADA di data latih. Artinya model kami bisa menyebut hasil yang benar tanpa
 * menghitung, dan buktinya ada di jawabannya sendiri:
 *   "12 ton : 10 = 1.200 kg. 1.200 x 14.500 = Rp174.000.000."
 * Dua langkah salah, hasil tepat. Itu mengingat, bukan berhitung.
 *
 * Obatnya BUKAN membuang baris latihnya — baris itu pengetahuan harga yang sah
 * dan memang harus dikuasai model. Yang diganti SOALNYA.
 *
 * Harganya jujur: seluruh baseline aritmetika sebelum 21 Agu 2026 BATAL dan
 * harus diukur ulang dengan soal baru. Membandingkan angka lama dengan angka
 * baru akan menghasilkan kesimpulan palsu.
 *
 * Soal baru disusun `susun-soal-bersih.mjs`: dirakit dari kombinasi angka,
 * kunci dihitung program, tiap calon diadu dengan korpus latih. Susun ULANG
 * setiap kali data latih berubah.
 */
const BERKAS_BERSIH = path.join(DIR, 'soal-aritmetika-bersih.json');
const SOAL_LAMA = [
  ['12 ton x Rp14.500/kg, berapa total?', 174000000],          // kunci BOCOR
  ['8 ton x Rp30.000/kg, berapa total?', 240000000],           // kunci BOCOR
  ['33 ton x Rp25.000/kg, berapa total?', 825000000],
  ['Rp270.000 didiskon 25%, lalu didiskon 15% lagi dari harga baru. Berapa harga akhirnya?', 172125],
  ['4 orang rata-rata 45, dan 24 orang rata-rata 80. Berapa rata-rata gabungannya?', 75],
  ['6 ton x Rp13.000/kg. Berapa DP 40% dari totalnya?', 31200000],   // kunci BOCOR
];
let SOAL = SOAL_LAMA, ASAL_SOAL = 'LAMA (TERCEMAR — jangan dipakai memutus)';
if (fs.existsSync(BERKAS_BERSIH)) {
  const b = JSON.parse(fs.readFileSync(BERKAS_BERSIH, 'utf8'));
  SOAL = b.soal.map((s) => [s.soal, s.kunci]);
  ASAL_SOAL = `BERSIH (${b.soal.length} soal, disusun dari ${b.korpus})`;
} else {
  console.warn('PERINGATAN: soal-aritmetika-bersih.json tidak ada — memakai soal LAMA yang kuncinya bocor.');
  console.warn('            Jalankan: node susun-soal-bersih.mjs');
}

// 23 Agu: SATU SUMBER prompt gerbang = eval/prompt-gerbang.json (dipakai juga
// tier-1 latih_cluster.py). Literal di bawah = cadangan identik bila berkas hilang.
const SIS_DASAR = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, 'prompt-gerbang.json'), 'utf8')).dasar; }
  catch { return 'Kerjakan bertahap dan tunjukkan angka antaranya. Jawab dengan angka yang jelas.'; }
})();
// Tambahan lewat lingkungan, bukan lewat menyunting berkas — supaya kalimat
// persisnya ikut tercatat di hasil dan percobaan bisa diulang huruf per huruf.
// T6 sudah membuktikan SATU kalimat prompt memotong aritmetika 94% -> 50%,
// jadi setiap kalimat yang ditambahkan ke gerbang lain WAJIB diuji di sini juga.
const SIS_TAMBAHAN = process.env.SISTEM_TAMBAHAN || '';
/**
 * SISTEM_GANTI mengganti system prompt SEUTUHNYA, termasuk mengosongkannya
 * (SISTEM_GANTI="kosong"). Ini bukan kenyamanan — ini yang membuat sebuah
 * dugaan bisa diuji.
 *
 * Playground menunjukkan v11 mengonversi ton dengan BENAR tanpa system prompt,
 * padahal di gerbang ia salah 12 dari 12. Kalau itu benar, sebagian
 * "kerusakan konversi" yang kami kejar semalaman sebenarnya dipicu oleh prompt
 * gerbangnya sendiri — dan T6 sudah pernah menunjukkan satu kalimat prompt
 * memotong aritmetika dari 94% ke 50%.
 *
 * Satu pengamatan bukan bukti. Dengan sakelar ini, dugaan itu bisa diadu
 * dengan benar: soal sama, model sama, ulangan sama, yang berbeda HANYA
 * prompt-nya.
 */
const SIS_GANTI = process.env.SISTEM_GANTI;
const SIS = SIS_GANTI !== undefined
  ? (SIS_GANTI === 'kosong' ? '' : SIS_GANTI)
  : (SIS_TAMBAHAN ? SIS_DASAR + ' ' + SIS_TAMBAHAN : SIS_DASAR);

function angkaDalam(teks) {
  const out = new Set();
  const t = String(teks);
  for (const m of t.matchAll(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?/g)) out.add(Number(m[0].replace(/\./g, '').replace(',', '.')));
  for (const m of t.matchAll(/-?\d+(?:[.,]\d+)?/g)) {
    const s = m[0];
    if (/\.\d{3}$/.test(s)) continue;
    out.add(Number(s.replace(',', '.')));
  }
  return [...out].filter(Number.isFinite);
}
const benarkah = (teks, n) =>
  angkaDalam(teks).some((x) => Math.abs(x - n) < Math.max(0.02, Math.abs(n) * 0.001));

// ───────────────────────────── uji instrumen (kendali) ─────────────────────────────
if (process.argv.includes('--uji-instrumen')) {
  // Kendali ditulis TANGAN: teks benar harus DITERIMA, teks salah harus DITOLAK.
  const KENDALI = [
    ['12 ton = 12.000 kg. 12.000 x Rp14.500 = Rp174.000.000.', 174000000, true],
    ['12 ton x Rp14.500 = Rp1.740.000.', 174000000, false],          // salah 100x
    ['33.000 kg x Rp25.000 = Rp825.000.000.', 825000000, true],
    ['33.000 kg x Rp25.000 = Rp7.650.000,00.', 825000000, false],    // kegagalan nyata 8B
    ['Harga akhirnya Rp172.125.', 172125, true],
    ['Harga akhirnya Rp162.000.', 172125, false],                    // jebakan diskon dijumlah
    ['Rata-rata gabungannya 75.', 75, true],
    ['Rata-rata gabungannya 62,5.', 75, false],                      // jebakan rata-rata polos
    ['DP 40%-nya Rp31.200.000.', 31200000, true],
    ['DP 40%-nya Rp78.000.000.', 31200000, false],                   // berhenti di total
  ];
  let cacat = 0;
  console.log('# Uji instrumen aritmetika (kendali positif & negatif)\n');
  for (const [teks, n, harusnya] of KENDALI) {
    const hasil = benarkah(teks, n);
    const ok = hasil === harusnya;
    if (!ok) cacat++;
    console.log(`${ok ? 'v' : 'x'} ${harusnya ? 'POSITIF' : 'NEGATIF'}  ${teks.slice(0, 56)}` +
      (ok ? '' : `   ← SALAH NILAI (dinilai ${hasil}, seharusnya ${harusnya})`));
  }
  // Pemeriksaan silang: jawaban tiap soal dihitung ulang di sini, bukan dipercaya.
  const ULANG = [12 * 1000 * 14500, 8 * 1000 * 30000, 33 * 1000 * 25000,
    Math.round(270000 * 0.75 * 0.85), (4 * 45 + 24 * 80) / 28, 6 * 1000 * 13000 * 0.4];
  console.log('\n# Pemeriksaan silang kunci jawaban (dihitung ulang program)');
  /**
   * Daftar ULANG di atas ditulis tangan untuk soal LAMA. Waktu soal diganti
   * (21 Agu, karena kuncinya bocor), pemeriksaan ini langsung berteriak 6 CACAT
   * — dan itu benar: rumus lama tidak boleh dipakai memeriksa kunci baru.
   * Sekarang rumusnya ikut soalnya: `soal-aritmetika-bersih.json` menyimpan
   * ekspresi `hitung` untuk setiap soal, dan di sinilah ia dijalankan ulang.
   * Kunci tidak pernah dipercaya hanya karena ada yang menuliskannya.
   */
  const bersih = fs.existsSync(BERKAS_BERSIH) ? JSON.parse(fs.readFileSync(BERKAS_BERSIH, 'utf8')).soal : null;
  if (bersih) {
    bersih.forEach((s, i) => {
      const v = Function(`"use strict"; return (${s.hitung});`)();
      const ok = Math.abs(v - s.kunci) < 0.01;
      if (!ok) cacat++;
      console.log(`${ok ? 'v' : 'x'} soal ${i + 1}: kunci ${s.kunci} vs hitung ulang ${v}   (${s.hitung})`);
    });
  } else {
    ULANG.forEach((v, i) => {
      const ok = Math.abs(v - SOAL[i][1]) < 0.01;
      if (!ok) cacat++;
      console.log(`${ok ? 'v' : 'x'} soal ${i + 1}: kunci ${SOAL[i][1]} vs hitung ulang ${v}`);
    });
  }
  console.log(`\n## VONIS: ${cacat === 0 ? 'INSTRUMEN SEHAT — boleh dipakai mengukur' : `${cacat} CACAT — JANGAN dipakai`}`);
  process.exit(cacat === 0 ? 0 : 1);
}

// ─────────────────────────────────── pengukuran ───────────────────────────────────
const MODEL = process.argv[2];
const ULANG = Number(process.argv[3]) || 3;
const SUHU = [0, 0.3];
if (!MODEL) { console.error('pakai: node uji-aritmetika.mjs <model> [ulang]  |  --uji-instrumen'); process.exit(2); }

// C15 — dua pengukuran serentak saling memperlambat lewat swap model (22 Agu:
// dua run beradu, 11 menit membengkak >50). Satu Ollama = satu pengukuran.
const { pegangKunci, lepasKunci } = await import('./kunci-ukur.mjs');
{
  const kunci = pegangKunci(MODEL);
  if (!kunci.ok) { console.error(kunci.pesan); process.exit(1); }
  process.on('exit', () => lepasKunci());
}

async function tanya(q, suhu) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, stream: false,
      messages: [...(SIS ? [{ role: 'system', content: SIS }] : []), { role: 'user', content: q }],
      options: { temperature: suhu, num_predict: 400 },
    }),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  const j = await r.json();
  // 23 Agu: rekam done_reason — "length" = jawaban TERPOTONG num_predict; skor
  // gagal pada jawaban terpotong bukan salah hitung (padanan `terpotong` tier-1).
  return { teks: String(j.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim(),
    doneReason: j.done_reason ?? null, evalCount: j.eval_count ?? null };
}

(async () => {
  const ringkas = {};
  const rinci = [];
  for (const suhu of SUHU) {
    let benar = 0, total = 0, terpotong = 0;
    for (const [q, kunci] of SOAL) {
      for (let i = 0; i < ULANG; i++) {
        total++;
        let t = '', doneReason = null, evalCount = null;
        try { ({ teks: t, doneReason, evalCount } = await tanya(q, suhu)); } catch (e) { t = `(GAGAL ${e.message})`; }
        const ok = benarkah(t, kunci);
        if (ok) benar++;
        if (doneReason === 'length') terpotong++;
        rinci.push({ suhu, soal: q.slice(0, 40), kunci, ok, doneReason, evalCount, terpotong: doneReason === 'length',
          jawab: t.replace(/\s+/g, ' ').slice(0, 220) });
      }
    }
    ringkas[`suhu-${suhu}`] = { benar, total, persen: Math.round(benar * 100 / total), terpotong };
    console.log(`${MODEL}  suhu ${suhu}:  ${benar}/${total}  (${Math.round(benar * 100 / total)}%)${terpotong ? `  · ${terpotong} jawaban TERPOTONG (num_predict)` : ''}`);
  }
  const f = path.join(DIR, `hasil-aritmetika-${MODEL.replace(/[:/]/g, '_')}.json`);
  fs.writeFileSync(f, JSON.stringify({ model: MODEL, ulang: ULANG, ringkas, rinci }, null, 2), 'utf8');
  console.log(`tertulis: ${f}`);
})();
