#!/usr/bin/env node
/**
 * pindah-model.mjs — salin model ollama dari laptop ke mesin kedua (Bmax).
 *
 * Kenapa bukan `scp -r` seluruh gudang: gudang laptop 39 GB dan sebagian besar
 * isinya model yang tidak dipakai. Alat ini menyalin HANYA blob yang benar-benar
 * dirujuk tag yang diminta, dan blob bersama dihitung sekali.
 *
 * Kenapa ada verifikasi digest: nama berkas blob ollama ADALAH sha256 isinya.
 * Jadi kebenaran salinan bisa dibuktikan, bukan diasumsikan — dan itu wajib,
 * karena bobot yang rusak separuh tidak berteriak; ia menjawab dengan salah.
 * (Kelas kegagalan yang sama dengan C29/C38: yang diukur harus terbukti
 * identik dengan yang dilayankan.)
 *
 * Blob yang SUDAH ada di tujuan dengan ukuran benar dilewati — jadi alat ini
 * aman diulang (idempoten) kalau jaringan putus di tengah.
 *
 * Pakai:
 *   node flywheel/pindah-model.mjs 0.14 0.4-qwen3 uji-jujur-1
 *   node flywheel/pindah-model.mjs --uji            (uji logika, tanpa jaringan)
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { jalankan, BMAX } from './bmax.mjs';

const GUDANG_LOKAL = process.env.OLLAMA_MODELS
  || path.join(os.homedir(), '.ollama', 'models');
const GUDANG_JAUH = '<local-dir>/models';
const PUSTAKA = 'manifests/registry.ollama.ai/library/migancore';

const H = '\x1b[32m', M = '\x1b[31m', A = '\x1b[2m', R = '\x1b[0m';

/** Baca manifes satu tag -> daftar {digest, size}. Melempar kalau tak ada. */
export function bacaManifes(gudang, tag) {
  const f = path.join(gudang, PUSTAKA, tag);
  if (!fs.existsSync(f)) throw new Error(`manifes tidak ada: ${f}`);
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  return [m.config, ...m.layers].map((x) => ({ digest: x.digest, size: x.size }));
}

/** Gabung blob dari banyak tag; blob bersama muncul SEKALI. */
export function blobUnik(gudang, tags) {
  const peta = new Map();
  for (const t of tags) for (const b of bacaManifes(gudang, t)) peta.set(b.digest, b.size);
  return [...peta].map(([digest, size]) => ({ digest, size }));
}

/** sha256:abc… -> nama berkas di disk (ollama memakai tanda hubung). */
export const namaBlob = (digest) => digest.replace(':', '-');

function scp(sumber, tujuan) {
  const r = spawnSync('scp', [
    '-q', '-i', BMAX.kunci,
    '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'LogLevel=ERROR',
    sumber, `${BMAX.pengguna}@${BMAX.inang}:${tujuan}`,
  ], { encoding: 'utf8', timeout: 60 * 60 * 1000 });
  return { ok: r.status === 0, galat: (r.stderr || '').trim() };
}

// ────────────────────────────────────────────────────────────── uji ──
const LANGSUNG = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('pindah-model.mjs');

if (LANGSUNG && process.argv.includes('--uji')) {
  let ok = 0, bad = 0;
  const cek = (n, c, k = '') => { if (c) { ok++; console.log(`  OK    ${n}`); } else { bad++; console.log(`  GAGAL ${n}${k ? ' — ' + k : ''}`); } };
  console.log('# Uji pindah-model (tanpa jaringan)\n');

  cek('digest -> nama berkas memakai tanda hubung',
    namaBlob('sha256:abc123') === 'sha256-abc123');

  const b = blobUnik(GUDANG_LOKAL, ['0.14']);
  cek('manifes 0.14 terbaca', b.length >= 2, `${b.length} blob`);
  cek('tiap blob punya digest sha256 + ukuran > 0',
    b.every((x) => /^sha256:[0-9a-f]{64}$/.test(x.digest) && x.size > 0));

  const gabung = blobUnik(GUDANG_LOKAL, ['0.14', '0.14']);
  cek('tag yang sama dua kali TIDAK menggandakan blob', gabung.length === b.length);

  let lempar = false;
  try { bacaManifes(GUDANG_LOKAL, 'tag-yang-tidak-ada-xyz'); } catch { lempar = true; }
  cek('tag tak ada = GAGAL KERAS, bukan diam', lempar);

  console.log(`\n${ok} lulus · ${bad} gagal\n`);
  process.exit(bad ? 1 : 0);
}

