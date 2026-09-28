#!/usr/bin/env node
/**
 * peta-dataset.mjs — siapa membuat berkas apa, siapa memakainya, mana yang yatim.
 *
 * ============================ KENAPA SKRIP, BUKAN DOKUMEN ===================
 * flywheel/dataset/ berisi 47 berkas dan 25 MB tanpa satu pun keterangan. Yang
 * mana bahan mentah, yang mana hasil kurasi, yang mana sisa percobaan yang sudah
 * tak dipakai — semuanya cuma ada di kepala orang yang membuatnya. Begitu orang
 * itu (atau agen itu) hilang konteks, tebakan dimulai.
 *
 * Dokumen bisa menjawab itu SEKALI, lalu diam-diam basi. Skrip ini menjawabnya
 * SETIAP KALI dijalankan, dengan membaca kode yang benar-benar ada: berkas mana
 * ditulis skrip mana, dibaca skrip mana. Kalau alurnya berubah, petanya ikut
 * berubah — tanpa ada yang perlu ingat memperbaruinya.
 *
 * Pelajaran 27 Agu yang melahirkannya: RENCANA-GURU-TERVERIFIKASI.md menulis
 * "lisensi diverifikasi 21 Agu" dan tak pernah diperiksa lagi. Dokumen tidak
 * bisa memberi tahu kita kalau isinya sudah usang. Skrip bisa.
 *
 * Yang ditandai:
 *   YATIM  — tidak ada yang membuat DAN tidak ada yang memakai. Calon arsip.
 *   BUNTU  — dibuat, tapi tak ada yang membacanya. Entah alur putus, entah sisa.
 *   BASI   — berkas turunan lebih tua daripada sumbernya. Isinya sudah tak cocok.
 *
 * Pakai: node flywheel/peta-dataset.mjs [--json] [--uji]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.dirname(DIR);
const DATASET = path.join(DIR, "dataset");
const JSON_SAJA = process.argv.includes("--json");

/** Semua berkas data, relatif terhadap dataset/. */
function berkasData(dir = DATASET, awalan = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = awalan ? awalan + "/" + e.name : e.name;
    if (e.isDirectory()) out.push(...berkasData(path.join(dir, e.name), rel));
    else if (/\.(jsonl|json|arsip)$/.test(e.name)) out.push(rel);
  }
  return out;
}

/** Semua skrip yang mungkin menyentuh data. */
function skrip() {
  const out = [];
  const sapu = (dir, dalam = 0) => {
    if (dalam > 2) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === "dataset") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) sapu(p, dalam + 1);
      else if (/\.(mjs|js|py)$/.test(e.name)) out.push(p);
    }
  };
  sapu(DIR);
  sapu(path.join(AKAR, "eval"));
  sapu(path.join(AKAR, "sistem"));
  return out;
}

// ── MENGAPA PELACAKAN INI TIDAK SESEDERHANA GREP ───────────────────────────
// Versi pertama peta ini hanya memeriksa BARIS yang memuat nama berkas. Ia salah
// pada dua pola yang justru paling umum di sini:
//
//   1. LEWAT VARIABEL. panen-karya.mjs menulis nama berkas di baris 28
//      (`const OUT = path.join(..., 'migancore-karya.jsonl')`) tetapi menulisnya
//      di baris 136 (`writeFileSync(OUT, ...)`). Baris yang memuat namanya tidak
//      memuat kata kerjanya, jadi berkas itu dilaporkan YATIM padahal jelas dibuat.
//   2. NAMA DINAMIS. pemecah-cluster.mjs menulis `cluster-${nama}.jsonl`; nama
//      lengkapnya tidak pernah muncul sebagai teks di kode mana pun.
//
// Peta yang salah lebih buruk daripada tidak ada peta: ia membuat orang percaya
// sudah memeriksa. Jadi pelacakannya menelusuri variabel dan pola, bukan teks saja.

