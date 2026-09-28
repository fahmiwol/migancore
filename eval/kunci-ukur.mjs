#!/usr/bin/env node
/**
 * kunci-ukur.mjs — penjaga C15: dua pengukuran serentak pada satu Ollama.
 *
 * ============================ KENAPA INI HARUS ADA ==========================
 * 22 Agu: dua uji-aritmetika jalan bersamaan (lengan base 03:25 + lengan chatml
 * 03:43) tanpa saling tahu. Satu Ollama melayani keduanya bergantian → tiap
 * soal memicu swap model 2,5–4 GB → run 11-menit membengkak melewati 50 menit,
 * dan tidak ada satu pun yang gagal TERLIHAT: keduanya "jalan". Jam dinding
 * yang membengkak diam-diam juga meracuni tafsir (run yang tampak macet,
 * pemantau yang menyalak salah). Jawaban tetap sah (temp 0), tapi biayanya
 * nyata dan senyap.
 *
 * Kuncinya berkas, bukan proses: berisi PID + model + waktu. Kunci yang
 * pemiliknya sudah mati = basi, boleh diambil alih — supaya crash tidak
 * meninggalkan gembok abadi.
 *
 * Pakai dari harness:
 *   import { pegangKunci, lepasKunci } from './kunci-ukur.mjs';
 *   const k = pegangKunci(MODEL); if (!k.ok) { console.error(k.pesan); exit(1); }
 *   process.on('exit', lepasKunci);
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BERKAS = path.join(DIR, '.ukur-berjalan.json');

export function pidHidup(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function pegangKunci(model, berkas = BERKAS) {
  if (fs.existsSync(berkas)) {
    let lama = null;
    try {
      lama = JSON.parse(fs.readFileSync(berkas, 'utf8'));
    } catch {
      /* kunci korup = basi */
    }
    if (lama && pidHidup(lama.pid)) {
      return {
        ok: false,
        pemilik: lama,
        pesan:
          `C15 — pengukuran lain sedang jalan: PID ${lama.pid} mengukur ${lama.model} sejak ${lama.mulai}.\n` +
          `Dua pengukuran serentak saling memperlambat lewat swap model dan membengkakkan jam dinding.\n` +
          `Tunggu selesai, atau hentikan prosesnya dulu.`,
      };
    }
  }
  fs.writeFileSync(berkas, JSON.stringify({ pid: process.pid, model, mulai: new Date().toISOString() }), 'utf8');
  return { ok: true };
}

export function lepasKunci(berkas = BERKAS) {
  try {
    const k = JSON.parse(fs.readFileSync(typeof berkas === 'string' ? berkas : BERKAS, 'utf8'));
    if (k.pid === process.pid) fs.unlinkSync(typeof berkas === 'string' ? berkas : BERKAS);
  } catch {
    /* sudah tidak ada / bukan milik kita */
  }
}

// ────────────────────────────────────────────────── uji instrumen ──
function ujiInstrumen() {
  const { spawnSync } = { spawnSync: null };
  const uji = path.join(DIR, '.ukur-berjalan.uji.json');
  const kasus = [];
  try { fs.unlinkSync(uji); } catch {}

  // 1. tanpa kunci → dapat
  kasus.push(['tanpa kunci = dapat', pegangKunci('model-a', uji).ok === true]);
  // 2. kunci milik proses hidup (kita sendiri) → ditolak untuk "orang lain"
  //    (simulasikan: tulis kunci ber-PID kita, minta lagi — pemilik hidup = tolak
  //     KECUALI itu memang kita; di dunia nyata proses lain yang minta. Uji
  //     inti perilakunya: PID hidup menolak.)
  fs.writeFileSync(uji, JSON.stringify({ pid: process.pid, model: 'model-a', mulai: 'x' }), 'utf8');
  kasus.push(['pemilik hidup = tolak', pegangKunci('model-b', uji).ok === false]);
  // 3. kunci basi (PID mustahil hidup) → diambil alih
  fs.writeFileSync(uji, JSON.stringify({ pid: 2 ** 22 + 12345, model: 'mati', mulai: 'x' }), 'utf8');
  const basi = pegangKunci('model-c', uji);
  kasus.push(['kunci basi = diambil alih', basi.ok === true]);
  // 4. kunci korup → diambil alih, bukan crash
  fs.writeFileSync(uji, 'bukan-json{', 'utf8');
  kasus.push(['kunci korup = diambil alih', pegangKunci('model-d', uji).ok === true]);
  // 5. lepas → berkas hilang
  lepasKunci(uji);
  kasus.push(['lepas = berkas hilang', !fs.existsSync(uji)]);
  // 6. pidHidup membedakan hidup dari mati
  kasus.push(['pid sendiri = hidup', pidHidup(process.pid) === true]);
  kasus.push(['pid mustahil = mati', pidHidup(2 ** 22 + 54321) === false]);

  try { fs.unlinkSync(uji); } catch {}
  let gagal = 0;
  for (const [nama, ok] of kasus) {
    console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nama}`);
    if (!ok) gagal++;
  }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

const iniUtama = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (iniUtama) ujiInstrumen();
