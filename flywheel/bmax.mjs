#!/usr/bin/env node
/**
 * bmax.mjs — kirim perintah PowerShell ke mesin kedua (Bmax) lewat SSH, UTUH.
 *
 * Kenapa alat ini ada, bukan sekadar `ssh host "powershell -Command ..."`:
 * perintah harus selamat melewati EMPAT lapis penafsir — bash → ssh → cmd.exe
 * → powershell. Tiap lapis memakan tanda kutip, backtick, `$`, dan `\` dengan
 * caranya sendiri. Itu persis kelas kegagalan yang sudah berulang kali kami
 * bayar (heredoc memangsa escape; backtick di `git commit -m` tersubstitusi
 * shell). Solusinya menghapus SELURUH kelas itu: naskah PowerShell dikodekan
 * UTF-16LE base64 dan dikirim lewat -EncodedCommand, sehingga tidak ada satu
 * karakter pun yang ditafsirkan lapis mana pun sebelum sampai di PowerShell.
 *
 * Pakai:
 *   node flywheel/bmax.mjs "Get-Service sshd | Format-List"
 *   node flywheel/bmax.mjs --berkas skrip.ps1
 *   echo "Get-Date" | node flywheel/bmax.mjs -
 *
 * Keluar dengan kode keluar PowerShell — jadi kegagalan GAGAL KERAS, tidak
 * tertelan pipa (pelajaran: `pip | tail` menelan kode keluar pip).
 */
'use strict';

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 18 Sep 2026: alamat Bmax sudah bergeser sekali lewat DHCP (.78 -> .17) dan diam-diam
// mematikan 13 berkas yang memakai alamat lama sebagai bawaan — tiap panggilan habis-waktu
// tanpa sebab yang jelas. Doktrin lamanya sudah benar ("pakai SIDIK MESIN, bukan IP"), tapi
// belum pernah dijalankan di kode. Sekarang alamat DITEMUKAN, bukan ditebak: coba beberapa
// calon, pakai yang port 22-nya menjawab, lalu simpan yang berhasil supaya lain kali langsung.
const INGATAN_ALAMAT = path.join(os.homedir(), '.migancore-bmax-alamat');
const CALON_ALAMAT = () => {
  const dari = [];
  if (process.env.BMAX_HOST) dari.push(process.env.BMAX_HOST);
  try { const t = fs.readFileSync(INGATAN_ALAMAT, 'utf8').trim(); if (t) dari.push(t); } catch { /* belum ada */ }
  dari.push('measure-host.local', 'MIGAN');
  return [...new Set(dari)];
};

/** Apakah port 22 di alamat ini menjawab? (cepat, tanpa membangunkan apa pun) */
function pintuTerbuka(inang, batasMs = 1500) {
  const r = spawnSync(process.platform === 'win32' ? 'powershell' : 'sh',
    process.platform === 'win32'
      ? ['-NoProfile', '-Command', `(Test-NetConnection -ComputerName '${inang}' -Port 22 -WarningAction SilentlyContinue).TcpTestSucceeded`]
      : ['-c', `nc -z -w2 ${inang} 22`],
    { encoding: 'utf8', timeout: Math.max(batasMs, 8000) });
  return process.platform === 'win32' ? /true/i.test(r.stdout || '') : r.status === 0;
}

/**
 * Temukan alamat Bmax yang hidup. Hasilnya diingat di ~/.migancore-bmax-alamat.
 * Kalau tidak ada yang menjawab, kembalikan calon pertama supaya galatnya jelas
 * ("connection timed out ke X") — bukan diam-diam memakai alamat mati.
 */
export function temukanAlamat({ diam = true, paksa = false } = {}) {
  // Penyelidikan port memakan ~3,7 dtk; jangan bayar itu tiap panggilan. Kalau alamat
  // terakhir yang BERHASIL masih segar (< 12 jam), pakai langsung. Kalau ternyata sudah
  // pindah, SSH-nya yang akan gagal terang-terangan, dan panggilan berikut menyelidik ulang.
  if (!paksa && !process.env.BMAX_HOST) {
    try {
      const st = fs.statSync(INGATAN_ALAMAT);
      const umurJam = (Date.now() - st.mtimeMs) / 36e5;
      const t = fs.readFileSync(INGATAN_ALAMAT, 'utf8').trim();
      if (t && umurJam < 12) return t;
    } catch { /* belum ada ingatan */ }
  }
  const calon = CALON_ALAMAT();
  for (const c of calon) {
    if (pintuTerbuka(c)) {
      if (c !== calon[0] && !diam) console.error(`[bmax] alamat berpindah -> ${c}`);
      try { fs.writeFileSync(INGATAN_ALAMAT, c); } catch { /* tidak fatal */ }
      return c;
    }
  }
  return calon[0];
}