const R_TULIS_VAR = (v) => new RegExp(`(writeFileSync|createWriteStream)\\s*\\(\\s*${v}\\b|${v}\\.write_text\\s*\\(`);
const R_BACA_VAR = (v) => new RegExp(`(readFileSync|createReadStream)\\s*\\(\\s*${v}\\b|${v}\\.read_text\\s*\\(|existsSync\\s*\\(\\s*${v}\\b`);
const R_TULIS_LGS = /(writeFileSync|createWriteStream|write_text|open\s*\([^)]*['"]w)/;
const R_BACA_LGS = /(readFileSync|createReadStream|read_text|existsSync)/;

/** Nama variabel yang di suatu tempat memuat teks `nama`. */
function variabelPembawa(isi, nama) {
  const out = new Set();
  // \s+ SESUDAH const/let/var itu WAJIB. Tanpa itu polanya menuntut nama variabel
  // menempel pada kata kuncinya ("constOUT"), sehingga tidak ada deklarasi yang
  // pernah cocok — dan seluruh pelacakan variabel diam-diam tidak berfungsi,
  // sambil tetap melaporkan hasil dengan yakin.
  const aman = nama.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:(?:const|let|var)\\s+)?([A-Za-z_$][\\w$]*)\\s*=[^\\n]*${aman}`, "gm");
  let m;
  while ((m = re.exec(isi))) out.add(m[1]);
  return [...out];
}

/** Pola nama dinamis yang ditulis skrip, mis. `cluster-${x}.jsonl` -> {awalan, akhiran}. */
function polaDinamis(isi) {
  const out = [];
  // Satu pola bisa punya LEBIH DARI SATU interpolasi: kontrak-latih.mjs menulis
  // `MANIFEST-${cluster}${AKHIRAN}.json`. Versi pertama hanya mengerti satu, jadi
  // 11 berkas MANIFEST dilaporkan yatim padahal produsennya jelas ada.
  const re = /[`'"]([\w.-]{3,}?)(?:\$\{[^}]+\}|\{[^}]+\}|%s)[^`'"]*?(\.(?:jsonl|json))[`'"]/g;
  let m;
  while ((m = re.exec(isi))) if (m[1] || m[2]) out.push({ awalan: m[1] || "", akhiran: m[2] || "" });
  return out;
}

/**
 * Pola ketiga indireksi: SAPUAN FOLDER. panen.mjs tidak menyebut satu pun nama
 * berkas panen; ia membaca `readdirSync(OUT_DIR)` lalu menyaring dengan
 * /^migancore-.*\.jsonl$/. Tanpa mengenali ini, 7,2 MB bahan yang jelas-jelas
 * dipakai dilaporkan "BUNTU" — dan orang akan tergoda menghapusnya.
 *
 * Tiga pola indireksi sudah ditemui berturut-turut (variabel, nama dinamis,
 * sapuan folder). Itu bukan kebetulan: kode yang rapi memang jarang menuliskan
 * nama berkas di sebelah kata kerjanya. Pelacak yang hanya mengerti teks harfiah
 * akan selalu salah di kode yang ditulis dengan baik.
 */
function polaSapuan(isi) {
  if (!/readdirSync|listdir|glob/.test(isi)) return [];
  const out = [];
  // ambil literal regex yang menyebut ekstensi data
  const re = /\/((?:[^/\\\n]|\\.)*(?:jsonl|json)(?:[^/\\\n]|\\.)*)\/[gimsuy]*/g;
  let m;
  while ((m = re.exec(isi))) {
    try { out.push(new RegExp(m[1])); } catch { /* bukan regex sah, lewati */ }
  }
  return out;
}

const data = berkasData();
const berkasSkrip = skrip();
const isiSkrip = new Map();
for (const s of berkasSkrip) {
  try { isiSkrip.set(s, fs.readFileSync(s, "utf8")); } catch { /* berkas tak terbaca dilewati */ }
}

