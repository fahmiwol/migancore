#!/usr/bin/env node
/**
 * e1-latensi-npc.mjs — E1: bisakah 4B menjawab sebagai NPC dalam anggaran waktu, di CPU?
 *
 * Pra-daftar (dikunci SEBELUM data, commit 41ca497):
 *   flywheel/PRA-DAFTAR-E1-LATENSI-NPC.json
 *
 * DUA pertanyaan, dibaca dari lengan yang SAMA dan berpasangan per giliran:
 *   Q_MODEL  — jam dimulai saat permintaan jawaban dikirim.
 *   Q_PRODUK — jam dimulai saat kalimat pemain masuk; mencakup probe gerbang bila berjalan.
 * Keduanya TIDAK pernah dicampur (pelajaran A4-BARU, 23 Sep).
 *
 * Kenapa jalur ini "ramping": POST /api/chat langsung, stream:true, TANPA kerangka
 * agen. Hermes dikecualikan di muka — doc 30 mengukurnya gagal (16–71k token/giliran
 * × 4B CPU = timeout/RAM).
 *
 * Kenapa think:false DAN /no_think: untuk qwen3, think:false saja hanya mencopot
 * tag <think>; model tetap bernalar ribuan karakter di badan jawaban (terbukti 2 Sep:
 * rata 5.607 karakter). Sakelar lunak /no_think yang benar-benar mematikannya. NPC
 * yang "berpikir" dulu tidak akan pernah lolos ambang awal respons.
 *
 * Pakai:
 *   node eval/e1-latensi-npc.mjs --uji             # uji luring, tanpa jaringan
 *   node eval/e1-latensi-npc.mjs --sesi 5          # pengukuran sah di Bmax
 *   node eval/e1-latensi-npc.mjs --sesi 1 --asap   # satu sesi, berkas berlabel asap
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const PRA_DAFTAR = 'flywheel/PRA-DAFTAR-E1-LATENSI-NPC.json';
// E1b (23 Sep): satu dial — format riwayat. Pra-daftarnya sendiri, ambang disalin kata per kata.
const PRA_DAFTAR_E1B = 'flywheel/PRA-DAFTAR-E1B-RIWAYAT.json';
const BEBAN = path.join(DI_SINI, 'beban-e1-npc.json');

/**
 * Dua entri riwayat untuk satu giliran yang sudah dijawab.
 *
 * 'mentah' (E1): pesan pengguna TANPA " /no_think", jawaban dipangkas — mereproduksi E1
 *   persis, supaya vonis E1 tetap bisa diulang.
 * 'persis' (E1b): pesan pengguna = string yang BENAR-BENAR dikirim, jawaban = string yang
 *   BENAR-BENAR diterima. Identik menurut konstruksi, bukan menurut kebetulan.
 *
 * Kenapa ini ada (F-262): riwayat yang dikirim ulang tidak sama byte-demi-byte dengan yang
 * di cache membuang awalan cache, dan prefill giliran-2 jadi 2,6× lebih lambat (1,61 vs
 * 0,63 dtk). Kehilangannya tidak berbunyi — ia terbaca sebagai "modelnya lambat".
 */
export function entriRiwayat(mode, q, j) {
  if (mode === 'persis') return [{ role: 'user', content: j.pesanPengguna }, { role: 'assistant', content: j.teksMentah }];
  return [{ role: 'user', content: q }, { role: 'assistant', content: j.teks }];
}

const HOST = (process.env.OLLAMA_HOST || 'http://measure-host.local:11434').replace(/\/$/, '');
const MODEL_JAWAB = 'migancore:0.14';
const MODEL_PROBE = 'migancore:0.4-qwen3';
const BATAS_DETIK = 120;
const OPSI = { temperature: 0.7, num_predict: 160 };
const KEEP_ALIVE = '30m';

// ─────────────────────────────────────────────────────────── alat murni ──

