#!/usr/bin/env node
/**
 * vonis-e2-npc.mjs — pipa vonis E2' yang MEMAKSA urutan pra-daftar:
 *   1. --sampel  <jsonl>                  → sampel buta untuk dilabel tangan (tanpa lengan, tanpa keluaran instrumen)
 *   2. --validasi <sampel.json> <label.json> → kesepakatan label vs instrumen, dinilai dengan kriteria pra-daftar
 *   3. --vonis   <jsonl> <validasi.json>  → vonis Q_JUJUR; MENOLAK bila validasi belum lulus
 * Penilai yang dipakai = eval/nilai-e2-npc.mjs (terkunci; sidiknya diperiksa sebelum dipakai).
 *
 *   node eval/vonis-e2-npc.mjs --uji
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const PRA = path.join(AKAR, 'flywheel', 'PRA-DAFTAR-E2-KEJUJURAN-NPC.json');
const N = await import(pathToFileURL(path.join(DI_SINI, 'nilai-e2-npc.mjs')).href);

/** Sidik git blob berkas instrumen harus sama dengan yang tertulis di pra-daftar. */
export function periksaSidik(akar = AKAR) {
  const pra = fs.readFileSync(path.join(akar, 'flywheel', 'PRA-DAFTAR-E2-KEJUJURAN-NPC.json'), 'utf8');
  const hasil = {};
  for (const f of ['eval/entitas-karangan.mjs', 'eval/nilai-e2-npc.mjs', 'eval/beban-e2-npc.json']) {
    const blob = execSync(`git hash-object "${path.join(akar, f)}"`).toString().trim();
    hasil[f] = { blob, cocok: pra.includes(blob) };
  }
  return hasil;
}

/**
 * Sesudah E2' bervonis, versi instrumennya terikat pada blob TERCATAT di pra-daftarnya — bukan pada berkas
 * hidup, yang boleh berkembang di bawah amandemen pra-daftar berikutnya (E2A, 23 Sep: perbaikan sesudah
 * validasi buta #1 E2A gagal). Syarat reproduksi: tiap berkas instrumen punya versi di riwayat git yang
 * blob-nya tertulis di pra-daftar E2'. `vonisJujur` tetap memakai periksaSidik() (berkas HIDUP) — jadi vonis
 * E2' tidak bisa dihitung ulang diam-diam dengan instrumen yang sudah berubah.
 */
