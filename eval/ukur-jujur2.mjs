#!/usr/bin/env node
/**
 * ukur-jujur2.mjs — pelari pengukur petak-jujur2 pada satu model.
 *
 * Inilah mesin yang menghasilkan baris papan peringkat. Tiap aturan di bawah
 * lahir dari kegagalan NYATA yang sudah dibayar — bukan gaya:
 *
 * 1. TIDAK MENIMPA HASIL (utang V17 dibayar). `uji-halusinasi.mjs` menimpa
 *    berkasnya tiap putaran, sehingga lima putaran hanya menyisakan yang
 *    terakhir — dan itulah yang membatasi kolam RLVR ke 36 prompt. Di sini
 *    tiap putaran mendarat di berkas BARU: hasil-jujur2-<model>-p<N>-<stempel>.
 *
 * 2. GALAT ≠ NGARANG (C33). Model yang tidak pernah ditanya tidak boleh
 *    divonis mengarang. Kegagalan jaringan dicatat sebagai baris GALAT,
 *    DIKELUARKAN dari metrik, dan JUMLAHNYA dilaporkan. Kalau galat > 10%
 *    petak, seluruh putaran divonis TIDAK SAH — angka dari petak yang
 *    setengahnya tak terjawab jaringan bukan pengukuran.
 *
 * 3. Pembungkus POLOS (tanpa system prompt), suhu 0,7 — konvensi yang sama
 *    dengan seluruh sejarah MENGARANG kami. Melatih/mengukur dengan pembungkus
 *    berbeda = mengukur hal yang berbeda.
 *
 * 4. Vonis diambil dari instrumen bersama (instrumen-jujur2), bukan ditulis
 *    ulang di sini — pemisahan yang membuat gerbang dan pengukur mustahil
 *    melenceng (pola C29/C39).
 *
 * Pakai:
 *   node eval/ukur-jujur2.mjs <model> [--putaran N] [--privat] [--uji]
 *   node eval/ukur-jujur2.mjs migancore:0.14 --putaran 3
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIK, PRIVAT } from './petak-jujur2.mjs';
import { nilai2, metrik } from './instrumen-jujur2.mjs';
import { jagaAcuan } from './kunci-acuan.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLLAMA = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434') + '/api/chat';
const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', A = '\x1b[2m', R = '\x1b[0m';

const AMBANG_GALAT = 0.10; // > 10% soal gagal jaringan = putaran TIDAK SAH

// 2 Sep: base mentah qwen3:4b (mode berpikir bawaan ollama) melewati batas 120 s
// pada 22–25% soal → 5/5 putaran TIDAK SAH; angkanya tidak pernah boleh dikutip.
// Dua tuas ini membuat pengukuran base yang SAH dan berlabel jujur:
//   PIKIR=off  → kirim think:false (jawab langsung, seperti model kita)
//   BATAS=300  → batas detik per jawaban (untuk mode berpikir yang panjang)
// Keduanya DICATAT di berkas hasil (medan `pikir`, `batasDetik`) supaya angka
// dengan pembungkus berbeda tidak pernah tercampur (C29).
export const PIKIR = (process.env.PIKIR || '').toLowerCase() === 'off' ? false : null;

// 10 Sep: BATAS bukan satu-satunya langit-langit, dan bukan yang mengikat.
// `fetch` bawaan Node (undici) memberi headersTimeout 300.000 ms, dan dengan
// `stream:false` Ollama tidak mengirim SATU BYTE PUN sampai seluruh jawaban
// selesai dibuat. Jadi tiap jawaban yang butuh lebih dari 300 detik memutus
// koneksinya sendiri — berapa pun BATAS yang dipasang. Terlihat saat uji
// langit-langit A3 dijalankan dengan BATAS=1800 dan tetap gagal di 304 detik
// dengan `TypeError: fetch failed`, bukan AbortError. Reproduksi offline:
// `node eval/uji-batas-fetch.mjs --penuh`.
//
// Dengan `stream:true` header datang seketika dan tiap potongan menyegarkan
// bodyTimeout, jadi langit-langit 300 dtk hilang. Isi jawabannya sama —
// potongan digabung apa adanya; yang berubah hanya angkutannya, bukan
// pembungkus, model, atau opsi sampling (C29 tidak tersentuh).
//
// Bawaan masih MATI. Ia dinyalakan setelah kesetaraannya diukur, bukan sebelum
// — mengubah bawaan diam-diam adalah cacat yang sudah pernah kena di sini.
export const ALIRAN = process.env.ALIRAN === '1';
export const BATAS_DETIK = Number(process.env.BATAS) || 120;

/**
 * Gabungkan aliran NDJSON Ollama jadi satu teks. Tiap baris satu objek JSON;
 * `message.content` disambung apa adanya. Baris rusak DILEWATI, bukan
 * menggagalkan seluruh jawaban — putus di tengah aliran akan menghasilkan
 * potongan tak lengkap, dan membuang seluruh jawaban karena satu baris rusak
 * akan mengubah kegagalan angkutan jadi GALAT model.
 *
 * Mengembalikan `null` kalau tidak ada satu pun isi — itu kegagalan sungguhan,
 * dan harus terbaca sebagai kegagalan, bukan sebagai jawaban kosong (C33).
 */
