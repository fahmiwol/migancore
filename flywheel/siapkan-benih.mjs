#!/usr/bin/env node
/**
 * siapkan-benih.mjs — pilih baris mana yang layak dikirim ke guru untuk disuling.
 *
 * ===================== KENAPA BUKAN "KIRIM SEMUA SAJA" =====================
 * Taksonomi kita (TAKSONOMI-CLUSTER.md, Miganxonomi) sudah membayar mahal untuk
 * mengetahui bahwa TIDAK semua cluster layak diperbanyak:
 *
 *   nalar      -> DIKECUALIKAN. Adapter nalar MEMPERBURUK nalar: 24/42 vs base
 *                 33/42 (p=0,012), premis-salah 0/4 vs 3/4. Memperbanyaknya
 *                 berarti memperbanyak kerusakan. Nalar diserahkan ke base +
 *                 backbone + prompt, bukan ke bobot.
 *   keluar-rag -> DIKECUALIKAN. Itu FAKTA (harga, tanggal, nama). Fakta hidup di
 *                 RAG (OMIGA brain); menaruhnya di bobot membuatnya basi diam-diam.
 *
 * Yang disuling hanya KEBIASAAN MEKANIS — kelas yang terbukti berhasil: tool,
 * hitung, gaya. Aturannya di TAKSONOMI-CLUSTER.md bagian 3.
 *
 * ============================ PENJAGA C07 ==================================
 * Baris yang mirip SOAL GERBANG (>= 0,8) DIBUANG. Kalau soal gerbang ikut
 * diajarkan, gerbang berhenti mengukur kemampuan dan mulai mengukur hafalan —
 * dan kita kehilangan satu-satunya alat yang bisa bilang "ini benar-benar lebih
 * baik". Daftar soal gerbang dibaca HIDUP dari berkas hasil eval lewat
 * soalGerbang(), bukan dari salinan yang bisa basi.
 *
 * Pakai:
 *   node flywheel/siapkan-benih.mjs                  semua cluster yang layak
 *   node flywheel/siapkan-benih.mjs --cluster=tool   satu cluster saja
 *   node flywheel/siapkan-benih.mjs --batas=60       batasi jumlah benih
 *   node flywheel/siapkan-benih.mjs --uji            uji instrumen, tanpa menulis
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { miripSoal, soalGerbang } from "../sistem/antre-ajar.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.dirname(DIR);
const DATASET = path.join(DIR, "dataset");
const KELUAR = path.join(DATASET, "benih-suling.jsonl");
const MANIFEST = path.join(DATASET, "benih-suling-manifest.json");

const arg = (n, b) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=")[1] : b;
};
const CLUSTER = arg("cluster", null);
const BATAS = Number(arg("batas", 0)) || 0;
const UJI = process.argv.includes("--uji");

/**
 * Sumber benih. `pakai:false` ditulis SENGAJA dengan alasannya, bukan dihapus —
 * supaya orang berikutnya tahu itu keputusan berdasar bukti, bukan kelupaan.
 */
const SUMBER = [
  { cluster: "tool", berkas: "v14/cluster-tool.jsonl", pakai: true,
    alasan: "celah hidup: 26 -> target 150, sudah 2 iterasi dan masih gagal di arit-latih 7/10" },
  { cluster: "hitung", berkas: "v13/cluster-hitung.jsonl", pakai: true,
    alasan: "kebiasaan mekanis; aritmetika 30/30 tapi RATA-RATA 0/2 di bawah prompt latih (C20)" },
  { cluster: "gaya", berkas: "v13/cluster-gaya.jsonl", pakai: true,
    alasan: "batas peran & tolak; tolak 9/10 tapi efek samping enggan memanggil alat" },
  { cluster: "hitung-promptragam", berkas: "v13/cluster-hitung-promptragam.jsonl", pakai: false,
    alasan: "DIUKUR 27 Agu: 0 lolos dari 285 — seluruhnya kembar dengan cluster-hitung " +
      "(memang soal yang sama dengan prompt dirotasi). Nol nilainya sebagai benih, dan " +
      "memakainya cuma menggelembungkan hitungan tolakan tiap kali dijalankan" },
  { cluster: "nalar", berkas: "v13/cluster-nalar.jsonl", pakai: false,
    alasan: "MEMPERBURUK nalar 24/42 vs base 33/42 (p=0,012); premis-salah 0/4. Memperbanyak = memperbanyak kerusakan" },
  { cluster: "keluar-rag", berkas: "v13/cluster-keluar-rag.jsonl", pakai: false,
    alasan: "fakta, bukan kebiasaan. Jalurnya RAG (OMIGA brain), bukan bobot" },
];

