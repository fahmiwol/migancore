#!/usr/bin/env node
/**
 * banding-jenis.mjs — penjaga C12: TOTAL BISA MENYEMBUNYIKAN DUA HAL BESAR
 * YANG SALING BERLAWANAN.
 *
 * ================================= KEJADIANNYA ==============================
 * 21 Agu 2026, gerbang aritmetika bersih, v11 vs 0.4-qwen3:
 *   agregat    48/60 vs 52/60   p=0,4632   "belum terbukti beda"
 * Kesimpulan itu hampir saya terbitkan. Dipecah per jenis soal:
 *   ton-harga     0/12 vs  8/12   p=0,0013   NYATA
 *   selisih-kali 12/12 vs  9/12   naik
 * Satu jenis GAGAL TOTAL, satu jenis SEMPURNA. Keduanya saling menghapus di
 * penjumlahan, dan yang tersisa adalah angka yang berkata "tidak ada apa-apa".
 *
 * Cacat total pada satu operasi hampir lolos sebagai ketiadaan temuan.
 *
 * ================================== ATURANNYA ===============================
 * Total TIDAK BOLEH dipercaya sebelum dipecah. Alat ini memecah, menguji tiap
 * jenis dengan Fisher exact, lalu MENOLAK (keluar 1) bila ada jenis yang beda
 * nyata sementara agregatnya berkata tidak ada beda — keadaan yang persis
 * menipu saya.
 *
 * Pakai:
 *   node banding-jenis.mjs <modelA> <modelB>   bandingkan hasil aritmetika
 *   node banding-jenis.mjs --uji-instrumen     uji alat ini sendiri
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vonis, vonisBerpasangan, pasangkanPerSoal } from './statistik.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;

/**
 * Inti penjaganya: apakah ada jenis yang beda nyata padahal agregat diam?
 * Dipisah jadi fungsi supaya bisa diuji dengan angka yang sudah diketahui.
 */
function periksaPenyamaran(agregat, perJenis) {
  const vAgregat = vonis(...agregat);
  const jenisNyata = perJenis.filter((j) => vonis(j.a, j.na, j.b, j.nb).nyata);
  return { vAgregat, jenisNyata, menyamar: !vAgregat.nyata && jenisNyata.length > 0 };
}

if (process.argv.includes('--uji-instrumen')) {
  console.log('# Uji instrumen — banding-jenis.mjs');
  console.log('# Kendali memakai angka NYATA dari pengukuran 21 Agu 2026.\n');
  const kasus = [
    { nama: 'kasus nyata: agregat diam, ton-harga menjerit -> WAJIB terdeteksi',
      agregat: [48, 60, 52, 60],
      jenis: [{ nama: 'ton-harga', a: 8, na: 12, b: 0, nb: 12 },
              { nama: 'diskon', a: 12, na: 12, b: 12, nb: 12 },
              { nama: 'selisih', a: 9, na: 12, b: 12, nb: 12 }],
      harus: true },
    { nama: 'semua jenis tenang -> TIDAK boleh dinyatakan menyamar',
      agregat: [30, 40, 32, 40],
      jenis: [{ nama: 'a', a: 15, na: 20, b: 16, nb: 20 },
              { nama: 'b', a: 15, na: 20, b: 16, nb: 20 }],
      harus: false },
    { nama: 'agregat SUDAH nyata -> bukan penyamaran, cuma beda biasa',
      agregat: [10, 40, 35, 40],
      jenis: [{ nama: 'a', a: 5, na: 20, b: 18, nb: 20 },
              { nama: 'b', a: 5, na: 20, b: 17, nb: 20 }],
      harus: false },
  ];
  let cacat = 0;
  for (const k of kasus) {
    const r = periksaPenyamaran(k.agregat, k.jenis);
    const ok = r.menyamar === k.harus;
    if (!ok) cacat++;
    console.log(`  ${ok ? 'OK   ' : 'CACAT'} ${k.nama}`);
    if (!ok) console.log(`         harap menyamar=${k.harus} · dapat ${r.menyamar}`);
  }
  console.log(`\n${cacat === 0 ? `SEHAT: ${kasus.length}/${kasus.length}` : `CACAT: ${cacat}`}`);
  process.exit(cacat === 0 ? 0 : 1);
}

// ─────────────────────────────────────────── pemakaian sungguhan ──
const A = process.argv[2], B = process.argv[3];
if (!A || !B) {
  // Tanpa argumen, alat ini tetap harus bisa dipakai sebagai PENJAGA di
  // register — jadi ia menguji dirinya sendiri, bukan mengeluh minta argumen.
  const { status } = (await import('node:child_process')).spawnSync(
    process.execPath, [path.join(DIR, 'banding-jenis.mjs'), '--uji-instrumen'], { stdio: 'inherit' });
  process.exit(status ?? 0);
}