/** PRNG Mulberry32 — benih tetap, urutan bisa diulang persis. */
export function acak(benih) {
  let a = benih >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Kalimat pertama = sapaan pertama NPC (pembuka percakapan yang wajar); sisanya
 * diacak dengan benih sesi×1000 + indeks NPC. Tujuannya memisahkan INDEKS GILIRAN
 * dari KATEGORI: riwayat menumpuk (Korkiakoski 2025), dan kalau urutannya tetap,
 * "latensi naik di giliran akhir" tidak bisa dibedakan dari "soal luar lebih panjang".
 */
export function urutkanKalimat(npc, sesi, idxNpc) {
  const semua = npc.kalimat.slice();
  const iPembuka = semua.findIndex((k) => k.k === 'sapa');
  const [pembuka] = semua.splice(iPembuka < 0 ? 0 : iPembuka, 1);
  const r = acak(sesi * 1000 + idxNpc);
  for (let i = semua.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [semua[i], semua[j]] = [semua[j], semua[i]];
  }
  return [pembuka, ...semua];
}

/**
 * Persona NPC. Pengetahuan = salinan persis pohon dialognya. SENGAJA tanpa arahan
 * abstensi: di produk, gerbang adalah mekanisme abstensi, dan E2 akan memutar dial
 * gerbang pada persona yang SAMA ini.
 */
export function bangunPersona(npc) {
  return [
    `Kamu ${npc.nama}, ${npc.peran} di dunia virtual Galantara.`,
    'Yang kamu tahu:',
    ...npc.pengetahuan.map((p) => `- ${p}`),
    'Gaya: ramah dan santai, bahasa Indonesia sehari-hari. Jawab SINGKAT, 1–2 kalimat.',
  ].join('\n');
}

/** Persentil interpolasi linear (tipe 7, bawaan numpy/R). Larik kosong → null. */
export function persentil(nilai, p) {
  const a = nilai.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  if (a.length === 1) return a[0];
  const h = (a.length - 1) * (p / 100);
  const lo = Math.floor(h), hi = Math.ceil(h);
  return a[lo] + (a[hi] - a[lo]) * (h - lo);
}

/**
 * Baca aliran NDJSON Ollama sambil mencatat waktu potongan ISI pertama.
 * `jam` disuntikkan supaya uji luring bisa memalsukan waktu.
 * Awal respons = potongan pertama yang message.content-nya TIDAK kosong — bukan
 * potongan pertama apa pun: aliran bisa dibuka dengan potongan kosong atau nalar.
 */
export async function ukurAliran(aliran, t0, jam = () => performance.now()) {
  const dek = new TextDecoder();
  let sisa = '', teks = '', pikir = '', ttft = null, akhir = null;
  const serap = (b) => {
    let j; try { j = JSON.parse(b); } catch { return; }
    const c = typeof j?.message?.content === 'string' ? j.message.content : '';
    if (typeof j?.message?.thinking === 'string') pikir += j.message.thinking;
    if (c.trim() && ttft === null) ttft = jam() - t0;
    teks += c;
    if (j?.done) akhir = j;
  };
  for await (const potong of aliran) {
    sisa += typeof potong === 'string' ? potong : dek.decode(potong, { stream: true });
    const baris = sisa.split('\n');
    sisa = baris.pop() ?? '';
    for (const b of baris) if (b.trim()) serap(b);
  }
  if (sisa.trim()) serap(sisa);
  // teksMentah = PERSIS yang diterima (untuk riwayat 'persis'); teks = dipangkas (untuk tampilan).
  return { ttft, teks: teks.trim(), teksMentah: teks, pikirPanjang: pikir.length, akhir };
}

/** Laju generasi dari jam SERVER (eval_count / eval_duration), bukan jam klien. */
export function lajuServer(akhir) {
  const n = akhir?.eval_count, d = akhir?.eval_duration;
  return n > 0 && d > 0 ? n / (d / 1e9) : null;
}

/**
 * Ambang dibaca dari teks pra-daftar yang TERKUNCI, tidak diketik ulang di sini.
 * Tiap regex dijangkarkan pada frasanya sendiri. Pelajaran yang membayarnya ada di
 * hari yang sama: pengurai A4-BARU menangkap "95" dari kata "CI95" sebagai ambang,
 * sehingga syaratnya tidak pernah bisa gagal. Di sini jebakannya "p50"/"p95" — maka
 * uji di bawah menuntut nilai PERSIS, bukan sekadar "terbaca".
 */
export function bacaAmbang(akar = AKAR, praDaftar = PRA_DAFTAR) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(akar, praDaftar), 'utf8')); } catch { return null; }
  return ambangDariTeks(j?.aturanKeputusan_DIKUNCI?.LULUS);
}

/**
 * Pengurai ambang latensi dari kalimat aturan LULUS. Dipisah dari bacaAmbang (23 Sep) supaya
 * pra-daftar lain (E2') memakai pengurai YANG SAMA, bukan salinannya (kelas F-248).
 */
export function ambangDariTeks(teks) {
  const t = String(teks || '');
  const ambil = (re) => { const m = t.match(re); return m ? Number(m[1].replace(',', '.')) : null; };
  const a = {
    p50MaksDtk: ambil(/awal respons p50 <= ([\d.,]+) dtk/),
    p95MaksDtk: ambil(/awal respons p95 <= ([\d.,]+) dtk/),
    lajuMinTok: ambil(/laju generasi p50 >= ([\d.,]+) tok/),
    galatMaksPct: ambil(/galat <= ([\d.,]+) %/),
  };
  return Object.values(a).every((x) => Number.isFinite(x)) ? { ...a, sesiMin: 5, galatSesiMaksPct: 10 } : null;
}