const sidikTeks = (t) => crypto.createHash("sha256").update(t).digest("hex").slice(0, 16);

/** Baca giliran manusia/jawaban dari dua bentuk berkas yang beredar di sini. */
function giliran(baris, mau) {
  const c = baris.conversations || baris.messages;
  if (!Array.isArray(c)) return "";
  const nama = baris.conversations
    ? { pengguna: "human", jawab: "gpt" }
    : { pengguna: "user", jawab: "assistant" };
  const cari = nama[mau];
  for (const m of c) if ((m.from ?? m.role) === cari) return m.value ?? m.content ?? "";
  return "";
}

function kumpulkan() {
  const gerbang = [...soalGerbang()];
  const dipakai = SUMBER.filter((s) => s.pakai && (!CLUSTER || s.cluster === CLUSTER));
  const benih = [];
  const tolak = {};
  const perCluster = {};
  const tanyaTerlihat = new Set();
  const catatTolak = (k) => { tolak[k] = (tolak[k] || 0) + 1; };

  for (const s of dipakai) {
    const p = path.join(DATASET, s.berkas);
    if (!fs.existsSync(p)) { console.error(`  ! berkas tidak ada, dilewati: ${s.berkas}`); continue; }
    const baris = fs.readFileSync(p, "utf8").split("\n").filter((x) => x.trim()).map((x) => JSON.parse(x));
    let lolos = 0;

    for (const b of baris) {
      const tanya = String(giliran(b, "pengguna")).trim();
      const jawab = String(giliran(b, "jawab")).trim();

      if (!tanya || !jawab) { catatTolak("giliran tidak lengkap"); continue; }
      // Pertanyaan sangat panjang bukan calon baik: guru cenderung meringkasnya,
      // dan meringkas berisiko menggeser maksud — persis yang tidak boleh terjadi.
      if (tanya.length > 400) { catatTolak("pertanyaan terlalu panjang (>400 huruf)"); continue; }
      if (tanya.length < 12) { catatTolak("pertanyaan terlalu pendek (<12 huruf)"); continue; }

      const k = tanya.toLowerCase().replace(/\s+/g, " ");
      if (tanyaTerlihat.has(k)) { catatTolak("pertanyaan kembar antar-berkas"); continue; }

      // C07: jangan pernah menyuling soal yang dipakai gerbang untuk mengukur kita
      if (gerbang.some((g) => miripSoal(tanya, g) >= 0.8)) { catatTolak("mirip soal gerbang (C07)"); continue; }

      tanyaTerlihat.add(k);
      benih.push({ ...b, _cluster: s.cluster, _berkasAsal: s.berkas });
      lolos++;
    }
    perCluster[s.cluster] = { dibaca: baris.length, lolos };
  }
  return { benih, tolak, perCluster, gerbang: gerbang.length, dipakai };
}

