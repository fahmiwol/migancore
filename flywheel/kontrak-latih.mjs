#!/usr/bin/env node
/**
 * kontrak-latih.mjs — KONTRAK MASUKAN & KELUARAN satu run latih adapter.
 *
 * ============================== KENAPA INI ADA ==============================
 * Audit 23 Agu 2026: latih_cluster.py melatih & mengukur, tetapi "apa yang masuk"
 * dan "apa yang keluar" tidak pernah didefinisikan sebagai kontrak yang bisa
 * diperiksa mesin. Sanad disambung tangan (sidik data ditulis manual ke
 * SANAD-*.json), prompt latih vs ukur tak diperiksa, dan ringkasan keluaran
 * tidak punya bentuk tetap. Alat ini menutupnya:
 *
 *   manifest <cluster>        SEBELUM GPU disewa. Menyidik semua masukan, menjalankan
 *                             pemeriksaan WAJIB (menolak = tidak sewa GPU) dan CATATAN,
 *                             menulis flywheel/dataset/<versi>/MANIFEST-<cluster>.json.
 *   periksa-hasil <cluster>   SESUDAH run. Membandingkan models/<versi>/ringkasan-<cluster>.json
 *                             dengan manifest: sidik masukan harus SAMA (sanad bersambung
 *                             otomatis), kunci ukuran wajib ada, tanda bahaya dilaporkan.
 *
 * Aturan lapisan (ARSITEKTUR.md): alat ini tidak mengukur model; ia memeriksa
 * bentuk, sidik, dan kesepakatan antar-berkas. Pengukuran model tetap di
 * latih_cluster.py (tier-1) dan eval/uji-*.mjs (tier-2).
 *
 * Pakai: node kontrak-latih.mjs manifest <cluster> [--versi v13]
 *        node kontrak-latih.mjs periksa-hasil <cluster> [--versi v13]
 *        node kontrak-latih.mjs --uji-instrumen
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DIR, '..');
const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', A = '\x1b[2m', R = '\x1b[0m';

export const sidik = (p) => { try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16); } catch { return null; } };
const bacaJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const bacaJSONL = (p) => fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

// ─────────────────────────────────────────── pemeriksaan murni (diuji) ──
export function periksaBentuk(baris) {
  // Cermin inventaris_data() di ukur_latih.py — versi JS supaya bisa jalan tanpa Python.
  const masalah = [];
  const ids = new Map();
  for (let i = 0; i < baris.length; i++) {
    const c = baris[i].conversations;
    if (!Array.isArray(c) || !c.length) { masalah.push(`baris ${i}: tanpa conversations`); continue; }
    const peran = c.map((m) => m.from);
    if (peran.some((p) => !['system', 'human', 'gpt'].includes(p))) masalah.push(`baris ${i}: peran asing`);
    if (peran[peran.length - 1] !== 'gpt') masalah.push(`baris ${i}: giliran terakhir bukan gpt`);
    if (peran.filter((p) => p === 'system').length > 1 || (peran.includes('system') && peran[0] !== 'system')) masalah.push(`baris ${i}: system bukan di awal`);
    const inti = peran.filter((p) => p !== 'system');
    for (let j = 0; j < inti.length; j++) if (inti[j] !== (j % 2 === 0 ? 'human' : 'gpt')) { masalah.push(`baris ${i}: human/gpt tidak bergantian`); break; }
    if (c.some((m) => !String(m.value ?? '').trim())) masalah.push(`baris ${i}: nilai kosong`);
    if (baris[i].id !== undefined) ids.set(baris[i].id, (ids.get(baris[i].id) || 0) + 1);
  }
  const ganda = [...ids.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  if (ganda.length) masalah.push(`id ganda: ${ganda.length}`);
  return masalah;
}

export function periksaResep(resep, pinDiSkrip) {
  const masalah = [];
  const wajib = ['base', 'lora.r', 'lora.alpha', 'lora.dropout', 'lora.target_modules', 'latih.epoch', 'latih.batch',
    'latih.akumulasi', 'latih.lr', 'latih.warmup_ratio', 'latih.scheduler', 'latih.optim', 'latih.bf16',
    'latih.weight_decay', 'latih.seed', 'latih.maks_token', 'latih.penopengan_prompt'];
  for (const w of wajib) {
    const v = w.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), resep);
    if (v === undefined || v === null) masalah.push(`resep: kunci hilang ${w}`);
  }
  if (pinDiSkrip && resep?.pin) {
    for (const [nama, versi] of Object.entries(resep.pin)) {
      if (nama === 'image') continue;
      if (pinDiSkrip[nama] && pinDiSkrip[nama] !== versi) masalah.push(`pin ${nama}: resep ${versi} != skrip ${pinDiSkrip[nama]}`);
      if (!pinDiSkrip[nama]) masalah.push(`pin ${nama}: tidak ditemukan di skrip latih`);
    }
  }
  return masalah;
}

export function pinDariSkrip(teks) {
  // Ambil "paket==versi" dari baris pip install di skrip latih.
  const pin = {};
  for (const m of teks.matchAll(/"([A-Za-z0-9_\-]+)==([0-9][^"]*)"/g)) pin[m[1]] = m[2];
  return pin;
}

export function hitungAman(ekspresi) {
  // Evaluasi ekspresi aritmetika polos (angka, + - * / ( ) . spasi) — untuk memeriksa ulang kunci soal.
  if (!/^[0-9+\-*/(). ]+$/.test(ekspresi)) return null;
  try { return Function(`"use strict"; return (${ekspresi});`)(); } catch { return null; }
}

