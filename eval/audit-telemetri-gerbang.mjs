#!/usr/bin/env node
/**
 * audit-telemetri-gerbang — membaca keputusan gerbang yang BENAR-BENAR terjadi di
 * serving (`eval/telemetri-gerbang-mcp.jsonl`) dan memisahkan yang mana pertanyaan
 * UJI (soal petak / pertanyaan bawaan harness) dan yang mana pertanyaan NYATA.
 *
 * Kenapa pemisahan itu wajib: 2 Sep telemetri berisi 7 baris yang semuanya soal
 * jebakan dari harness — kalau dihitung apa adanya, gerbang tampak sempurna
 * (7/7 abstain benar) padahal ia belum pernah diuji satu pun pertanyaan nyata.
 * Angka yang mencampur keduanya BOHONG ke arah yang menyenangkan. (Kelas C38/#8:
 * saringan wajib dicetak dan dibaca, jangan dipercaya begitu saja.)
 *
 * Baris nyata disandingkan dengan `jurnal/agent-YYYYMM.jsonl` (pertanyaan sama →
 * jawaban + sumber yang dipakai). Dari situ lahir tanda CURIGA: gerbang memutuskan
 * BUKAN-jawab padahal retrieval menemukan catatan kanonik — persis cacat 3 Sep
 * ("Apa itu MiganCore…" → konteks-kurang). Baris curiga adalah kandidat pola baru
 * untuk `flywheel/POLA-JEBAKAN.md` (Epic E2). Alat ini MENANDAI, tidak memvonis:
 * benar/salahnya diputuskan manusia, karena hanya Fahmi yang tahu apa yang ia mau.
 *
 * Pakai:
 *   node eval/audit-telemetri-gerbang.mjs            # tabel + daftar curiga
 *   node eval/audit-telemetri-gerbang.mjs --periksa  # penjaga: gerbang masih hidup & sehat?
 *   node eval/audit-telemetri-gerbang.mjs --uji      # uji sendiri, tanpa berkas nyata
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soalPetak } from './jaga-pencemaran-kolam.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const TELEMETRI = path.join(AKAR, 'eval', 'telemetri-gerbang-mcp.jsonl');
const JURNAL_DIR = path.join(AKAR, 'jurnal');

// Pertanyaan bawaan harness `eval/uji-mcp-gerbang.mjs` — diurai dari sumbernya,
// tidak disalin dengan tangan (#10: nilai yang bisa dibaca program jangan diketik ulang).
export function pertanyaanHarness() {
  try {
    const src = fs.readFileSync(path.join(AKAR, 'eval', 'uji-mcp-gerbang.mjs'), 'utf8');
    const m = src.match(/process\.argv\[3\]\s*\|\|\s*'((?:[^'\\]|\\.)*)'/);
    return m ? [m[1]] : [];
  } catch { return []; }
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Kumpulan pertanyaan yang BUKAN pemakaian nyata: soal petak + pertanyaan harness. */
export function kumpulanUji() {
  const set = new Set();
  for (const q of pertanyaanHarness()) set.add(norm(q));
  try { for (const t of soalPetak('eval/petak-jujur2.mjs').teks) set.add(norm(t)); } catch { /* petak tak terbaca → set lebih kecil, dilaporkan */ }
  return set;
}