export async function gabungAliran(aliran) {
  return (await gabungAliranLengkap(aliran)).teks;
}

/**
 * Sama dengan gabungAliran, tapi JUGA menyimpan `message.thinking`.
 *
 * 15 Sep: sensus 110 berkas hasil (3.789 baris, 11 model) — NOL baris menyimpan
 * jejak nalar. Kedua jalur angkutan hanya mengambil `message.content`; qwen3
 * bernalar ribuan token per soal (≈250 dtk/soal di Bmax) dan semuanya dibuang.
 * Satu-satunya tempat keraguan model sendiri bisa diamati tidak pernah disimpan,
 * sehingga pertanyaan "apakah model TAHU ia tidak tahu?" tidak bisa diuji dari
 * satu pun pengukuran yang pernah kami buat.
 *
 * `teks` dan `ada` berperilaku PERSIS seperti sebelumnya: `ada` tetap hanya
 * dinyalakan oleh isi jawaban, jadi aliran yang cuma berisi nalar tetap GALAT
 * (C33), bukan jawaban kosong. Penilai tidak pernah melihat `pikir`.
 */
export async function gabungAliranLengkap(aliran) {
  let teks = '';
  let pikir = '';
  let ada = false;
  let sisa = '';
  const dekoder = new TextDecoder();
  const serap = (b) => {
    let j;
    try { j = JSON.parse(b); } catch { return; } // baris rusak/terpotong: lewati, isi sebelumnya tetap sah
    if (typeof j?.message?.content === 'string') { teks += j.message.content; ada = true; }
    if (typeof j?.message?.thinking === 'string') pikir += j.message.thinking;
  };
  for await (const potong of aliran) {
    sisa += dekoder.decode(potong, { stream: true });
    const baris = sisa.split('\n');
    sisa = baris.pop() ?? '';
    for (const b of baris) if (b.trim()) serap(b);
  }
  if (sisa.trim()) serap(sisa);
  return { teks: ada ? teks : null, pikir };
}

export async function tanyaPolos(model, teks, { batasDetik = BATAS_DETIK } = {}) {
  const kendali = new AbortController();
  const jam = setTimeout(() => kendali.abort(), batasDetik * 1000);
  try {
    // PIKIR=off: `think:false` saja TIDAK cukup untuk qwen3 — ia hanya mencopot tag
    // <think>, modelnya tetap bernalar panjang di badan jawaban (terbukti 2 Sep:
    // rata 5.607 karakter, 16/36 lewat batas). Sakelar lunak `/no_think` di prompt
    // yang benar-benar mematikannya (uji: 7 karakter, jawab langsung).
    const isi = PIKIR === false ? `${teks} /no_think` : teks;
    const badan = {
      model,
      messages: [{ role: 'user', content: isi }],
      stream: ALIRAN,
      options: { temperature: 0.7 },
    };
    if (PIKIR === false) badan.think = false;
    const r = await fetch(OLLAMA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: kendali.signal,
      body: JSON.stringify(badan),
    });
    if (!r.ok) return { ok: false, sebab: `ollama ${r.status}: ${(await r.text()).slice(0, 160)}` };
    if (ALIRAN) {
      const { teks, pikir } = await gabungAliranLengkap(r.body);
      if (teks === null) return { ok: false, sebab: 'aliran berakhir tanpa isi' };
      return { ok: true, teks: teks.trim(), ...(pikir.trim() ? { pikir: pikir.trim() } : {}) };
    }
    const d = await r.json();
    if (typeof d?.message?.content !== 'string') {
      return { ok: false, sebab: `balasan tanpa message.content: ${JSON.stringify(d).slice(0, 120)}` };
    }
    const pikir = typeof d?.message?.thinking === 'string' ? d.message.thinking.trim() : '';
    return { ok: true, teks: d.message.content.trim(), ...(pikir ? { pikir } : {}) };
  } catch (e) {
    return { ok: false, sebab: String(e?.name === 'AbortError' ? `lewat ${batasDetik}s` : e).slice(0, 160) };
  } finally {
    clearTimeout(jam);
  }
}

