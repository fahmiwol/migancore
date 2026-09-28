#!/usr/bin/env node
/**
 * siapkan-suling.mjs — ubah hasil penyulingan jadi sumber gabung per cluster.
 *
 * ===================== KENAPA TIDAK LANGSUNG DIGABUNG ======================
 * `hasil-suling-bersih.jsonl` adalah SATU berkas berisi semua cluster, dan tiap
 * barisnya masih membawa `id` MILIK BENIHNYA — karena ia memang salinan benih
 * dengan pertanyaan ditulis ulang. Kalau digabung apa adanya, satu cluster akan
 * berisi dua baris ber-id sama, dan jejak "baris ini berasal dari mana" putus
 * justru di tempat yang paling butuh ditelusuri.
 *
 * Berkas ini memisahkannya per cluster dan memberi id sendiri, sambil MENJAGA
 * dua jejak yang tidak boleh hilang:
 *   `_benih` — sidik benih asalnya, supaya pasangan bisa dilacak balik
 *   `_guru`  — model yang menulis ulang pertanyaannya
 * `sumber` diberi awalan `suling-` supaya di dalam cluster pun asal-usulnya
 * kelihatan tanpa perlu membuka berkas lain. Itu penting: hukum A11 mencatat
 * gold MANUSIA sebagai dial paling efektif — kalau baris mesin dan baris manusia
 * tidak bisa dibedakan lagi di dalam cluster, dial itu berhenti bisa diukur.
 *
 * Keluaran ditulis ke dataset/suling/<cluster>.jsonl, yang dibaca gabung-ajar.mjs
 * lewat mesin yang sama dengan data ajar: cadangkan -> gabung -> gerbang ->
 * BATALKAN kalau gagal -> segarkan sidik pra-daftar.
 *
 * Pakai: node flywheel/siapkan-suling.mjs [--terapkan]
 *        node flywheel/siapkan-suling.mjs --varian=1 --terapkan
 *        node flywheel/siapkan-suling.mjs --uji
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.dirname(DIR);
const MASUK = path.join(DIR, "dataset", "hasil-suling-bersih.jsonl");
const KELUAR_DIR = path.join(DIR, "dataset", "suling");

const soalDari = (b) => String((b.conversations || []).find((c) => c.from === "human")?.value ?? "");

/**
 * BERAPA VARIAN PER BENIH YANG BOLEH IKUT — dan kenapa angkanya 1.
 *
 * Penyuling sengaja membuat JAWABAN identik antar-varian (guru hanya menulis
 * ulang pertanyaan). Sementara gerbang flywheel/periksa-latih.mjs menghitung
 * "nyaris-kembar" dengan Jaccard atas 5-gram SELURUH JAWABAN, ambang <=2%.
 * Dua rancangan yang sama-sama benar, dan tabrakannya baru terlihat di titik gabung.
 *
 * DIUKUR 28 Agu 2026 pada cluster tool (188 benih unik, base 201 baris):
 *   1 varian/benih -> 389 baris · nyaris-kembar 0,5%  (2 pasangan) · VONIS SIAP
 *   2 varian/benih -> 530 baris · nyaris-kembar 26,8% (142 pasangan) · GAGAL
 *   3 varian/benih -> 600 baris · nyaris-kembar 47,0% (282 pasangan) · GAGAL
 *
 * Ambangnya TIDAK ditawar — itu anti-pola yang dilarang skill indikator-parameter
 * ("menawar ambang setelah gagal"). Yang diubah datanya, bukan ambangnya.
 * Naikkan angka ini hanya kalau gerbangnya sendiri berubah cara mengukur, dan
 * ukur ulang sebelum menaikkannya.
 */
const VARIAN = Number((process.argv.find((x) => x.startsWith("--varian=")) || "").split("=")[1] || 1);

/**
 * Bersihkan satu baris suling jadi baris cluster yang sah.
 * Murni — bisa diuji dengan fixture, tanpa menyentuh berkas.
 */
export function rapikan(b) {
  const cluster = b._cluster || "?";
  const soal = soalDari(b);
  const salin = { conversations: JSON.parse(JSON.stringify(b.conversations)) };
  salin.id = "suling-" + crypto.createHash("sha256").update(cluster + "|" + soal).digest("hex").slice(0, 10);
  salin.sumber = "suling-" + cluster;
  if (b._benih) salin._benih = b._benih;   // jejak balik ke benih
  if (b._guru) salin._guru = b._guru;      // siapa yang menulis ulang
  // kunci lain yang dibawa benih (formatAngka, promptRagam) ikut, karena
  // gerbang cluster memakainya; kunci internal penyuling TIDAK ikut.
  for (const [k, v] of Object.entries(b))
    if (!k.startsWith("_") && !["conversations", "id", "sumber"].includes(k)) salin[k] = v;
  return salin;
}

