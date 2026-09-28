#!/usr/bin/env node
/**
 * siapkan-skor.mjs — GERBANG-S1: berkas MASUKAN skor_s1.py (lem antara pelari dan encoder beku).
 *
 *   T1: satu baris per jawaban P bukan-GALAT dari 16 pasangan SAH pertama (inti-s1 pilihPasanganSah) →
 *       { lengan:'P', putaran, id, sha, soal, jawaban }; sha = shaJawaban(q, teks) diteruskan skor_s1.py (tinjauan putaran 2, B3).
 *       Kunci (putaran, id) inilah yang dibaca pemuat vonis dari skor-T1-S/Sq; baris G tidak diskor (G punya probe sendiri).
 *   T2: satu baris per jawaban bukan-GALAT yang soalnya TIDAK dibuang audit kebocoran → { id, sampel, sha, soal, jawaban }.
 *       Dijalankan SESUDAH beku (jawaban T2 tidak dibuka/dilabel sebelum encoder dibekukan — pra-daftar uji.T2_v1_2).
 *
 * Satu masukan dipakai untuk S dan S_q (mode dipilih di skor_s1.py). Baris pertama berkas = pemanasan di skor_s1.py.
 *
 *   node eval/gerbang-s1/siapkan-skor.mjs --t1 --stempel <s> [--dir hasil-uji] <keluar.jsonl>
 *   node eval/gerbang-s1/siapkan-skor.mjs --t2 --jawab <jawaban-uji2.jsonl> --soal <soal-uji2.jsonl> --kecuali <audit-bocor.json> <keluar.jsonl>
 *   node eval/gerbang-s1/siapkan-skor.mjs --uji
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const { bacaPutaran, DIR_HASIL, pilihPasanganSah, shaJawaban } = await import(pathToFileURL(path.join(DI_SINI, 'inti-s1.mjs')).href);
const bacaJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** put = { P, G } (bacaPutaran) → baris masukan T1 dari 16 pasangan sah pertama; melempar bila aturan berhenti dilanggar. */
export function barisT1(put) {
  const pil = pilihPasanganSah(put);
  // Hanya kekurangan pasangan sah yang menghentikan persiapan; pelanggaran aturan berhenti dicatat pemuat vonis sebagai TIDAK_SAH.
  if (!pil.lengkap) throw new Error(`pasangan sah ${pil.terpilih.length}/16 · masalah: ${pil.masalah.join('; ') || '-'}`);
  if (pil.masalah.length) console.error(`PERINGATAN aturan berhenti: ${pil.masalah.join('; ')} — hanya 16 pasangan sah pertama yang disiapkan`);
  return pil.terpilih.flatMap((p) => put.P.get(p).baris.filter((b) => b.hasil !== 'GALAT')
    .map((b) => ({ lengan: 'P', putaran: p, id: b.soal.id, sha: shaJawaban(b.soal.q, b.teks), soal: b.soal.q, jawaban: b.teks })));
}
/** Baris masukan T2: buang GALAT dan id audit; soal diambil dari berkas soal (bukan dari jawaban). */
export function barisT2(soal, jawab, buang) {
  const Q = new Map(soal.map((s) => [s.id, s.q]));
  const keluar = jawab.filter((j) => j.hasil !== 'GALAT' && !buang.has(j.id)).map((j) => {
    if (!Q.has(j.id)) throw new Error(`jawaban T2 untuk soal tak dikenal: ${j.id}`);
    return { id: j.id, sampel: j.sampel, sha: shaJawaban(Q.get(j.id), j.teks), soal: Q.get(j.id), jawaban: j.teks };
  });
  const kunci = new Set(keluar.map((x) => `${x.id}#${x.sampel}`));
  if (kunci.size !== keluar.length) throw new Error('kunci (id, sampel) T2 ganda');
  return keluar;
}

