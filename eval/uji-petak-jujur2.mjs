/**
 * uji-petak-jujur2.mjs — penjaga bank soal v2.
 *
 * Petak ini akan DITERBITKAN. Cacat di petak internal merugikan kami; cacat di
 * petak terbit merugikan semua pemakainya dan kredibilitas tolok ukurnya. Maka
 * penjaganya lahir di commit yang sama dengan banknya (aturan #7).
 */
'use strict';

import { PUBLIK, PRIVAT, KATEGORI, HARUS_ABSTAIN, SUMBER, cakupan } from './petak-jujur2.mjs';
import { periksaKolam } from './jaga-pencemaran-kolam.mjs';
import { existsSync } from 'node:fs';

let ok = 0, bad = 0;
const cek = (n, c, k = '') => { if (c) { ok++; console.log(`  OK    ${n}`); } else { bad++; console.log(`  GAGAL ${n}${k ? ' — ' + k : ''}`); } };

console.log('# Uji petak-jujur2\n');

const semua = [...PUBLIK, ...PRIVAT];

// ── bentuk dasar ────────────────────────────────────────────────────────────
cek('tiap soal punya id, jenis, keluarga, sumber, q',
  semua.every((s) => s.id && s.jenis && s.keluarga && s.sumber && s.q));
cek('id unik di seluruh bank',
  new Set(semua.map((s) => s.id)).size === semua.length);
cek('jenis semuanya dari taksonomi',
  semua.every((s) => s.jenis in KATEGORI));
cek('sumber semuanya dikenal',
  semua.every((s) => s.sumber in SUMBER));
cek('soal fakta SEMUA punya pola `benar`',
  semua.filter((s) => s.jenis === 'fakta').every((s) => typeof s.benar === 'string' && s.benar.length));
cek('soal abstain TIDAK punya pola `benar` (kalau punya, jenisnya salah)',
  semua.filter((s) => HARUS_ABSTAIN.has(s.jenis)).every((s) => !('benar' in s)));
cek('pola `benar` semuanya regex sah',
  semua.filter((s) => s.benar).every((s) => { try { new RegExp(s.benar, 'i'); return true; } catch { return false; } }));

// ── cakupan taksonomi ───────────────────────────────────────────────────────
const c = cakupan(PUBLIK);
cek('PUBLIK menutup KEENAM kategori abstensi + fakta',
  c.kategoriHilang.length === 0, `hilang: ${c.kategoriHilang.join(', ')}`);
cek('tiap kategori abstensi punya >= 3 soal (di bawah itu = anekdot)',
  [...HARUS_ABSTAIN].every((j) => (c.perJenis[j] ?? 0) >= 3),
  JSON.stringify(c.perJenis));
cek('fakta cukup tebal sebagai pagar dua arah (>= 6)',
  (c.perJenis.fakta ?? 0) >= 6);
cek('keluarga pola cukup beragam (>= 12) untuk belahan TRAIN/TAHAN per keluarga',
  c.keluarga >= 12, `${c.keluarga} keluarga`);

// ── kemurnian publik/privat ─────────────────────────────────────────────────
// Rilis publik: nama bisnis pemilik diperiksa oleh daftar privat di luar repo ini.
const RAHASIA = /OMIGA|MiganCore|Migan|Sidix|Fahmi/i;
cek('PUBLIK bersih dari nama internal (layak terbit)',
  PUBLIK.every((s) => !RAHASIA.test(s.q + (s.benar ?? ''))),
  PUBLIK.filter((s) => RAHASIA.test(s.q + (s.benar ?? ''))).map((s) => s.id).join(','));
cek('PRIVAT kosong di rilis publik (tiga soal privat tidak diterbitkan)', PRIVAT.length === 0);

// ── anti-pencemaran terhadap petak SEJARAH ──────────────────────────────────
// v2 tidak boleh menyalin soal petak-40: kalau sama, ia mewarisi seluruh
// pencemaran kolam RLVR (C42) dan kehilangan alasan keberadaannya.
// Pengecualian yang DIUMUMKAN: soal `adaptasi` memang diangkat dari sana —
// jumlahnya harus kecil dan tercatat di medan sumber.
const bukan40 = PUBLIK.filter((s) => s.sumber !== 'adaptasi');
if (existsSync('eval/uji-halusinasi.mjs')) {
  const cemar = periksaKolam(
    bukan40.map((s) => ({ id: s.id, t: s.q })),
    ['eval/uji-halusinasi.mjs'],
  );
  cek('soal non-adaptasi TIDAK menyalin petak-40',
    cemar.tercemar === 0,
    cemar.temuan.map((t) => `${t.id}:${t.jenis}`).join(' '));
} else {
  console.log('  LEWAT soal non-adaptasi vs petak-40 (petak-40 tidak ikut rilis publik)');
}
cek('soal adaptasi sedikit (<= 4 dari PUBLIK) dan diberi label',
  PUBLIK.filter((s) => s.sumber === 'adaptasi').length <= 4);

// ── keseimbangan yang menentukan tafsir ─────────────────────────────────────
const nAbstain = PUBLIK.filter((s) => HARUS_ABSTAIN.has(s.jenis)).length;
const nJawab = PUBLIK.filter((s) => s.jenis === 'fakta').length;
console.log(`\n  komposisi PUBLIK: ${nJawab} harus-jawab · ${nAbstain} harus-abstain · ${c.keluarga} keluarga`);
console.log(`  per jenis : ${JSON.stringify(c.perJenis)}`);
console.log(`  per sumber: ${JSON.stringify(c.perSumber)}`);

console.log(`\n${ok} lulus · ${bad} gagal\n`);
process.exit(bad ? 1 : 0);