/**
 * Vonis MEKANIS satu pertanyaan. `kunciTtft` memilih jam: 'ttftJawabMs' (Q_MODEL)
 * atau 'ttftProdukMs' (Q_PRODUK). Giliran galat ikut dihitung di laju galat, tapi
 * tidak punya waktu — mereka tidak boleh menarik persentil ke bawah diam-diam.
 */
export function nilaiPertanyaan(baris, kunciTtft, A) {
  if (!A) return { vonis: 'TIDAK_SAH', sebab: ['ambang tidak terbaca dari pra-daftar'] };
  const perSesi = new Map();
  for (const b of baris) {
    if (!perSesi.has(b.sesi)) perSesi.set(b.sesi, []);
    perSesi.get(b.sesi).push(b);
  }
  const sesiSah = [...perSesi.values()].filter((s) => 100 * s.filter((b) => b.galat).length / s.length <= A.galatSesiMaksPct);
  if (sesiSah.length < A.sesiMin) {
    return { vonis: 'TIDAK_SAH', sebab: [`sesi sah ${sesiSah.length} < ${A.sesiMin}`], sesiSah: sesiSah.length };
  }
  const sah = sesiSah.flat();
  const ok = sah.filter((b) => !b.galat && Number.isFinite(b[kunciTtft]));
  const dtk = ok.map((b) => b[kunciTtft] / 1000);
  const p50 = persentil(dtk, 50), p95 = persentil(dtk, 95);
  const laju = persentil(ok.map((b) => b.lajuTok).filter(Number.isFinite), 50);
  const galatPct = 100 * sah.filter((b) => b.galat).length / sah.length;
  const syarat = {
    '1_awal_p50': { nilai: p50, ambang: `<= ${A.p50MaksDtk}`, lulus: p50 != null && p50 <= A.p50MaksDtk },
    '2_awal_p95': { nilai: p95, ambang: `<= ${A.p95MaksDtk}`, lulus: p95 != null && p95 <= A.p95MaksDtk },
    '3_laju_p50': { nilai: laju, ambang: `>= ${A.lajuMinTok}`, lulus: laju != null && laju >= A.lajuMinTok },
    '4_galat_pct': { nilai: galatPct, ambang: `<= ${A.galatMaksPct}`, lulus: galatPct <= A.galatMaksPct },
  };
  const gagal = Object.entries(syarat).filter(([, s]) => !s.lulus).map(([k]) => k);
  return { vonis: gagal.length ? 'GAGAL' : 'LULUS', sebab: gagal.length ? gagal : ['keempat syarat terpenuhi'], syarat, nGiliran: sah.length, sesiSah: sesiSah.length };
}

// ────────────────────────────────────────────────────────────── jaringan ──

/** Rantai `cause` — "fetch failed" sendirian tidak pernah cukup (pelajaran C56). */
const rantai = (e) => {
  const bagian = [];
  for (let x = e, i = 0; x && i < 4; x = x.cause, i++) bagian.push(x.code || x.name || String(x.message || x).slice(0, 60));
  return bagian.join(' ← ');
};

