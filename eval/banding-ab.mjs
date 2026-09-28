#!/usr/bin/env node
// banding-ab.mjs — bandingkan dua berkas hasil uji-aritmetika (mis. dengan vs tanpa system prompt)
// per-soal DULU, baru total — sesuai C12 (agregat bisa menyamarkan efek berlawanan).
// Pakai: node banding-ab.mjs <berkasA> <berkasB> [labelA] [labelB]
import { readFileSync } from "node:fs";
import { fisher, ukuranSampelPerlu, vonisBerpasangan, pasangkanPerSoal } from "./statistik.mjs";

const [, , fA, fB, labA = "A", labB = "B"] = process.argv;
if (!fA || !fB) {
  console.error("pakai: node banding-ab.mjs <berkasA> <berkasB> [labelA] [labelB]");
  process.exit(1);
}
const A = JSON.parse(readFileSync(fA, "utf8"));
const B = JSON.parse(readFileSync(fB, "utf8"));

// Sama-sama harus model & jumlah ulangan yang sama — kalau tidak, perbandingan tidak sah.
if (A.model !== B.model) {
  console.error(`TOLAK: model beda (${A.model} vs ${B.model}) — ini bukan A/B perlakuan.`);
  process.exit(1);
}
if (A.ulang !== B.ulang) {
  console.error(`TOLAK: jumlah ulangan beda (${A.ulang} vs ${B.ulang}).`);
  process.exit(1);
}

const kelompok = (R) => {
  const m = new Map();
  for (const r of R.rinci) {
    const kunci = r.soal;
    if (!m.has(kunci)) m.set(kunci, { b: 0, n: 0, contohSalah: null, contohBenar: null });
    const e = m.get(kunci);
    e.n++;
    if (r.ok) { e.b++; if (!e.contohBenar) e.contohBenar = r.jawab; }
    else if (!e.contohSalah) e.contohSalah = r.jawab;
  }
  return m;
};
const mA = kelompok(A), mB = kelompok(B);

const soalA = [...mA.keys()].sort(), soalB = [...mB.keys()].sort();
if (soalA.join("|") !== soalB.join("|")) {
  console.error("TOLAK: daftar soal tidak identik — blok soal wajib sama.");
  console.error("hanya di A:", soalA.filter((s) => !mB.has(s)));
  console.error("hanya di B:", soalB.filter((s) => !mA.has(s)));
  process.exit(1);
}

console.log(`model     : ${A.model} (ulangan ${A.ulang}x, kedua suhu digabung per soal)`);
console.log(`${labA.padEnd(9)}: ${fA}`);
console.log(`${labB.padEnd(9)}: ${fB}`);
console.log("");
console.log("PER SOAL " + "-".repeat(70));

let totA = { b: 0, n: 0 }, totB = { b: 0, n: 0 };
const menonjol = [];
for (const s of soalA) {
  const a = mA.get(s), b = mB.get(s);
  totA.b += a.b; totA.n += a.n; totB.b += b.b; totB.n += b.n;
  const p = fisher(a.b, a.n, b.b, b.n);
  const tanda = p < 0.05 ? " <<< BEDA NYATA" : "";
  console.log(`  ${s.slice(0, 46).padEnd(48)} ${labA} ${a.b}/${a.n}  ${labB} ${b.b}/${b.n}  p=${p.toFixed(4)}${tanda}`);
  if (p < 0.05 || Math.abs(a.b / a.n - b.b / b.n) >= 0.5) menonjol.push({ s, a, b, p });
}

console.log("");
console.log("TOTAL (gabungan ulangan — INDIKATIF, C19: ulangan bukan pengamatan bebas) " + "-".repeat(10));
const pTot = fisher(totA.b, totA.n, totB.b, totB.n);
console.log(`  ${labA}: ${totA.b}/${totA.n} (${Math.round((100 * totA.b) / totA.n)}%)   ${labB}: ${totB.b}/${totB.n} (${Math.round((100 * totB.b) / totB.n)}%)   Fisher p=${pTot.toFixed(4)} (indikatif)`);
if (pTot >= 0.05) {
  const perlu = ukuranSampelPerlu(totA.b / totA.n, totB.b / totB.n);
  console.log(`  total belum terbukti beda; butuh ~${perlu} percobaan/lengan untuk kuasa 80%`);
}

// C19 (23 Agu): satuan yang SAH = soal. Ulangan dirata-rata per soal, lalu
// McNemar eksak atas soal yang diskordan. Ini vonis yang boleh diklaim.
console.log("");
console.log("BERPASANGAN PER SOAL (SAH untuk klaim) " + "-".repeat(40));
const vb = vonisBerpasangan(pasangkanPerSoal(A.rinci, B.rinci));
console.log(`  ${vb.nSoal} soal · ${labB} lebih baik di ${vb.c} · ${labA} lebih baik di ${vb.b} · seri ${vb.seri} · McNemar eksak p=${vb.p.toFixed(4)} ${vb.nyata ? "<<< BEDA NYATA" : "(belum terbukti — butuh >=6 soal diskordan searah untuk p<0,05 pada n kecil)"}`);
console.log(`  rata-rata skor per soal: ${labA} ${vb.rataA.toFixed(3)} · ${labB} ${vb.rataB.toFixed(3)}`);

if (menonjol.length) {
  console.log("");
  console.log("BUKTI MENTAH (soal yang menonjol) " + "-".repeat(45));
  for (const { s, a, b } of menonjol) {
    console.log(`  SOAL: ${s}`);
    if (a.contohSalah) console.log(`    [${labA} salah] ${a.contohSalah.slice(0, 160)}`);
    if (a.contohBenar) console.log(`    [${labA} benar] ${a.contohBenar.slice(0, 160)}`);
    if (b.contohSalah) console.log(`    [${labB} salah] ${b.contohSalah.slice(0, 160)}`);
    if (b.contohBenar) console.log(`    [${labB} benar] ${b.contohBenar.slice(0, 160)}`);
    console.log("");
  }
}