// ── uji instrumen: penjaganya sendiri diperiksa sebelum dipercaya ────────────
if (UJI) {
  let ok = 0, buruk = 0;
  const cek = (n, a, b) => (a === b ? (ok++, console.log(`  OK   ${n}`))
    : (buruk++, console.log(`  GAGAL ${n}\n        dapat ${JSON.stringify(a)} harap ${JSON.stringify(b)}`)));

  const sgpt = { conversations: [{ from: "system", value: "S" }, { from: "human", value: "U" }, { from: "gpt", value: "A" }] };
  const oai = { messages: [{ role: "user", content: "U" }, { role: "assistant", content: "A" }] };
  cek("baca ShareGPT: pengguna", giliran(sgpt, "pengguna"), "U");
  cek("baca ShareGPT: jawaban", giliran(sgpt, "jawab"), "A");
  cek("baca OpenAI: pengguna", giliran(oai, "pengguna"), "U");
  cek("baca bentuk asing -> kosong, tidak meledak", giliran({ x: 1 }, "pengguna"), "");

  const g = soalGerbang();
  cek("daftar soal gerbang tidak kosong", g.size > 0, true);
  const contoh = [...g][0] || "";
  cek("soal gerbang mirip dirinya sendiri (>=0,8)", contoh ? miripSoal(contoh, contoh) >= 0.8 : true, true);
  cek("kalimat tak berhubungan TIDAK dianggap mirip",
    miripSoal("Berapa margin 3 ton di 8.500?", "Tolong buatkan gambar kucing terbang") < 0.8, true);

  cek("nalar DIKECUALIKAN", SUMBER.find((s) => s.cluster === "nalar").pakai, false);
  cek("keluar-rag DIKECUALIKAN", SUMBER.find((s) => s.cluster === "keluar-rag").pakai, false);
  cek("tiap sumber punya alasan tertulis", SUMBER.every((s) => s.alasan && s.alasan.length > 20), true);

  console.log("\n" + "=".repeat(52));
  console.log(`${ok} lulus · ${buruk} gagal`);
  process.exit(buruk ? 1 : 0);
}

// ── jalan ────────────────────────────────────────────────────────────────────
console.log("SIAPKAN BENIH —", new Date().toISOString().slice(0, 16).replace("T", " "));
console.log("=".repeat(70));
for (const s of SUMBER) {
  const tanda = s.pakai ? "dipakai " : "DIKECUALIKAN";
  console.log(` ${tanda} ${s.cluster.padEnd(20)} ${s.alasan.slice(0, 66)}`);
}

const { benih: semua, tolak, perCluster, gerbang } = kumpulkan();
const benih = BATAS ? semua.slice(0, BATAS) : semua;

console.log("\n" + "=".repeat(70));
console.log(`soal gerbang yang dijaga (dibaca hidup dari eval/): ${gerbang}`);
for (const [c, v] of Object.entries(perCluster))
  console.log(`  ${c.padEnd(22)} ${String(v.lolos).padStart(4)} lolos dari ${v.dibaca}`);
console.log("\nditolak:");
for (const [k, v] of Object.entries(tolak).sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(v).padStart(4)}  ${k}`);

// Nol benih = GAGAL. Menulis berkas kosong lalu menyewa GPU untuknya adalah
// cara termahal menemukan bahwa penyaringnya terlalu ketat.
if (!benih.length) {
  console.error("\nBERHENTI: nol benih lolos. Periksa penyaring sebelum menyewa apa pun.");
  process.exit(1);
}

// Diakhiri baris-baru: tanpa itu `wc -l` di instance melaporkan 752 untuk 753
// baris, dan pemeriksaan jumlah jadi tidak bisa dipercaya persis saat ia paling perlu.
fs.writeFileSync(KELUAR, benih.map((b) => JSON.stringify(b)).join("\n") + "\n");
const manifest = {
  dibuat: new Date().toISOString(),
  benih: benih.length,
  sidikBenih: sidikTeks(fs.readFileSync(KELUAR, "utf8")),
  perCluster, ditolak: tolak, soalGerbangDijaga: gerbang,
  dikecualikan: SUMBER.filter((s) => !s.pakai).map((s) => ({ cluster: s.cluster, alasan: s.alasan })),
  catatan: "jawaban TIDAK boleh diubah oleh guru; guru hanya menulis ulang giliran pengguna",
};
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));

console.log(`\nbenih siap : ${benih.length} baris -> ${path.relative(AKAR, KELUAR)}`);
console.log(`sidik      : ${manifest.sidikBenih}`);
console.log(`manifest   : ${path.relative(AKAR, MANIFEST)}`);