// ──────────────────────────────────────────────────────────── jalan ──
if (LANGSUNG && !process.argv.includes('--uji')) {
  const tags = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!tags.length) {
    console.error('Pakai: node flywheel/pindah-model.mjs <tag> [tag...]');
    process.exit(2);
  }

  const blob = blobUnik(GUDANG_LOKAL, tags);
  const total = blob.reduce((a, c) => a + c.size, 0);
  console.log(`\n# pindah-model -> ${BMAX.inang}`);
  console.log(`  tag  : ${tags.join(' · ')}`);
  console.log(`  blob : ${blob.length} unik · ${(total / 1e9).toFixed(2)} GB\n`);

  // apa yang SUDAH ada di sana (lewati yang ukurannya sudah benar)
  const daftar = jalankan(`
    $b = "${GUDANG_JAUH}/blobs"
    if (Test-Path $b) { Get-ChildItem $b -File | ForEach-Object { "$($_.Name) $($_.Length)" } }
  `);
  const sudah = new Map();
  for (const baris of daftar.keluaran.split(/\r?\n/)) {
    const [n, s] = baris.trim().split(/\s+/);
    if (n) sudah.set(n, Number(s));
  }

  let dikirim = 0, dilewati = 0;
  for (const [i, b] of blob.entries()) {
    const nama = namaBlob(b.digest);
    if (sudah.get(nama) === b.size) {
      console.log(`  ${A}[${i + 1}/${blob.length}] lewati ${nama.slice(0, 20)}… sudah ada${R}`);
      dilewati++;
      continue;
    }
    const mb = (b.size / 1e6).toFixed(0);
    process.stdout.write(`  [${i + 1}/${blob.length}] kirim ${nama.slice(0, 20)}… ${mb} MB `);
    const t0 = Date.now();
    const r = scp(path.join(GUDANG_LOKAL, 'blobs', nama), `${GUDANG_JAUH}/blobs/${nama}`);
    if (!r.ok) { console.log(`${M}GAGAL${R} ${r.galat}`); process.exit(1); }
    const dtk = (Date.now() - t0) / 1000;
    console.log(`${H}ok${R} ${A}${dtk.toFixed(0)}s · ${(b.size / 1e6 / dtk).toFixed(1)} MB/s${R}`);
    dikirim++;
  }

  for (const t of tags) {
    const r = scp(path.join(GUDANG_LOKAL, PUSTAKA, t), `${GUDANG_JAUH}/${PUSTAKA}/${t}`);
    if (!r.ok) { console.log(`  ${M}manifes ${t} GAGAL${R} ${r.galat}`); process.exit(1); }
  }
  console.log(`\n  manifes ${tags.length} tag terkirim`);

  // VERIFIKASI: nama berkas blob = sha256 isinya, jadi kebenarannya bisa DIBUKTIKAN
  console.log(`\n  ${A}memverifikasi digest di ${BMAX.inang} (butuh semenit)…${R}`);
  const v = jalankan(`
    $rusak = 0; $ok = 0
    Get-ChildItem "${GUDANG_JAUH}/blobs" -File | ForEach-Object {
      $harap = $_.Name -replace '^sha256-',''
      $nyata = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
      if ($harap -ne $nyata) { $rusak++; "RUSAK $($_.Name)" } else { $ok++ }
    }
    "RINGKAS $ok utuh, $rusak rusak"
  `, { batasDetik: 1800 });
  console.log('  ' + v.keluaran.split(/\r?\n/).join('\n  '));

  const l = jalankan('& "$env:LOCALAPPDATA\\Programs\\Ollama\\ollama.exe" list');
  console.log(`\n  ${A}ollama list di ${BMAX.inang}:${R}\n  ` + l.keluaran.split(/\r?\n/).join('\n  '));
  console.log(`\n${dikirim} dikirim · ${dilewati} dilewati\n`);
}
