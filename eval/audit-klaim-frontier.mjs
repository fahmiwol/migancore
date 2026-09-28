#!/usr/bin/env node
/**
 * audit-klaim-frontier.mjs — memeriksa bahwa tiap angka di tabel doc 89 §3
 * benar-benar sama dengan berkas hasil mentah.
 *
 * ====================== KENAPA ADA ======================
 * `eval/audit-klaim-gerbang.mjs` sudah lama menjaga doc 85 dengan aturan yang
 * sama, dan aturannya ada karena sebab yang nyata: dokumen dan berkas hasil
 * berpisah diam-diam. Dokumen ditulis sekali lalu tidak ikut berubah saat
 * pembacanya diperbaiki — dan pembaca acuan memang diperbaiki 7 Sep, yang
 * menggeser `0.14` dari 41,8 % ke 50,0 %.
 *
 * Doc 89 lahir hari itu juga, dengan tujuh angka di tabelnya, dan tanpa satu pun
 * penjaga. Berkas ini menutup celah itu: papan dibaca ulang dari berkas hasil
 * (`bacaPapan`), lalu diadu dengan angka yang tertulis di dokumen.
 *
 * Ia TIDAK mengarang perbaikan. Kalau berbeda, ia menyebut selisihnya dan gagal —
 * yang memperbaiki dokumen tetap manusia yang tahu mana yang benar.
 *
 * Pakai:
 *   node eval/audit-klaim-frontier.mjs
 *   node eval/audit-klaim-frontier.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bacaPapan } from './ukur-jujur2-frontier.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const DOK = path.join(AKAR, 'docs', 'jarvis', '89_TOLOK_UKUR_FRONTIER.md');
const arg = process.argv.slice(2);

/**
 * KOLAM yang dilaporkan doc 89 — disebut namanya, bukan "semua yang ada".
 *
 * `null` = berkas hasil yang TIDAK dimiliki pra-daftar mana pun, yaitu kolam
 * historis yang membangun tabel doc 89. Eksperimen yang datang kemudian
 * (GERBANG-ON, H-ARAH, …) menulis medan `praDaftar` ke berkas hasilnya dan
 * karena itu TIDAK ikut menggeser angka dokumen ini.
 *
 * Kenapa dikunci begitu (F-252, 21 Sep 2026): tanpa ini, angka doc 89 bergerak
 * setiap kali eksperimen lain berjalan — `0.14` sempat 50 % → 46,3 % di tengah
 * GERBANG-ON. Penjaga lalu menyala, dan orang tergoda menulis angka eksperimen
 * yang BELUM divonis ke dalam dokumen berlaku. Angka yang tidak menyebut
 * kolamnya bukan angka; ia rata-rata bergerak.
 *
 * Memasukkan putaran baru ke doc 89 adalah keputusan BERTANGGAL, bukan efek
 * samping: ubah konstanta ini (atau tulis dokumennya ulang), jangan diamkan.
 */
export const KOLAM_DOC89 = null;

/**
 * Peta label-di-dokumen → id model.
 *
 * Ditulis EKSPLISIT, bukan ditebak dari teksnya. Label di dokumen memang prosa
 * ("kimi-k3 (Moonshot, frontier)"), dan mencocokkannya dengan tebakan akan
 * membuat penjaga ini gagal-senyap begitu prosanya diubah sedikit — persis kelas
 * cacat yang C50/C52 catat. Peta yang salah akan berbunyi "label tidak ketemu",
 * bukan diam.
 */
export const PETA_LABEL = [
  ['kimi-k3', 'kimi:kimi-k3'],
  ['gpt-6-astra', 'openai:gpt-6-astra'],
  ['**Codex** (GPT + agen beralat)', 'codex:bawaan-config'],
  ['`migancore:0.14-tool`', 'migancore:0.14-tool'],
  ['`migancore:0.4-qwen3`', 'migancore:0.4-qwen3'],
  ['`qwen2.5:7b`', 'qwen2.5:7b'],
  ['**+ gerbang jebakan**', 'migancore:0.14 +gerbang(migancore:0.4-qwen3)'],
  ['`migancore:uji-jujur-1`', 'migancore:uji-jujur-1'],
  ['**`migancore:0.14`** (BERLAKU)', 'migancore:0.14'],
];

