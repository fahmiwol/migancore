#!/usr/bin/env node
/**
 * ragam-prompt.mjs — turunkan cluster dengan SYSTEM PROMPT DIROTASI, jawaban & soal IDENTIK.
 *
 * ============================== KENAPA (H-prompt-ragam, 23 Agu) =============
 * Run kontrol & dua varian hiperparameter (wd, epoch) membuktikan: kerusakan
 * naskah v13 TERIKAT PROMPT (C20) — rata-rata 0/2 di bawah prompt latih dominan,
 * 2/2 di bawah prompt gerbang; epoch hanya memindahkan di prompt mana rusaknya.
 * Data hitung: 70% baris memakai SATU prompt identitas. Literatur: system prompt
 * tetap saat latih menjadi "kunci" perilaku (Qi 2023 arXiv 2310.03693;
 * template-anchored 2502.13946); obatnya latih dengan >=3 parafrasa + porsi
 * tanpa prompt. Ini PERUBAHAN DATA tanpa jawaban baru — tidak menyentuh aturan
 * "jangan latih dari output model lain".
 *
 * Ember (deterministik lewat hash id + garam, supaya sidik tetap):
 *   A 30%  prompt identitas asli (dominan di data)
 *   G 25%  prompt gerbang (eval/prompt-gerbang.json)
 *   P 20%  parafrasa A (makna sama, kata beda)
 *   N 25%  tanpa system prompt
 * G+N = 50% -> paritas prompt "penuh" (periksa-prompt-paritas).
 *
 * Pakai: node ragam-prompt.mjs <masuk.jsonl> <keluar.jsonl> [garam]
 *        node ragam-prompt.mjs --uji-instrumen
 */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DIR, '..');

export const PROMPT = {
  A: 'Kamu MiganCore, agent AI milik Fahmi Ghani. Kerjakan bertahap dan tunjukkan langkahnya. Periksa hasilmu sendiri sebelum menjawab. Kalau kamu tidak yakin, katakan tidak yakin — jangan menyodorkan angka atau kesimpulan yang belum kamu cek.',
  G: null, // diisi dari eval/prompt-gerbang.json
  P: 'Kamu MiganCore, asisten Fahmi Ghani. Hitung selangkah demi selangkah, tuliskan tiap hasil antara, lalu cek ulang sebelum menyimpulkan. Kalau ragu, katakan ragu — jangan mengarang angka.',
  N: null,
};
export const EMBER = [['A', 0.30], ['G', 0.25], ['P', 0.20], ['N', 0.25]];

export function ember(id, garam = 'ragam-prompt-23agu') {
  const h = crypto.createHash('sha256').update(`${garam}:${id}`).digest();
  const u = h.readUInt32BE(0) / 0xffffffff; // 0..1
  let acc = 0;
  for (const [k, p] of EMBER) { acc += p; if (u < acc) return k; }
  return EMBER[EMBER.length - 1][0];
}

/** Baris yang system prompt-nya memuat daftar alat (JSON tool spec / <tools>) TIDAK dirotasi:
 *  jawabannya memanggil alat yang didefinisikan di situ. */
export function berDaftarAlat(b) {
  const s = b.conversations?.[0];
  return s?.from === 'system' && /<tools>|"name"\s*:\s*"[a-z_]+"\s*,\s*"description"/i.test(s.value);
}

/**
 * @param opsi.pertahankanAsli  ember A = prompt ASLI baris (apa pun itu), bukan PROMPT.A tetap.
 *                              Dipakai untuk cluster selain hitung (gaya: prompt dominan berbeda).
 * @param opsi.parafrasa        teks ember P untuk cluster ini (bawaan PROMPT.P milik hitung).
 */
export function turunkan(baris, promptG, garam, opsi = {}) {
  const hitung = { A: 0, G: 0, P: 0, N: 0, X: 0 };
  const P = opsi.parafrasa || PROMPT.P;
  const keluar = baris.map((b, i) => {
    if (berDaftarAlat(b)) { hitung.X++; return { ...b, promptRagam: 'X' }; } // dikecualikan, utuh
    const id = b.id ?? String(i);
    const k = ember(id, garam);
    hitung[k]++;
    const asli = b.conversations[0]?.from === 'system' ? b.conversations[0].value : null;
    const conv = b.conversations.filter((m) => m.from !== 'system');
    const sistem = k === 'A' ? (opsi.pertahankanAsli ? asli : PROMPT.A) : k === 'G' ? promptG : k === 'P' ? P : null;
    return { ...b, conversations: sistem ? [{ from: 'system', value: sistem }, ...conv] : conv, promptRagam: k };
  });
  return { keluar, hitung };
}

function bacaJsonl(p) { return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); }
const promptGerbang = () => JSON.parse(fs.readFileSync(path.join(AKAR, 'eval', 'prompt-gerbang.json'), 'utf8')).dasar;

// ── PENJAGA ENTRYPOINT ──────────────────────────────────────────────────────
// Tanpa ini, MENGIMPOR berkas ini menjalankan CLI-nya dan proses pemanggil
// langsung mati dengan pesan 'pakai: node ragam-prompt.mjs ...'. Akibatnya
// siapa pun yang butuh PROMPT.A terpaksa MENYALINnya — dan salinan itu akan
// menyimpang diam-diam, persis penyakit aturan-nomor yang pernah ditulis tiga
// kali di tiga berkas. Modul yang tidak bisa diimpor MEMAKSA duplikasi.
const DIJALANKAN_LANGSUNG = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('ragam-prompt.mjs');

