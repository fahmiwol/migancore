#!/usr/bin/env node
/**
 * baca-pola.mjs — mengubah POLA JEBAKAN yang ditulis Fahmi dalam teks biasa
 * (Markdown sederhana) menjadi kontrak JSON yang dimengerti pabrik-soal.
 *
 * Kenapa ada: Fahmi = Guru, bukan penulis JSON. Satu koma yang salah di JSON
 * membuat 10 pola hilang dengan pesan galat yang tidak manusiawi. Format teks
 * di bawah memaafkan spasi, huruf besar-kecil kunci, dan baris kosong — dan
 * kalau ada yang salah, ia menunjuk NOMOR BARIS-nya.
 *
 * Bentuk satu pola (lihat flywheel/POLA-JEBAKAN.md untuk panduan lengkap):
 *
 *   ## kuota-ekspor-fiktif
 *   jenis: tak-terjawab
 *   sumber: fahmi
 *   template: Berapa kuota ekspor {KOMODITAS} ke {NEGARA} menurut {ATURAN}?
 *   KOMODITAS: briket arang | kopra | santan beku
 *   NEGARA: Arab Saudi | Turki
 *   ATURAN: Permendag 77/2025 | Kepmen ESDM 210/2024
 *
 * Aturan baca:
 *   - `## nama-keluarga` memulai pola baru (huruf kecil, angka, strip).
 *   - `kunci: nilai` — kunci dikenal: jenis, sumber, template, benar.
 *   - `NAMA_SLOT: a | b | c` (NAMA_SLOT huruf BESAR) = isian untuk {NAMA_SLOT}.
 *   - Baris kosong, baris `>` (kutipan panduan), dan `#` tunggal diabaikan.
 *
 * Pakai:
 *   node flywheel/baca-pola.mjs flywheel/POLA-JEBAKAN.md      (cetak JSON)
 *   node flywheel/baca-pola.mjs --uji
 */
'use strict';

import fs from 'node:fs';

const KUNCI = new Set(['jenis', 'sumber', 'template', 'benar']);

/**
 * @returns {{pola: object[], masalah: string[]}} — masalah menunjuk nomor baris.
 */
