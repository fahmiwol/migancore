#!/usr/bin/env node
/**
 * e5-pasang.mjs — E5-pasang (flywheel/PRA-DAFTAR-E5-PASANG.json): otak NPC Galantara di jalur HIDUP.
 *
 *   Q_SETARA  : config.js yang LIVE → persona = lengan batas E2' (penjaga paritas, --config URL), dan
 *               otak-npc.js yang terpasang = blob yang diuji (sha256 dibandingkan; --hash-terpasang)
 *   Q_LATENSI : token pertama DI KLIEN (emit npc_tanya → npc_potong pertama), 6 NPC × 8 giliran,
 *               kalimat & urutan sesi 1 E2' — ambang DIBACA dari pra-daftar E1 (bukan diketik ulang)
 *   Q_BEBAN   : 2 dan 4 klien serentak — deskriptif; menentukan OTAK_NPC_ANTREAN_MAKS
 *   Q_GAGAL   : sesudah jalur ke otak diputus: tiap pertanyaan → npc_sibuk ≤ 1 dtk (mode --gagal)
 * Klien = socket.io yang DI-VENDOR Galantara — sama persis dengan yang dimuat browser pemain.
 *
 *   node eval/e5-pasang.mjs --uji
 *   node eval/e5-pasang.mjs --url http://127.0.0.1:4010 --asap          # demo lokal — BUKAN data
 *   node eval/e5-pasang.mjs --url http<local-dir>.io --hash-terpasang <sha256>
 *   node eval/e5-pasang.mjs --url http<local-dir>.io --gagal          # sesudah terowongan diputus
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
export const PRA_DAFTAR_E5 = 'flywheel/PRA-DAFTAR-E5-PASANG.json';
const E1 = await import(pathToFileURL(path.join(DI_SINI, 'e1-latensi-npc.mjs')).href);
const E2 = await import(pathToFileURL(path.join(DI_SINI, 'e2-kejujuran-npc.mjs')).href);
const PAR = await import(pathToFileURL(path.join(DI_SINI, 'paritas-otak-npc-galantara.mjs')).href);
const beban = JSON.parse(fs.readFileSync(path.join(DI_SINI, 'beban-e2-npc.json'), 'utf8'));

export const ATURAN = { gagalMaksMs: 1000, nGagal: 10, bebanP95MaksDtk: 15, batasTanyaMs: 60000 };

/** Percakapan terskrip: kalimat & urutan sesi 1 E2' per NPC (harness E2 dipakai ulang, tidak disalin). */
export function percakapanSkrip(sesi = 1) {
  return beban.npc.map((npc, i) => ({ npcId: npc.id, kalimat: E2.urutanSesi(npc, sesi, i).map((x) => ({ k: x.k, q: x.q })) }));
}

/** Satu pertanyaan lewat soket: waktu ke potongan pertama (tAwal) dan ke akhir, jenis akhir. */
export function tanya(soket, npcId, pesan, { batasMs = ATURAN.batasTanyaMs, jam = () => performance.now(), id = `e5-${crypto.randomUUID()}` } = {}) {
  return new Promise((resolve) => {
    const t0 = jam();
    let tAwal = null, teks = '';
    const lepas = () => { soket.off('npc_potong', onPotong); soket.off('npc_selesai', onSelesai); soket.off('npc_sibuk', onSibuk); clearTimeout(w); };
    const akhir = (jenis, extra = {}) => { lepas(); resolve({ npcId, q: pesan, jenis, tAwalMs: tAwal, totalMs: jam() - t0, teks, ...extra }); };
    const onPotong = (d) => { if (d?.id !== id) return; if (tAwal === null) tAwal = jam() - t0; teks += d.delta || ''; };
    const onSelesai = (d) => { if (d?.id === id) akhir('selesai', { teks: d.teks ?? teks, msServer: d.ms ?? null }); };
    const onSibuk = (d) => { if (d?.id === id) akhir('sibuk', { alasan: d.alasan }); };
    const w = setTimeout(() => akhir('waktu'), batasMs);
    soket.on('npc_potong', onPotong); soket.on('npc_selesai', onSelesai); soket.on('npc_sibuk', onSibuk);
    soket.emit('npc_tanya', { id, npcId, pesan });
  });
}