// ── uji instrumen
if (process.argv.includes("--uji")) {
  let ok = 0, buruk = 0;
  const cek = (n, benar, ket = "") => (benar ? (ok++, console.log(`  OK    ${n}`))
    : (buruk++, console.log(`  GAGAL ${n}${ket ? " — " + ket : ""}`)));

  const contoh = {
    conversations: [{ from: "system", value: "S" }, { from: "human", value: "soal baru" }, { from: "gpt", value: "JAWABAN" }],
    id: "asli-123", sumber: "cluster-tool", formatAngka: "polos",
    _cluster: "tool", _benih: "abc123", _guru: "Qwen/Qwen3-8B", _asal: "suling", _berkasAsal: "x",
  };
  const r = rapikan(contoh);
  cek("id BARU, tidak menabrak id benih", r.id !== "asli-123" && r.id.startsWith("suling-"));
  cek("sumber menandai asal mesin", r.sumber === "suling-tool");
  cek("JAWABAN tidak tersentuh", r.conversations[2].value === "JAWABAN");
  cek("soal ikut apa adanya", soalDari(r) === "soal baru");
  cek("jejak benih disimpan", r._benih === "abc123");
  cek("jejak guru disimpan", r._guru === "Qwen/Qwen3-8B");
  cek("kunci internal penyuling dibuang", !("_cluster" in r) && !("_asal" in r) && !("_berkasAsal" in r));
  cek("kunci cluster yang sah ikut terbawa", r.formatAngka === "polos");
  cek("masukan asli tidak berubah", contoh.id === "asli-123");
  const r2 = rapikan({ ...contoh, conversations: [{ from: "human", value: "soal lain" }, { from: "gpt", value: "J" }] });
  cek("id berbeda untuk soal berbeda", r.id !== r2.id);
  cek("id sama untuk soal sama (bisa diulang)", rapikan(contoh).id === r.id);

  console.log("\n" + "=".repeat(52));
  console.log(`${ok} lulus · ${buruk} gagal`);
  process.exit(buruk ? 1 : 0);
}

// ── jalan
if (!fs.existsSync(MASUK)) { console.error("belum ada", path.relative(AKAR, MASUK)); process.exit(1); }
const TERAPKAN = process.argv.includes("--terapkan");
const baris = fs.readFileSync(MASUK, "utf8").split("\n").filter((x) => x.trim()).map((x) => JSON.parse(x));

// Kelompokkan dulu per BENIH, baru ambil N varian teratas — kalau langsung
// dipotong per cluster, benih yang kebetulan di urutan awal menyumbang 3 varian
// sementara benih lain nol, dan keragaman yang kita bayar justru hilang.
const perBenih = {};
for (const b of baris) (perBenih[(b._cluster || "?") + "|" + (b._benih || b.id)] ??= []).push(b);
const dipilih = [];
for (const arr of Object.values(perBenih)) dipilih.push(...arr.slice(0, VARIAN));

const per = {};
for (const b of dipilih) (per[b._cluster || "?"] ??= []).push(rapikan(b));

console.log(`hasil suling : ${baris.length} baris · ${Object.keys(perBenih).length} benih`);
console.log(`varian dipakai: ${VARIAN} per benih -> ${dipilih.length} baris terpilih (ambang nyaris-kembar gerbang <=2%; 2 varian = 26,8%, 3 varian = 47,0%)`);
for (const [c, arr] of Object.entries(per).sort((a, b) => b[1].length - a[1].length)) {
  const unik = new Set(arr.map((x) => x.id)).size;
  console.log(`  ${c.padEnd(10)} ${String(arr.length).padStart(4)} baris · ${unik} id unik${unik !== arr.length ? "  <- ADA KEMBAR" : ""}`);
}

if (!TERAPKAN) { console.log("\n(uji coba — tambahkan --terapkan untuk menulis dataset/suling/)"); process.exit(0); }

fs.mkdirSync(KELUAR_DIR, { recursive: true });
for (const [c, arr] of Object.entries(per)) {
  const p = path.join(KELUAR_DIR, `${c}.jsonl`);
  fs.writeFileSync(p, arr.map((x) => JSON.stringify(x)).join("\n") + "\n");
  console.log(`  tertulis: ${path.relative(AKAR, p)} (${arr.length} baris)`);
}
console.log("\nBerikutnya: node migan.mjs gabung-ajar   (kering dulu; gerbang jalan sesudah gabung)");