// C14 — lengan beda templat: selisih model tercampur selisih templat.
// Beda terbukti + tidak dinyatakan sengaja = tolak; Ollama mati = peringatan saja.
{
  const { jagaTemplat, laporkan } = await import('./periksa-templat.mjs');
  const t = await jagaTemplat(A, B, { sengaja: process.env.TEMPLAT_BEDA_SENGAJA === '1' });
  if (laporkan(A, B, t) !== 0) process.exit(1);
}

const baca = (m) => JSON.parse(fs.readFileSync(path.join(DIR, `hasil-aritmetika-${m.replace(/[:/]/g, '_')}.json`), 'utf8'));
const bersih = JSON.parse(fs.readFileSync(path.join(DIR, 'soal-aritmetika-bersih.json'), 'utf8')).soal;
const petaJenis = new Map(bersih.map((s) => [s.soal.slice(0, 40), s.jenis]));

function kumpul(m) {
  const j = baca(m);
  const per = new Map();
  let benar = 0, total = 0;
  for (const r of j.rinci) {
    const jn = petaJenis.get(r.soal) || 'lain';
    const t = per.get(jn) || [0, 0];
    t[1]++; if (r.ok) t[0]++;
    per.set(jn, t);
    total++; if (r.ok) benar++;
  }
  return { per, benar, total, rinci: j.rinci };
}

const a = kumpul(A), b = kumpul(B);
const perJenis = [...a.per].map(([jn, ta]) => {
  const tb = b.per.get(jn) || [0, 0];
  return { nama: jn, a: ta[0], na: ta[1], b: tb[0], nb: tb[1] };
});
const r = periksaPenyamaran([a.benar, a.total, b.benar, b.total], perJenis);

console.log(`# Banding per JENIS — A=${A} · B=${B}\n`);
console.log('| Jenis | A | B | selisih | Fisher p | Vonis |');
console.log('|---|---|---|---|---|---|');
for (const j of perJenis) {
  const v = vonis(j.a, j.na, j.b, j.nb);
  console.log(`| ${j.nama} | ${j.a}/${j.na} | ${j.b}/${j.nb} | ${pct(v.selisih)} | ${v.p < 0.0001 ? '<0,0001' : v.p.toFixed(4)} | ${v.nyata ? (v.selisih > 0 ? '**B LEBIH BAIK**' : '**B LEBIH BURUK**') : 'belum terbukti'} |`);
}
const va = r.vAgregat;
console.log(`| **AGREGAT** | ${a.benar}/${a.total} | ${b.benar}/${b.total} | ${pct(va.selisih)} | ${va.p.toFixed(4)} | ${va.nyata ? 'beda nyata' : 'belum terbukti'} |`);

// C19 (23 Agu): Fisher di tabel di atas menggabungkan ulangan sebagai pengamatan
// bebas — INDIKATIF untuk menyaring penyamaran (C12), TIDAK sah untuk klaim
// "beda nyata". Klaim memakai satuan SOAL, berpasangan, McNemar eksak.
console.log('\n## Berpasangan per SOAL (satuan sah, C19)');
const vbAgg = vonisBerpasangan(pasangkanPerSoal(a.rinci, b.rinci));
console.log(`- AGREGAT: ${vbAgg.nSoal} soal · B lebih baik ${vbAgg.c} · A lebih baik ${vbAgg.b} · seri ${vbAgg.seri} · McNemar p=${vbAgg.p.toFixed(4)} → ${vbAgg.nyata ? '**BEDA NYATA**' : 'belum terbukti'}`);
for (const jn of a.per.keys()) {
  const fa = a.rinci.filter((x) => (petaJenis.get(x.soal) || 'lain') === jn);
  const fb = b.rinci.filter((x) => (petaJenis.get(x.soal) || 'lain') === jn);
  const vj = vonisBerpasangan(pasangkanPerSoal(fa, fb));
  console.log(`- ${jn}: ${vj.nSoal} soal · B>A ${vj.c} · A>B ${vj.b} · McNemar p=${vj.p.toFixed(3)}${vj.nSoal < 6 ? ' (n soal terlalu kecil untuk signifikansi — arah saja)' : ''}`);
}
console.log('Catatan: kolom "Fisher p" di tabel atas = gabungan ulangan (indikatif).');

console.log(`\n## VONIS: ${r.menyamar
  ? `AGREGAT MENYAMARKAN — ${r.jenisNyata.length} jenis beda nyata sementara totalnya diam. JANGAN pakai angka agregat.`
  : 'agregat tidak menyamarkan apa pun'}`);
process.exit(r.menyamar ? 1 : 0);