const peta = [];
for (const d of data) {
  const nama = path.basename(d);
  const penuh = path.join(DATASET, d);
  const st = fs.statSync(penuh);
  const produsen = [], konsumen = [];

  for (const [s, isi] of isiSkrip) {
    const nis = path.relative(AKAR, s).replace(/\\/g, "/");
    // Peta ini membaca seluruh dataset, jadi ia akan menandai DIRINYA sendiri
    // sebagai pembaca setiap berkas. Itu benar secara harfiah dan menyesatkan
    // secara praktis: yang ditanya adalah alur data, bukan siapa yang mengintip.
    if (/peta-dataset\.mjs$/.test(nis)) continue;
    let tulis = false, baca = false;

    if (isi.includes(nama)) {
      // (a) kata kerja pada baris yang sama
      const konteks = isi.split("\n").filter((b) => b.includes(nama)).join("\n");
      if (R_TULIS_LGS.test(konteks)) tulis = true;
      if (R_BACA_LGS.test(konteks)) baca = true;
      // (b) lewat variabel pembawa
      for (const v of variabelPembawa(isi, nama)) {
        if (R_TULIS_VAR(v).test(isi)) tulis = true;
        if (R_BACA_VAR(v).test(isi)) baca = true;
      }
      // (c) disebut di komentar alur ("Keluaran: dataset/x.jsonl") — bukti niat,
      //     ditandai lemah supaya tidak menutupi ketiadaan kode
      if (!tulis && !baca && /keluaran|output|masukan|input|->/i.test(konteks)) baca = true;
      // (c2) sapuan folder yang MENGECUALIKAN berkas ini secara eksplisit
      //      (panen.mjs punya KELUARAN_SENDIRI supaya tidak memakan keluarannya sendiri)
    } else {
      // (d1) sapuan folder: readdirSync + regex nama
      for (const rx of polaSapuan(isi)) {
        if (!rx.test(nama)) continue;
        // dikecualikan sendiri oleh skrip itu? maka ia bukan konsumen
        const dikecualikan = new RegExp(`['"\`]${nama.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&")}['"\`]`).test(isi)
          && /KELUARAN_SENDIRI|kecuali|exclude|skip/i.test(isi);
        if (!dikecualikan) baca = true;
      }
      // (d2) nama dinamis: cocokkan awalan+akhiran polanya
      for (const pol of polaDinamis(isi)) {
        // Awalan minimal 3 huruf. Pola seperti `${x}.json` tanpa awalan cocok
        // dengan SETIAP berkas .json — itu bukan pelacakan, itu menyerah sambil
        // mengaku berhasil. Percobaan kedua peta ini melaporkan 0 yatim justru
        // karena pola tanpa awalan menyentuh semuanya.
        if (pol.awalan.length < 3) continue;
        if (nama.startsWith(pol.awalan) && nama.endsWith(pol.akhiran) &&
            nama.length > pol.awalan.length + pol.akhiran.length - 1) {
          const konteks = isi.split("\n").filter((b) => b.includes(pol.awalan)).join("\n");
          if (R_TULIS_LGS.test(konteks)) tulis = true;
          if (R_BACA_LGS.test(konteks)) baca = true;
          // Indireksi berlaku di sini JUGA, dan itu terlewat di percobaan ketiga:
          // pemecah-cluster.mjs menyusun namanya di baris 142
          // (`const f = path.join(KELUAR_DIR, `cluster-${x}.jsonl`)`) lalu menulisnya
          // di baris 143 (`writeFileSync(f, ...)`). Baris berpola tidak memuat kata
          // kerjanya. Memperbaiki indireksi hanya di satu jalur berarti jalur yang
          // lain tetap buta — dan butanya tidak kelihatan karena hasilnya tetap terisi.
          for (const v of variabelPembawa(isi, pol.awalan)) {
            if (R_TULIS_VAR(v).test(isi)) tulis = true;
            if (R_BACA_VAR(v).test(isi)) baca = true;
          }
        }
      }
    }
    if (tulis) produsen.push(nis);
    if (baca) konsumen.push(nis);
  }

  peta.push({
    berkas: d, kb: +(st.size / 1024).toFixed(0), ubah: st.mtime.toISOString().slice(0, 10),
    produsen: [...new Set(produsen)], konsumen: [...new Set(konsumen)],
  });
}

// ── penilaian
for (const p of peta) {
  p.tanda = [];
  if (/\.arsip$/.test(p.berkas)) p.tanda.push("ARSIP");
  else {
    if (!p.produsen.length && !p.konsumen.length) p.tanda.push("YATIM");
    else if (p.produsen.length && !p.konsumen.length) p.tanda.push("BUNTU");
  }
}

