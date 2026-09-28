#!/usr/bin/env node
/**
 * netralkan-prompt-induk.mjs — buang prompt GERBANG dari cluster INDUK.
 *
 * ============================== KENAPA ADA ==================================
 * D1 audit (27 Agu) menemukan cluster-hitung.jsonl memakai prompt gerbang di
 * 22,0% barisnya — naik dari 0,7% pada 23 Agu. Sebabnya bukan cacat program:
 * commit 733ff80 memasukkan 80 baris gold yang DITULIS TANGAN Fahmi pada sesi
 * 24 Agu, dan ia menulisnya dengan prompt standar — wajar sekali.
 *
 * Kenapa itu tetap harus dibetulkan: prompt gerbang adalah kalimat yang dipakai
 * eval/uji-aritmetika.mjs untuk MENGUKUR. Kalau seperlima data latih dikondisikan
 * pada kalimat itu, gerbangnya sebagian mengukur hafalan-kondisi, bukan kemampuan.
 * Ini penyakit yang sama dengan C07 (soal gerbang bocor ke data latih), hanya
 * pindah tingkat: dari SOAL ke PROMPT.
 *
 * Pembagian tugas yang benar:
 *   INDUK (cluster-*.jsonl)   membawa ISI. Prompt-nya netral, satu ragam identitas.
 *   TURUNAN (*-promptragam)   membawa RAGAM. ragam-prompt.mjs yang menugaskan
 *                             ember A/G/P/N — termasuk porsi prompt gerbang yang
 *                             memang DISENGAJA supaya paritas tercapai.
 * Menaruh prompt gerbang di induk berarti mengambil pekerjaan turunan, lalu
 * melakukannya tanpa proporsi.
 *
 * ISI TIDAK DISENTUH. Yang diubah hanya giliran `system`. Soal, jawaban, angka,
 * id, sumber — semuanya utuh. Bisa diperiksa: --uji.
 *
 * ⚠️ MENGUBAH INDUK MENGUBAH SIDIKNYA. Semua PRA-DAFTAR yang mengunci sidik lama
 * jadi kedaluwarsa dan WAJIB disegarkan sebelum GPU disewa. Itu memang aturannya.
 *
 * Pakai: node flywheel/netralkan-prompt-induk.mjs <berkas.jsonl> [--terapkan]
 *        node flywheel/netralkan-prompt-induk.mjs --uji
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { PROMPT } from "./ragam-prompt.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.dirname(DIR);
const GERBANG = JSON.parse(fs.readFileSync(path.join(AKAR, "eval", "prompt-gerbang.json"), "utf8")).dasar;

const baca = (p) => fs.readFileSync(p, "utf8").split("\n").filter((x) => x.trim()).map((x) => JSON.parse(x));
const sidik = (t) => crypto.createHash("sha256").update(t).digest("hex").slice(0, 16);

/**
 * Ganti giliran system yang berisi prompt gerbang dengan prompt identitas (A).
 * Murni — tidak menyentuh berkas, bisa diuji dengan fixture.
 */
export function netralkan(baris, promptGerbang, promptGanti) {
  let diubah = 0;
  const keluar = baris.map((b) => {
    const c = b.conversations;
    if (!Array.isArray(c) || c[0]?.from !== "system" || c[0].value !== promptGerbang) return b;
    diubah++;
    const salin = JSON.parse(JSON.stringify(b));
    salin.conversations[0].value = promptGanti;
    return salin;
  });
  return { keluar, diubah };
}

// ── uji instrumen: penjaganya diperiksa sebelum dipercaya ───────────────────
if (process.argv.includes("--uji")) {
  let ok = 0, buruk = 0;
  const cek = (n, benar, ket = "") => (benar ? (ok++, console.log(`  OK    ${n}`))
    : (buruk++, console.log(`  GAGAL ${n}${ket ? " — " + ket : ""}`)));

  const G = "PROMPT-GERBANG", A = "PROMPT-A";
  const contoh = [
    { id: 1, sumber: "x", conversations: [{ from: "system", value: G }, { from: "human", value: "soal 3 ton" }, { from: "gpt", value: "jawab 25.500" }] },
    { id: 2, sumber: "y", conversations: [{ from: "system", value: "lain" }, { from: "human", value: "h2" }, { from: "gpt", value: "j2" }] },
    { id: 3, sumber: "z", conversations: [{ from: "human", value: "tanpa system" }, { from: "gpt", value: "j3" }] },
  ];
  const { keluar, diubah } = netralkan(contoh, G, A);

  cek("hanya baris berprompt gerbang yang diubah", diubah === 1);
  cek("prompt gerbang -> prompt A", keluar[0].conversations[0].value === A);
  cek("prompt lain TIDAK disentuh", keluar[1].conversations[0].value === "lain");
  cek("baris tanpa system TIDAK disentuh", keluar[2].conversations[0].from === "human");
  cek("SOAL utuh", keluar[0].conversations[1].value === "soal 3 ton");
  cek("JAWABAN utuh — aturan paling keras", keluar[0].conversations[2].value === "jawab 25.500");
  cek("id & sumber terbawa", keluar[0].id === 1 && keluar[0].sumber === "x");
  cek("masukan asli tidak ikut berubah", contoh[0].conversations[0].value === G);
  cek("jumlah baris tetap", keluar.length === contoh.length);
  cek("prompt gerbang nyata terbaca dari berkas", typeof GERBANG === "string" && GERBANG.length > 20);
  cek("prompt A nyata ada di ragam-prompt", typeof PROMPT.A === "string" && PROMPT.A.length > 20);

  console.log("\n" + "=".repeat(52));
  console.log(`${ok} lulus · ${buruk} gagal`);
  process.exit(buruk ? 1 : 0);
}

// ── jalan
const berkas = process.argv.find((x) => x.endsWith(".jsonl"));
if (!berkas) {
  console.error("pakai: node flywheel/netralkan-prompt-induk.mjs <berkas.jsonl> [--terapkan] | --uji");
  process.exit(2);
}
const TERAPKAN = process.argv.includes("--terapkan");
const baris = baca(berkas);
const sebelum = fs.readFileSync(berkas, "utf8");
const { keluar, diubah } = netralkan(baris, GERBANG, PROMPT.A);

const pangsaSebelum = baris.filter((b) => b.conversations?.[0]?.value === GERBANG).length / baris.length;
const pangsaSesudah = keluar.filter((b) => b.conversations?.[0]?.value === GERBANG).length / keluar.length;

console.log(`berkas   : ${path.relative(AKAR, berkas)}`);
console.log(`baris    : ${baris.length}`);
console.log(`diubah   : ${diubah} giliran system (isi tidak disentuh)`);
console.log(`prompt gerbang: ${(pangsaSebelum * 100).toFixed(1)}% -> ${(pangsaSesudah * 100).toFixed(1)}%  (ambang <5%)`);

if (!diubah) { console.log("\ntidak ada yang perlu diubah."); process.exit(0); }
if (!TERAPKAN) { console.log("\n(UJI COBA — tambahkan --terapkan untuk menyimpan)"); process.exit(0); }

const isi = keluar.map((b) => JSON.stringify(b)).join("\n") + "\n";
fs.writeFileSync(berkas, isi);
console.log(`\nsidik data: ${sidik(sebelum)} -> ${sidik(isi)}`);
console.log("⚠️  PRA-DAFTAR yang mengunci sidik lama kini KEDALUWARSA.");
console.log("    Segarkan sebelum menyewa GPU — itu memang aturannya, bukan kelalaian.");
console.log("    Dan bangun ulang turunannya: node flywheel/ragam-prompt.mjs <induk> <turunan>");
