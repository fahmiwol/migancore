#!/usr/bin/env node
/**
 * uji-nalar-alat — MENJAWAB SATU PERTANYAAN DENGAN ANGKA:
 * apakah membungkus model dengan ORKESTRATOR (alat + loop) benar-benar membuatnya
 * lebih pintar, atau itu cuma asumsi?
 *
 * Pertanyaan Fahmi (3 Sep, disarikan): apakah model bekerja lebih baik di dalam orkestrator,
 * framework, atau pembungkus yang lebih kokoh (mis. Hermes, Cursor, OpenRouter)? Jawabannya
 * harus datang dari percobaan, bukan asumsi.
 *
 * Bank nalar adalah tempat terbaik untuk menjawabnya, dan alasannya sama dengan
 * alasan OpenAI Five (Dota) berhasil: **sinyal benar/salahnya otomatis dan tak
 * terbatas**. Soalnya dihasilkan program dengan angka acak, jawabannya DIHITUNG
 * bukan dilabeli, dan tiap soal membawa jebakan yang "kelihatan benar". Tidak ada
 * juri, tidak ada label karangan, tidak ada biaya per soal.
 *
 * Dua moda, satu instrumen (C29 — `nilai()` diimpor dari pelari polos, bukan
 * disalin; salinan penilai yang menyimpang akan membuat selisihnya bohong):
 *   polos  : model menjawab sendiri (angka pembanding sudah ada di repo)
 *   alat   : lewat `migancore_agent` di jalur MCP nyata — punya kalkulator, loop
 *            tool-call, dan penjaga sitasi. Inilah "aplikasi yang robust" itu.
 *
 * Yang diukur bukan cuma benar/salah, tapi juga BERAPA KALI model tergelincir ke
 * jawaban jebakan — karena kalkulator seharusnya menyelamatkan justru di situ.
 *
 * Pakai: node eval/uji-nalar-alat.mjs [--n 24] [--model migancore:0.14]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nilai, SISTEM } from './uji-nalar.mjs';
import { jagaAcuan } from './kunci-acuan.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const arg = process.argv.slice(2);
const ambil = (n, d) => (arg.includes(n) ? arg[arg.indexOf(n) + 1] : d);
const N = Number(ambil('--n', 24));
const MODEL = ambil('--model', 'migancore:0.14');
const MODA = ambil('--moda', 'alat');

// Penjaga acuan: berkas hasil pelari ini ikut dibaca gerbang regresi, jadi
// mengukur ulang acuan yang terkunci pra-daftar aktif menggeser angka yang
// ambang menangnya sudah dihitung dari situ (C38).
jagaAcuan(MODEL, { izin: process.argv.includes('--acuan-sengaja'), apa: 'uji-nalar-alat' });

function bacaBank() {
  const f = path.join(DI_SINI, 'bank-nalar.jsonl');
  const baris = fs.readFileSync(f, 'utf8').split('\n').filter((b) => b.trim()).map((b) => JSON.parse(b));
  // Deduplikasi berdasarkan teks soal: bank menulis banyak varian acak, dan
  // mengukur soal yang sama dua kali hanya melipatgandakan derau.
  const unik = new Map();
  for (const s of baris) if (!unik.has(s.tanya)) unik.set(s.tanya, s);
  return [...unik.values()].slice(0, N);
}

async function lewatAgent(soal) {
  const anak = spawn(process.execPath, [path.join(AKAR, 'mcp', 'server.js')], {
    cwd: AKAR,
    env: { ...process.env, GERBANG: 'off', MIGANCORE_MODEL: MODEL },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = '';
  const jawaban = new Map();
  anak.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const b = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!b) continue;
      try { const m = JSON.parse(b); if (m.id != null) jawaban.set(m.id, m); } catch { /* bukan JSON */ }
    }
  });
  let err = '';
  anak.stderr.on('data', (d) => { err += d.toString(); });
  const kirim = (o) => anak.stdin.write(JSON.stringify(o) + '\n');
  const tunggu = (id, ms) => new Promise((res, rej) => {
    const t0 = Date.now();
    const jam = setInterval(() => {
      if (jawaban.has(id)) { clearInterval(jam); res(jawaban.get(id)); }
      else if (Date.now() - t0 > ms) { clearInterval(jam); rej(new Error(`tak ada balasan; stderr: ${err.slice(0, 160)}`)); }
    }, 100);
  });

  kirim({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'uji-nalar-alat', version: '0' } } });
  await tunggu(1, 20000);
  kirim({ jsonrpc: '2.0', method: 'notifications/initialized' });

  const hasil = [];
  for (let i = 0; i < soal.length; i++) {
    const id = 200 + i;
    kirim({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'migancore_agent', arguments: { pertanyaan: soal[i].tanya } } });
    const t0 = Date.now();
    try {
      const r = await tunggu(id, 300000);
      const teks = r.result?.content?.map((c) => c.text).join('\n') || '';
      const pakaiAlat = /hitung\(|Jejak alat/i.test(teks);
      hasil.push({ soal: soal[i], jawab: teks, pakaiAlat, ms: Date.now() - t0 });
      process.stdout.write(pakaiAlat ? '#' : '.');
    } catch (e) {
      hasil.push({ soal: soal[i], jawab: `(GAGAL: ${e.message})`, pakaiAlat: false, ms: Date.now() - t0 });
      process.stdout.write('!');
    }
  }
  process.stdout.write('\n');
  anak.kill();
  return hasil;
}