/** Q_LATENSI: persentil token pertama (dtk) dan laju galat, dinilai terhadap ambang E1. */
export function nilaiLatensi(giliran, A) {
  const n = giliran.length;
  const ok = giliran.filter((g) => g.jenis === 'selesai' && g.tAwalMs != null);
  const galatPct = n ? (100 * (n - ok.length)) / n : 100;
  const p50 = E1.persentil(ok.map((g) => g.tAwalMs / 1000), 50), p95 = E1.persentil(ok.map((g) => g.tAwalMs / 1000), 95);
  const lulus = n > 0 && p50 != null && p95 != null && p50 <= A.p50MaksDtk && p95 <= A.p95MaksDtk && galatPct <= A.galatMaksPct;
  return { n, p50Dtk: p50 == null ? null : +p50.toFixed(2), p95Dtk: p95 == null ? null : +p95.toFixed(2), galatPct: +galatPct.toFixed(2), ambang: { p50: A.p50MaksDtk, p95: A.p95MaksDtk, galatPct: A.galatMaksPct }, lulus };
}

/** Q_GAGAL: tiap pertanyaan saat jalur putus harus berakhir npc_sibuk dalam ≤ 1 dtk. */
export function nilaiGagal(giliran, R = ATURAN) {
  const cepat = giliran.filter((g) => g.jenis === 'sibuk' && g.totalMs <= R.gagalMaksMs).length;
  return { n: giliran.length, sibukCepat: cepat, maksMs: giliran.length ? Math.round(Math.max(...giliran.map((g) => g.totalMs))) : null, lulus: giliran.length >= R.nGagal && cepat === giliran.length };
}

/** Q_BEBAN (deskriptif) → aturan antrean: 4 dipertahankan bila p95 token pertama pada 4 klien ≤ 15 dtk tanpa 'antrean penuh'. */
export function aturanAntrean(beban4, R = ATURAN) {
  const ok = beban4.filter((g) => g.jenis === 'selesai' && g.tAwalMs != null).map((g) => g.tAwalMs / 1000);
  const p95 = E1.persentil(ok, 95);
  const penuh = beban4.filter((g) => g.alasan === 'antrean penuh').length;
  return { p95Dtk: p95 == null ? null : +p95.toFixed(2), antreanPenuh: penuh, antreanMaks: p95 != null && p95 <= R.bebanP95MaksDtk && penuh === 0 ? 4 : 2 };
}

/** Vonis: PASANG_UNTUK_PEMAIN hanya bila SETARA, LATENSI, dan GAGAL ketiganya lulus. */
export function putuskanE5({ setara, latensi, gagal }) {
  const alasan = [];
  if (!setara?.lulus) alasan.push('Q_SETARA gagal');
  if (!latensi?.lulus) alasan.push('Q_LATENSI gagal');
  if (!gagal?.lulus) alasan.push('Q_GAGAL gagal/belum diukur');
  return { vonis: alasan.length ? 'JANGAN_DULU' : 'PASANG_UNTUK_PEMAIN', alasan };
}

/** sha256 blob otak-npc.js yang diuji (isi komit, LF) — untuk dibandingkan dengan berkas terpasang. */
export function hashBlobDiuji(akar, rev = 'HEAD') {
  const isi = execFileSync('git', ['-C', akar, 'show', `${rev}:galantara-server/otak-npc.js`]);
  return crypto.createHash('sha256').update(isi).digest('hex');
}

