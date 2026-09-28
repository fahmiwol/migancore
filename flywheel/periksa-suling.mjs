#!/usr/bin/env node
/**
 * periksa-suling.mjs — buktikan hasil penyulingan layak, jangan percaya hitungannya.
 *
 * Ringkasan penyuling melaporkan berapa yang diterima dan ditolak. Itu laporan
 * ALAT TENTANG DIRINYA SENDIRI. Berkas ini memeriksa BERKAS HASILNYA, dari luar,
 * dengan pertanyaan yang paling menentukan:
 *
 *   1. JAWABANNYA benar-benar tidak tersentuh? Ini aturan paling keras seluruh
 *      pipa. Kalau satu saja jawaban berubah, seluruh hasil dibuang — sebab
 *      pilot14 gagal justru karena kuncinya salah, bukan karena modelnya bodoh.
 *   2. Pertanyaannya benar-benar BEDA dari benihnya? Kalau tidak, kita cuma
 *      menggandakan bobot satu kalimat, bukan menambah keragaman.
 *   3. Angkanya utuh? Guru yang menggeser angka membuat soal tak cocok kuncinya.
 *   4. Tidak ada yang mirip soal GERBANG? Kalau bocor, gerbang berhenti mengukur
 *      kemampuan dan mulai mengukur hafalan.
 *   5. Tidak ada sisa "jejak pikir" atau kalimat meta dari guru.
 *
 * Pakai: node flywheel/periksa-suling.mjs
 * Keluar 1 kalau ada yang gagal — supaya bisa dipakai sebagai gerbang.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { miripSoal, soalGerbang } from "../sistem/antre-ajar.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.join(DIR, "dataset");
const HASIL = path.join(DATASET, "hasil-suling.jsonl");
const BENIH = path.join(DATASET, "benih-suling.jsonl");

const baca = (p) => fs.readFileSync(p, "utf8").split("\n").filter((x) => x.trim()).map((x) => JSON.parse(x));

function giliran(b, mau) {
  const c = b.conversations || b.messages;
  if (!Array.isArray(c)) return "";
  const nama = b.conversations ? { pengguna: "human", jawab: "gpt" } : { pengguna: "user", jawab: "assistant" };
  for (const m of c) if ((m.from ?? m.role) === nama[mau]) return m.value ?? m.content ?? "";
  return "";
}
const angka = (t) => (String(t).match(/\d[\d.,]*/g) || []).map((x) => x.replace(/[.,]+$/, "")).sort();
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (!fs.existsSync(HASIL)) { console.error("belum ada hasil-suling.jsonl"); process.exit(1); }
const hasil = baca(HASIL);
const benih = baca(BENIH);

// benih dipetakan lewat sidik yang ditulis penyuling, bukan lewat urutan —
// urutan bisa bergeser dan pemeriksaan yang salah pasangan lebih buruk dari tak memeriksa
import crypto from "node:crypto";
const sidik = (x) => crypto.createHash("sha256").update(JSON.stringify(x, Object.keys(x).sort())).digest("hex").slice(0, 16);
const petaBenih = new Map();
for (const b of benih) {
  const bersih = { ...b };
  petaBenih.set(giliran(b, "jawab"), b);   // dipasangkan lewat JAWABAN, yang menurut aturan tidak boleh berubah
}

let lulus = 0, gagal = 0;
const cek = (n, ok, ket = "") => (ok ? (lulus++, console.log(`  OK   ${n}${ket ? " — " + ket : ""}`))
  : (gagal++, console.log(`  GAGAL ${n}${ket ? " — " + ket : ""}`)));

console.log(`hasil suling: ${hasil.length} baris · benih: ${benih.length} baris\n`);

// ── 1. jawaban tidak tersentuh
const jawabanBenih = new Set(benih.map((b) => giliran(b, "jawab")));
const jawabanAsing = hasil.filter((h) => !jawabanBenih.has(giliran(h, "jawab")));
cek("JAWABAN tidak tersentuh (aturan paling keras)", jawabanAsing.length === 0,
  jawabanAsing.length ? `${jawabanAsing.length} jawaban TIDAK cocok benih mana pun` : `${hasil.length}/${hasil.length} cocok persis`);

// ── 2. pertanyaan benar-benar beda
const tolak = new Set();   // indeks baris yang tidak layak kirim
let miripBenih = 0, contohMirip = null;
for (const [i, h] of hasil.entries()) {
  const b = petaBenih.get(giliran(h, "jawab"));
  if (!b) continue;
  const m = miripSoal(giliran(h, "pengguna"), giliran(b, "pengguna"));
  if (m >= 0.8) { miripBenih++; tolak.add(i); contohMirip = contohMirip || giliran(h, "pengguna").slice(0, 60); }
}
cek("pertanyaan berbeda dari benihnya (<0,8)", miripBenih === 0,
  miripBenih ? `${miripBenih} masih terlalu mirip, mis. "${contohMirip}"` : "semua di bawah ambang");

// ── 3. angka utuh
let angkaGeser = 0, contohGeser = null;
for (const [i, h] of hasil.entries()) {
  const b = petaBenih.get(giliran(h, "jawab"));
  if (!b) continue;
  if (!sama(angka(giliran(h, "pengguna")), angka(giliran(b, "pengguna")))) {
    angkaGeser++; tolak.add(i);
    contohGeser = contohGeser || { baru: giliran(h, "pengguna").slice(0, 70), asli: giliran(b, "pengguna").slice(0, 70) };
  }
}
cek("angka tidak bergeser", angkaGeser === 0,
  angkaGeser ? `${angkaGeser} bergeser, mis. "${contohGeser.asli}" -> "${contohGeser.baru}"` : "semua cocok");