export const BMAX = {
  inang: process.env.BMAX_HOST || temukanAlamat(),
  pengguna: process.env.BMAX_USER || 'migan',
  kunci: process.env.BMAX_KEY || path.join(os.homedir(), '.ssh', 'bmax_key'),
};

/** Naskah PowerShell -> argumen -EncodedCommand (UTF-16LE base64). */
export function sandikan(naskah) {
  return Buffer.from(naskah, 'utf16le').toString('base64');
}

/**
 * Jalankan naskah PowerShell di Bmax.
 * @returns {{ok:boolean, kode:number, keluaran:string, galat:string}}
 */
export function jalankan(naskah, { batasDetik = 900 } = {}) {
  const r = spawnSync('ssh', [
    '-i', BMAX.kunci,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'LogLevel=ERROR',
    '-o', 'BatchMode=yes',
    '-o', `ConnectTimeout=15`,
    `${BMAX.pengguna}@${BMAX.inang}`,
    'powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand', sandikan(naskah),
  ], { encoding: 'utf8', timeout: batasDetik * 1000, maxBuffer: 64 * 1024 * 1024 });

  // 2 Sep: tiga unduhan model (gemma/llama/mistral, 5–9 GB) DIBUNUH diam-diam oleh
  // batas 900 detik ini — ssh dimatikan, proses `ollama pull` di Bmax ikut mati,
  // keluaran kosong, dan pipa `| grep | tail` di pemanggil menelan kode keluarnya
  // (pelajaran `pip | tail` terulang). Blob tersisa di disk tapi manifes tidak
  // dibuat, jadi `ollama list` tidak memuatnya. Sekarang: lewat batas = GAGAL
  // KERAS dan BERBUNYI. Untuk kerja panjang (unduh, latih): **Scheduled Task
  // sekali-jalan (SYSTEM)**, BUKAN Start-Process — Start-Process yang dipanggil
  // dari sesi SSH yang langsung ditutup IKUT MATI (anak sesi sshd, log 0 B).
  // Register-ScheduledTask + Start-ScheduledTask dimiliki layanan penjadwal =
  // benar-benar terlepas; pantau lewat log di <local-dir>\log\.
  const lewatBatas = r.error && r.error.code === 'ETIMEDOUT';
  if (lewatBatas) {
    return { ok: false, kode: 124, keluaran: (r.stdout || '').trim(),
      galat: `DIBUNUH: lewat batas ${batasDetik} detik — proses di Bmax ikut mati. Kerja panjang harus Start-Process (lihat kepala berkas).` };
  }
  return {
    ok: r.status === 0,
    kode: r.status ?? -1,
    keluaran: (r.stdout || '').trim(),
    galat: (r.stderr || '').trim(),
  };
}

// ────────────────────────────────────────────────────────────────── jalan ──
// 25 Sep 2026: dulu `argv[1].endsWith('bmax.mjs')` — skrip LAIN yang namanya kebetulan berakhiran begitu
// (mis. ambil-bmax.mjs) lalu mengimpor modul ini ikut menjalankan blok CLI: argumennya terkirim ke Bmax
// sebagai PowerShell. Kini jalur skrip dibandingkan persis dengan berkas modul ini.
const LANGSUNG = !!process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (LANGSUNG) {
  const arg = process.argv.slice(2);
  let naskah;
  if (arg[0] === '--berkas') naskah = fs.readFileSync(arg[1], 'utf8');
  else if (arg[0] === '-') naskah = fs.readFileSync(0, 'utf8');
  else naskah = arg.join(' ');

  if (!naskah || !naskah.trim()) {
    console.error('Pakai: node flywheel/bmax.mjs "<PowerShell>" | --berkas <x.ps1> | -');
    process.exit(2);
  }

  const h = jalankan(naskah);
  if (h.keluaran) console.log(h.keluaran);
  if (h.galat) console.error(h.galat);
  process.exit(h.kode);
}