function uji() {
  let gagal = 0; const cek = (n, ok) => { console.log(`${ok ? '✓' : '✗'} ${n}`); if (!ok) gagal++; };
  const s = (id) => ({ id, q: `q-${id}`, jenis: 'fakta' });
  const bs = (galat) => ({ baris: Array.from({ length: 10 }, (_, i) => ({ soal: s(i ? `X${i}` : 'A'), hasil: i < galat ? 'GALAT' : 'BENAR', teks: `t${i}` })) });
  const mk = (n, galatPada = new Set()) => ({ P: new Map(Array.from({ length: n }, (_, i) => [i + 1, bs(galatPada.has(i + 1) ? 5 : 0)])), G: new Map(Array.from({ length: n }, (_, i) => [i + 1, bs(0)])) });
  const t1 = barisT1(mk(16));
  cek('T1: satu baris per jawaban P bukan-GALAT, kunci (putaran, id), sha = shaJawaban(q, teks)', t1.length === 160 && t1[0].putaran === 1 && t1[0].id === 'A' && t1[0].soal === 'q-A' && t1.every((x) => x.lengan === 'P' && x.sha === shaJawaban(x.soal, x.jawaban)));
  const ganti3 = barisT1(mk(17, new Set([3])));
  cek('T1: pasangan 3 tidak sah (GALAT 50 %) → dipakai pasangan 1,2,4..17', !ganti3.some((x) => x.putaran === 3) && ganti3.some((x) => x.putaran === 17) && new Set(ganti3.map((x) => x.putaran)).size === 16);
  let lempar = false; try { barisT1(mk(15)); } catch { lempar = true; }
  cek('T1: kurang dari 16 pasangan sah → menolak', lempar);
  const lebih = barisT1(mk(18));
  cek('T1: pasangan sesudah pasangan sah ke-16 diabaikan (pemuat vonis yang menyatakan TIDAK_SAH)', !lebih.some((x) => x.putaran > 16) && new Set(lebih.map((x) => x.putaran)).size === 16);
  const soal = [s('U1'), s('U2'), s('U3')];
  const jawab = [{ id: 'U1', sampel: 1, hasil: 'BENAR', teks: 'x' }, { id: 'U1', sampel: 2, hasil: 'GALAT', teks: '' }, { id: 'U2', sampel: 1, hasil: 'NGARANG', teks: 'y' }, { id: 'U3', sampel: 1, hasil: 'BENAR', teks: 'z' }];
  const t2 = barisT2(soal, jawab, new Set(['U3']));
  cek('T2: GALAT & id buang audit dikeluarkan, kunci (id, sampel), sha terikat', t2.length === 2 && t2.every((x) => x.id !== 'U3') && t2[0].soal === 'q-U1' && t2[0].sampel === 1 && t2[0].sha === shaJawaban('q-U1', 'x'));
  lempar = false; try { barisT2(soal, [...jawab, { id: 'U1', sampel: 1, hasil: 'BENAR', teks: 'dup' }], new Set()); } catch { lempar = true; }
  cek('T2: kunci ganda → menolak', lempar);
  console.log(gagal ? `${gagal} uji gagal` : 'siapkan-skor: semua uji lulus'); return gagal ? 1 : 0;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(uji());
  const opsi = (n) => (arg.includes(n) ? arg[arg.indexOf(n) + 1] : undefined);
  const fKeluar = arg[arg.length - 1];
  if (!fKeluar || fKeluar.startsWith('--')) { console.error('pakai: --t1 --stempel <s> [--dir d] <keluar> | --t2 --jawab <f> --soal <f> --kecuali <audit> <keluar> | --uji'); process.exit(2); }
  if (fs.existsSync(fKeluar)) { console.error(`BERHENTI: ${fKeluar} sudah ada`); process.exit(1); }
  let baris;
  if (arg.includes('--t1')) {
    const stempel = opsi('--stempel');
    if (!stempel) { console.error('BERHENTI: --stempel wajib'); process.exit(2); }
    baris = barisT1(bacaPutaran(stempel, opsi('--dir') || DIR_HASIL));
  } else if (arg.includes('--t2')) {
    if (!opsi('--jawab') || !opsi('--soal') || !opsi('--kecuali')) { console.error('BERHENTI: --jawab, --soal, --kecuali wajib'); process.exit(2); }
    const buang = new Set((JSON.parse(fs.readFileSync(opsi('--kecuali'), 'utf8')).buang || []).map((b) => (typeof b === 'string' ? b : b.id)));
    baris = barisT2(bacaJsonl(opsi('--soal')), bacaJsonl(opsi('--jawab')), buang);
  } else { console.error('pilih --t1 atau --t2'); process.exit(2); }
  fs.writeFileSync(fKeluar, baris.map((b) => JSON.stringify(b)).join('\n') + '\n');
  console.log(`${baris.length} baris masukan skor → ${fKeluar}`);
}