if (DIJALANKAN_LANGSUNG && process.argv.includes('--uji-instrumen')) {
  const kasus = [];
  const cek = (n, ok) => kasus.push([n, ok]);
  const G = 'PROMPT GERBANG';
  const baris = Array.from({ length: 2000 }, (_, i) => ({ id: `r${i}`, conversations: [{ from: 'system', value: 'LAMA' }, { from: 'human', value: `q${i}` }, { from: 'gpt', value: `j${i}` }] }));
  const { keluar, hitung } = turunkan(baris, G, 'uji');
  cek('jumlah baris tetap', keluar.length === 2000);
  cek('soal & jawaban identik per baris', keluar.every((b, i) => b.conversations.at(-1).value === `j${i}` && b.conversations.find((m) => m.from === 'human').value === `q${i}`));
  cek('ember A ~30% (±3)', Math.abs(hitung.A / 2000 - 0.30) < 0.03);
  cek('ember G ~25% (±3)', Math.abs(hitung.G / 2000 - 0.25) < 0.03);
  cek('ember P ~20% (±3)', Math.abs(hitung.P / 2000 - 0.20) < 0.03);
  cek('ember N ~25% (±3) = tanpa system', Math.abs(hitung.N / 2000 - 0.25) < 0.03 && keluar.filter((b) => b.conversations[0].from !== 'system').length === hitung.N);
  cek('G+N ~50% (±3; paritas penuh diputuskan pada data NYATA oleh periksa-prompt-paritas)', Math.abs((hitung.G + hitung.N) / 2000 - 0.5) < 0.03);
  cek('deterministik: jalankan 2x = sama', JSON.stringify(turunkan(baris, G, 'uji').keluar) === JSON.stringify(keluar));
  cek('garam beda = pembagian beda', JSON.stringify(turunkan(baris, G, 'lain').hitung) !== JSON.stringify(hitung) || turunkan(baris, G, 'lain').keluar.some((b, i) => b.promptRagam !== keluar[i].promptRagam));
  cek('prompt lama tidak tersisa', keluar.every((b) => !b.conversations.some((m) => m.from === 'system' && m.value === 'LAMA')));
  // pertahankanAsli + pengecualian daftar alat
  const alat = { id: 'alat1', conversations: [{ from: 'system', value: 'Kamu punya akses tools berikut (format JSON): [{"name":"brain_search","description":"cari"}]' }, { from: 'human', value: 'q' }, { from: 'gpt', value: '<tool_call>{"name":"brain_search"}</tool_call>' }] };
  const r2 = turunkan([...baris.slice(0, 400), alat], G, 'uji', { pertahankanAsli: true, parafrasa: 'PARA' });
  cek('pertahankanAsli: ember A memakai prompt asli baris (LAMA), bukan PROMPT.A', r2.keluar.filter((b) => b.promptRagam === 'A').every((b) => b.conversations[0].value === 'LAMA'));
  cek('parafrasa per cluster dipakai di ember P', r2.keluar.filter((b) => b.promptRagam === 'P').every((b) => b.conversations[0].value === 'PARA'));
  cek('baris ber-daftar-alat dikecualikan utuh (X)', r2.hitung.X === 1 && r2.keluar.at(-1).promptRagam === 'X' && /brain_search/.test(r2.keluar.at(-1).conversations[0].value));
  cek('bawaan (tanpa opsi) tetap deterministik sama seperti sebelumnya', JSON.stringify(turunkan(baris, G, 'uji').keluar) === JSON.stringify(keluar));
  cek('prompt A di data NYATA = teks A', (() => { try { const nyata = bacaJsonl(path.join(DIR, 'dataset', 'v13', 'cluster-hitung.jsonl')); return nyata.some((b) => b.conversations[0]?.value === PROMPT.A); } catch { return true; } })());
  let gagal = 0;
  for (const [n, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${n}`); if (!ok) gagal++; }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

if (!DIJALANKAN_LANGSUNG) { /* diimpor sebagai modul — CLI tidak dijalankan */ } else {
const argv = process.argv.slice(2);
const posisi = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--parafrasa'));
const [masuk, keluarP, garam = 'ragam-prompt-23agu'] = posisi;
const opsi = { pertahankanAsli: argv.includes('--pertahankan-asli'), parafrasa: argv.includes('--parafrasa') ? argv[argv.indexOf('--parafrasa') + 1] : undefined };
if (!masuk || !keluarP) { console.error('pakai: node ragam-prompt.mjs <masuk.jsonl> <keluar.jsonl> [garam] [--pertahankan-asli] [--parafrasa "teks"] | --uji-instrumen'); process.exit(2); }
const baris = bacaJsonl(masuk);
const { keluar, hitung } = turunkan(baris, promptGerbang(), garam, opsi);
fs.writeFileSync(keluarP, keluar.map((b) => JSON.stringify(b)).join('\n') + '\n', 'utf8');
console.log(`${baris.length} baris -> ${keluarP}`);
for (const k of ['A', 'G', 'P', 'N', 'X']) console.log(`  ${k}: ${hitung[k]} (${(100 * hitung[k] / baris.length).toFixed(1)}%)${k === 'X' ? ' (dikecualikan: ber-daftar-alat)' : ''}`);
console.log(`  G+N = ${(100 * (hitung.G + hitung.N) / baris.length).toFixed(1)}% (paritas penuh bila >= 50%)`);

}