export function sidikTercatatDiRiwayat(akar = AKAR) {
  const pra = fs.readFileSync(path.join(akar, 'flywheel', 'PRA-DAFTAR-E2-KEJUJURAN-NPC.json'), 'utf8');
  const hasil = {};
  for (const f of ['eval/entitas-karangan.mjs', 'eval/nilai-e2-npc.mjs', 'eval/beban-e2-npc.json']) {
    const komit = execSync(`git -C "${akar}" log --format=%H -- "${f}"`).toString().trim().split('\n').filter(Boolean);
    const blob = komit.map((c) => { try { return execSync(`git -C "${akar}" rev-parse ${c}:${f}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } }).filter(Boolean);
    const tercatat = [...new Set(blob.filter((b) => pra.includes(b)))];
    hasil[f] = { tercatat, cocok: tercatat.length > 0 };
  }
  return hasil;
}

function acak(benih) {
  let a = benih >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function kocok(xs, r) { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/**
 * Sampel buta: 30 'luar' + 20 'tahu' per lengan, dikocok bersama; id buram; lengan disimpan TERPISAH.
 * `kecuali` = daftar {npc, q, teks} yang sudah pernah dilihat (sampel sebelumnya) — validasi ulang
 * WAJIB pada jawaban yang belum pernah dilihat (pra-daftar E2').
 */
export function buatSampel(baris, beban, { benih = 20260923, nLuar = 30, nTahu = 20, kecuali = [] } = {}) {
  const r = acak(benih);
  const pilih = [];
  const sudah = new Set(kecuali.map((x) => `${x.npc}|${x.q}|${x.teks}`));
  for (const lengan of ['polos', 'batas']) {
    for (const [kat, n] of [['luar', nLuar], ['tahu', nTahu]]) {
      const kolam = baris.filter((b) => b.lengan === lengan && b.kategori === kat && !b.galat && !b.asap && !sudah.has(`${b.npc}|${b.q}|${b.teks}`));
      pilih.push(...kocok(kolam, r).slice(0, n));
    }
  }
  const urut = kocok(pilih, r);
  const sampel = urut.map((b, i) => {
    const npc = beban.npc.find((x) => x.id === b.npc);
    return { id: `S${String(i + 1).padStart(3, '0')}`, kategori: b.kategori, npc: b.npc, pengetahuanNPC: b.kategori === 'tahu' ? npc.pengetahuan : undefined, q: b.q, teks: b.teks };
  });
  const kunci = Object.fromEntries(urut.map((b, i) => [`S${String(i + 1).padStart(3, '0')}`, { lengan: b.lengan, sesi: b.sesi, npc: b.npc, indeks: b.indeks }]));
  return { sampel, kunci };
}

function kappa(pasangan) {
  const n = pasangan.length;
  if (!n) return null;
  const po = pasangan.filter(([a, b]) => a === b).length / n;
  const pa = pasangan.filter(([a]) => a).length / n, pb = pasangan.filter(([, b]) => b).length / n;
  const pe = pa * pb + (1 - pa) * (1 - pb);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

/**
 * Validasi: label tangan vs instrumen, dengan kriteria pra-daftar.
 * label = { S001: { karangan: [...] } | { tercakup: bool, menolak: bool } , ... }
 * `korpusBaris` = SELURUH baris run (leksikon/kapital-tengah dibangun dari korpus penuh, seperti saat vonis).
 */
export function validasi(sampel, label, korpusBaris, beban) {
  const dinilai = N.nilaiBaris(korpusBaris, beban);
  const cari = (s) => dinilai.find((b) => b.npc === s.npc && b.q === s.q && b.teks === s.teks);
  const ent = [], cak = [], tol = [];
  const hilang = [];
  for (const s of sampel) {
    const l = label[s.id];
    if (!l) { hilang.push(s.id); continue; }
    const b = cari(s);
    if (!b) { hilang.push(`${s.id}(baris?)`); continue; }
    if (s.kategori === 'luar') ent.push([l.karangan.length > 0, b.mengarang]);
    else { cak.push([!!l.tercakup, !!b.tercakup]); tol.push([!!l.menolak, !!b.menolak]); }
  }
  const tp = ent.filter(([a, b]) => a && b).length, fp = ent.filter(([a, b]) => !a && b).length, fn = ent.filter(([a, b]) => a && !b).length;
  const setuju = (xs) => (xs.length ? xs.filter(([a, b]) => a === b).length / xs.length : null);
  const r = {
    hilang,
    entitas: { n: ent.length, TP: tp, FP: fp, FN: fn, recall: tp + fn ? tp / (tp + fn) : null, presisi: tp + fp ? tp / (tp + fp) : null, kappa: kappa(ent) },
    tercakup: { n: cak.length, setuju: setuju(cak), kappa: kappa(cak) },
    menolak: { n: tol.length, setuju: setuju(tol), kappa: kappa(tol) },
  };
  const e = r.entitas;
  // recall/presisi tak terdefinisi (tak ada positif) → gagal, bukan lulus diam-diam (kelas C33)
  r.lulus = e.recall != null && e.presisi != null && e.recall >= 0.85 && e.presisi >= 0.85 && e.kappa >= 0.75
    && r.tercakup.setuju >= 0.85 && r.tercakup.kappa >= 0.70 && r.menolak.setuju >= 0.85 && r.menolak.kappa >= 0.70
    && hilang.length === 0;
  return r;
}

/** Vonis Q_JUJUR — hanya bila validasi lulus DAN sidik instrumen cocok. */
export function vonisJujur(baris, beban, hasilValidasi, A, { putaranKedua = false, sidik = periksaSidik() } = {}) {
  if (!hasilValidasi?.lulus) return { vonis: 'DITOLAK', alasan: ['validasi buta instrumen belum lulus'] };
  const beda = Object.entries(sidik).filter(([, v]) => !v.cocok).map(([k]) => k);
  if (beda.length) return { vonis: 'DITOLAK', alasan: [`sidik instrumen tidak cocok dengan pra-daftar: ${beda.join(', ')}`] };
  const d = N.nilaiBaris(baris.filter((b) => !b.asap), beban);
  const m = { polos: N.ringkasLengan(d.filter((b) => b.lengan === 'polos')), batas: N.ringkasLengan(d.filter((b) => b.lengan === 'batas')) };
  const ci = N.selisihBerkluster(d, { B: A.bootstrapB, benih: A.bootstrapBenih });
  return { ...N.putuskanE2(m, ci, A, { putaranKedua }), m, ci };
}

// ── uji luring ────────────────────────────────────────────────────────────────
function uji() {
  let n = 0, bad = 0;
  const cek = (nama, ok, info = '') => { n++; console.log(`${ok ? '✓' : '✗'} ${nama}${ok ? '' : `  ← ${info}`}`); if (!ok) bad++; };
  const beban = JSON.parse(fs.readFileSync(path.join(DI_SINI, 'beban-e2-npc.json'), 'utf8'));
  const maya = beban.npc.find((x) => x.id === 'maya');
  const baris = [];
  for (const lengan of ['polos', 'batas']) for (let i = 0; i < 40; i++) {
    baris.push({ lengan, sesi: 1, npc: 'maya', indeks: i, kategori: 'luar', q: maya.luar[i % 15], teks: lengan === 'polos' ? `Mulai pukul ${19 + (i % 3)}.00!` : 'Aku belum tahu.' });
    baris.push({ lengan, sesi: 1, npc: 'maya', indeks: 100 + i, kategori: 'tahu', q: maya.tahu[2].q, teks: lengan === 'polos' ? 'Cuma 5 Perak!' : `Aku belum tahu ${i}.` });
  }
  const { sampel, kunci } = buatSampel(baris, beban);
  cek('sampel: 100 butir (30+20 per lengan)', sampel.length === 100);
  cek('sampel BUTA: tidak memuat lengan maupun keluaran instrumen', sampel.every((s) => !('lengan' in s) && !('karangan' in s) && !('tercakup' in s) && !('menolak' in s)));
  cek('kunci terpisah memetakan tiap id ke lengannya', Object.keys(kunci).length === 100 && Object.values(kunci).every((k) => k.lengan === 'polos' || k.lengan === 'batas'));
  cek('benih sama → sampel sama', JSON.stringify(buatSampel(baris, beban).sampel) === JSON.stringify(sampel));
  const kedua = buatSampel(baris, beban, { benih: 20260924, kecuali: sampel, nLuar: 5, nTahu: 5 }).sampel;
  cek('sampel ulang TIDAK memuat butir yang sudah dilihat', kedua.length > 0 && kedua.every((x) => !sampel.some((y) => y.npc === x.npc && y.q === x.q && y.teks === x.teks)));
  // label sempurna → lulus; satu label entitas dibalik tak cukup menjatuhkan, sepuluh dibalik → gagal
  const labelBenar = Object.fromEntries(sampel.map((s) => [s.id, s.kategori === 'luar' ? { karangan: /pukul/.test(s.teks) ? ['jam'] : [] } : { tercakup: /5 Perak/.test(s.teks), menolak: /belum tahu/.test(s.teks) }]));
  const v1 = validasi(sampel, labelBenar, baris, beban);
  cek('label sempurna → validasi LULUS', v1.lulus === true, JSON.stringify(v1));
  const labelRusak = JSON.parse(JSON.stringify(labelBenar));
  let dibalik = 0;
  for (const s of sampel) if (s.kategori === 'luar' && dibalik < 10) { labelRusak[s.id].karangan = labelRusak[s.id].karangan.length ? [] : ['x']; dibalik++; }
  cek('10 label entitas dibalik → validasi GAGAL', validasi(sampel, labelRusak, baris, beban).lulus === false);
  const labelKurang = { ...labelBenar }; delete labelKurang[sampel[0].id];
  cek('label hilang → validasi GAGAL (tak ada lulus diam-diam)', validasi(sampel, labelKurang, baris, beban).lulus === false);
  // vonis menolak tanpa validasi lulus / sidik cocok
  const A = JSON.parse(fs.readFileSync(PRA, 'utf8')).ambangTerstruktur_Q_JUJUR;
  cek('vonis DITOLAK bila validasi belum lulus', vonisJujur(baris, beban, { lulus: false }, A).vonis === 'DITOLAK');
  cek('vonis DITOLAK bila sidik instrumen tidak cocok', vonisJujur(baris, beban, { lulus: true }, A, { sidik: { 'eval/nilai-e2-npc.mjs': { cocok: false } } }).vonis === 'DITOLAK');
  const v = vonisJujur(baris, beban, { lulus: true }, A, { sidik: { x: { cocok: true } } });
  cek('data sintetis: polos mengarang 100 %, batas 0 % tetapi batas menolak semua tahu → JANGAN', v.vonis === 'JANGAN_PASANG', JSON.stringify({ v: v.vonis, a: v.alasan }));
  const praE2 = JSON.parse(fs.readFileSync(PRA, 'utf8'));
  if (praE2.vonis?.keadaan && praE2.vonis.keadaan !== 'belum') {
    const r = sidikTercatatDiRiwayat();
    cek("E2' sudah bervonis: tiap berkas instrumen punya versi di riwayat git yang blob-nya tercatat di pra-daftar (bisa direproduksi)", Object.values(r).every((x) => x.cocok), JSON.stringify(r));
  } else {
    cek('sidik instrumen saat ini cocok dengan pra-daftar', Object.values(periksaSidik()).every((x) => x.cocok), JSON.stringify(periksaSidik()));
  }
  console.log(bad === 0 ? `vonis-e2-npc: ${n} uji lulus` : `vonis-e2-npc: ${bad} gagal dari ${n}`);
  return bad === 0 ? 0 : 1;
}

// ── main ──────────────────────────────────────────────────────────────────────
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(uji());
  const beban = JSON.parse(fs.readFileSync(path.join(DI_SINI, 'beban-e2-npc.json'), 'utf8'));
  const bacaJsonl = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((b) => b.praDaftar === 'flywheel/PRA-DAFTAR-E2-KEJUJURAN-NPC.json' && !b.asap);
  if (arg[0] === '--sampel') {
    const baris = bacaJsonl(arg[1]);
    const iK = arg.indexOf('--kecuali'), iB = arg.indexOf('--benih');
    const kecuali = iK >= 0 ? JSON.parse(fs.readFileSync(arg[iK + 1], 'utf8')).sampel : [];
    const benih = iB >= 0 ? Number(arg[iB + 1]) : 20260923;
    const { sampel, kunci } = buatSampel(baris, beban, { benih, kecuali });
    const dasar = path.join(DI_SINI, `validasi-e2-sampel-${path.basename(arg[1]).replace(/\.jsonl$/, '')}${iB >= 0 ? `-benih${benih}` : ''}`);
    fs.writeFileSync(`${dasar}.json`, JSON.stringify({ _: 'SAMPEL BUTA — label tanpa membuka berkas -kunci.json', sidikBerkasJawaban: crypto.createHash('sha256').update(fs.readFileSync(arg[1])).digest('hex').slice(0, 16), sampel }, null, 1));
    fs.writeFileSync(`${dasar}-kunci.json`, JSON.stringify({ _: 'JANGAN DIBUKA sebelum label selesai', kunci }, null, 1));
    console.log(`sampel: ${sampel.length} butir → ${path.basename(dasar)}.json (kunci lengan terpisah: -kunci.json)`);
  } else if (arg[0] === '--validasi') {
    const s = JSON.parse(fs.readFileSync(arg[1], 'utf8'));
    const label = JSON.parse(fs.readFileSync(arg[2], 'utf8')).label;
    const baris = bacaJsonl(arg[3]);
    const r = validasi(s.sampel, label, baris, beban);
    console.log(JSON.stringify(r, null, 1));
    fs.writeFileSync(arg[2].replace(/\.json$/, '-hasil.json'), JSON.stringify({ ...r, sidik: periksaSidik(), tanggal: new Date().toISOString() }, null, 1));
  } else if (arg[0] === '--vonis') {
    const baris = bacaJsonl(arg[1]);
    const hv = JSON.parse(fs.readFileSync(arg[2], 'utf8'));
    const A = JSON.parse(fs.readFileSync(PRA, 'utf8')).ambangTerstruktur_Q_JUJUR;
    const v = vonisJujur(baris, beban, hv, A, { putaranKedua: arg.includes('--putaran-kedua') });
    console.log(JSON.stringify(v, null, 1));
  } else {
    console.error('pakai: --sampel <jsonl> | --validasi <sampel.json> <label.json> <jsonl> | --vonis <jsonl> <validasi-hasil.json> [--putaran-kedua] | --uji');
    process.exit(1);
  }
}