/**
 * Moda POLOS di pelari yang SAMA — supaya perbandingannya BERPASANGAN.
 * Angka polos lama di repo (0.14k 29/42) TIDAK boleh diadu langsung dengan moda alat:
 * soalnya berbeda (42 dengan varian acak vs 24 unik) dan itu persis kelas kesalahan
 * yang sudah dua kali nyaris terjadi hari ini (A9 recall artefak, A7 metrik salah).
 * Prompt sistem diimpor dari pelari polos, bukan ditulis ulang.
 */
async function lewatPolos(soal) {
  const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  const hasil = [];
  for (const s of soal) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, stream: false, options: { temperature: 0.2, num_ctx: 8192 }, messages: [{ role: 'system', content: SISTEM }, { role: 'user', content: s.tanya }] }),
      });
      const d = await r.json();
      const teks = (d.message && d.message.content ? d.message.content : '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      hasil.push({ soal: s, jawab: teks, pakaiAlat: false, ms: Date.now() - t0 });
      process.stdout.write('.');
    } catch (e) {
      hasil.push({ soal: s, jawab: `(GAGAL: ${e.message})`, pakaiAlat: false, ms: Date.now() - t0 });
      process.stdout.write('!');
    }
  }
  process.stdout.write('\n');
  return hasil;
}

async function utama() {
  const soal = bacaBank();
  console.log(`# uji-nalar-alat — ${soal.length} soal · model ${MODEL} · moda ${MODA.toUpperCase()}`);
  console.log('# penilai & prompt diimpor dari eval/uji-nalar.mjs — instrumen SAMA (C29)\n');
  
  const jalan = MODA === 'polos' ? await lewatPolos(soal) : await lewatAgent(soal);

  const baris = jalan.map((h) => ({ kategori: h.soal.kategori, ...nilai(h.soal, h.jawab), pakaiAlat: h.pakaiAlat, ms: h.ms }));
  const benar = baris.filter((b) => b.lulus).length;
  const kenaJebakan = baris.filter((b) => b.jebakan).length;
  const pakai = baris.filter((b) => b.pakaiAlat).length;
  const perKat = {};
  for (const b of baris) {
    perKat[b.kategori] = perKat[b.kategori] || { n: 0, lulus: 0, jebakan: 0 };
    perKat[b.kategori].n++;
    if (b.lulus) perKat[b.kategori].lulus++;
    if (b.jebakan) perKat[b.kategori].jebakan++;
  }
  console.log(`\nBENAR ${benar}/${baris.length} (${((benar / baris.length) * 100).toFixed(1)}%) · kena jebakan ${kenaJebakan} · memakai alat ${pakai}/${baris.length}`);
  for (const [k, v] of Object.entries(perKat)) console.log(`  ${k.padEnd(20)} ${v.lulus}/${v.n} benar · ${v.jebakan} kena jebakan`);
  console.log('\nPembanding moda POLOS (hasil tersimpan di repo): 0.14k 29/42 (69,0%) · gen-1 0.4-qwen3 33/42 (78,6%) · 0.8-8b 6/14 (42,9%)');
  console.log('CATATAN: n kecil dan soal tidak identik dengan run lama — bacaan ini ARAH, bukan vonis.');

  const keluar = path.join(DI_SINI, `hasil-nalar-${MODA}-${MODEL.replace(/[:/]/g, "_")}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
  fs.writeFileSync(keluar, JSON.stringify({ tanggal: new Date().toISOString(), model: MODEL, moda: MODA, n: baris.length, benar, kenaJebakan, pakaiAlat: pakai, perKat, baris }, null, 1));
  console.log(`ditulis: ${path.relative(process.cwd(), keluar)}`);
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) utama().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
