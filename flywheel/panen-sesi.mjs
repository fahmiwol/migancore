#!/usr/bin/env node
/**
 * panen-sesi.mjs — iterasi 4: panen dari SESI NYATA (Claude Code + Codex).
 *
 * Perintah Fahmi 20 Agu (disarikan): panen semua sesi kerja, termasuk sesi Codex dan proyek
 * lain di komputernya, sebagai bahan data berkualitas.
 *
 * ================== BATAS YANG TIDAK BOLEH DILANGGAR ==================
 * PRD MiganCore R11 (docs/08_RISK_TRAINING, docs/AGENTS.md):
 *     "Legal: using Claude/GPT output — NEVER."
 * Maka giliran ASISTEN di sesi TIDAK dipanen sama sekali. Yang dipanen
 * hanya giliran FAHMI — pertanyaan dan pernyataannya sendiri, 100% datanya.
 *
 * Justru di situ emasnya: sesi menyimpan DISTRIBUSI NYATA cara Fahmi bertanya
 * (bahasa campur, typo, banyak niat sekaligus, kadang marah). Model yang
 * dilatih dengan pertanyaan buatan akan kaget di dunia nyata; ini obatnya.
 * Sisi jawaban tetap dari KORPUSNYA SENDIRI (learned.jsonl) — dijodohkan
 * dengan skor tumpang-tindih kata; kalau tidak ada jodoh kuat, baris dibuang.
 * ======================================================================
 *
 * Dua kolam:
 *   A. GAYA-NYATA  — pertanyaan asli Fahmi × jawaban dari catatannya sendiri.
 *   B. PERNYATAAN  — kalimat deklaratif Fahmi tentang estat (keputusan, angka,
 *      aturan) → jadi fakta yang diajarkan, dengan kata-katanya sendiri.
 *
 * Sanitasi wajib (sama seperti saring.mjs, plus lebih ketat di sini karena
 * sesi paling rawan memuat rahasia): kredensial, token, kunci, path pribadi.
 *
 * Keluaran: dataset/migancore-sesi.jsonl → digabung panen.mjs → saring.mjs.
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'dataset', 'migancore-sesi.jsonl');
const LEARNED = '<memory-dir>\\corpus\\learned\\learned.jsonl';
const SUMBER = [
  { label: 'claude', dir: '~\\.claude\\projects' },
  { label: 'codex', dir: '~\\.codex\\sessions' },
];

const hash = (t) => crypto.createHash('sha1').update(t).digest('hex').slice(0, 10);

// ---------------------------------------------------------- sanitasi --
const RAHASIA = [
  /hf_[A-Za-z0-9]{8,}/, /sk-[A-Za-z0-9_-]{12,}/, /gh[pousr]_[A-Za-z0-9]{16,}/,
  /AIza[A-Za-z0-9_-]{20,}/, /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(password|passwd|kata sandi|api[ _-]?key|secret|token)\b\s*[:=]/i,
  /\bssh\s+-i\b/, /\bmysql\s+-p/, /\bBearer\s+[A-Za-z0-9._-]{20,}/,
];
const berbauRahasia = (t) => RAHASIA.some((r) => r.test(t));

// ------------------------------------------------------ baca giliran --
function bacaGiliranPengguna(berkas) {
  const keluar = [];
  let isi;
  try { isi = fs.readFileSync(berkas, 'utf8'); } catch { return keluar; }
  for (const baris of isi.split(/\r?\n/)) {
    if (!baris || baris.length > 400000) continue;
    let o;
    try { o = JSON.parse(baris); } catch { continue; }

    // Claude Code: {type:'user', message:{role:'user', content: str|array}}
    // Codex     : {type:'message', role:'user', content:[{type:'input_text',text}]}
    const peran = o?.message?.role || o?.role;
    if (peran !== 'user') continue;
    const konten = o?.message?.content ?? o?.content;

    let teks = '';
    if (typeof konten === 'string') teks = konten;
    else if (Array.isArray(konten)) {
      for (const b of konten) {
        if (typeof b === 'string') teks += b + '\n';
        else if (b?.type === 'text' || b?.type === 'input_text') teks += (b.text || '') + '\n';
        // blok tool_result / image sengaja dilewati: itu keluaran alat, bukan kata Fahmi
      }
    }
    teks = teks.trim();
    if (teks) keluar.push(teks);
  }
  return keluar;
}

function kumpulkanBerkas(dir, hasil = []) {
  let isi;
  try { isi = fs.readdirSync(dir, { withFileTypes: true }); } catch { return hasil; }
  for (const e of isi) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) kumpulkanBerkas(p, hasil);
    else if (e.name.endsWith('.jsonl')) hasil.push(p);
  }
  return hasil;
}

// --------------------------------------------------- penyaring ucapan --
const SISTEM_SUNTIK = /<system-reminder|<command-name|<local-command|Caveat: The messages below|This session is being continued|\[Request interrupted|<task-notification/i;

function ucapanBersih(t) {
  if (t.length < 12 || t.length > 600) return null;
  if (SISTEM_SUNTIK.test(t)) return null;          // suntikan sistem, bukan kata Fahmi
  if (berbauRahasia(t)) return null;
  if (/^\/[a-z-]+/.test(t)) return null;            // perintah slash
  if (/^(y|ya|ok|oke|gas|lanjut|next|iya|sip|mantap|thanks|makasih)\W*$/i.test(t)) return null;
  const noise = (t.match(/[A-Z]:\\[^\s]+|https?:\/\/\S+|```[\s\S]*?```/g) || []).join('').length;
  if (noise / t.length > 0.35) return null;
  return t.replace(/\s+/g, ' ').trim();
}

const bertanya = (t) => /\?|^(gimana|bagaimana|apa|apakah|kenapa|mengapa|siapa|kapan|di ?mana|berapa|bisakah|bisa ?nggak|gmn)\b/i.test(t);

// ------------------------------------------ indeks jawaban dari korpus --
const STOP = new Set('yang dan di ke dari untuk pada dengan itu ini ada saya kamu kita bisa aja ya nya juga atau tapi kalo kalau udah sudah gak nggak jadi biar buat lagi dulu terus semua akan dalam sebagai adalah the a an of to in for is are on with'.split(' '));
const kataKunci = (t) => [...new Set(t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
  .filter((w) => w.length > 3 && !STOP.has(w)))];

function muatKorpus() {
  const entri = [];
  let isi;
  try { isi = fs.readFileSync(LEARNED, 'utf8'); } catch {
    console.error('!! learned.jsonl tidak terbaca:', LEARNED); return entri;
  }
  for (const b of isi.split(/\r?\n/)) {
    if (!b) continue;
    let o; try { o = JSON.parse(b); } catch { continue; }
    const judul = String(o.title || '').trim();
    const badan = String(o.body || '').replace(/\s+/g, ' ').trim();
    if (badan.length < 120 || badan.length > 1400) continue;
    if (berbauRahasia(judul + ' ' + badan)) continue;
    entri.push({ judul, badan, kunci: new Set(kataKunci(judul + ' ' + badan)), tgl: String(o.created_at || o.date || '').slice(0, 10) });
  }
  return entri;
}

function jodohkan(tanya, korpus) {
  const k = kataKunci(tanya);
  if (k.length < 3) return null;
  let terbaik = null, skorTerbaik = 0;
  for (const e of korpus) {
    let cocok = 0;
    for (const w of k) if (e.kunci.has(w)) cocok++;
    const skor = cocok / k.length;
    if (skor > skorTerbaik) { skorTerbaik = skor; terbaik = e; }
  }
  // ambang tinggi: lebih baik sedikit tapi benar-benar berjodoh
  return skorTerbaik >= 0.5 && terbaik ? { e: terbaik, skor: skorTerbaik } : null;
}

// ------------------------------------------------------------- utama --
const SISTEM = 'Kamu MiganCore, agent AI milik Fahmi Ghani. Jawab dari catatan yang kamu punya, sebut tanggal pencatatannya. Kalau tidak ada di catatan, katakan terus terang — jangan mengarang.';

const rows = [];
const lihat = new Set();
function tambah(tanya, jawab, sumber) {
  const id = hash(tanya + '||' + jawab);
  if (lihat.has(id)) return false;
  lihat.add(id);
  rows.push({
    conversations: [
      { from: 'system', value: SISTEM },
      { from: 'human', value: tanya },
      { from: 'gpt', value: jawab },
    ],
    id, sumber,
  });
  return true;
}

console.log('memuat korpus jawaban (milik sendiri)…');
const korpus = muatKorpus();
console.log(`  ${korpus.length} entri catatan layak jadi jawaban`);

let totalBerkas = 0, totalUcapan = 0, dibuangRahasia = 0;
const ucapan = [];
for (const s of SUMBER) {
  const berkas = kumpulkanBerkas(s.dir);
  totalBerkas += berkas.length;
  for (const f of berkas) {
    for (const t of bacaGiliranPengguna(f)) {
      totalUcapan++;
      if (berbauRahasia(t)) { dibuangRahasia++; continue; }
      const bersih = ucapanBersih(t);
      if (bersih) ucapan.push({ teks: bersih, asal: s.label });
    }
  }
}
console.log(`  ${totalBerkas} berkas sesi · ${totalUcapan} giliran Fahmi · ${ucapan.length} layak · ${dibuangRahasia} dibuang (berbau rahasia)`);

// dedup ucapan
const lihatUcap = new Set();
const unikUcap = ucapan.filter((u) => {
  const k = hash(u.teks.toLowerCase().slice(0, 200));
  return lihatUcap.has(k) ? false : (lihatUcap.add(k), true);
});
console.log(`  ${unikUcap.length} ucapan unik`);

// ── kolam A: pertanyaan NYATA × jawaban dari catatan sendiri ──
let kolamA = 0;
for (const u of unikUcap) {
  if (!bertanya(u.teks)) continue;
  const j = jodohkan(u.teks, korpus);
  if (!j) continue;
  const tgl = j.e.tgl || 'tanggal pencatatan';
  if (tambah(u.teks, `Menurut catatan saya (${tgl}) tentang ${j.e.judul}: ${j.e.badan}`, `sesi-gaya-${u.asal}`)) kolamA++;
}

// ── kolam B: pernyataan pemilik (deklaratif, berisi angka/keputusan/aturan) ──
const PENANDA = /\b(harus|wajib|jangan|selalu|nomor|nomer|harga|target|deadline|prioritas|keputusan|aturan|pakai|gunakan|jadikan)\b/i;
let kolamB = 0;
for (const u of unikUcap) {
  if (bertanya(u.teks)) continue;
  if (!PENANDA.test(u.teks)) continue;
  if (u.teks.length < 40 || u.teks.length > 320) continue;
  const k = kataKunci(u.teks);
  if (k.length < 4) continue;
  const topik = k.slice(0, 3).join(' ');
  if (tambah(
    `Apa arahan Fahmi soal ${topik}?`,
    `Arahan langsung dari Fahmi (dicatat dari sesi kerja): "${u.teks}" — itu instruksi pemilik, jadi saya ikuti apa adanya, bukan tafsiran saya.`,
    `sesi-arahan-${u.asal}`)) kolamB++;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
console.log(`\npanen-sesi: ${rows.length} baris → ${OUT}`);
console.log(`  kolam A (gaya nyata × catatan sendiri) : ${kolamA}`);
console.log(`  kolam B (arahan pemilik)               : ${kolamB}`);
console.log('  CATATAN: nol giliran asisten dipanen — patuh R11.');
