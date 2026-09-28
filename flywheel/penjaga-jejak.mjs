#!/usr/bin/env node
/**
 * penjaga-jejak.mjs — M18: menampilkan yang BELUM tercatat.
 *
 * Kenapa ada. Modul lain menampilkan yang SUDAH tercatat; yang mahal di proyek ini justru
 * yang belum. Lima kerugian nyata sepanjang 2026 semuanya ketahuan KARENA KEBETULAN, bukan
 * karena sistem: enam run MO-GRPO berbobot tanpa evaluasi · lima artefak salinan tunggal ·
 * retrieval OMIGA 98,5 % salah petakan (F-249) · dokumen arah ADO tanpa penunjuk (F-251) ·
 * satu angka salah hidup di lima berkas (F-248). Fahmi, 18 Sep 2026: tidak boleh ada
 * yang hilang. Berkas ini mengubah kebetulan jadi pemeriksaan.
 *
 * Sifatnya: BACA-SAJA, dibangkitkan, tidak pernah menulis ke sumber. Ia tidak memvonis —
 * ia menunjuk tempat yang perlu dilihat manusia, beserta SATU tindakan untuk menutupnya.
 *
 * Pakai:
 *   node flywheel/penjaga-jejak.mjs              # cetak laporan
 *   node flywheel/penjaga-jejak.mjs --json       # keluaran mesin
 *   node flywheel/penjaga-jejak.mjs --uji        # uji sendiri (untuk migan periksa)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baca = (p) => { try { return fs.readFileSync(path.join(AKAR, p), 'utf8'); } catch { return ''; } };
const git = (...a) => { try { return execFileSync('git', ['-C', AKAR, ...a], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const HARI = 86400000;
const temuan = [];
const lapor = (jenis, berat, apa, tindakan, bukti = null) => temuan.push({ jenis, berat, apa, tindakan, bukti });

// ── 1. Pra-daftar yang MANDEK ────────────────────────────────────────────────
// Ambang dikunci lalu didiamkan = separuh disiplin terbuang. Yang `belum` lebih dari
// 7 hari sejak ditulis, atau `netral` tanpa tindak lanjut, wajib muncul di sini.
const praDaftar = fs.readdirSync(path.join(AKAR, 'flywheel'))
  .filter((f) => /^PRA-DAFTAR-.*\.json$/.test(f))
  .map((f) => { try { return { f, j: JSON.parse(baca(`flywheel/${f}`)) }; } catch { return null; } })
  .filter(Boolean);

for (const { f, j } of praDaftar) {
  const id = f.replace(/^PRA-DAFTAR-|\.json$/g, '');
  const keadaan = j.vonis?.keadaan || 'tanpa';
  const tgl = j.tanggal || j.vonis?.tanggal;
  const umur = tgl ? Math.floor((Date.now() - Date.parse(tgl)) / HARI) : null;
  if (keadaan === 'belum' && umur != null && umur > 7) {
    lapor('pra-daftar mandek', umur > 30 ? 'tinggi' : 'sedang',
      `${id} berkeadaan "belum" sejak ${tgl} (${umur} hari)`,
      'Jalankan, atau tulis amandemen bertanggal yang menyatakan kenapa ditunda.', `flywheel/${f}`);
  }
  if (!j.vonis || typeof j.vonis.hasil !== 'string' || !j.vonis.hasil.trim()) {
    lapor('vonis tak berbentuk', 'tinggi',
      `${id} tidak punya vonis.hasil berupa string`,
      'Isi vonis.hasil — walau isinya "BELUM DIJALANKAN, ambang dikunci ...". Vonis kosong tak terbaca migan status.', `flywheel/${f}`);
  }
}

// ── 2. Nomor F/C yang DIRUJUK tetapi tidak punya entri ───────────────────────
// Kelas F-248/F-251: rujukan yang tidak bisa dibuka = kegagalan senyap. Agen membaca
// aturan, mencari berkasnya, tidak menemukan, lalu melanjutkan.
const temuanTeks = baca('docs/jarvis/FINDINGS_LOG.md');
const hukumTeks = baca('PETA-DIAL-LATIH.md');
const adaF = new Set([...temuanTeks.matchAll(/^- \*\*(F-\d+)/gm)].map((m) => m[1]));
const adaC = new Set([...hukumTeks.matchAll(/^##+ (C\d+[a-z]?)\b/gm)].map((m) => m[1]));

const sumberRujukan = ['docs/jarvis/FINDINGS_LOG.md', 'PETA-DIAL-LATIH.md', 'AGENTS.md',
  ...fs.readdirSync(path.join(AKAR, 'flywheel')).filter((f) => f.endsWith('.json')).map((f) => `flywheel/${f}`)];
const rujukC = new Map();
for (const p of sumberRujukan) {
  for (const m of baca(p).matchAll(/\b(C\d{1,2})\b/g)) {
    if (!rujukC.has(m[1])) rujukC.set(m[1], new Set());
    rujukC.get(m[1]).add(p);
  }
}
const cYatim = [...rujukC.keys()].filter((c) => !adaC.has(c)).sort((a, b) => +a.slice(1) - +b.slice(1));
if (cYatim.length) {
  lapor('hukum dirujuk tanpa entri', 'sedang',
    `${cYatim.length} nomor hukum dirujuk tetapi tidak punya entri berjudul: ${cYatim.join(', ')}`,
    'Tulis entrinya di PETA-DIAL-LATIH.md, atau ganti rujukannya ke nomor yang benar. Rujukan yang tak bisa dibuka adalah kegagalan senyap (F-251).',
    'PETA-DIAL-LATIH.md');
}

// ── 3. Adapter/bobot yang ADA tetapi tidak pernah diukur ─────────────────────
// Kerugian termahal proyek ini: GPU sudah dibayar, jawabannya tidak pernah diambil.
try {
  // Windows: impor ESM WAJIB lewat file:// — jalur absolut `c:\...` ditolak pemuat bawaan.
  const { kumpulkanAdapter } = await import(pathToFileURL(path.join(AKAR, 'flywheel', 'panen-adapter.mjs')).href);
  const adapter = kumpulkanAdapter() || [];
  const tanpaRingkasan = adapter.filter((a) => !a.ringkasan);
  if (tanpaRingkasan.length) {
    lapor('bobot tanpa evaluasi', 'tinggi',
      `${tanpaRingkasan.length} dari ${adapter.length} adapter tidak punya ringkasan hasil`,
      'Panen dan ukur, atau catat alasan tertulis kenapa tidak diukur. Bobot yang dibayar tanpa jawaban adalah kerugian, bukan arsip.',
      tanpaRingkasan.slice(0, 4).map((a) => a.jalur).join(' · '));
  }
} catch (e) {
  lapor('pemeriksaan gagal', 'rendah', `adapter tidak bisa dihitung: ${e.message}`,
    'Periksa flywheel/panen-adapter.mjs; jangan menghitung adapter dengan pola nama berkas.');
}

// ── 4. Kerja yang belum masuk CHANGELOG ──────────────────────────────────────
// CHANGELOG adalah riwayat kanonik. Berkas riset yang berubah sesudah entri terakhir
// berarti ada kerja yang belum punya kalimatnya.
const chg = baca('docs/jarvis/CHANGELOG.md');
const tglChg = (chg.match(/^## (\d{4}-\d{2}-\d{2})/m) || [])[1];
if (tglChg) {
  const sejak = git('log', `--since=${tglChg}`, '--name-only', '--pretty=format:');
  const pantau = /^(flywheel\/PRA-DAFTAR|docs\/jarvis\/|eval\/.*\.mjs|PETA-DIAL-LATIH|models\/)/;
  const berubah = [...new Set(sejak.split('\n').map((s) => s.trim()).filter((s) => s && pantau.test(s)))];
  const disebut = berubah.filter((f) => !chg.includes(path.basename(f).replace(/\.(json|md|mjs)$/, '')));
  if (disebut.length > 3) {
    lapor('kerja belum masuk CHANGELOG', 'sedang',
      `${disebut.length} berkas riset berubah sejak entri CHANGELOG terakhir (${tglChg}) tanpa disebut di sana`,
      'Tulis entri CHANGELOG untuk kerja itu. Yang tidak punya kalimatnya akan hilang saat konteks berganti.',
      disebut.slice(0, 5).join(' · '));
  }
}

// ── 5. Berkas hasil yang belum punya pra-daftar ──────────────────────────────
// Kelas F-252: pengukuran yang tidak terikat pra-daftar bisa menggeser angka utama
// tanpa ada yang tahu eksperimen mana pemiliknya.
const hasil = fs.readdirSync(path.join(AKAR, 'eval')).filter((f) => /^hasil-jujur2-.*\.json$/.test(f));
const tanpaPraDaftar = hasil.filter((f) => {
  try { return !JSON.parse(baca(`eval/${f}`)).praDaftar; } catch { return false; }
});
if (tanpaPraDaftar.length) {
  lapor('hasil tanpa pemilik', 'rendah',
    `${tanpaPraDaftar.length} dari ${hasil.length} berkas hasil tidak menyebut pra-daftarnya`,
    'Tambahkan medan `praDaftar` pada pelari yang membuatnya. Tanpa itu, papan angka mencampur eksperimen yang berbeda (F-252).',
    tanpaPraDaftar.slice(0, 3).join(' · '));
}

// ── keluaran ─────────────────────────────────────────────────────────────────
const urut = { tinggi: 0, sedang: 1, rendah: 2 };
temuan.sort((a, b) => urut[a.berat] - urut[b.berat]);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ dibangkitkan: new Date().toISOString(), jumlah: temuan.length, temuan }, null, 2));
} else if (process.argv.includes('--uji')) {
  // Untuk migan periksa: alat ini SEHAT selama ia bisa berjalan dan menghitung.
  // Ia TIDAK menggagalkan periksa karena menemukan sesuatu — menemukan memang tugasnya.
  const wajib = ['pra-daftar mandek', 'hukum dirujuk tanpa entri', 'bobot tanpa evaluasi'];
  const jalan = temuan.length >= 0 && praDaftar.length > 0 && adaF.size > 0 && adaC.size > 0;
  console.log(jalan
    ? `OK penjaga-jejak jalan: ${praDaftar.length} pra-daftar · ${adaF.size} temuan · ${adaC.size} hukum berjudul · ${temuan.length} butir belum tercatat`
    : 'GAGAL penjaga-jejak tidak bisa membaca sumbernya');
  process.exit(jalan ? 0 : 1);
} else {
  const ikon = { tinggi: '🔴', sedang: '🟡', rendah: '⚪' };
  console.log(`\n# PENJAGA JEJAK — yang belum tercatat\n`);
  console.log(`  sumber: ${praDaftar.length} pra-daftar · ${adaF.size} temuan F · ${adaC.size} hukum C berjudul\n`);
  if (!temuan.length) { console.log('  Tidak ada butir. (Kosong hanya berarti kelima pemeriksaan ini bersih — bukan bahwa tak ada yang hilang.)\n'); }
  for (const t of temuan) {
    console.log(`${ikon[t.berat]} [${t.jenis}] ${t.apa}`);
    console.log(`   → ${t.tindakan}`);
    if (t.bukti) console.log(`   ${t.bukti}`);
    console.log();
  }
  console.log(`  ${temuan.length} butir. Alat ini menunjuk, tidak memvonis — yang memutuskan tetap manusia.\n`);
}