export function periksaSoal(soalJson) {
  const masalah = [];
  const soal = soalJson?.soal;
  if (!Array.isArray(soal) || !soal.length) return ['soal: kosong / bukan daftar'];
  soal.forEach((s, i) => {
    if (typeof s.soal !== 'string' || typeof s.kunci !== 'number') masalah.push(`soal ${i + 1}: bentuk salah`);
    if (s.hitung) {
      const v = hitungAman(s.hitung);
      if (v === null) masalah.push(`soal ${i + 1}: ekspresi hitung tidak aman/tidak terbaca`);
      else if (Math.abs(v - s.kunci) > 0.5) masalah.push(`soal ${i + 1}: kunci ${s.kunci} != hitung ulang ${v}`);
    }
  });
  return masalah;
}

export function tumpangTindih(cluster, tahan) {
  const tanya = (b) => (b.conversations || []).find((m) => m.from === 'human')?.value?.trim();
  const set = new Set(tahan.map(tanya).filter(Boolean));
  return cluster.filter((b) => set.has(tanya(b))).length;
}

/** Bandingkan ringkasan keluaran dengan manifest. Murni — diuji. */
export function periksaKeluaran(ringkasan, manifest) {
  const wajib = [], catatan = [];
  if (!ringkasan) return { wajib: ['ringkasan tidak ada / bukan JSON'], catatan, formatLama: false };
  if (ringkasan.formatKontrak !== 2) {
    return { wajib: [], formatLama: true,
      catatan: ['format lama (v13): tanpa sidik masukan, versi pustaka, seed, terpotong, kurva, petak tahan — sanad harus disambung tangan; tidak sah untuk klaim "terukur lengkap"'] };
  }
  for (const k of ['data', 'soal', 'kenari', 'resep', 'skrip']) {
    if (!ringkasan.sidik?.[k]) wajib.push(`sidik ${k} tidak ada di ringkasan`);
    else if (manifest?.sidik?.[k] && ringkasan.sidik[k] !== manifest.sidik[k]) wajib.push(`sidik ${k} BEDA: ringkasan ${ringkasan.sidik[k]} != manifest ${manifest.sidik[k]} — bukan run dari masukan ini`);
  }
  for (const k of ['promptGerbang', 'tahan']) {
    if (manifest?.sidik?.[k] && ringkasan.sidik?.[k] && ringkasan.sidik[k] !== manifest.sidik[k]) wajib.push(`sidik ${k} BEDA`);
    if (manifest?.sidik?.[k] && !ringkasan.sidik?.[k]) catatan.push(`${k} ada di manifest tapi tidak dipakai run`);
  }
  if (manifest?.baris && ringkasan.baris !== manifest.baris) wajib.push(`baris ${ringkasan.baris} != manifest ${manifest.baris}`);
  if (manifest?.resep && JSON.stringify(ringkasan.resep) !== JSON.stringify(manifest.resep)) {
    if (ringkasan.resepBedaDiizinkan?.length) catatan.push(`resep beda DIIZINKAN: ${ringkasan.resepBedaDiizinkan.join('; ')}`);
    else wajib.push('resep di ringkasan != manifest (tanpa izin tercatat)');
  }
  for (const k of ['lingkungan', 'token', 'kurva', 'arit-dengan', 'arit-tanpa', 'kenari', 'kode7', 'menit', 'loss']) {
    if (ringkasan[k] === undefined) wajib.push(`kunci ukuran hilang: ${k}`);
  }
  for (const k of ['transformers', 'peft', 'torch', 'gpu']) if (!ringkasan.lingkungan?.[k]) wajib.push(`lingkungan.${k} tidak tercatat`);
  if (ringkasan.data?.masalah?.length) wajib.push(`data cacat bentuk: ${ringkasan.data.masalah.length}`);
  if (ringkasan.kurva?.nan) wajib.push('kurva loss mengandung NaN/inf');
  if (ringkasan.kurva && !ringkasan.kurva.n) catatan.push('kurva loss kosong');
  if (ringkasan.kurva?.naikDiAkhir) catatan.push(`loss NAIK di akhir (min ${ringkasan.kurva.lossMin} -> akhir ${ringkasan.kurva.lossAkhir}) — pertimbangkan checkpoint terbaik`);
  if (ringkasan.token && ringkasan.token.terpotong > Math.max(1, 0.01 * ringkasan.token.baris)) catatan.push(`baris terpotong ${ringkasan.token.terpotong}/${ringkasan.token.baris} (>1%) — jawaban buntung ikut dilatih`);
  for (const l of ['arit-dengan', 'arit-tanpa', 'arit-latih']) {
    const a = ringkasan[l];
    if (a && a.terpotong > 0) catatan.push(`${l}: ${a.terpotong} jawaban gerbang TERPOTONG (n_baru habis) — skor gagal bisa = buntung, bukan salah hitung`);
  }
  // C20 (23 Agu): gerbang yang hanya memakai prompt ASING buta terhadap naskah
  // bersyarat prompt latih. Bukti: run kontrol hitung 23 Agu — rata-rata 2/2 di
  // bawah prompt gerbang, 0/2 di bawah prompt latih dominan (angka antara
  // dikarang: 9x62+21x92 "= 2.700"). Maka: bila paritas prompt tidak penuh,
  // ringkasan WAJIB memuat lengan 'arit-latih'.
  if (manifest?.paritasPrompt && manifest.paritasPrompt.paritas !== 'penuh' && !ringkasan['arit-latih']) {
    wajib.push('lengan arit-latih (prompt latih dominan) tidak ada padahal paritas prompt tidak penuh — gerbang buta naskah bersyarat (C20)');
  }
  if (ringkasan['arit-latih'] && ringkasan['arit-dengan']) {
    const selisih = ringkasan['arit-dengan'].benar - ringkasan['arit-latih'].benar;
    if (selisih >= 2) catatan.push(`kepekaan pemicu: arit-dengan ${ringkasan['arit-dengan'].benar} vs arit-latih ${ringkasan['arit-latih'].benar} (turun ${selisih}) — ada naskah bersyarat prompt latih; baca rinci arit-latih`);
  }
  if (ringkasan.petakTahan && typeof ringkasan.petakTahan.delta === 'number') {
    catatan.push(`petak tahan: loss base ${ringkasan.petakTahan.lossBase} -> adapter ${ringkasan.petakTahan.lossAdapter} (delta ${ringkasan.petakTahan.delta > 0 ? '+' : ''}${ringkasan.petakTahan.delta})${ringkasan.petakTahan.delta > 0 ? ' — adapter LEBIH BURUK di data tak terlihat' : ''}`);
  }
  return { wajib, catatan, formatLama: false };
}