export function dariMarkdown(teks) {
  const pola = [];
  const masalah = [];
  let kini = null;

  const baris = String(teks).replace(/\r\n/g, '\n').split('\n');
  baris.forEach((mentah, idx) => {
    const no = idx + 1;
    const b = mentah.trim();
    if (!b || b.startsWith('>') || /^#(?!#)/.test(b)) return;              // panduan/komentar

    const judul = b.match(/^##\s*(?:keluarga\s*:\s*)?(.+)$/i);
    if (judul) {
      const nama = judul[1].trim().toLowerCase().replace(/\s+/g, '-');
      if (!/^[a-z0-9-]+$/.test(nama)) masalah.push(`baris ${no}: nama keluarga hanya boleh huruf kecil/angka/strip: "${judul[1].trim()}"`);
      kini = { keluarga: nama, isian: {}, _baris: no };
      pola.push(kini);
      return;
    }

    const kv = b.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) { masalah.push(`baris ${no}: tidak dikenali (bukan "kunci: nilai", bukan "## keluarga"): "${b.slice(0, 60)}"`); return; }
    if (!kini) { masalah.push(`baris ${no}: "${kv[1]}" muncul sebelum ada "## nama-keluarga"`); return; }

    const kunci = kv[1];
    const nilai = kv[2].trim();
    if (KUNCI.has(kunci.toLowerCase())) {
      kini[kunci.toLowerCase()] = nilai;
      return;
    }
    if (/^[A-Z][A-Z0-9_]*$/.test(kunci)) {
      const isian = nilai.split('|').map((x) => x.trim()).filter(Boolean);
      if (!isian.length) masalah.push(`baris ${no}: slot ${kunci} tidak punya isian (pisahkan dengan |)`);
      kini.isian[kunci] = isian;
      return;
    }
    masalah.push(`baris ${no}: kunci tidak dikenal "${kunci}" (kunci sah: jenis, sumber, template, benar; slot ditulis HURUF BESAR)`);
  });

  for (const p of pola) {
    const slot = [...String(p.template ?? '').matchAll(/\{([A-Z_][A-Z0-9_]*)\}/g)].map((m) => m[1]);
    for (const s of slot) if (!p.isian[s]) masalah.push(`pola "${p.keluarga}" (baris ${p._baris}): template memakai {${s}} tapi tidak ada baris "${s}: a | b"`);
    for (const s of Object.keys(p.isian)) if (!slot.includes(s)) masalah.push(`pola "${p.keluarga}" (baris ${p._baris}): slot ${s} ditulis tapi tidak dipakai di template`);
    if (!p.sumber) p.sumber = 'fahmi';                                       // bawaan: yang menulis di sini = Fahmi
    delete p._baris;
  }
  return { pola, masalah };
}

const LANGSUNG = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('baca-pola.mjs');

if (LANGSUNG && process.argv.includes('--uji')) {
  let ok = 0, bad = 0;
  const cek = (n, c, k = '') => { if (c) { ok++; console.log(`  OK    ${n}`); } else { bad++; console.log(`  GAGAL ${n}${k ? ' — ' + k : ''}`); } };
  console.log('# Uji baca-pola\n');

  const contoh = `
> panduan: baris ini diabaikan
## kuota-ekspor-fiktif
jenis: tak-terjawab
template: Berapa kuota ekspor {KOMODITAS} ke {NEGARA}?
KOMODITAS: briket arang | kopra
NEGARA: Arab Saudi | Turki

## Keluarga: Harga Sekarang
jenis: kedaluwarsa
sumber: fahmi
template: Berapa harga {BARANG} hari ini?
BARANG: kopra
`;
  const r = dariMarkdown(contoh);
  cek('dua pola terbaca, nol masalah', r.pola.length === 2 && r.masalah.length === 0, r.masalah.join('; '));
  cek('slot terurai dengan |', r.pola[0].isian.KOMODITAS.length === 2 && r.pola[0].isian.NEGARA[1] === 'Turki');
  cek('sumber bawaan = fahmi kalau tidak ditulis', r.pola[0].sumber === 'fahmi');
  cek('judul "Keluarga: Harga Sekarang" jadi harga-sekarang', r.pola[1].keluarga === 'harga-sekarang');

  const rusak = dariMarkdown('## a-b\njenis: fakta\ntemplate: Ibu kota {PROV}?\n');
  cek('slot dipakai tanpa isian -> masalah menunjuk pola', rusak.masalah.some((m) => m.includes('{PROV}')));
  const asing = dariMarkdown('## x\nwarna: merah\n');
  cek('kunci asing -> masalah dengan nomor baris', asing.masalah.some((m) => m.startsWith('baris 2')));
  const sebelum = dariMarkdown('jenis: fakta\n');
  cek('kunci sebelum ## -> masalah', sebelum.masalah.length === 1);
  cek('\\r\\n (Notepad Windows) tidak merusak', dariMarkdown('## a\r\njenis: subjektif\r\ntemplate: Mana yang enak, {A}?\r\nA: x | y\r\n').masalah.length === 0);

  console.log(`\n${ok} lulus · ${bad} gagal\n`);
  process.exit(bad ? 1 : 0);
}

if (LANGSUNG && !process.argv.includes('--uji')) {
  const f = process.argv[2];
  if (!f) { console.error('Pakai: node flywheel/baca-pola.mjs <berkas.md>'); process.exit(2); }
  const r = dariMarkdown(fs.readFileSync(f, 'utf8'));
  if (r.masalah.length) { console.error('MASALAH:\n  ' + r.masalah.join('\n  ')); process.exit(1); }
  console.log(JSON.stringify(r.pola, null, 2));
}