/** "3,6 %" → 3.6 · "50,0 %" → 50. Koma desimal Indonesia, bukan titik. */
export function keAngka(t) {
  const m = String(t).match(/(\d+)[.,](\d+)|(\d+)/);
  if (!m) return null;
  return m[3] != null ? Number(m[3]) : Number(`${m[1]}.${m[2]}`);
}

/**
 * Ambil (label, MENGARANG) dari baris tabel markdown.
 * Kolom MENGARANG adalah kolom ke-3 di tabel doc 89 §3 (setelah ◆ dan model).
 */
export function bacaTabel(teks) {
  const keluar = [];
  for (const baris of teks.split('\n')) {
    if (!baris.startsWith('|')) continue;
    const kolom = baris.split('|').map((x) => x.trim());
    // | (kosong) | ◆ | model | MENGARANG | fakta | over-refusal | putaran | (kosong)
    if (kolom.length < 7) continue;
    const model = kolom[2], mengarang = kolom[3];
    if (!/%/.test(mengarang)) continue;        // baris kepala & pemisah dilewati
    const angka = keAngka(mengarang);
    if (angka == null) continue;
    keluar.push({ label: model, mengarang: angka });
  }
  return keluar;
}

/** Cocokkan tiap baris dokumen dengan papan. Murni — bisa diuji tanpa berkas. */
export function bandingkan(barisDok, papan, peta = PETA_LABEL) {
  const hasil = [];
  for (const [penanda, id] of peta) {
    const dok = barisDok.find((b) => b.label.includes(penanda));
    const nyata = papan.find((p) => p.model === id);
    if (!dok) { hasil.push({ id, status: 'LABEL-HILANG', pesan: `tidak ada baris dokumen yang memuat "${penanda}"` }); continue; }
    if (!nyata || nyata.mengarang == null) { hasil.push({ id, status: 'BERKAS-HILANG', pesan: 'tidak ada hasil SAH untuk model ini di eval/' }); continue; }
    const b = +nyata.mengarang.toFixed(1);
    hasil.push(Math.abs(b - dok.mengarang) < 0.05
      ? { id, status: 'COCOK', dok: dok.mengarang, berkas: b }
      : { id, status: 'BEDA', dok: dok.mengarang, berkas: b, pesan: `dokumen ${dok.mengarang} % · berkas ${b} %` });
  }
  return hasil;
}