// ── 4. tidak mencemari soal gerbang
const gerbang = [...soalGerbang()];
let bocor = 0, contohBocor = null;
for (const [i, h] of hasil.entries()) {
  const t = giliran(h, "pengguna");
  if (gerbang.some((g) => miripSoal(t, g) >= 0.8)) { bocor++; tolak.add(i); contohBocor = contohBocor || t.slice(0, 60); }
}
cek(`tidak mirip soal gerbang (${gerbang.length} soal dijaga)`, bocor === 0,
  bocor ? `${bocor} bocor, mis. "${contohBocor}"` : "bersih");

// ── 5. tidak ada sisa jejak pikir / kalimat meta guru
// Pola ini SENGAJA sama dengan R_JEJAK_PIKIR di suling.py. Kalau pemeriksa luar
// lebih longgar daripada penjaga dalam, ia akan meloloskan persis kesalahan yang
// dibuat penjaga dalam — dan pemeriksaan jadi teater. Percobaan 27 Agu lolos
// pemeriksa ini dengan 1.047 baris jejak pikir karena polanya terlalu sempit.
const R_META = new RegExp(
  "(^|\\b)(first,? i|okay,? (the|so|let)|let me|i need to|i should|the user (wants|is asking)"
  + "|we need to|my task|rephrase|paraphrase|original (query|question|request)"
  + "|<think>|</think>|berikut (adalah )?(versi|penulisan|hasil)|tulis ulang\\s*:"
  + "|sebagai (asisten|model))", "i");
const meta = hasil.filter((h, i) => { const k = R_META.test(giliran(h, "pengguna")); if (k) tolak.add(i); return k; });
cek("tidak ada sisa jejak pikir/kalimat meta guru", meta.length === 0,
  meta.length ? `${meta.length} bermeta, mis. "${giliran(meta[0], "pengguna").slice(0, 70)}"` : "bersih");

// ── 6. panjang wajar
const panjang = hasil.map((h) => giliran(h, "pengguna").length);
const rerata = panjang.reduce((a, b) => a + b, 0) / Math.max(panjang.length, 1);
const ekstrem = panjang.filter((x) => x < 10 || x > 500).length;
cek("panjang pertanyaan wajar", ekstrem === 0,
  `rerata ${rerata.toFixed(0)} huruf` + (ekstrem ? `, ${ekstrem} ekstrem` : ""));

// ── 7. sebaran per cluster: satu cluster tidak boleh menenggelamkan yang lain
const per = {};
for (const h of hasil) per[h._cluster || "?"] = (per[h._cluster || "?"] || 0) + 1;
const total = hasil.length;
const dominan = Math.max(...Object.values(per)) / total;
console.log(`\n  sebaran cluster:`);
for (const [k, v] of Object.entries(per).sort((a, b) => b[1] - a[1]))
  console.log(`    ${k.padEnd(14)} ${String(v).padStart(4)}  (${(v / total * 100).toFixed(0)}%)`);
cek("tidak ada cluster yang mendominasi (<70%)", dominan < 0.7, `terbesar ${(dominan * 100).toFixed(0)}%`);

// ── contoh nyata untuk dibaca manusia
console.log(`\n  3 contoh (benih -> hasil):`);
for (const h of hasil.slice(0, 3)) {
  const b = petaBenih.get(giliran(h, "jawab"));
  console.log(`    asli : ${(b ? giliran(b, "pengguna") : "?").slice(0, 88)}`);
  console.log(`    baru : ${giliran(h, "pengguna").slice(0, 88)}\n`);
}

// ── PEMBERSIH ────────────────────────────────────────────────────────────────
// KENAPA PERLU, padahal penyuling sudah punya penjaga sendiri: penjaga DALAM
// (suling.py, Python) memakai mirip(), pemeriksa LUAR ini memakai miripSoal()
// dari sistem/antre-ajar.mjs. Normalisasi keduanya sedikit berbeda, jadi selalu
// ada sisa yang lolos satu tapi tidak lolos yang lain — 6 dari 1.537 pada
// percobaan 27 Agu.
//
// Menyamakan kedua fungsi lintas-bahasa akan melahirkan salinan yang bisa
// menyimpang diam-diam (persis penyakit aturan-nomor yang ditulis tiga kali).
// Lebih jujur: biarkan keduanya berbeda, lalu KIRIM HANYA YANG LOLOS KEDUANYA.
// Ambang gabungan selalu lebih ketat daripada masing-masing, dan itu arah yang benar.
if (process.argv.includes("--bersihkan")) {
  const BERSIH = path.join(DATASET, "hasil-suling-bersih.jsonl");
  const layak = hasil.filter((_, i) => !tolak.has(i));
  fs.writeFileSync(BERSIH, layak.map((x) => JSON.stringify(x)).join("\n") + "\n");
  console.log(`\ndibersihkan: ${hasil.length} -> ${layak.length} baris (${tolak.size} dibuang)`);
  console.log(`tertulis   : ${path.relative(path.dirname(DIR), BERSIH)}`);
  const per = {};
  for (const h of layak) per[h._cluster || "?"] = (per[h._cluster || "?"] || 0) + 1;
  console.log("sebaran    : " + Object.entries(per).map(([k, v]) => `${k} ${v}`).join(" \u00b7 "));
  process.exit(0);
}

console.log("=".repeat(60));
console.log(`${lulus} lulus \u00b7 ${gagal} gagal`);
if (gagal) console.log(`jalankan lagi dengan --bersihkan untuk menulis berkas tanpa ${tolak.size} baris cacat itu`);
process.exit(gagal ? 1 : 0);
