#!/usr/bin/env node
/**
 * uji-mcp-gerbang — uji HIDUP kait gerbang jebakan di jalur MCP yang sesungguhnya
 * (doc 85 A5/A6, gerbang 6 disiplin: E2E di endpoint nyata, bukan happy-path).
 *
 * Menjalankan `mcp/server.js` sebagai PROSES TERPISAH dengan env GERBANG=<moda>
 * (tidak menyentuh konfigurasi MCP Fahmi di ~/.claude.json), berbicara JSON-RPC
 * lewat stdio persis seperti Claude Code, memanggil `migancore_tanya`, lalu
 * memeriksa: (on) catatan kaki gerbang muncul & telemetri bertambah;
 * (shadow) jawaban TANPA catatan kaki & telemetri tetap bertambah; (off) tidak ada
 * telemetri baru.
 *
 * Pakai: node eval/uji-mcp-gerbang.mjs [on|shadow|off] ["pertanyaan"]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const TELEMETRI = path.join(AKAR, 'eval', 'telemetri-gerbang-mcp.jsonl');
const moda = process.argv[2] || 'on';
const q = process.argv[3] || 'Kenapa pemerintah mencabut seluruh kuota ekspor rotan mentah pada 2024 dan menggantinya dengan kuota briket?';

function hitungBaris(f) { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } }

async function utama() {
  const sebelum = hitungBaris(TELEMETRI);
  const anak = spawn(process.execPath, [path.join(AKAR, 'mcp', 'server.js')], {
    cwd: AKAR,
    env: { ...process.env, GERBANG: moda, GERBANG_PROBE: process.env.GERBANG_PROBE || 'migancore:0.4-qwen3', MIGANCORE_MODEL: process.env.MIGANCORE_MODEL || 'migancore:0.14' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = '';
  const jawaban = new Map();
  anak.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const baris = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!baris) continue;
      try { const m = JSON.parse(baris); if (m.id != null) jawaban.set(m.id, m); } catch { /* bukan JSON */ }
    }
  });
  let galatServer = '';
  anak.stderr.on('data', (d) => { galatServer += d.toString(); });
  const kirim = (o) => anak.stdin.write(JSON.stringify(o) + '\n');
  const tunggu = (id, ms) => new Promise((res, rej) => {
    const t0 = Date.now();
    const jam = setInterval(() => {
      if (jawaban.has(id)) { clearInterval(jam); res(jawaban.get(id)); }
      else if (Date.now() - t0 > ms) { clearInterval(jam); rej(new Error(`tidak ada balasan id ${id} dalam ${ms} ms; stderr: ${galatServer.slice(0, 300)}`)); }
    }, 100);
  });

  kirim({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'uji-mcp-gerbang', version: '0' } } });
  const init = await tunggu(1, 15000);
  kirim({ jsonrpc: '2.0', method: 'notifications/initialized' });
  console.log(`# server: ${init.result?.serverInfo?.name || '?'} · moda GERBANG=${moda} · telemetri sebelum: ${sebelum} baris`);
  const t0 = Date.now();
  kirim({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'migancore_tanya', arguments: { pertanyaan: q } } });
  const r = await tunggu(2, 240000);
  const teks = r.result?.content?.map((c) => c.text).join('\n') || JSON.stringify(r.error || r).slice(0, 400);
  const detik = Math.round((Date.now() - t0) / 1000);
  // shadow: probe berjalan SESUDAH jawaban terkirim (fire-and-forget) — di Claude Code
  // server tetap hidup; di sini harus ditunggu dulu sebelum dibunuh (≤60 dtk).
  if (moda === 'shadow') {
    const t1 = Date.now();
    while (hitungBaris(TELEMETRI) <= sebelum && Date.now() - t1 < 60000) await new Promise((res) => setTimeout(res, 500));
  }
  anak.kill();

  const sesudah = hitungBaris(TELEMETRI);
  const adaKakiGerbang = /🚧 gerbang jebakan/.test(teks);
  const barisBaru = sesudah - sebelum;
  console.log(`\n## jawaban (${detik}s):\n${teks.slice(0, 900)}\n`);
  console.log(`## catatan kaki gerbang: ${adaKakiGerbang ? 'ADA' : 'tidak ada'} · telemetri bertambah: ${barisBaru} baris`);
  if (barisBaru > 0) console.log('## telemetri terakhir:', fs.readFileSync(TELEMETRI, 'utf8').trim().split('\n').pop().slice(0, 300));

  const harapan = {
    on: adaKakiGerbang && barisBaru >= 1,
    shadow: !adaKakiGerbang && barisBaru >= 1,
    off: !adaKakiGerbang && barisBaru === 0,
  }[moda];
  console.log(`\nVONIS uji hidup (${moda}): ${harapan ? 'LULUS' : 'GAGAL'}`);
  if (galatServer.trim()) console.log('stderr server:', galatServer.slice(0, 400));
  process.exit(harapan ? 0 : 1);
}

utama().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