// ── jaringan ─────────────────────────────────────────────────────────────────
async function bangunkan(url, batasDtk = 300) {
  const akhir = Date.now() + batasDtk * 1000;
  while (Date.now() < akhir) {
    try { const t = await (await fetch(`${url}/mp/socket.io/?EIO=4&transport=polling`, { signal: AbortSignal.timeout(5000) })).text(); if (t.includes('"sid"')) return true; } catch { /* sakelar masih menyalakan */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}
function klien(akar) { return createRequire(path.join(akar, 'vendor', 'x.js'))('./socket.io.4.8.3.min.js'); }
async function soket(io, url) {
  const s = io(url, { path: '/mp/socket.io', transports: ['websocket'], reconnection: false, forceNew: true });
  await new Promise((ok, gagal) => { s.once('connect', ok); s.once('connect_error', gagal); });
  return s;
}

// ── uji luring ───────────────────────────────────────────────────────────────
async function uji() {
  let n = 0, bad = 0;
  const cek = (nama, ok, info = '') => { n++; console.log(`${ok ? '✓' : '✗'} ${nama}${ok ? '' : `  ← ${info}`}`); if (!ok) bad++; };
  const A = E1.bacaAmbang();
  cek('ambang latensi dibaca dari pra-daftar E1: p50 ≤ 2, p95 ≤ 4 dtk, galat ≤ 2 %', A?.p50MaksDtk === 2 && A?.p95MaksDtk === 4 && A?.galatMaksPct === 2, JSON.stringify(A));
  const P = percakapanSkrip();
  cek('percakapan: 6 NPC × 8 kalimat = urutan sesi 1 E2\' (2 sapa, 3 tahu, 3 luar)', P.length === 6 && P.every((p) => p.kalimat.length === 8 && p.kalimat.filter((k) => k.k === 'luar').length === 3));
  cek('percakapan sesi 1 identik dengan urutanSesi E2 (bukan salinan)', JSON.stringify(P[2].kalimat.map((k) => k.q)) === JSON.stringify(E2.urutanSesi(beban.npc[2], 1, 2).map((x) => x.q)));

  // tanya() dengan soket palsu: jawaban mengalir, sibuk, dan habis waktu
  const palsu = (mode) => {
    const s = new EventEmitter();
    s.emit = function (ev, d) {
      if (ev !== 'npc_tanya') return EventEmitter.prototype.emit.apply(this, arguments);
      setTimeout(() => {
        if (mode === 'jawab') { EventEmitter.prototype.emit.call(s, 'npc_potong', { id: d.id, delta: 'Ha' }); setTimeout(() => EventEmitter.prototype.emit.call(s, 'npc_selesai', { id: d.id, teks: 'Halo' }), 5); }
        if (mode === 'sibuk') EventEmitter.prototype.emit.call(s, 'npc_sibuk', { id: d.id, alasan: 'otak tidak menjawab' });
        if (mode === 'lain') EventEmitter.prototype.emit.call(s, 'npc_selesai', { id: 'bukan-milikku', teks: 'x' });
      }, 10);
      return true;
    };
    return s;
  };
  const j = await tanya(palsu('jawab'), 'budi', 'Halo');
  cek('tanya: potongan pertama mencatat tAwal, selesai mencatat teks', j.jenis === 'selesai' && j.tAwalMs != null && j.tAwalMs < j.totalMs && j.teks === 'Halo');
  const sb = await tanya(palsu('sibuk'), 'budi', 'Halo');
  cek('tanya: npc_sibuk → jenis sibuk + alasan', sb.jenis === 'sibuk' && sb.alasan === 'otak tidak menjawab');
  const w = await tanya(palsu('lain'), 'budi', 'Halo', { batasMs: 50 });
  cek('tanya: jawaban ber-id lain diabaikan → habis waktu', w.jenis === 'waktu');

  const g = (t, jenis = 'selesai') => ({ jenis, tAwalMs: t * 1000, totalMs: t * 1000 + 500 });
  const lulus = nilaiLatensi(Array.from({ length: 48 }, (_, i) => g(0.6 + (i % 10) * 0.2)), A);
  cek('latensi: p50 1,4 · p95 2,4 dtk, galat 0 → LULUS', lulus.lulus && lulus.p50Dtk <= 2 && lulus.p95Dtk <= 4, JSON.stringify(lulus));
  const satuGalat = nilaiLatensi([...Array.from({ length: 47 }, () => g(0.8)), { jenis: 'sibuk', tAwalMs: null, totalMs: 10 }], A);
  cek('latensi: 1/48 sibuk = 2,08 % > 2 % → GAGAL', !satuGalat.lulus && satuGalat.galatPct === 2.08, JSON.stringify(satuGalat));
  // Persentil tipe 7 berinterpolasi: 3 nilai tinggi dari 48 memberi p95 3,08 (masih lulus) — butuh ≥ 4.
  cek('latensi: p95 4,2 dtk (5 dari 48 giliran lambat) → GAGAL', !nilaiLatensi([...Array.from({ length: 43 }, () => g(1)), ...Array.from({ length: 5 }, () => g(4.2))], A).lulus);
  cek('latensi: 3 dari 48 lambat → p95 3,08 dtk → masih LULUS (interpolasi, bukan maksimum)', nilaiLatensi([...Array.from({ length: 45 }, () => g(1)), g(4.2), g(4.2), g(4.3)], A).p95Dtk === 3.08);
  const cepat = Array.from({ length: 10 }, () => ({ jenis: 'sibuk', totalMs: 120 }));
  cek('gagal-terbuka: 10/10 sibuk ≤ 1 dtk → LULUS', nilaiGagal(cepat).lulus);
  cek('gagal-terbuka: satu yang 1,2 dtk → GAGAL; kurang dari 10 → GAGAL', !nilaiGagal([...cepat.slice(1), { jenis: 'sibuk', totalMs: 1200 }]).lulus && !nilaiGagal(cepat.slice(2)).lulus);
  cek('antrean: 4 klien p95 ≤ 15 dtk tanpa antrean penuh → 4; p95 20 dtk → 2', aturanAntrean(Array.from({ length: 32 }, () => g(9))).antreanMaks === 4 && aturanAntrean([...Array.from({ length: 28 }, () => g(9)), ...Array.from({ length: 4 }, () => g(20))]).antreanMaks === 2);
  cek('antrean: satu "antrean penuh" → 2 walau cepat', aturanAntrean([...Array.from({ length: 31 }, () => g(2)), { jenis: 'sibuk', alasan: 'antrean penuh', totalMs: 5 }]).antreanMaks === 2);
  cek('vonis: hanya ketiga lulus → PASANG_UNTUK_PEMAIN; tanpa Q_GAGAL → JANGAN_DULU', putuskanE5({ setara: { lulus: true }, latensi: { lulus: true }, gagal: { lulus: true } }).vonis === 'PASANG_UNTUK_PEMAIN' && putuskanE5({ setara: { lulus: true }, latensi: { lulus: true } }).vonis === 'JANGAN_DULU');
  const akar = PAR.cariGalantara();
  if (akar) cek('hash blob otak-npc.js dihitung dari isi KOMIT (bukan working tree)', /^[0-9a-f]{64}$/.test(hashBlobDiuji(akar)));
  console.log(bad === 0 ? `e5-pasang: ${n} uji lulus` : `e5-pasang: ${bad} gagal dari ${n}`);
  return bad === 0 ? 0 : 1;
}

// ── jalan ────────────────────────────────────────────────────────────────────
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  const nilaiArg = (k) => { const i = arg.indexOf(k); return i >= 0 ? arg[i + 1] : null; };
  if (arg.includes('--uji')) process.exit(await uji());
  const url = (nilaiArg('--url') || '').replace(/\/$/, '');
  const asap = arg.includes('--asap'), modeGagal = arg.includes('--gagal');
  if (!url) { console.error('Pakai: node eval/e5-pasang.mjs --url <http(s)://host> [--asap | --gagal] [--hash-terpasang <sha256>]'); process.exit(2); }
  let pra = null;
  try { pra = JSON.parse(fs.readFileSync(path.join(DI_SINI, '..', PRA_DAFTAR_E5), 'utf8')); } catch { /* belum ada */ }
  if (!asap && pra?.dikunci !== true) { console.error(`BERHENTI: ${PRA_DAFTAR_E5} belum dikunci — hanya --asap yang boleh jalan`); process.exit(1); }
  const akar = PAR.cariGalantara();
  if (!akar) { console.error('BERHENTI: repo Galantara (klien socket.io yang di-vendor) tidak ditemukan'); process.exit(1); }
  const io = klien(akar);
  const stempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const label = asap ? '-asap' : modeGagal ? '-gagal' : '';
  const jsonl = path.join(DI_SINI, `e5-pasang-${stempel}${label}.jsonl`);
  const catat = (b) => fs.appendFileSync(jsonl, JSON.stringify({ ...b, t: new Date().toISOString(), asap }) + '\n');
  console.log(`\n# E5-pasang — ${url}${asap ? ' · ASAP (bukan data)' : ''}${modeGagal ? ' · mode GAGAL' : ''}`);
  if (!(await bangunkan(url))) { console.error('BERHENTI: server tidak menjawab handshake dalam 300 dtk'); process.exit(1); }
  const hasil = { praDaftar: PRA_DAFTAR_E5, stempel, url, asap, modeGagal, jsonl: path.basename(jsonl) };

  if (modeGagal) {
    const s = await soket(io, url);
    const gil = [];
    for (let i = 0; i < ATURAN.nGagal; i++) { const g = await tanya(s, beban.npc[i % 6].id, 'Halo, lagi apa?', { batasMs: 5000 }); gil.push(g); catat({ q: 'gagal', ...g }); }
    s.close();
    hasil.Q_GAGAL = nilaiGagal(gil);
    console.log(`Q_GAGAL: ${JSON.stringify(hasil.Q_GAGAL)}`);
  } else {
    // Q_SETARA — config LIVE + blob terpasang
    const out = (() => { try { return execFileSync(process.execPath, [path.join(DI_SINI, 'paritas-otak-npc-galantara.mjs'), '--config', `${url}/src/data/config.js`], { encoding: 'utf8' }); } catch (e) { return String(e.stdout || e); } })();
    const hashTerpasang = nilaiArg('--hash-terpasang');
    const hashDiuji = hashBlobDiuji(akar);
    hasil.Q_SETARA = { paritasConfigLive: /LULUS \d+\/\d+/.test(out), keluaranParitas: out.trim().split('\n').slice(-1)[0], hashDiuji, hashTerpasang, hashCocok: hashTerpasang ? hashTerpasang === hashDiuji : null };
    hasil.Q_SETARA.lulus = hasil.Q_SETARA.paritasConfigLive && (asap || hasil.Q_SETARA.hashCocok === true);
    console.log(`Q_SETARA: config live ${hasil.Q_SETARA.paritasConfigLive ? 'identik' : 'BERBEDA'} · hash ${hashTerpasang ? (hasil.Q_SETARA.hashCocok ? 'cocok' : 'BEDA') : 'tidak diberikan'}`);

    const s0 = await soket(io, url);
    const st = await s0.timeout(5000).emitWithAck('npc_status', null).catch(() => null);
    if (!st?.aktif) { console.error(`BERHENTI: npc_status = ${JSON.stringify(st)} — otak tidak hidup di server ini`); process.exit(1); }
    for (const p of percakapanSkrip()) await tanya(s0, p.npcId, 'Halo!');   // pemanasan (tidak dicatat), soket lalu ditutup → riwayatnya hilang
    s0.close();

    // Q_LATENSI — satu klien, 6 NPC × 8 giliran
    const s1 = await soket(io, url);
    const lat = [];
    for (const p of percakapanSkrip()) for (const k of p.kalimat) { const g = await tanya(s1, p.npcId, k.q); lat.push({ ...g, k: k.k }); catat({ q: 'latensi', kategori: k.k, ...g }); }
    s1.close();
    hasil.Q_LATENSI = nilaiLatensi(lat, E1.bacaAmbang());
    console.log(`Q_LATENSI: ${JSON.stringify(hasil.Q_LATENSI)}`);

    // Q_BEBAN — 2 lalu 4 klien serentak, tiap klien satu NPC berbeda
    hasil.Q_BEBAN = {};
    for (const k of [2, 4]) {
      const soketK = await Promise.all(Array.from({ length: k }, () => soket(io, url)));
      const per = await Promise.all(soketK.map(async (s, i) => { const p = percakapanSkrip()[i]; const out2 = []; for (const kal of p.kalimat) { const g = await tanya(s, p.npcId, kal.q); out2.push(g); catat({ q: `beban${k}`, klien: i, ...g }); } s.close(); return out2; }));
      const semua = per.flat();
      hasil.Q_BEBAN[k] = { ...nilaiLatensi(semua, { p50MaksDtk: Infinity, p95MaksDtk: Infinity, galatMaksPct: 100 }), sibuk: semua.filter((g) => g.jenis !== 'selesai').map((g) => g.alasan || g.jenis) };
      if (k === 4) hasil.Q_BEBAN.aturanAntrean = aturanAntrean(semua);
      console.log(`Q_BEBAN ${k} klien: p50 ${hasil.Q_BEBAN[k].p50Dtk} · p95 ${hasil.Q_BEBAN[k].p95Dtk} dtk · tak selesai ${hasil.Q_BEBAN[k].sibuk.length}`);
    }
    hasil.vonisSementara = putuskanE5({ setara: hasil.Q_SETARA, latensi: hasil.Q_LATENSI, gagal: null });
    console.log(`\n## ${asap ? 'ASAP — bukan vonis' : 'vonis sementara (Q_GAGAL diukur terpisah dengan --gagal)'}: ${JSON.stringify(hasil.vonisSementara)}`);
  }
  const f = path.join(DI_SINI, `HASIL-E5-PASANG-${stempel}${label}.json`);
  fs.writeFileSync(f, JSON.stringify(hasil, null, 1));
  console.log(`→ ${path.basename(f)}`);
  process.exit(0);
}