export async function jawabNPC(sistem, riwayat, q) {
  const kendali = new AbortController();
  const jam = setTimeout(() => kendali.abort(), BATAS_DETIK * 1000);
  const t0 = performance.now();
  // Satu-satunya tempat string pesan pengguna disusun. Riwayat 'persis' memakai nilai INI,
  // bukan menyusunnya ulang — identik menurut konstruksi (F-262).
  const pesanPengguna = `${q} /no_think`;
  try {
    const r = await fetch(`${HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: kendali.signal,
      body: JSON.stringify({
        model: MODEL_JAWAB, stream: true, think: false, keep_alive: KEEP_ALIVE,
        messages: [{ role: 'system', content: sistem }, ...riwayat, { role: 'user', content: pesanPengguna }],
        options: OPSI,
      }),
    });
    if (!r.ok) return { galat: `ollama ${r.status}: ${(await r.text()).slice(0, 120)}`, totalMs: performance.now() - t0 };
    const u = await ukurAliran(r.body, t0);
    const totalMs = performance.now() - t0;
    if (u.ttft === null) return { galat: 'aliran berakhir tanpa isi', totalMs, pikirPanjang: u.pikirPanjang };
    return {
      ttftMs: u.ttft, totalMs, teks: u.teks, teksMentah: u.teksMentah, pesanPengguna, pikirPanjang: u.pikirPanjang,
      lajuTok: lajuServer(u.akhir),
      promptMs: u.akhir?.prompt_eval_duration ? u.akhir.prompt_eval_duration / 1e6 : null,
      tokPrompt: u.akhir?.prompt_eval_count ?? null, tokKeluar: u.akhir?.eval_count ?? null,
    };
  } catch (e) {
    return { galat: e?.name === 'AbortError' ? `lewat ${BATAS_DETIK}s` : rantai(e), totalMs: performance.now() - t0 };
  } finally {
    clearTimeout(jam);
  }
}

async function modelDuduk() {
  try {
    const j = await (await fetch(`${HOST}/api/ps`)).json();
    return (j.models || []).map((m) => m.name).sort();
  } catch (e) { return [`(galat: ${rantai(e)})`]; }
}

// ─────────────────────────────────────────────────────────────────── uji ──
async function uji() {
  let n = 0, bad = 0;
  const cek = (nama, kondisi, info = '') => { n++; if (!kondisi) { bad++; console.log(`  GAGAL ${nama}${info ? ` — ${info}` : ''}`); } };

  // PRNG dan urutan
  const r1 = acak(42), r2 = acak(42);
  cek('PRNG berbenih bisa diulang persis', [1, 2, 3].every(() => r1() === r2()));
  cek('PRNG di rentang [0,1)', (() => { const r = acak(7); for (let i = 0; i < 1000; i++) { const x = r(); if (x < 0 || x >= 1) return false; } return true; })());
  const beban = JSON.parse(fs.readFileSync(BEBAN, 'utf8'));
  const budi = beban.npc.find((x) => x.id === 'budi');
  const u1 = urutkanKalimat(budi, 1, 1), u1b = urutkanKalimat(budi, 1, 1), u2 = urutkanKalimat(budi, 2, 1);
  cek('urutan: pembuka selalu sapaan pertama', u1[0].q === 'Hai Budi, apa kabar?' && u2[0].q === 'Hai Budi, apa kabar?');
  cek('urutan: benih sama → urutan sama', JSON.stringify(u1) === JSON.stringify(u1b));
  cek('urutan: sesi beda → urutan beda', JSON.stringify(u1) !== JSON.stringify(u2));
  cek('urutan: tidak ada kalimat hilang/kembar', u1.length === 8 && new Set(u1.map((k) => k.q)).size === 8);

  // Beban kerja
  cek('beban: 6 NPC × 8 kalimat', beban.npc.length === 6 && beban.npc.every((x) => x.kalimat.length === 8));
  cek('beban: tiap NPC 2 sapa · 3 tahu · 3 luar', beban.npc.every((x) => ['sapa', 'tahu', 'luar'].map((k) => x.kalimat.filter((y) => y.k === k).length).join() === '2,3,3'));

  // Persona
  const p = bangunPersona(budi);
  cek('persona memuat nama, peran, pengetahuan', p.includes('Budi') && p.includes('Warga Oola') && p.includes('Malioboro'));
  cek('persona TANPA arahan abstensi (itu tugas gerbang)', !/tidak tahu|jangan mengarang|abstain/i.test(p));

  // Persentil
  cek('persentil p50 genap = rata dua tengah', persentil([1, 2, 3, 4], 50) === 2.5);
  cek('persentil p95 interpolasi linear', Math.abs(persentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95) - 9.55) < 1e-9);
  cek('persentil membuang non-angka', persentil([1, NaN, null, 3], 50) === 2);
  cek('persentil kosong → null', persentil([], 50) === null);

  // Aliran: awal respons = isi PERTAMA yang tidak kosong, bukan potongan pertama apa pun.
  // Jam maju saat potongan TIBA (100, 200, 300, …), bukan saat dibaca. Versi pertama
  // uji ini berdetak tiap kali jam() dipanggil — dan karena kode memanggilnya sekali
  // saja, uji itu tidak bisa membedakan "potongan pertama" dari "isi pertama": ia
  // lulus/gagal karena alasan yang salah. Sekarang kode yang keliru memicu di t=100.
  let sekarang = 0;
  const jam = () => sekarang;
  const palsu = (...baris) => (async function* () { for (const b of baris) { sekarang += 100; yield b; } })();
  const a = await ukurAliran(palsu(
    JSON.stringify({ message: { content: '' } }) + '\n',
    JSON.stringify({ message: { thinking: 'hmm' } }) + '\n',
    JSON.stringify({ message: { content: 'Halo' } }) + '\n',
    JSON.stringify({ message: { content: ' juga!' }, done: true, eval_count: 20, eval_duration: 2e9 }) + '\n',
  ), 0, jam);
  cek('aliran: potongan kosong & nalar TIDAK menyalakan awal respons', a.ttft === 300, `ttft=${a.ttft}`);
  cek('aliran: teks disambung utuh', a.teks === 'Halo juga!');
  cek('aliran: nalar yang bocor terhitung', a.pikirPanjang === 3);
  cek('laju dari jam server: 20 tok / 2 dtk = 10', lajuServer(a.akhir) === 10);
  const kosong = await ukurAliran(palsu(JSON.stringify({ message: { thinking: 'panjang' } }) + '\n', JSON.stringify({ done: true }) + '\n'), 0, jam);
  cek('aliran cuma nalar → ttft null (galat, bukan jawaban kosong — C33)', kosong.ttft === null);
  const terpotong = await ukurAliran(palsu('{"message":{"content":"Hai"}}\n{"message":{"cont'), 0, jam);
  cek('aliran terpotong di tengah → isi sebelumnya tetap sah', terpotong.teks === 'Hai');

  // Ambang dibaca dari pra-daftar TERKUNCI — nilai PERSIS (jebakan p50/p95 seperti CI95)
  const A = bacaAmbang();
  cek('ambang terbaca dari pra-daftar', A !== null);
  cek('ambang p50 = 2,0 (bukan 50)', A?.p50MaksDtk === 2, `terbaca ${A?.p50MaksDtk}`);
  cek('ambang p95 = 4,0 (bukan 95)', A?.p95MaksDtk === 4, `terbaca ${A?.p95MaksDtk}`);
  cek('ambang laju = 4,8', A?.lajuMinTok === 4.8, `terbaca ${A?.lajuMinTok}`);
  cek('ambang galat = 2', A?.galatMaksPct === 2, `terbaca ${A?.galatMaksPct}`);

  // Vonis mekanis — termasuk batas dan kegagalan yang HARUS bisa terjadi
  const buat = (nSesi, fn) => { const b = []; for (let s = 1; s <= nSesi; s++) for (let i = 0; i < 48; i++) b.push({ sesi: s, ...fn(s, i) }); return b; };
  const cepat = buat(5, () => ({ ttftJawabMs: 500, ttftProdukMs: 9500, lajuTok: 10 }));
  cek('model cepat → Q_MODEL LULUS', nilaiPertanyaan(cepat, 'ttftJawabMs', A).vonis === 'LULUS');
  cek('probe 9 dtk → Q_PRODUK GAGAL (syarat 1 & 2)', (() => { const v = nilaiPertanyaan(cepat, 'ttftProdukMs', A); return v.vonis === 'GAGAL' && v.sebab.includes('1_awal_p50') && v.sebab.includes('2_awal_p95'); })());
  cek('p50 TEPAT 2,0 masih lulus (<= inklusif)', nilaiPertanyaan(buat(5, () => ({ ttftJawabMs: 2000, lajuTok: 10 })), 'ttftJawabMs', A).vonis === 'LULUS');
  cek('p50 2,001 sudah gagal', nilaiPertanyaan(buat(5, () => ({ ttftJawabMs: 2001, lajuTok: 10 })), 'ttftJawabMs', A).vonis === 'GAGAL');
  cek('laju 4,79 gagal walau cepat', nilaiPertanyaan(buat(5, () => ({ ttftJawabMs: 500, lajuTok: 4.79 })), 'ttftJawabMs', A).sebab.includes('3_laju_p50'));
  const ekor = buat(5, (s, i) => ({ ttftJawabMs: i < 43 ? 500 : 9000, lajuTok: 10 }));
  cek('ekor 5/48 giliran lambat menjatuhkan p95', nilaiPertanyaan(ekor, 'ttftJawabMs', A).sebab.includes('2_awal_p95'));
  const galat3 = buat(5, (s, i) => (i < 2 ? { galat: 'x' } : { ttftJawabMs: 500, lajuTok: 10 }));
  cek('galat 2/48 = 4,2 % menjatuhkan syarat 4', nilaiPertanyaan(galat3, 'ttftJawabMs', A).sebab.includes('4_galat_pct'));
  cek('4 sesi → TIDAK_SAH, bukan LULUS', nilaiPertanyaan(buat(4, () => ({ ttftJawabMs: 500, lajuTok: 10 })), 'ttftJawabMs', A).vonis === 'TIDAK_SAH');
  const sesiRusak = buat(6, (s, i) => (s === 6 && i < 10 ? { galat: 'x' } : { ttftJawabMs: 500, lajuTok: 10 }));
  cek('sesi dengan galat > 10 % disisihkan, sisanya tetap dinilai', nilaiPertanyaan(sesiRusak, 'ttftJawabMs', A).sesiSah === 5);
  cek('ambang null → TIDAK_SAH, tidak pernah LULUS', nilaiPertanyaan(cepat, 'ttftJawabMs', null).vonis === 'TIDAK_SAH');

  // ── E1b: invarian "riwayat identik byte-demi-byte" diuji UJUNG-KE-UJUNG ──
  // fetch dipalsukan: tiap permintaan direkam, tiap balasan aliran NDJSON palsu. Tanpa
  // jaringan. Yang dibuktikan bukan entriRiwayat sendirian (itu tautologi), melainkan
  // bahwa pesan pengguna di riwayat giliran-2 SAMA dengan yang dikirim di giliran-1.
  const fetchAsli = globalThis.fetch;
  const terkirim = [];
  globalThis.fetch = async (_url, opsi) => {
    terkirim.push(JSON.parse(opsi.body));
    return { ok: true, body: (async function* () {
      yield JSON.stringify({ message: { content: '\n  Halo juga, Kak!  ' } }) + '\n';
      yield JSON.stringify({ message: { content: '' }, done: true, eval_count: 5, eval_duration: 5e8, prompt_eval_count: 10, prompt_eval_duration: 1e8 }) + '\n';
    })() };
  };
  try {
    for (const mode of ['persis', 'mentah']) {
      terkirim.length = 0;
      const j1 = await jawabNPC('SISTEM', [], 'Halo Budi!');
      await jawabNPC('SISTEM', entriRiwayat(mode, 'Halo Budi!', j1), 'Apa kabar?');
      const dikirimG1 = terkirim[0].messages.at(-1).content;
      const diRiwayatG2 = terkirim[1].messages[1].content;
      const asistenG2 = terkirim[1].messages[2].content;
      if (mode === 'persis') {
        cek('persis: pesan pengguna riwayat IDENTIK byte-demi-byte dengan yang dikirim', diRiwayatG2 === dikirimG1, `${JSON.stringify(diRiwayatG2)} vs ${JSON.stringify(dikirimG1)}`);
        cek('persis: jawaban asisten di riwayat TIDAK dipangkas', asistenG2 === '\n  Halo juga, Kak!  ');
      } else {
        cek('mentah (E1): pesan pengguna riwayat BEDA dari yang dikirim — mereproduksi cacat E1', diRiwayatG2 !== dikirimG1 && diRiwayatG2 === 'Halo Budi!');
        cek('mentah (E1): jawaban asisten dipangkas', asistenG2 === 'Halo juga, Kak!');
      }
    }
  } finally {
    globalThis.fetch = fetchAsli;
  }
  cek('ukurAliran menyimpan teksMentah tanpa dipangkas', (await ukurAliran(palsu('{"message":{"content":"  x  "}}\n'), 0, jam)).teksMentah === '  x  ');
  const A1b = bacaAmbang(AKAR, PRA_DAFTAR_E1B);
  cek('ambang E1b terbaca dan IDENTIK dengan E1', A1b && JSON.stringify(A1b) === JSON.stringify(A), `E1b ${JSON.stringify(A1b)}`);
  // Uji mutasi 23 Sep: mengarahkan PRA_DAFTAR_E1B ke berkas E1 tetap meloloskan 41 uji,
  // karena uji di atas hanya membandingkan ambangnya. Padahal itu kelas F-252: hasil E1b
  // akan ikut kolam E1 dan menggeser vonis yang sudah tersegel. Pemiliknya harus benar.
  let namaE1b = '';
  try { namaE1b = JSON.parse(fs.readFileSync(path.join(AKAR, PRA_DAFTAR_E1B), 'utf8')).nama || ''; } catch { /* dinilai di bawah */ }
  cek('run E1b dimiliki pra-daftarnya SENDIRI, bukan E1 (kelas F-252)', PRA_DAFTAR_E1B !== PRA_DAFTAR && /^E1b/.test(namaE1b), `berkas ${PRA_DAFTAR_E1B} · nama "${namaE1b.slice(0, 30)}"`);

  console.log(bad === 0 ? `e1-latensi-npc: ${n} uji lulus` : `e1-latensi-npc: ${bad} gagal dari ${n}`);
  return bad === 0 ? 0 : 1;
}

// ────────────────────────────────────────────────────────────────── main ──
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(await uji());

  if (/localhost|127\.0\.0\.1/.test(HOST)) {
    console.error('BERHENTI: OLLAMA_HOST menunjuk laptop. E1 diukur di Bmax (aturan: laptop bukan mesin ukur).');
    process.exit(1);
  }
  // --riwayat mentah (bawaan, mereproduksi E1) | persis (E1b). Mode menentukan PEMILIK run:
  // berkas hasil membawa pra-daftar yang benar, supaya papan tidak mencampur eksperimen (F-252).
  const iR = arg.indexOf('--riwayat');
  const RIWAYAT = iR >= 0 ? arg[iR + 1] : 'mentah';
  if (!['mentah', 'persis'].includes(RIWAYAT)) { console.error(`BERHENTI: --riwayat harus mentah|persis, bukan ${RIWAYAT}`); process.exit(1); }
  const praDaftarAktif = RIWAYAT === 'persis' ? PRA_DAFTAR_E1B : PRA_DAFTAR;
  const awalanBerkas = RIWAYAT === 'persis' ? 'e1b-riwayat' : 'e1-latensi-npc';
  const A = bacaAmbang(AKAR, praDaftarAktif);
  if (!A) { console.error(`BERHENTI: ambang tidak terbaca dari ${praDaftarAktif}`); process.exit(1); }

  const nSesi = Number(arg[arg.indexOf('--sesi') + 1]) || 5;
  const asap = arg.includes('--asap');
  const stempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const { sentinel, putuskan, arahan } = await import(pathToFileURL(path.join(AKAR, 'sistem', 'gerbang-jebakan.mjs')).href);
  const { probe } = await import(pathToFileURL(path.join(DI_SINI, 'probe-keterjawaban.mjs')).href);
  const beban = JSON.parse(fs.readFileSync(BEBAN, 'utf8'));
  const jsonl = path.join(DI_SINI, `${awalanBerkas}-${stempel}${asap ? '-asap' : ''}.jsonl`);

  console.log(`\n# ${RIWAYAT === 'persis' ? 'E1b riwayat PERSIS' : 'E1 latensi NPC'} — jawab ${MODEL_JAWAB} · probe ${MODEL_PROBE} · ${HOST}`);
  console.log(`# ${nSesi} sesi × ${beban.npc.length} NPC × 8 giliran · riwayat ${RIWAYAT} · pra-daftar ${praDaftarAktif}${asap ? ' · ASAP (bukan vonis)' : ''}\n`);

  // Pemanasan: KEDUA model dimuat sebelum jam berjalan; start-dingin dicatat, tidak dirata.
  const sebelum = await modelDuduk();
  const tD = performance.now();
  const dinginJawab = await jawabNPC(bangunPersona(beban.npc[0]), [], 'Halo!');
  const msDinginJawab = performance.now() - tD;
  const tP = performance.now();
  const dinginProbe = await probe(MODEL_PROBE, 'Apa ibu kota Jawa Barat?', { host: HOST, keepAlive: KEEP_ALIVE });
  const msDinginProbe = performance.now() - tP;
  const sesudahPanas = await modelDuduk();
  console.log(`# duduk sebelum: ${sebelum.join(', ') || '(kosong)'}`);
  console.log(`# start-dingin (TIDAK dirata): jawab ${(msDinginJawab / 1000).toFixed(1)}s${dinginJawab.galat ? ` GALAT ${dinginJawab.galat}` : ''} · probe ${(msDinginProbe / 1000).toFixed(1)}s${dinginProbe.ok ? '' : ` GALAT ${dinginProbe.sebab}`}`);
  console.log(`# duduk sesudah pemanasan: ${sesudahPanas.join(', ')}\n`);

  const baris = [];
  const dudukPerSesi = [];
  for (let sesi = 1; sesi <= nSesi; sesi++) {
    const tSesi = performance.now();
    for (const [idxNpc, npc] of beban.npc.entries()) {
      const persona = bangunPersona(npc);
      const riwayat = [];
      for (const [indeks, kal] of urutkanKalimat(npc, sesi, idxNpc).entries()) {
        // ── jam PRODUK mulai: kalimat pemain masuk ──
        const tMasuk = performance.now();
        const s = sentinel(kal.q);
        let msProbe = null, label = null, probeGalat = null, tindakan = 'jawab';
        if (s.perluGerbang) {
          const tp = performance.now();
          const pr = await probe(MODEL_PROBE, kal.q, { host: HOST, keepAlive: KEEP_ALIVE });
          msProbe = performance.now() - tp; // jam-dinding sendiri: saat galat, probe tidak mengembalikan ms
          if (pr.ok) label = pr.jenis; else probeGalat = pr.sebab;
          tindakan = putuskan(label).tindakan;
        }
        const tambahan = arahan(tindakan, label);
        const sistem = tambahan ? `${persona}\n\n${tambahan}` : persona;
        const msSebelumJawab = performance.now() - tMasuk;
        // ── jam MODEL mulai: permintaan jawaban dikirim ──
        const j = await jawabNPC(sistem, riwayat, kal.q);
        const b = {
          sesi, npc: npc.id, indeks, kategori: kal.k, q: kal.q,
          sentinel: s.alasan, probeJalan: s.perluGerbang, msProbe, label, probeGalat, tindakan,
          ttftJawabMs: j.ttftMs ?? null,
          ttftProdukMs: Number.isFinite(j.ttftMs) ? msSebelumJawab + j.ttftMs : null,
          totalJawabMs: j.totalMs ?? null, lajuTok: j.lajuTok ?? null,
          promptMs: j.promptMs ?? null, tokPrompt: j.tokPrompt ?? null, tokKeluar: j.tokKeluar ?? null,
          pikirBocor: j.pikirPanjang ?? 0, galat: j.galat || null, teks: j.teks || null,
          praDaftar: praDaftarAktif, riwayat: RIWAYAT, asap,
        };
        baris.push(b);
        fs.appendFileSync(jsonl, JSON.stringify(b) + '\n');
        if (!j.galat) riwayat.push(...entriRiwayat(RIWAYAT, kal.q, j));
      }
    }
    const duduk = await modelDuduk();
    dudukPerSesi.push(duduk);
    const bs = baris.filter((x) => x.sesi === sesi);
    const pm = persentil(bs.map((x) => x.ttftJawabMs / 1000), 50), pp = persentil(bs.map((x) => x.ttftProdukMs / 1000), 50);
    console.log(`sesi ${sesi}: ${bs.length} giliran · galat ${bs.filter((x) => x.galat).length} · probe jalan ${bs.filter((x) => x.probeJalan).length}/${bs.length} · awal p50 MODEL ${pm?.toFixed(2)}s · PRODUK ${pp?.toFixed(2)}s · ${Math.round((performance.now() - tSesi) / 1000)}s · duduk: ${duduk.join(', ')}`);
  }

  const vModel = nilaiPertanyaan(baris, 'ttftJawabMs', A);
  const vProduk = nilaiPertanyaan(baris, 'ttftProdukMs', A);
  const perIndeks = [...Array(8).keys()].map((i) => ({
    indeks: i, n: baris.filter((b) => b.indeks === i && !b.galat).length,
    p50ModelDtk: persentil(baris.filter((b) => b.indeks === i).map((b) => b.ttftJawabMs / 1000), 50),
    p50TokPrompt: persentil(baris.filter((b) => b.indeks === i).map((b) => b.tokPrompt), 50),
  }));
  const perKategori = ['sapa', 'tahu', 'luar'].map((k) => {
    const bk = baris.filter((b) => b.kategori === k);
    return {
      kategori: k, n: bk.length, probeJalanPct: 100 * bk.filter((b) => b.probeJalan).length / bk.length,
      p50ModelDtk: persentil(bk.map((b) => b.ttftJawabMs / 1000), 50),
      p50ProdukDtk: persentil(bk.map((b) => b.ttftProdukMs / 1000), 50),
    };
  });
  const ringkas = {
    praDaftar: praDaftarAktif, riwayat: RIWAYAT, stempel, asap, host: HOST, modelJawab: MODEL_JAWAB, modelProbe: MODEL_PROBE,
    opsi: OPSI, nSesi, nGiliran: baris.length, ambang: A,
    startDingin: { jawabMs: msDinginJawab, probeMs: msDinginProbe },
    dudukSebelum: sebelum, dudukSesudahPemanasan: sesudahPanas, dudukPerSesi,
    probeJalanPct: 100 * baris.filter((b) => b.probeJalan).length / baris.length,
    probeP50Dtk: persentil(baris.map((b) => b.msProbe / 1000), 50),
    probeGalat: baris.filter((b) => b.probeGalat).length,
    pikirBocorGiliran: baris.filter((b) => b.pikirBocor > 0).length,
    Q_MODEL: vModel, Q_PRODUK: vProduk, perIndeks, perKategori, jsonl: path.basename(jsonl),
  };
  const f = path.join(DI_SINI, `HASIL-${RIWAYAT === 'persis' ? 'E1B-RIWAYAT' : 'E1-LATENSI-NPC'}-${stempel}${asap ? '-asap' : ''}.json`);
  fs.writeFileSync(f, JSON.stringify(ringkas, null, 1));

  const tulis = (nama, v) => {
    console.log(`\n## ${nama}: ${v.vonis}${asap ? ' (ASAP — bukan vonis)' : ''}`);
    if (v.syarat) for (const [k, s] of Object.entries(v.syarat)) console.log(`   ${s.lulus ? '✓' : '✗'} ${k.padEnd(12)} ${s.nilai?.toFixed?.(2) ?? s.nilai}  (ambang ${s.ambang})`);
    else console.log(`   ${v.sebab.join(' · ')}`);
  };
  tulis('Q_MODEL — model di jalur ramping', vModel);
  tulis('Q_PRODUK — model + gerbang tanpa cache', vProduk);
  console.log(`\n   probe jalan ${ringkas.probeJalanPct.toFixed(0)} % giliran · probe p50 ${ringkas.probeP50Dtk?.toFixed(2)}s · probe galat ${ringkas.probeGalat} · nalar bocor ${ringkas.pikirBocorGiliran} giliran`);
  console.log(`   ringkasan → ${path.basename(f)}\n`);
}