/** Satu putaran penuh pada satu model. Murni terhadap I/O kecuali `tanya`. */
export async function satuPutaran(model, petak, tanya = tanyaPolos) {
  const baris = [];
  for (const soal of petak) {
    const j = await tanya(model, soal.q);
    if (!j.ok) {
      baris.push({ soal, hasil: 'GALAT', sebab: j.sebab });
      continue;
    }
    const v = nilai2(soal, j.teks);
    baris.push({ soal, hasil: v.hasil, sinyal: v.sinyal, teks: j.teks, ...(j.pikir ? { pikir: j.pikir } : {}) });
  }
  return baris;
}

/** Vonis kesahihan putaran + metrik. Baris GALAT keluar dari hitungan (C33). */
export function rangkum(baris) {
  const galat = baris.filter((r) => r.hasil === 'GALAT');
  const sah = baris.filter((r) => r.hasil !== 'GALAT');
  const lajuGalat = baris.length ? galat.length / baris.length : 1;
  return {
    sah: lajuGalat <= AMBANG_GALAT,
    galat: galat.length,
    lajuGalat: +(100 * lajuGalat).toFixed(1),
    metrik: metrik(sah),
  };
}

// ─────────────────────────────────────────────────────────── uji instrumen ──
const LANGSUNG = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('ukur-jujur2.mjs');