export function bacaJsonl(berkas) {
  try {
    return fs.readFileSync(berkas, 'utf8').split('\n').filter((b) => b.trim())
      .map((b) => { try { return JSON.parse(b); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/** Jurnal pemakaian: pertanyaan → entri terakhir (jawaban + sumber yang dipakai). */
export function muatJurnal() {
  const peta = new Map();
  let berkas = [];
  try { berkas = fs.readdirSync(JURNAL_DIR).filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl')); } catch { berkas = []; }
  for (const f of berkas) for (const e of bacaJsonl(path.join(JURNAL_DIR, f))) if (e.q) peta.set(norm(e.q), e);
  return peta;
}

/**
 * Satu baris telemetri + konteksnya. `curiga` = gerbang memutuskan BUKAN-jawab
 * padahal jurnal menunjukkan retrieval memakai catatan KANONIK (Buku Besar) —
 * tanda bahwa probe menilai pertanyaan telanjang, bukan bahwa jawabannya tak ada.
 */
export function nilaiBaris(t, ujiSet, jurnal) {
  const q = norm(t.q);
  const jenis = ujiSet.has(q) ? 'uji' : 'nyata';
  const j = jurnal.get(q) || null;
  const sumberKanon = j && Array.isArray(j.sumber) ? j.sumber.filter((s) => /kanonik|BRIEF/i.test(String(s))).length : 0;
  const bukanJawab = Boolean(t.tindakan) && t.tindakan !== 'jawab';
  return {
    jenis,
    label: t.label || (t.galat ? 'GALAT-MODUL' : 'GALAT-PROBE'),
    tindakan: t.tindakan || '-',
    curiga: jenis === 'nyata' && bukanJawab && sumberKanon > 0,
    sumberKanon,
    q: t.q || '',
    t: t.t || '',
  };
}

export function ringkas(baris) {
  const tabel = new Map();
  for (const b of baris) {
    const k = `${b.label} → ${b.tindakan}`;
    tabel.set(k, (tabel.get(k) || 0) + 1);
  }
  return [...tabel.entries()].sort((a, b) => b[1] - a[1]);
}

function utama() {
  const arg = process.argv.slice(2);
  const mentah = bacaJsonl(TELEMETRI);
  const ujiSet = kumpulanUji();
  const jurnal = muatJurnal();
  const baris = mentah.map((t) => nilaiBaris(t, ujiSet, jurnal));
  const nyata = baris.filter((b) => b.jenis === 'nyata');
  const uji = baris.filter((b) => b.jenis === 'uji');
  const galat = mentah.filter((t) => t.galat || t.probeGalat).length;

  if (arg.includes('--periksa')) {
    // Penjaga: gerbang yang mati SENYAP terlihat sama dengan gerbang yang sehat.
    const n20 = mentah.slice(-20);
    const galat20 = n20.filter((t) => t.galat || t.probeGalat).length;
    const persen = n20.length ? (galat20 / n20.length) * 100 : 0;
    // Telemetri KOSONG bukan kegagalan: bawaan GERBANG=off memang tidak menulis
    // apa pun, dan `migan periksa` berjalan tanpa env serving sehingga ia tidak
    // bisa tahu modanya. Penjaga yang menuduh di sini akan GAGAL PALSU di mesin
    // bersih — persis kelas cacat yang penjaga ini seharusnya cegah.
    const masalah = [];
    if (n20.length && persen > 10) masalah.push(`probe GALAT ${persen.toFixed(0)}% di ${n20.length} baris terakhir (ambang 10%)`);
    for (const m of masalah) console.log(`GAGAL: ${m}`);
    if (!masalah.length) {
      console.log(mentah.length
        ? `OK: telemetri ${mentah.length} baris · GALAT ${persen.toFixed(0)}% di 20 terakhir · nyata ${nyata.length} · uji ${uji.length}`
        : 'OK: telemetri kosong (wajar bila GERBANG=off — bawaan)');
    }
    process.exit(masalah.length ? 1 : 0);
  }

  if (arg.includes('--uji')) return uji_();

  console.log(`# audit telemetri gerbang — ${mentah.length} baris (${nyata.length} NYATA · ${uji.length} uji · GALAT ${galat})`);
  console.log(`# kumpulan uji dikenali: ${ujiSet.size} pertanyaan (petak + harness) · jurnal: ${jurnal.size} pertanyaan\n`);
  if (!mentah.length) { console.log('(telemetri kosong — jalankan MCP dengan GERBANG=shadow lalu tanya sesuatu)'); return; }

  for (const [nama, isi] of [['NYATA (yang menentukan)', nyata], ['uji (petak/harness — TIDAK dihitung sebagai bukti)', uji]]) {
    console.log(`## ${nama} — ${isi.length} baris`);
    if (!isi.length) { console.log('  (kosong)\n'); continue; }
    for (const [k, n] of ringkas(isi)) console.log(`  ${String(n).padStart(3)} × ${k}`);
    console.log('');
  }

  const curiga = nyata.filter((b) => b.curiga);
  console.log(`## CURIGA — gerbang tidak menjawab padahal catatan kanonik dipakai: ${curiga.length}`);
  for (const b of curiga) console.log(`  [${b.label} → ${b.tindakan}] kanon ${b.sumberKanon} · ${b.q.slice(0, 70)}`);
  if (!curiga.length) console.log('  (tidak ada)');
  console.log('\nBaris CURIGA = kandidat pola untuk flywheel/POLA-JEBAKAN.md (Epic E2).');
  console.log(`Syarat mengusulkan GERBANG=on: >= 5 baris NYATA (sekarang ${nyata.length}) dan keputusannya masuk akal.`);
}

function uji_() {
  let n = 0; const ok = (k, p) => { n++; if (!p) { console.error('GAGAL:', k); process.exit(1); } };
  const ujiSet = new Set(['soal petak contoh', 'pertanyaan harness']);
  const jurnal = new Map([['apa itu migancore', { sumber: ['BRIEF.md (Buku Besar — selalu disertakan)', 'BOOK/00-INDEX.md — X (kanonik)'] }]]);
  const b1 = nilaiBaris({ q: 'Soal Petak Contoh', label: 'premis-salah', tindakan: 'abstain' }, ujiSet, jurnal);
  ok('soal petak dikenali sebagai uji', b1.jenis === 'uji' && b1.curiga === false);
  const b2 = nilaiBaris({ q: 'Apa itu MiganCore', label: 'konteks-kurang', tindakan: 'klarifikasi' }, ujiSet, jurnal);
  ok('nyata + bukan-jawab + kanon → CURIGA', b2.jenis === 'nyata' && b2.curiga === true && b2.sumberKanon === 2);
  const b3 = nilaiBaris({ q: 'Apa itu MiganCore', label: 'fakta', tindakan: 'jawab' }, ujiSet, jurnal);
  ok('nyata + jawab → tidak curiga', b3.curiga === false);
  const b4 = nilaiBaris({ q: 'Hal lain yang tak ada di jurnal', label: 'tak-terjawab', tindakan: 'abstain' }, ujiSet, jurnal);
  ok('tanpa jurnal → tidak curiga (bukan bukti)', b4.jenis === 'nyata' && b4.curiga === false && b4.sumberKanon === 0);
  const b5 = nilaiBaris({ q: 'X', galat: 'meledak' }, ujiSet, jurnal);
  ok('baris galat modul dilabeli, tidak menabrak', b5.label === 'GALAT-MODUL' && b5.tindakan === '-');
  ok('normalisasi spasi/huruf besar', nilaiBaris({ q: '  SOAL   petak contoh ' }, ujiSet, jurnal).jenis === 'uji');
  const r = ringkas([{ label: 'a', tindakan: 'b' }, { label: 'a', tindakan: 'b' }, { label: 'c', tindakan: 'd' }]);
  ok('ringkas menghitung & mengurutkan', r[0][0] === 'a → b' && r[0][1] === 2 && r.length === 2);
  ok('pertanyaan harness diurai dari sumbernya', pertanyaanHarness().length === 1 && /rotan/i.test(pertanyaanHarness()[0]));
  const set = kumpulanUji();
  ok('kumpulan uji memuat soal petak NYATA (bukan nol — C33)', set.size >= 36);
  console.log(`audit-telemetri-gerbang: ${n}/${n} uji lulus`);
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) utama();