// ─────────────────────────────────────────────────────────────────── uji ──
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (LANGSUNG && arg.includes('--uji')) {
  let n = 0, bad = 0;
  const ok = (nama, cond, ket = '') => { if (cond) { n++; console.log(`  OK    ${nama}`); } else { bad++; console.log(`  GAGAL ${nama}${ket ? ' — ' + ket : ''}`); } };
  console.log('# Uji audit-klaim-frontier\n');

  ok('koma desimal Indonesia terbaca', keAngka('3,6 %') === 3.6 && keAngka('50,0 %') === 50);
  ok('angka bulat tanpa desimal terbaca', keAngka('100 %') === 100);
  ok('teks tanpa angka mengembalikan null', keAngka('—') === null);

  const contoh = [
    '| | model | MENGARANG | fakta | over-refusal | putaran |',
    '|---|---|---|---|---|---|',
    '| ◆ | **kimi-k3** (Moonshot, frontier) | **3,6 %** | 100 % | 0,0 % | 1 |',
    '| | **`migancore:0.14`** (BERLAKU) | **50,0 %** | 47 % | 1,0 % | 13 |',
    'bukan tabel',
  ].join('\n');
  const t = bacaTabel(contoh);
  ok('baris kepala & pemisah tidak ikut terbaca', t.length === 2, `${t.length}`);
  ok('kolom MENGARANG yang diambil, bukan fakta', t[0].mengarang === 3.6 && t[1].mengarang === 50);

  const papanPalsu = [
    { model: 'kimi:kimi-k3', mengarang: 3.6 },
    { model: 'migancore:0.14', mengarang: 50.0 },
  ];
  const peta = [['kimi-k3', 'kimi:kimi-k3'], ['**`migancore:0.14`** (BERLAKU)', 'migancore:0.14']];
  ok('angka yang sama divonis COCOK', bandingkan(t, papanPalsu, peta).every((x) => x.status === 'COCOK'));

  const papanGeser = [{ model: 'kimi:kimi-k3', mengarang: 9.9 }, { model: 'migancore:0.14', mengarang: 50.0 }];
  const geser = bandingkan(t, papanGeser, peta);
  ok('angka yang bergeser divonis BEDA, bukan didiamkan', geser.find((x) => x.id === 'kimi:kimi-k3').status === 'BEDA');

  ok('label yang tidak ada di dokumen berbunyi LABEL-HILANG (bukan lulus)',
    bandingkan(t, papanPalsu, [['tidak-ada-di-dokumen', 'kimi:kimi-k3']])[0].status === 'LABEL-HILANG');
  ok('model tanpa hasil SAH berbunyi BERKAS-HILANG (bukan lulus)',
    bandingkan(t, [], peta)[0].status === 'BERKAS-HILANG');

  // Dokumen NYATA, papan NYATA — penjaga yang cuma diuji dengan umpan buatan
  // sendiri tidak membuktikan apa pun tentang berkas sungguhan.
  const dokNyata = bacaTabel(fs.readFileSync(DOK, 'utf8'));
  const nyata = bandingkan(dokNyata, bacaPapan(undefined, { praDaftar: KOLAM_DOC89 }));
  ok('doc 89 NYATA: semua label ketemu', !nyata.some((x) => x.status === 'LABEL-HILANG'),
    nyata.filter((x) => x.status === 'LABEL-HILANG').map((x) => x.id).join(', '));
  ok('doc 89 NYATA: semua angka cocok dengan berkas', nyata.every((x) => x.status === 'COCOK'),
    nyata.filter((x) => x.status !== 'COCOK').map((x) => `${x.id}: ${x.pesan}`).join(' · '));

  console.log(`\naudit-klaim-frontier: ${n}/${n + bad} uji lulus\n`);
  process.exit(bad ? 1 : 0);
}

// ───────────────────────────────────────────────────────────────── jalan ──
if (LANGSUNG && !arg.includes('--uji')) {
  const dok = bacaTabel(fs.readFileSync(DOK, 'utf8'));
  const papan = bacaPapan(undefined, { praDaftar: KOLAM_DOC89 });
  const hasil = bandingkan(dok, papan);
  console.log('\n# audit klaim frontier — doc 89 §3 vs berkas hasil mentah\n');
  console.log(`  kolam: berkas tanpa pemilik pra-daftar · ${papan.ditolakPraDaftar} berkas eksperimen lain disisihkan (F-252)\n`);
  for (const h of hasil) {
    const tanda = h.status === 'COCOK' ? '✓' : '✗';
    console.log(`  ${tanda} ${h.id.padEnd(46)} ${h.status === 'COCOK' ? `dok ${h.dok} % = berkas ${h.berkas} %` : `${h.status}: ${h.pesan}`}`);
  }
  const gagal = hasil.filter((h) => h.status !== 'COCOK');
  console.log(gagal.length
    ? `\nAUDIT GAGAL: ${gagal.length} klaim tidak sama dengan berkas. Perbaiki DOKUMEN atau ukur ulang — jangan geser angkanya.\n`
    : `\nAUDIT LULUS: ${hasil.length} klaim sama dengan berkas (toleransi 0,1 pp).\n`);
  process.exit(gagal.length ? 1 : 0);
}