if (LANGSUNG && process.argv.includes('--uji')) {
  let ok = 0, bad = 0;
  const cek = (n, c, k = '') => { if (c) { ok++; console.log(`  OK    ${n}`); } else { bad++; console.log(`  GAGAL ${n}${k ? ' — ' + k : ''}`); } };
  console.log('# Uji ukur-jujur2 (tanpa jaringan)\n');

  // GALAT ≠ NGARANG: model palsu yang selalu gagal jaringan
  const petakUji = PUBLIK.slice(0, 4);
  const selaluGagal = async () => ({ ok: false, sebab: 'uji: jaringan mati' });
  const b1 = await satuPutaran('model-uji', petakUji, selaluGagal);
  cek('kegagalan jaringan jadi GALAT, bukan NGARANG', b1.every((r) => r.hasil === 'GALAT'));
  const r1 = rangkum(b1);
  cek('putaran 100% galat divonis TIDAK SAH', r1.sah === false && r1.metrik.n === 0);

  // model palsu yang selalu mengaku tidak tahu
  const selaluJujur = async () => ({ ok: true, teks: 'Saya tidak tahu.' });
  const b2 = await satuPutaran('model-uji', PUBLIK, selaluJujur);
  const r2 = rangkum(b2);
  cek('putaran bersih divonis SAH', r2.sah === true && r2.galat === 0);
  cek('penolak-segalanya: MENGARANG 0 TAPI over-refusal 100 — pagar dua arah bekerja',
    r2.metrik.MENGARANG_pct === 0 && r2.metrik.over_refusal_pct === 100);

  // model palsu yang menjawab pasti semuanya
  const selaluYakin = async () => ({ ok: true, teks: 'Jawabannya adalah 42, sudah pasti.' });
  const r3 = rangkum(await satuPutaran('model-uji', PUBLIK, selaluYakin));
  cek('penjawab-segalanya: MENGARANG 100', r3.metrik.MENGARANG_pct === 100);

  // 15 Sep — jejak nalar disimpan, tapi TIDAK PERNAH menyentuh penilaian.
  const aliranPalsu = (...obj) => (async function* () {
    const enc = new TextEncoder();
    for (const o of obj) yield enc.encode(JSON.stringify(o) + '\n');
  })();
  const lengkap = await gabungAliranLengkap(aliranPalsu(
    { message: { thinking: 'Hmm, I am not sure ' } }, { message: { thinking: 'this exists.' } },
    { message: { content: 'Jawab' } }, { message: { content: 'an 42.' } }, { done: true }));
  cek('aliran: nalar dan isi dipisah', lengkap.teks === 'Jawaban 42.' && lengkap.pikir === 'Hmm, I am not sure this exists.',
    JSON.stringify(lengkap));
  const lama = await gabungAliran(aliranPalsu({ message: { thinking: 'ragu' } }, { message: { content: 'Isi.' } }));
  cek('gabungAliran lama tetap mengembalikan isi saja (uji-batas-fetch bergantung padanya)', lama === 'Isi.');
  const cumaNalar = await gabungAliranLengkap(aliranPalsu({ message: { thinking: 'panjang sekali' } }, { done: true }));
  cek('aliran yang cuma berisi nalar tetap tanpa isi -> GALAT, bukan jawaban kosong (C33)',
    cumaNalar.teks === null && cumaNalar.pikir === 'panjang sekali');

  const soalAbstain = PUBLIK.find((s) => s.jenis === 'tak-terjawab');
  const tanpaNalar = await satuPutaran('model-uji', [soalAbstain], async () => ({ ok: true, teks: 'Jawabannya adalah 42, sudah pasti.' }));
  const denganNalar = await satuPutaran('model-uji', [soalAbstain],
    async () => ({ ok: true, teks: 'Jawabannya adalah 42, sudah pasti.', pikir: 'Saya tidak tahu. Mohon jelaskan? Tergantung.' }));
  cek('nalar penuh sinyal abstain TIDAK mengubah vonis jawaban yang mengarang',
    tanpaNalar[0].hasil === 'NGARANG' && denganNalar[0].hasil === 'NGARANG'
    && JSON.stringify(tanpaNalar[0].sinyal) === JSON.stringify(denganNalar[0].sinyal));
  cek('nalar tersimpan di baris hasil', denganNalar[0].pikir?.startsWith('Saya tidak tahu') && !('pikir' in tanpaNalar[0]));

  // nama berkas: putaran TIDAK saling menimpa
  const n1 = namaBerkas('migancore:0.14', 1, '2026-09-01T00-00-00');
  const n2 = namaBerkas('migancore:0.14', 2, '2026-09-01T00-00-00');
  cek('nama berkas beda antar putaran (utang V17 dibayar)', n1 !== n2, `${n1}`);
  cek('nama model disterilkan untuk sistem berkas', !n1.includes(':'));

  console.log(`\n${ok} lulus · ${bad} gagal\n`);
  process.exit(bad ? 1 : 0);
}

export function namaBerkas(model, putaran, stempel, label = '') {
  return `hasil-jujur2-${model.replace(/[:/]/g, '_')}${label ? `-${label}` : ''}-p${putaran}-${stempel}.json`;
}