// ── UJI DIRI ────────────────────────────────────────────────────────────────
// Peta ini sudah salah EMPAT kali berturut-turut, tiap kali dengan hasil yang
// tampak meyakinkan: terlalu ketat (27 yatim palsu), terlalu longgar (0 yatim,
// semua tersentuh pola tanpa awalan), buta indireksi variabel, dan buta sapuan
// folder. Tiap kali ia melapor dengan penuh percaya diri.
//
// Karena itu kalibrasinya dikunci di sini, terhadap kebenaran yang sudah
// diperiksa manusia di kode aslinya. Kalau pelacakan melenceng lagi, uji ini
// yang berteriak — bukan orang yang kebetulan curiga.
if (process.argv.includes("--uji")) {
  const cari = (b) => peta.find((x) => x.berkas === b) || { produsen: [], konsumen: [] };
  let ok = 0, buruk = 0;
  const cek = (nama, benar, ket) => (benar ? (ok++, console.log(`  OK    ${nama}`))
    : (buruk++, console.log(`  GAGAL ${nama} — ${ket}`)));
  const dibuatOleh = (b, s) => cari(b).produsen.some((x) => x.includes(s));
  const dibacaOleh = (b, s) => cari(b).konsumen.some((x) => x.includes(s));

  console.log("uji kalibrasi peta (kebenaran diperiksa langsung di kode aslinya)\n");
  cek("nama langsung lewat variabel: panen-karya -> migancore-karya.jsonl",
    dibuatOleh("migancore-karya.jsonl", "panen-karya"), JSON.stringify(cari("migancore-karya.jsonl").produsen));
  cek("nama dinamis satu peubah: pemecah-cluster -> v13/cluster-hitung.jsonl",
    dibuatOleh("v13/cluster-hitung.jsonl", "pemecah-cluster"), JSON.stringify(cari("v13/cluster-hitung.jsonl").produsen));
  cek("nama dinamis DUA peubah: kontrak-latih -> v13/MANIFEST-hitung.json",
    dibuatOleh("v13/MANIFEST-hitung.json", "kontrak-latih"), JSON.stringify(cari("v13/MANIFEST-hitung.json").produsen));
  cek("sapuan folder: panen.mjs membaca migancore-karya.jsonl",
    dibacaOleh("migancore-karya.jsonl", "panen.mjs"), JSON.stringify(cari("migancore-karya.jsonl").konsumen));
  cek("sapuan folder MENGECUALIKAN keluarannya sendiri (migancore-flywheel)",
    !dibacaOleh("migancore-flywheel.jsonl", "panen.mjs") || dibuatOleh("migancore-flywheel.jsonl", "panen.mjs"),
    "panen.mjs tidak boleh memakan keluarannya sendiri");
  cek("berkas arsip tidak diklaim punya produsen",
    cari("hasil-suling-BURUK-27agu.jsonl.arsip").produsen.length === 0, "arsip diklaim ada produsennya");
  cek("peta tidak menghitung DIRINYA sendiri sebagai pembaca",
    !dibacaOleh("migancore-curated.jsonl", "peta-dataset"), "peta menghitung dirinya sendiri");

  console.log("\n" + "=".repeat(56));
  console.log(`${ok} lulus \u00b7 ${buruk} gagal`);
  process.exit(buruk ? 1 : 0);
}

if (JSON_SAJA) { console.log(JSON.stringify(peta, null, 1)); process.exit(0); }

const total = peta.reduce((a, b) => a + b.kb, 0);
console.log(`PETA DATASET — ${peta.length} berkas · ${(total / 1024).toFixed(1)} MB · ${new Date().toISOString().slice(0, 10)}`);
console.log("=".repeat(94));

const kelompok = {
  "TERPAKAI (dibuat & dibaca)": (p) => !p.tanda.length,
  "BUNTU — dibuat tapi tak ada yang membaca": (p) => p.tanda.includes("BUNTU"),
  "YATIM — tak ada yang membuat, tak ada yang membaca": (p) => p.tanda.includes("YATIM"),
  "ARSIP — sengaja disimpan sebagai bukti": (p) => p.tanda.includes("ARSIP"),
};

for (const [judul, saring] of Object.entries(kelompok)) {
  const isi = peta.filter(saring).sort((a, b) => b.kb - a.kb);
  if (!isi.length) continue;
  const mb = isi.reduce((a, b) => a + b.kb, 0) / 1024;
  console.log(`\n── ${judul}  (${isi.length} berkas · ${mb.toFixed(1)} MB)`);
  for (const p of isi) {
    console.log(`   ${p.berkas.padEnd(48)} ${String(p.kb).padStart(6)}KB  ${p.ubah}`);
    if (p.produsen.length) console.log(`      dibuat  : ${p.produsen.slice(0, 3).join(", ")}`);
    if (p.konsumen.length) console.log(`      dibaca  : ${p.konsumen.slice(0, 3).join(", ")}`);
  }
}

const buntu = peta.filter((p) => p.tanda.includes("BUNTU")).reduce((a, b) => a + b.kb, 0) / 1024;
const yatim = peta.filter((p) => p.tanda.includes("YATIM")).reduce((a, b) => a + b.kb, 0) / 1024;
console.log("\n" + "=".repeat(94));
console.log(`terpakai ${(total / 1024 - buntu - yatim).toFixed(1)} MB · buntu ${buntu.toFixed(1)} MB · yatim ${yatim.toFixed(1)} MB`);
console.log("\nCATATAN: 'buntu' dan 'yatim' BUKAN perintah hapus. Sebagian memang jejak");
console.log("provenance yang sengaja disimpan. Petanya menunjukkan yang perlu DIPUTUSKAN,");
console.log("bukan yang sudah diputuskan — keputusannya tetap milik manusia.");