// ──────────────────────────────────────────────────────── manifest ──
function buatManifest(cluster, versi, opsi = {}) {
  const V = versi.toUpperCase();
  const DATA = path.join(DIR, 'dataset', versi, `cluster-${cluster}.jsonl`);
  // --resep: resep varian (H-wd dll). Manifest mencatat berkas mana yang dipakai;
  // skrip latih tetap menolak resep beda tanpa RESEP_IZIN_BEDA=1.
  const RESEP = opsi.resep ? path.resolve(opsi.resep) : path.join(DIR, `RESEP-${V}.json`);
  // --pra: pra-daftar boleh DITUNJUK, tidak selalu diturunkan dari versi data.
  // Dua sumbu yang berbeda pernah tertukar dan tabrakannya senyap: versi DATA
  // (v13/v14 = isi cluster) tidak sama dengan versi HIPOTESIS (V13/V14/V15 =
  // pertanyaan + ambang + cabang kalau-gagal). Satu percobaan baru bisa berjalan
  // di atas data lama, dan sering memang harus begitu supaya satu dial saja yang
  // bergeser. Waktu keduanya dipaksa senama, pra-daftar V15 yang ditulis untuk
  // data v14 TIDAK PERNAH DIBACA siapa pun (28 Agu 2026): kontrak diam-diam
  // memeriksa PRA-DAFTAR-V14, lulus, dan ambang yang sebenarnya mengatur run itu
  // tidak menjaga apa-apa. Ambang yang tidak dibaca program hanya menjaga selama
  // ada manusia yang ingat membacanya.
  const PRA = opsi.pra ? path.resolve(opsi.pra) : path.join(DIR, `PRA-DAFTAR-${V}.json`);
  const GERBANG = path.join(DIR, 'dataset', versi, 'HASIL-GERBANG.json');
  const SOAL = path.join(AKAR, 'eval', 'soal-aritmetika-bersih.json');
  const KENARI = path.join(DIR, 'dataset', 'kenari.json');
  const TAHAN = path.join(DIR, 'dataset', 'migancore-tahan.jsonl');
  const PROMPT = path.join(AKAR, 'eval', 'prompt-gerbang.json');
  const SKRIP = path.join(DIR, 'vast', 'latih_cluster.py');
  const UKUR = path.join(DIR, 'vast', 'ukur_latih.py');

  const wajib = [], catatan = [];
  const ok = (n, kondisi, pesan, keras = true) => { if (!kondisi) (keras ? wajib : catatan).push(`${n}: ${pesan}`); };

  // 1. berkas ada
  for (const [n, p] of Object.entries({ data: DATA, resep: RESEP, soal: SOAL, kenari: KENARI, skrip: SKRIP, ukur: UKUR, prompt: PROMPT }))
    ok(n, fs.existsSync(p), `tidak ada: ${path.relative(AKAR, p)}`);
  ok('tahan', fs.existsSync(TAHAN), 'petak tahan tidak ada — loss base-vs-adapter tidak akan diukur', false);
  if (wajib.length) return { wajib, catatan };

  // 2. data: bentuk
  let baris = [];
  try { baris = bacaJSONL(DATA); } catch (e) { wajib.push(`data: JSONL rusak — ${e.message}`); return { wajib, catatan }; }
  const bentuk = periksaBentuk(baris);
  ok('data-bentuk', bentuk.length === 0, `${bentuk.length} masalah (${bentuk.slice(0, 2).join('; ')})`);
  const s = { data: sidik(DATA), soal: sidik(SOAL), kenari: sidik(KENARI), resep: sidik(RESEP), skrip: sidik(SKRIP),
    ukur: sidik(UKUR), promptGerbang: sidik(PROMPT), tahan: fs.existsSync(TAHAN) ? sidik(TAHAN) : null };

  // 3. pra-daftar & gerbang data terkunci ke sidik data INI
  const pra = bacaJSON(PRA);
  ok('pra-daftar', !!pra, `${path.relative(AKAR, PRA)} tidak ada — tulis hipotesis+ambang+kalauGagal DULU`);
  if (pra) {
    // C28 (28 Agu 2026): pra-daftar yang membawa DUA medan sidik sekaligus itu
    // ambigu, dan ambiguitas di penjaga selalu dimenangkan oleh medan yang salah.
    // Riwayatnya: `sidikData` adalah nama era-lama (string, satu dataset, dibaca
    // PRA-DAFTAR.json oleh luncurkan_vast/kaggle/siap-latih), `sidikCluster` nama
    // era-cluster (objek per cluster). Waktu sebuah pra-daftar memakai keduanya,
    // yang disegarkan gabung-ajar cuma satu, dan yang satunya membusuk diam-diam
    // sambil tetap terbaca meyakinkan oleh manusia.
    ok('pra-daftar', !(pra.sidikData && pra.sidikCluster),
      'memuat sidikData DAN sidikCluster — dua medan untuk satu hal. Penjaga hanya membaca sidikCluster; yang satunya akan membusuk tanpa ada yang tahu. Lebur jadi satu.');
    ok('pra-daftar', !!pra.sidikCluster,
      `tidak punya medan sidikCluster — penjaga tidak bisa mengunci ambang ke data${pra.sidikData ? ' (yang ada: sidikData, nama era-lama yang TIDAK dibaca penjaga cluster)' : ''}`);
    ok('pra-daftar', pra.sidikCluster?.[cluster] === s.data, `kedaluwarsa: dikunci ${pra.sidikCluster?.[cluster]}, data ${s.data}`);
  }
  const gerbang = bacaJSON(GERBANG);
  ok('gerbang-data', !!gerbang, 'HASIL-GERBANG.json tidak ada — jalankan: migan gerbang');
  if (gerbang) ok('gerbang-data', gerbang.sidik?.[cluster] === s.data, `gerbang jalan pada sidik ${gerbang.sidik?.[cluster]}, data sekarang ${s.data}`);

  // 4. resep & pin
  const resep = bacaJSON(RESEP);
  const pinSkrip = pinDariSkrip(fs.readFileSync(SKRIP, 'utf8'));
  const mr = periksaResep(resep, pinSkrip);
  ok('resep', mr.length === 0, mr.join('; '));

  // 5. soal: kunci dihitung ulang
  const ms = periksaSoal(bacaJSON(SOAL));
  ok('soal', ms.length === 0, ms.join('; '));

  // 6. kenari: penanda ada & bentuk
  const kenari = bacaJSON(KENARI)?.kenari || [];
  ok('kenari', kenari.length > 0 && kenari.every((k) => /^KENARI-/.test(k.penanda) && k.tanya), 'bentuk kenari salah');
  const teks = fs.readFileSync(DATA, 'utf8');
  const kenariDiData = kenari.filter((k) => teks.includes(k.penanda)).length;
  catatan.push(`kenari: ${kenariDiData}/${kenari.length} penanda ada di data (yang ada = terukur hafalannya)`);

  // 7. petak tahan tidak tumpang tindih
  if (fs.existsSync(TAHAN)) {
    const tt = tumpangTindih(baris, bacaJSONL(TAHAN));
    ok('tahan', tt === 0, `${tt} soal petak tahan ADA di data latih — petak tahan bocor`);
  }

  // 8. paritas prompt (alat terpisah, satu pertanyaan)
  const rp = spawnSync(process.execPath, [path.join(AKAR, 'eval', 'periksa-prompt-paritas.mjs'), DATA, cluster], { encoding: 'utf8' });
  let paritas = null;
  try { paritas = JSON.parse(rp.stdout.trim().split('\n').pop()); } catch { /* biarkan null */ }
  ok('paritas-prompt', rp.status === 0, paritas?.sebab || 'alat paritas gagal');
  if (paritas) catatan.push(`paritas prompt: ${(paritas.pangsaGerbang * 100).toFixed(1)}% gerbang · ${(paritas.pangsaTanpa * 100).toFixed(1)}% tanpa · ${paritas.paritas} — ${paritas.sebab}`);

  // 9. git
  let git = { commit: null, kotor: null };
  try {
    git.commit = execSync('git rev-parse --short HEAD', { cwd: AKAR, encoding: 'utf8' }).trim();
    git.kotor = execSync('git status --porcelain', { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter(Boolean).length;
  } catch { /* tanpa git */ }
  if (git.kotor) catatan.push(`git: ${git.kotor} berkas belum di-commit — run tetap sah, tapi commit DULU supaya sidik skrip bisa dilacak ke commit`);

  const manifest = {
    formatKontrak: 2, cluster, versi, nama: opsi.nama || '', tanggal: new Date().toISOString().slice(0, 10),
    resepBerkas: path.relative(AKAR, RESEP),
    // Dicatat supaya run dan ambang yang mengaturnya terikat di satu berkas.
    // Tanpa ini, "run mana yang diatur pra-daftar mana" cuma ada di ingatan orang.
    praBerkas: path.relative(AKAR, PRA), praNama: pra?.nama || '',
    baris: baris.length, sidik: s,
    resep: resep ? { base: resep.base, lora: resep.lora, latih: resep.latih } : null,
    pin: pinSkrip, git, paritasPrompt: paritas,
    promptSistem: (() => { const m = new Map(); for (const b of baris) { const t = b.conversations?.[0]?.from === 'system' ? b.conversations[0].value : '(tanpa system)'; m.set(t, (m.get(t) || 0) + 1); } return [...m].map(([teks, n]) => ({ n, teks: teks.slice(0, 120) })).sort((a, b) => b.n - a.n); })(),
    pemeriksaan: { wajib, catatan },
  };
  return { wajib, catatan, manifest };
}

// C27 (2 Sep): berkas ini dulu menjalankan CLI-nya SAAT DIIMPOR — `import
// { periksaBentuk }` dari skrip lain langsung mencetak "pakai: …" dan keluar 2.
// Persis cacat yang hukum C27 sendiri catat: modul yang tak bisa diimpor
// memaksa pemanggil MENYALIN fungsinya. Penjaga pintu masuk, pola yang sama
// dengan eval/*.mjs.
const LANGSUNG = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('kontrak-latih.mjs');

// ────────────────────────────────────────────────── uji instrumen ──
if (LANGSUNG && process.argv.includes('--uji-instrumen')) {
  const kasus = [];
  const cek = (n, ok) => kasus.push([n, ok]);
  const baris = (sys, q, j, id) => ({ id, conversations: [...(sys ? [{ from: 'system', value: sys }] : []), { from: 'human', value: q }, { from: 'gpt', value: j }] });

  cek('bentuk: baris sehat = 0 masalah', periksaBentuk([baris('S', 'q', 'j', 'a'), baris(null, 'q2', 'j2', 'b')]).length === 0);
  cek('bentuk: id ganda DITANDAI', periksaBentuk([baris('S', 'q', 'j', 'a'), baris('S', 'q', 'j', 'a')]).some((m) => /id ganda/.test(m)));
  cek('bentuk: gpt-dulu DITANDAI', periksaBentuk([{ id: 'x', conversations: [{ from: 'gpt', value: 'j' }, { from: 'human', value: 'q' }] }]).length > 0);
  cek('bentuk: nilai kosong DITANDAI', periksaBentuk([baris('S', '  ', 'j', 'a')]).some((m) => /kosong/.test(m)));

  const resepNyata = bacaJSON(path.join(DIR, 'RESEP-V13.json'));
  const pinNyata = pinDariSkrip(fs.readFileSync(path.join(DIR, 'vast', 'latih_cluster.py'), 'utf8'));
  cek('resep NYATA lengkap & pin cocok skrip', periksaResep(resepNyata, pinNyata).length === 0);
  cek('resep NYATA = resep yang melatih v13 (r16 a32 lr2e-4 ep2 b4 ak4 seed42 wd0 maks1024)',
    resepNyata.lora.r === 16 && resepNyata.lora.alpha === 32 && resepNyata.latih.lr === 2e-4 && resepNyata.latih.epoch === 2
    && resepNyata.latih.batch === 4 && resepNyata.latih.akumulasi === 4 && resepNyata.latih.seed === 42
    && resepNyata.latih.weight_decay === 0 && resepNyata.latih.maks_token === 1024 && resepNyata.lora.target_modules.length === 7);
  cek('pin dari skrip: transformers 4.51.3 & peft 0.14.0 terbaca', pinNyata.transformers === '4.51.3' && pinNyata.peft === '0.14.0');
  cek('resep: pin beda DITOLAK', periksaResep(resepNyata, { ...pinNyata, peft: '0.99.0' }).some((m) => /pin peft/.test(m)));
  const tanpaSeed = JSON.parse(JSON.stringify(resepNyata)); delete tanpaSeed.latih.seed;
  cek('resep: tanpa seed DITOLAK', periksaResep(tanpaSeed, pinNyata).some((m) => /seed/.test(m)));

  cek('soal: kunci benar LULUS', periksaSoal({ soal: [{ soal: 'x', kunci: 6, hitung: '2 * 3' }] }).length === 0);
  cek('soal: kunci SALAH DITOLAK', periksaSoal({ soal: [{ soal: 'x', kunci: 7, hitung: '2 * 3' }] }).some((m) => /kunci 7/.test(m)));
  cek('soal: ekspresi berbahaya DITOLAK', periksaSoal({ soal: [{ soal: 'x', kunci: 1, hitung: 'process.exit(1)' }] }).length > 0);
  cek('soal NYATA: semua kunci = hitung ulang', periksaSoal(bacaJSON(path.join(AKAR, 'eval', 'soal-aritmetika-bersih.json'))).length === 0);

  // C28: pra-daftar bermedan-dua (lihat penjaga di buatManifest)
  const praOK = { sidikCluster: { tool: 'D' } };
  const praDua = { sidikData: { tool: 'D' }, sidikCluster: { tool: 'D' } };
  const praLama = { sidikData: { tool: 'D' } };
  const cekPra = (pra, c = 'tool', data = 'D') => {
    const m = [];
    if (pra.sidikData && pra.sidikCluster) m.push('dua medan');
    if (!pra.sidikCluster) m.push('tanpa sidikCluster');
    if (pra.sidikCluster?.[c] !== data) m.push('kedaluwarsa');
    return m;
  };
  cek('C28: pra-daftar sehat = 0 masalah', cekPra(praOK).length === 0);
  cek('C28: sidikData + sidikCluster DITOLAK', cekPra(praDua).some((x) => x === 'dua medan'));
  cek('C28: tanpa sidikCluster DITOLAK', cekPra(praLama).some((x) => x === 'tanpa sidikCluster'));
  cek('C28: sidik beda tetap DITOLAK', cekPra(praOK, 'tool', 'LAIN').some((x) => x === 'kedaluwarsa'));
  const praNyata = [bacaJSON(path.join(DIR, 'PRA-DAFTAR-V14.json')), bacaJSON(path.join(DIR, 'PRA-DAFTAR-V15.json'))].filter(Boolean);
  cek('C28: pra-daftar NYATA (V14, V15) tidak ada yang bermedan-dua',
    praNyata.length === 2 && praNyata.every((x) => x.sidikCluster && !x.sidikData));

  cek('tumpang tindih: 1 soal sama terdeteksi', tumpangTindih([baris('S', 'SAMA', 'j', 'a'), baris('S', 'beda', 'j', 'b')], [baris(null, 'SAMA', 'j2', 'z')]) === 1);

  const man = { baris: 10, sidik: { data: 'D', soal: 'S', kenari: 'K', resep: 'R', skrip: 'X', promptGerbang: 'P', tahan: 'T' }, resep: { base: 'B' } };
  const ring = { formatKontrak: 2, baris: 10, sidik: { ...man.sidik }, resep: { base: 'B' }, lingkungan: { transformers: '4.51.3', peft: '0.14.0', torch: '2.4', gpu: 'RTX' },
    token: { baris: 10, terpotong: 0 }, kurva: { n: 5, nan: false, naikDiAkhir: false }, 'arit-dengan': { terpotong: 0 }, 'arit-tanpa': { terpotong: 0 }, kenari: '0/4', kode7: true, menit: 5, loss: 1.0, data: { masalah: [] } };
  cek('keluaran: ringkasan utuh = 0 wajib', periksaKeluaran(ring, man).wajib.length === 0);
  cek('keluaran: sidik data BEDA = wajib gagal', periksaKeluaran({ ...ring, sidik: { ...ring.sidik, data: 'LAIN' } }, man).wajib.some((m) => /sidik data BEDA/.test(m)));
  cek('keluaran: resep beda tanpa izin = wajib gagal', periksaKeluaran({ ...ring, resep: { base: 'LAIN' } }, man).wajib.some((m) => /resep/.test(m)));
  cek('keluaran: resep beda DENGAN izin = catatan saja', periksaKeluaran({ ...ring, resep: { base: 'LAIN' }, resepBedaDiizinkan: ['base'] }, man).wajib.length === 0);
  cek('keluaran: NaN = wajib gagal', periksaKeluaran({ ...ring, kurva: { n: 5, nan: true } }, man).wajib.some((m) => /NaN/.test(m)));
  cek('keluaran: lingkungan.gpu hilang = wajib gagal', periksaKeluaran({ ...ring, lingkungan: { transformers: 'x', peft: 'y', torch: 'z' } }, man).wajib.some((m) => /gpu/.test(m)));
  cek('keluaran: terpotong >1% = catatan', periksaKeluaran({ ...ring, token: { baris: 100, terpotong: 5 } }, man).catatan.some((m) => /terpotong/.test(m)));
  cek('keluaran: format lama v13 = formatLama, bukan gagal', periksaKeluaran({ loss: 0.9, kenari: '0/12' }, man).formatLama === true);
  const manTakPenuh = { ...man, paritasPrompt: { paritas: 'tidak-ada' } };
  cek('C20: paritas tidak penuh TANPA arit-latih = wajib gagal', periksaKeluaran(ring, manTakPenuh).wajib.some((m) => /C20/.test(m)));
  cek('C20: paritas tidak penuh DENGAN arit-latih = lulus', periksaKeluaran({ ...ring, 'arit-latih': { benar: 8, total: 10, terpotong: 0 } }, manTakPenuh).wajib.length === 0);
  cek('C20: paritas penuh tanpa arit-latih = tidak dituntut', periksaKeluaran(ring, { ...man, paritasPrompt: { paritas: 'penuh' } }).wajib.length === 0);
  cek('kepekaan pemicu: dengan 10 vs latih 8 = catatan', periksaKeluaran({ ...ring, 'arit-dengan': { benar: 10, total: 10, terpotong: 0 }, 'arit-latih': { benar: 8, total: 10, terpotong: 0 } }, manTakPenuh).catatan.some((m) => /kepekaan pemicu/.test(m)));
  cek('keluaran: ringkasan tidak ada = wajib gagal', periksaKeluaran(null, man).wajib.length === 1);
  const v13 = bacaJSON(path.join(AKAR, 'models', 'v13', 'ringkasan-hitung.json'));
  if (v13) cek('keluaran NYATA v13 hitung = format lama (terdeteksi, tidak dipalsukan)', periksaKeluaran(v13, man).formatLama === true);

  let gagal = 0;
  for (const [n, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${n}`); if (!ok) gagal++; }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

// ──────────────────────────────────────────────────────────── jalan ──
const argv = process.argv.slice(2);
const perintah = argv[0];
const cluster = argv[1];
const versi = (argv.includes('--versi') ? argv[argv.indexOf('--versi') + 1] : 'v13');
const nama = (argv.includes('--nama') ? argv[argv.indexOf('--nama') + 1] : '');
const resepArg = (argv.includes('--resep') ? argv[argv.indexOf('--resep') + 1] : null);
const praArg = (argv.includes('--pra') ? argv[argv.indexOf('--pra') + 1] : null);
const AKHIRAN = nama ? `-${nama}` : '';
if (LANGSUNG && !process.argv.includes('--uji-instrumen') && (!['manifest', 'periksa-hasil'].includes(perintah) || !cluster)) {
  console.error('pakai: node kontrak-latih.mjs manifest <cluster> [--versi v13] [--resep berkas] [--pra berkas] [--nama label] | periksa-hasil <cluster> [--versi v13] [--nama label] | --uji-instrumen');
  process.exit(2);
}

if (perintah === 'manifest') {
  console.log(`\n# Kontrak masukan — ${cluster}${AKHIRAN} (${versi})\n`);
  const { wajib, catatan, manifest } = buatManifest(cluster, versi, { resep: resepArg, pra: praArg, nama });
  for (const c of catatan) console.log(`  ${K}catatan${R} ${c}`);
  for (const w of wajib) console.log(`  ${M}WAJIB  ${R} ${w}`);
  if (manifest) {
    const keluar = path.join(DIR, 'dataset', versi, `MANIFEST-${cluster}${AKHIRAN}.json`);
    fs.writeFileSync(keluar, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(`\n  sidik: ${Object.entries(manifest.sidik).map(([k, v]) => `${k}=${v || '-'}`).join(' · ')}`);
    console.log(`  pra-daftar: ${manifest.praBerkas}${manifest.praNama ? ` (${manifest.praNama})` : ''}`);
    console.log(`  manifest: ${path.relative(AKAR, keluar)}`);
  }
  console.log(wajib.length
    ? `\n${M}TAHAN${R} — ${wajib.length} syarat wajib gagal. GPU TIDAK boleh disewa.\n`
    : `\n${H}SIAP${R} — semua syarat wajib terpenuhi (${catatan.length} catatan). ${A}berikutnya: migan latih ${cluster}${R}\n`);
  process.exit(wajib.length ? 1 : 0);
}

if (perintah === 'periksa-hasil') {
  console.log(`\n# Kontrak keluaran — ${cluster}${AKHIRAN} (${versi})\n`);
  const manifest = bacaJSON(path.join(DIR, 'dataset', versi, `MANIFEST-${cluster}${AKHIRAN}.json`));
  const ringkasan = bacaJSON(path.join(AKAR, 'models', versi, `ringkasan-${cluster}${AKHIRAN}.json`));
  if (!manifest) console.log(`  ${K}catatan${R} manifest tidak ada — sidik masukan tidak bisa dibandingkan (jalankan manifest SEBELUM run berikutnya)`);
  const { wajib, catatan, formatLama } = periksaKeluaran(ringkasan, manifest);
  for (const c of catatan) console.log(`  ${K}catatan${R} ${c}`);
  for (const w of wajib) console.log(`  ${M}WAJIB  ${R} ${w}`);
  if (formatLama) { console.log(`\n${K}FORMAT LAMA${R} — ringkasan v13 tanpa kontrak; sah untuk angka gerbangnya, TIDAK sah untuk klaim sanad otomatis.\n`); process.exit(0); }
  console.log(wajib.length ? `\n${M}DHAIF${R} — ${wajib.length} pelanggaran kontrak; jangan pakai ringkasan ini untuk klaim.\n`
    : `\n${H}SAHIH${R} — sidik masukan cocok manifest; sanad run ini bersambung otomatis.\n`);
  process.exit(wajib.length ? 1 : 0);
}