// ───────────────────────────────────────────────────────────────── jalan ──
if (LANGSUNG && !process.argv.includes('--uji')) {
  const model = process.argv[2];
  if (!model) {
    console.error('Pakai: node eval/ukur-jujur2.mjs <model> [--putaran N] [--privat]');
    process.exit(1);
  }
  const nPutaran = Number((process.argv.find((a) => a.startsWith('--putaran')) || '').split('=')[1]
    || process.argv[process.argv.indexOf('--putaran') + 1] || 1) || 1;
  // 2 Sep: --petak <berkas.jsonl> mengukur bank soal LAIN (kandidat dari pabrik
  // soal) dengan penilai & pembungkus yang SAMA. Berkas hasilnya diberi label
  // nama bank supaya tidak pernah tercampur dengan hasil petak-jujur2 (C29).
  const iPetak = process.argv.indexOf('--petak');
  const berkasPetak = iPetak > 0 ? process.argv[iPetak + 1] : null;
  const petak = berkasPetak
    ? fs.readFileSync(berkasPetak, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    : process.argv.includes('--privat') ? [...PUBLIK, ...PRIVAT] : PUBLIK;
  const label = berkasPetak ? path.basename(berkasPetak).replace(/\.jsonl$/, '') : '';
  // Penjaga acuan: menambah putaran pada model yang angkanya dikunci pra-daftar
  // aktif menggeser rata-rata DAN n, sehingga ambang menang lepas dari acuannya.
  jagaAcuan(model, { izin: process.argv.includes('--acuan-sengaja'), apa: 'ukur-jujur2' });
  const stempel = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');

  console.log(`\n# ukur-jujur2 — ${model} · ${petak.length} soal${label ? ` (${label})` : ''} · ${nPutaran} putaran · pembungkus polos\n`);

  const semuaPutaran = [];
  for (let p = 1; p <= nPutaran; p++) {
    const t0 = Date.now();
    const baris = await satuPutaran(model, petak);
    const r = rangkum(baris);
    semuaPutaran.push(r);

    const f = path.join(AKAR, 'eval', namaBerkas(model, p, stempel, label));
    // `aliran` DICATAT, bukan diam-diam. Angkutan sudah terbukti tidak mengubah
    // jawaban (seed dikunci, prasyarat determinisme diperiksa), tapi mencatatnya
    // membuat pencampuran bisa KETAHUAN — dan berkas lama yang tanpa medan ini
    // terbaca apa adanya sebagai `false`, bukan ditebak.
    fs.writeFileSync(f, JSON.stringify({ model, putaran: p, stempel, petak: petak.length, bank: label || 'petak-jujur2', pikir: PIKIR === false ? 'off' : 'bawaan', batasDetik: BATAS_DETIK, aliran: ALIRAN, baris, rangkuman: r }, null, 1));

    const m = r.metrik;
    console.log(`--- putaran ${p} (${Math.round((Date.now() - t0) / 1000)}s) ${r.sah ? '' : M + 'TIDAK SAH' + R}`);
    console.log(`  MENGARANG      ${m.MENGARANG_pct}%   fakta ${(m.fakta_akurasi ?? 0) * 100}%   over-refusal ${m.over_refusal_pct}%`);
    console.log(`  abstensi       recall ${m.abstain_recall} · presisi ${m.abstain_presisi}`);
    if (r.galat) console.log(`  ${K}GALAT jaringan ${r.galat} soal (${r.lajuGalat}%)${R}`);
    const pj = Object.entries(m.perJenis).map(([k, v]) => `${k} ${v.benar}/${v.total}`).join(' · ');
    console.log(`  ${A}${pj}${R}`);
    console.log(`  ${A}tersimpan: ${path.basename(f)}${R}\n`);

    // 10 Sep, A3: Bmax mati di tengah run. Putaran 1 SAH (9.519 dtk, 0 galat),
    // putaran 2 rusak sebagian (83 % galat), lalu putaran 3-5 masing-masing
    // gagal 36/36 dalam NOL DETIK — dan pelari tetap menulis tiga berkas hasil
    // penuh nol. Server mati terbaca seperti model yang gagal, dan sampahnya
    // ikut masuk repo sebagai "bukti pengukuran".
    //
    // Nol detik dengan seluruh soal galat bukan pengukuran; itu tanda tidak ada
    // yang mendengarkan di ujung sana. Berhenti, jangan bakar sisa putarannya.
    // Berkasnya tetap ditulis (bukti bahwa run-nya dihentikan, bukan hilang).
    if (r.lajuGalat >= 100) {
      console.log(`${M}BERHENTI — putaran ${p} galat 100 %. Itu servernya, bukan modelnya.${R}`);
      console.log(`${A}  Periksa: curl -s -m 8 $OLLAMA_HOST/api/tags`);
      console.log(`  Sisa ${nPutaran - p} putaran TIDAK dijalankan — melanjutkan hanya menambah berkas nol.${R}\n`);
      break;
    }
  }

  if (nPutaran > 1) {
    const sahSaja = semuaPutaran.filter((r) => r.sah);
    const angka = sahSaja.map((r) => r.metrik.MENGARANG_pct);
    const rata = angka.reduce((a, c) => a + c, 0) / (angka.length || 1);
    const sd = angka.length > 1
      ? Math.sqrt(angka.reduce((a, c) => a + (c - rata) ** 2, 0) / (angka.length - 1)) : 0;
    console.log(`## ${model}: MENGARANG rata ${rata.toFixed(1)}% · sd ${sd.toFixed(2)} · ${sahSaja.length}/${nPutaran} putaran sah`);
  }
}
