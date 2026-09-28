#!/usr/bin/env node
/**
 * uji-nalar.mjs — gerbang NALAR, dan yang paling penting:
 * pengukur **"BENAR TAPI JALANNYA SALAH"** pada model KITA SENDIRI.
 *
 * Latar (terverifikasi dengan membaca makalahnya, arXiv 2601.00513):
 * dari 10.734 jejak, 50–69% jawaban BENAR model 7–9B lahir dari penalaran yang
 * SALAH — Qwen-2.5-7B paling parah (69,3%), dan keluarga Qwen adalah base kita.
 * Selama gerbang hanya memeriksa angka akhir, kita bisa menghadiahi keberuntungan.
 *
 * Cara mengukurnya di sini (bisa dihitung mesin, bukan tafsiran):
 *   tiap soal membawa `buktiProses` = angka ANTARA yang HARUS muncul kalau
 *   jalannya benar (mis. harga setelah diskon pertama, jumlah kg hasil konversi,
 *   total jarak pulang-pergi, jumlah langkah pencarian biner).
 *
 *   BENAR              = angka jawaban benar muncul
 *   TERMAKAN JEBAKAN   = angka jalan-pintas muncul, yang benar tidak
 *   PROSES TERLIHAT    = semua buktiProses muncul
 *   BTJS (benar-tapi-jalannya-salah) = BENAR tapi PROSES TIDAK TERLIHAT
 *
 * Untuk soal yang TIDAK BOLEH dijawab angka (data kurang / premis salah /
 * sebab-kebetulan / inversi): lulus bila mengaku + TIDAK menyodorkan angka.
 *
 * Pakai: node uji-nalar.mjs [model] [jumlahSoal]
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL = process.argv[2] || 'migancore:0.8-8b';
const BATAS = Number(process.argv[3]) || 40;
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const BANK = path.join(DIR, 'bank-nalar.jsonl');

export const SISTEM =
  'Kamu asisten berbahasa Indonesia yang teliti. Kerjakan bertahap dan TUNJUKKAN ' +
  'angka-angka antaranya, jangan cuma hasil akhir. Kalau datanya tidak cukup atau ' +
  'pertanyaannya memuat anggapan yang keliru, katakan itu — jangan menyodorkan angka ' +
  'yang tidak bisa kamu dasari. Jawab ringkas.';

// ── pembacaan angka: tahan format Indonesia (1.234.567,89) ──
function angkaDalam(teks) {
  const out = new Set();
  const t = String(teks);
  // 1.234.567,89  → 1234567.89
  for (const m of t.matchAll(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?/g)) out.add(Number(m[0].replace(/\./g, '').replace(',', '.')));
  // 1234567.89 / 1234 / 23,5
  for (const m of t.matchAll(/-?\d+(?:[.,]\d+)?/g)) {
    const s = m[0];
    if (/\.\d{3}$/.test(s)) continue;               // kemungkinan pemisah ribuan, sudah ditangani
    out.add(Number(s.replace(',', '.')));
  }
  return [...out].filter(Number.isFinite);
}
const punyaAngka = (daftar, n) =>
  daftar.some((x) => Math.abs(x - n) < Math.max(0.02, Math.abs(n) * 0.001));

const MENGAKU = /(tidak cukup|belum cukup|kurang|belum ada|tidak bisa|perlu (data|informasi|angka)|keliru|salah|belum tentu|tidak bisa disimpulkan|bergantung|tergantung)/i;

async function tanya(teks) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, stream: false,
      messages: [{ role: 'system', content: SISTEM }, { role: 'user', content: teks }],
      options: { temperature: 0.2, num_predict: 420 },
    }),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  return String((await r.json()).message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export function nilai(s, jawab) {
  const angka = angkaDalam(jawab);
  if (s.jawabBenar === null) {
    // soal yang TIDAK boleh dijawab angka
    const mengaku = MENGAKU.test(jawab);
    // angka yang "berbahaya" = angka besar yang terkesan hasil hitungan
    const menyodorkan = angka.some((x) => Math.abs(x) >= 100);
    return {
      lulus: mengaku && !menyodorkan,
      sebab: !mengaku ? 'tidak mengaku' : menyodorkan ? 'menyodorkan angka padahal tak berdasar' : 'benar',
      btjs: false,
    };
  }
  const benar = punyaAngka(angka, s.jawabBenar);
  const jebakan = s.jebakanUmum !== undefined && punyaAngka(angka, s.jebakanUmum);
  const bukti = (s.buktiProses || []);
  const prosesTerlihat = bukti.length === 0 ? null : bukti.every((b) => punyaAngka(angka, b));
  return {
    lulus: benar,
    sebab: benar ? (prosesTerlihat === false ? 'benar TAPI proses tak terlihat' : 'benar')
      : jebakan ? 'TERMAKAN jalan pintas' : 'salah',
    btjs: benar && prosesTerlihat === false,
    jebakan: !benar && jebakan,
  };
}

// C27: modul harus bisa diimpor tanpa efek samping. Sampai 3 Sep berkas ini
// menjalankan seluruh pengujian begitu di-import — ketahuan saat pelari moda-alat
// hendak memakai ulang `nilai()` dan malah memicu 24 panggilan model ke Ollama.
// Instrumen yang sama WAJIB dipakai kedua moda (C29), jadi ia harus bisa diimpor.
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) (async () => {
  if (!fs.existsSync(BANK)) {
    console.error('bank-nalar.jsonl belum ada — jalankan: node bank-nalar.mjs --tulis 400');
    process.exit(2);
  }
  const semua = fs.readFileSync(BANK, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  // ambil merata dari tiap kategori supaya tidak didominasi aritmetika
  const perKat = {};
  for (const s of semua) (perKat[s.kategori] ||= []).push(s);
  const kats = Object.keys(perKat);
  const dipilih = [];
  for (let i = 0; dipilih.length < Math.min(BATAS, semua.length); i++) {
    const k = kats[i % kats.length];
    if (perKat[k].length) dipilih.push(perKat[k].shift());
    if (kats.every((x) => !perKat[x].length)) break;
  }

  console.log(`# Uji nalar — ${MODEL} — ${dipilih.length} soal\n`);
  const hasil = [];
  for (const s of dipilih) {
    let jawab = '';
    try { jawab = await tanya(s.tanya); } catch (e) { jawab = `(GAGAL: ${e.message})`; }
    const n = nilai(s, jawab);
    hasil.push({ kategori: s.kategori, ...n, tanya: s.tanya.slice(0, 120), jawab: jawab.slice(0, 700), panjang: jawab.length });
    const tanda = n.lulus ? (n.btjs ? '~' : 'v') : 'x';
    console.log(`${tanda} [${s.kategori}] ${s.tanya.slice(0, 78)}`);
    console.log(`    ${n.sebab}`);
    if (!n.lulus || n.btjs) console.log(`    jawab: ${jawab.replace(/\s+/g, ' ').slice(0, 150)}`);
  }

  // ── ringkasan ──
  const kat = {};
  for (const h of hasil) {
    const k = (kat[h.kategori] ||= { n: 0, lulus: 0, btjs: 0, jebakan: 0 });
    k.n++; if (h.lulus) k.lulus++; if (h.btjs) k.btjs++; if (h.jebakan) k.jebakan++;
  }
  console.log('\n## Skor per kategori');
  for (const [k, v] of Object.entries(kat)) {
    console.log(`  ${k.padEnd(20)} benar ${v.lulus}/${v.n}` +
      (v.jebakan ? `  · termakan jebakan ${v.jebakan}` : '') +
      (v.btjs ? `  · BTJS ${v.btjs}` : ''));
  }
  const totalBenar = hasil.filter((h) => h.lulus).length;
  const totalBtjs = hasil.filter((h) => h.btjs).length;
  const totalJebakan = hasil.filter((h) => h.jebakan).length;
  const rasioBtjs = totalBenar ? (totalBtjs / totalBenar) * 100 : 0;

  console.log(`\n## RINGKASAN`);
  console.log(`  benar             : ${totalBenar}/${hasil.length} (${Math.round(totalBenar / hasil.length * 100)}%)`);
  console.log(`  termakan jebakan  : ${totalJebakan}`);
  console.log(`  BENAR-TAPI-JALANNYA-SALAH : ${totalBtjs} dari ${totalBenar} jawaban benar = **${rasioBtjs.toFixed(1)}%**`);
  console.log(`  (pembanding riset: Qwen-2.5-7B 69,3% · Llama-3-8B 55,2% · Mistral-7B 50,2%)`);

  const berkas = path.join(DIR, `hasil-uji-nalar-${MODEL.replace(/[:/]/g, '_')}.json`);
  fs.writeFileSync(berkas, JSON.stringify({ model: MODEL, n: hasil.length, totalBenar, totalBtjs, rasioBtjs, kat, hasil }, null, 2), 'utf8');
  console.log(`\ntertulis: ${berkas}`);
})();
