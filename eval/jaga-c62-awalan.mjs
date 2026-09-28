#!/usr/bin/env node
/**
 * jaga-c62-awalan.mjs — penjaga hukum C62: awalan yang dikirim ulang harus stabil byte-demi-byte.
 *
 * Dalam satu percakapan, permintaan giliran k+1 WAJIB memuat seluruh pesan giliran k di posisi yang
 * sama dan dengan isi yang sama persis (lalu jawaban asisten, lalu pesan baru). Satu byte berbeda di
 * depan riwayat memaksa seluruh riwayat diproses ulang — di Bmax 40 tok/dtk (F-265).
 *
 * Penjaga ini BUKAN uji "harness benar" semata: uji dirinya menuntut bahwa ia MENANGKAP dua pola
 * yang sudah membayar hukum ini — riwayat tanpa ' /no_think' (F-262) dan arahan yang berganti di
 * pesan sistem (F-265) — dan meloloskan jalur E2' yang terbukti cepat (p95 1,04 dtk).
 *
 *   node eval/jaga-c62-awalan.mjs --uji
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));

/** Periksa satu percakapan: daftar badan permintaan /api/chat berurutan. */
export function awalanStabil(permintaan) {
  const pelanggaran = [];
  for (let i = 1; i < permintaan.length; i++) {
    const lalu = permintaan[i - 1].messages, kini = permintaan[i].messages;
    if (kini.length < lalu.length + 2) { pelanggaran.push({ giliran: i, posisi: null, sebab: 'riwayat memendek / tidak memuat giliran lalu' }); continue; }
    for (let j = 0; j < lalu.length; j++) {
      if (kini[j].role !== lalu[j].role || kini[j].content !== lalu[j].content) {
        pelanggaran.push({ giliran: i, posisi: j, peran: lalu[j].role, sebab: j === 0 ? 'pesan sistem berubah' : `pesan ${lalu[j].role} ke-${j} tidak dikirim ulang persis` });
        break;
      }
    }
  }
  return { ok: pelanggaran.length === 0, pelanggaran };
}

async function uji() {
  let n = 0, bad = 0;
  const cek = (nama, ok, info = '') => { n++; console.log(`${ok ? '✓' : '✗'} ${nama}${ok ? '' : `  ← ${info}`}`); if (!ok) bad++; };
  const E1 = await import(pathToFileURL(path.join(DI_SINI, 'e1-latensi-npc.mjs')).href);
  const E2 = await import(pathToFileURL(path.join(DI_SINI, 'e2-kejujuran-npc.mjs')).href);
  const { arahan } = await import(pathToFileURL(path.join(DI_SINI, '..', 'sistem', 'gerbang-jebakan.mjs')).href);
  const fs = await import('node:fs');
  const beban = JSON.parse(fs.readFileSync(path.join(DI_SINI, 'beban-e2-npc.json'), 'utf8'));
  const P = E2.bacaPraDaftarE2();
  const npc = beban.npc[1];
  const kal = E2.urutanSesi(npc, 1, 1).slice(0, 4).map((k) => k.q);

  const terkirim = [];
  const fetchAsli = globalThis.fetch;
  globalThis.fetch = async (_u, o) => {
    terkirim.push(JSON.parse(o.body));
    return { ok: true, body: (async function* () {
      yield JSON.stringify({ message: { content: ' Oke, siap! ' } }) + '\n';
      yield JSON.stringify({ message: { content: '' }, done: true, eval_count: 3, eval_duration: 3e8, prompt_eval_count: 9, prompt_eval_duration: 1e8 }) + '\n';
    })() };
  };
  // Satu percakapan 4 giliran; `sistemGiliran(i)` dan `modeRiwayat` mereproduksi tiap tata letak.
  const percakapan = async (sistemGiliran, modeRiwayat) => {
    terkirim.length = 0;
    const riwayat = [];
    for (const [i, q] of kal.entries()) {
      const j = await E1.jawabNPC(sistemGiliran(i), riwayat, q);
      riwayat.push(...E1.entriRiwayat(modeRiwayat, q, j));
    }
    return awalanStabil(terkirim.slice());
  };
  try {
    // Jalur E2' (kedua lengan): sistem tetap, riwayat persis → STABIL
    for (const lengan of ['polos', 'batas']) {
      const r = await percakapan(() => E2.personaLengan(npc, lengan, P.batasTeks), 'persis');
      cek(`E2' lengan ${lengan}: awalan stabil`, r.ok, JSON.stringify(r.pelanggaran));
    }
    // F-262: riwayat 'mentah' (E1) — pesan pengguna riwayat tanpa ' /no_think' → HARUS tertangkap
    const r262 = await percakapan(() => E1.bangunPersona(npc), 'mentah');
    cek('F-262 tertangkap: riwayat tanpa /no_think melanggar di pesan pengguna pertama', !r262.ok && r262.pelanggaran[0].posisi === 1, JSON.stringify(r262.pelanggaran));
    // F-265: arahan gerbang di pesan SISTEM yang berganti antargiliran (tata letak E1/E1b) → HARUS tertangkap
    const urutanTindakan = [['jawab', null], ['klarifikasi', 'maksud-kurang'], ['abstain', 'tak-terjawab'], ['jawab', 'fakta']];
    const r265 = await percakapan((i) => { const t = arahan(...urutanTindakan[i]); return t ? `${E1.bangunPersona(npc)}\n\n${t}` : E1.bangunPersona(npc); }, 'persis');
    cek('F-265 tertangkap: arahan berganti di pesan sistem melanggar di posisi 0', !r265.ok && r265.pelanggaran.every((p) => p.posisi === 0), JSON.stringify(r265.pelanggaran));
    // Kendali: arahan yang TIDAK berganti di sistem tidak dituduh (penjaga menilai perubahan, bukan keberadaan)
    const rTetap = await percakapan(() => `${E1.bangunPersona(npc)}\n\n${arahan('klarifikasi', 'maksud-kurang')}`, 'persis');
    cek('kendali: sistem berarahan TETAP → stabil (bukan positif palsu)', rTetap.ok, JSON.stringify(rTetap.pelanggaran));
  } finally { globalThis.fetch = fetchAsli; }
  // Satuan murni
  cek('riwayat memendek tertangkap', !awalanStabil([{ messages: [{ role: 'system', content: 'a' }, { role: 'user', content: 'b' }] }, { messages: [{ role: 'system', content: 'a' }] }]).ok);
  console.log(bad === 0 ? `jaga-c62-awalan: ${n} uji lulus` : `jaga-c62-awalan: ${bad} gagal dari ${n}`);
  return bad === 0 ? 0 : 1;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG && process.argv.includes('--uji')) process.exit(await uji());
