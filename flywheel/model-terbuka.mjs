// MODEL TERBUKA — daftar model sumber-terbuka yang boleh kita pakai, dan
// yang MEMERIKSA LISENSINYA SENDIRI ke HuggingFace setiap kali dijalankan.
//
// KENAPA BERKAS INI ADA, bukan dokumen biasa:
// RENCANA-GURU-TERVERIFIKASI.md menulis "semua lisensi diverifikasi 21 Agu 2026".
// Itu benar pada hari itu, dan sejak itu tak pernah diperiksa lagi. Lisensi bisa
// diganti, model bisa dijadikan gated, repo bisa dihapus. Dokumen tidak bisa
// memberi tahu kita kalau isinya sudah basi — berkas ini bisa, karena ia
// menanyakan ulang ke sumbernya tiap kali dipanggil.
//
// PELAJARAN YANG MELAHIRKANNYA (26 Agu 2026): "OX Alpha" disangka model terbuka.
// Ternyata stealth model anonim di OpenRouter, tanpa bobot; tiga repo "ox-alpha"
// di HuggingFace penunggang nama, satu di antaranya berlisensi all-rights-reserved
// dengan config.json karangan. Sejak itu: TIDAK ADA model masuk pipa latih tanpa
// lisensinya diperiksa langsung ke API, dan tanpa alasan tertulis kenapa dipilih.
//
// KELANJUTANNYA (1 Sep 2026) — dan berkas ini ada justru untuk menangkap
// kelanjutan semacam ini: OX Alpha akhirnya terbit dengan nama aslinya,
// **GLM-5.3-Flash dari Z.ai (Zhipu)**. Diverifikasi LANGSUNG lewat
// periksaLisensi(), bukan dari berita:
//     zai-org/GLM-5.3-Flash  ->  {ada:true, lisensi:"mit", gated:false, unduh:441348}
// Jadi bobot yang dulu TIDAK ADA sekarang ADA, dan lisensinya MIT.
//
// Yang berubah: keluaran BOBOT TERBUKA-nya boleh masuk pipa latih.
// Yang TIDAK berubah: endpoint stealth lamanya di OpenRouter tetap tunduk pada
// EULA-nya sendiri. Dua hal berbeda dengan nama yang sama — dan membedakannya
// adalah seluruh gunanya memeriksa ke sumber, bukan ke nama.
//
// Pelajaran yang bertahan: vonis "bukan model terbuka" pada 26 Agu BENAR untuk
// hari itu. Vonis tentang dunia luar punya tanggal kedaluwarsa; hanya vonis
// tentang metode kita sendiri yang abadi.
//
// Pakai:
//   node flywheel/model-terbuka.mjs              periksa semua, cetak tabel
//   node flywheel/model-terbuka.mjs --peran=vision
//   node flywheel/model-terbuka.mjs --json       untuk dipakai skrip lain
//
// Dari skrip lain:
//   import { DAFTAR, ambil, periksaLisensi } from "./model-terbuka.mjs";

// Lisensi yang MENGIZINKAN melatih turunan dan pemakaian komersial.
// Kalau lisensi sebuah model tidak ada di sini, ia TIDAK BOLEH masuk pipa latih —
// sekalipun bobotnya bisa diunduh. Bisa-diunduh bukan boleh-dipakai.
export const LISENSI_BEBAS = new Set([
  "mit", "apache-2.0", "bsd-3-clause", "cc-by-4.0", "cc-by-sa-4.0",
  "openrail", "bigscience-openrail-m",
]);

/**
 * Angka unduhan di bawah = potret 26 Agu 2026, HANYA sebagai penunjuk kematangan.
 * Yang MENGIKAT adalah hasil periksaLisensi() yang diambil hidup-hidup.
 */
export const DAFTAR = [
  // ══ GURU DISTILASI ══ untuk M1: menghasilkan jawaban acuan yang dipelajari 4B kita
  {
    id: "deepseek-ai/DeepSeek-R1", peran: "guru", lisensi: "mit", unduh: 4431386,
    kenapa: "README-nya TERSURAT mengizinkan & mendorong distilasi: 'will benefit the research " +
      "community to distill better smaller models'. Ini izin paling jelas yang pernah kita temukan.",
    catatan: "671B — tidak bisa dijalankan sendiri. Pakai lewat API penyedia, atau pakai versi sulingannya di bawah.",
  },
  {
    id: "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B", peran: "guru", lisensi: "mit",
    kenapa: "Base-nya Qwen — SEKELUARGA dengan model kita, jadi gaya token & template cocok. " +
      "±9 GB q4: muat di GPU sewaan murah, bahkan bisa diuji di laptop.",
    catatan: "Jejak nalarnya 3-5x lebih panjang dari gaya kita 'maksimal 4 kalimat'. Itu HARUS ditangani " +
      "di tahap kurasi, bukan diabaikan — kalau tidak, gaya jawab kita ikut melar.",
  },
  {
    id: "openai/gpt-oss-120b", peran: "guru", lisensi: "apache-2.0", unduh: 5222602,
    kenapa: "Apache-2.0 penuh, penalaran kuat, dan unduhannya tertinggi di kelasnya — matang, banyak yang menguji.",
    catatan: "120B. Untuk Vast, bukan untuk rumah. Adiknya gpt-oss-20b jauh lebih murah dijalankan.",
  },
  {
    id: "Qwen/Qwen3-30B-A3B", peran: "guru", lisensi: "apache-2.0", unduh: 2589556,
    kenapa: "MoE: 30B bobot tapi hanya ~3B aktif per token, jadi jauh lebih murah dijalankan " +
      "daripada model padat seukurannya.",
    catatan: "RALAT 26 Agu: doc 50 menulis model ini SUDAH ADA di kotak kita. Diperiksa langsung — " +
      "TIDAK ADA, baik di laptop maupun VPS-2. Ia dulu ada di VPS-1 yang sekarang mati. " +
      "Yang benar-benar ada di VPS-2 cuma qwen2.5:1.5b/3b/7b. Jadi model ini tetap harus diunduh.",
  },

  {
    id: "Qwen/Qwen3-8B", peran: "guru", lisensi: "apache-2.0", unduh: 14694928,
    kenapa: "GURU BAWAAN penyuling (flywheel/vast/suling.py). Dipilih setelah pilihan awal " +
      "DeepSeek-R1-Distill-14B ditinjau ulang dan ditolak: tugas menyuling kita adalah MENULIS " +
      "ULANG PERTANYAAN, bukan menalar — model penalaran membakar token untuk jejak <think> " +
      "yang tidak kita pakai, dan 14B bf16 (~28 GB) bahkan tidak muat di RTX 3090 (24 GB).",
    catatan: "~16 GB bf16, muat longgar di 3090. Sekeluarga dengan base kita, Bahasa Indonesianya kuat.",
  },

  // ══ VISION ══ F-111 mencatat: vision kita MENGARANG isi di luar hasil tool.
  // Itu celah keandalan model, bukan bug routing — jadi obatnya model vision yang benar.
  {
    id: "Qwen/Qwen3-VL-4B-Instruct", peran: "vision", lisensi: "apache-2.0", unduh: 4015022,
    kenapa: "UKURANNYA SAMA dengan base serving kita (4B) dan SEKELUARGA (Qwen3). Artinya bisa " +
      "menempati slot yang sama di VPS tanpa mengubah anggaran RAM — penukaran paling murah yang kita punya.",
    catatan: "Kandidat utama untuk menambal F-111. Uji dulu dengan gerbang anti-halu yang sama, " +
      "jangan diganti buta.",
  },
  {
    id: "Qwen/Qwen3-VL-8B-Instruct", peran: "vision", lisensi: "apache-2.0", unduh: 6610463,
    kenapa: "Kalau 4B masih mengarang, ini tangga berikutnya yang masih sekeluarga.",
    catatan: "8B di VPS = lambat (vonis H-tool-8b: 3,4 jam/jawaban untuk teks). Vision hanya layak " +
      "kalau dipanggil sesekali lewat SAKELAR, bukan selalu-hidup.",
  },
  {
    id: "Qwen/Qwen2.5-VL-7B-Instruct", peran: "vision", lisensi: "apache-2.0", unduh: 8671414,
    kenapa: "Unduhan tertinggi di kelas VLM terbuka — paling banyak diuji orang, paling banyak " +
      "resep yang beredar. Pilihan aman kalau Qwen3-VL bermasalah.",
  },

  // ══ OCR ══ untuk membaca dokumen nyata: LHU, invoice, RFQ pembeli, sertifikat
  {
    id: "deepseek-ai/DeepSeek-OCR-2", peran: "ocr", lisensi: "apache-2.0", unduh: 1223550,
    kenapa: "Apache-2.0 dan dirancang untuk dokumen padat. Lembar FAKTA kita (LHU No. 092/LHU/P2HB) " +
      "sekarang diketik ulang manusia — sekali salah ketik, seluruh penawaran jadi salah.",
  },
  {
    id: "zai-org/GLM-OCR", peran: "ocr", lisensi: "mit", unduh: 2599280,
    kenapa: "MIT, unduhan lebih tinggi. Pembanding untuk DeepSeek-OCR-2; pilih yang menang di dokumen kita sendiri.",
  },

  // ══ EMBEDDING ══ jalur baca. Ingatan mencatat r=0,98 antara mutu jalur-baca dan mutu jawaban.
  {
    id: "Qwen/Qwen3-Embedding-0.6B", peran: "embedding", lisensi: "apache-2.0", unduh: 7022748,
    kenapa: "Sekeluarga dengan model kita, 0,6B jadi murah dijalankan bersamaan dengan yang lain.",
  },
  {
    id: "intfloat/multilingual-e5-small", peran: "embedding", lisensi: "mit", unduh: 12309999,
    kenapa: "MIT, multibahasa, dan KECIL. Korpus kita Bahasa Indonesia — model khusus Inggris " +
      "akan diam-diam memburuk di situ, dan kegagalan diam adalah musuh utama kita.",
  },

  // ══ RERANKER ══ pernah MATI DIAM-DIAM di jalur baca kita (F-120) dan tak ada yang tahu
  {
    id: "BAAI/bge-reranker-v2-m3", peran: "reranker", lisensi: "apache-2.0", unduh: 18444853,
    kenapa: "Baku de-facto untuk reranking multibahasa, 18 juta unduhan. Multibahasa = penting, " +
      "karena separuh lead kita berbahasa Inggris/Arab dan separuhnya Indonesia.",
  },
  {
    id: "Qwen/Qwen3-Reranker-0.6B", peran: "reranker", lisensi: "apache-2.0", unduh: 1996118,
    kenapa: "Sekeluarga, sangat kecil. Alternatif kalau bge terlalu berat di VPS.",
  },

  // ══ SUARA ══ Aria bicara. Ini juga soal doktrin: 'own it, don't rent it'.
  {
    id: "hexgrad/Kokoro-82M", peran: "tts", lisensi: "apache-2.0", unduh: 12296493,
    kenapa: "82 JUTA parameter — cukup kecil untuk jalan di CPU VPS. Ini jalan keluar dari " +
      "langganan ElevenLabs yang sekarang dipakai EMIGA; sejalan dengan doktrin 'own it, don't rent it'.",
    catatan: "Periksa dulu mutu Bahasa Indonesianya sebelum mengganti apa pun.",
  },
  {
    id: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", peran: "tts", lisensi: "apache-2.0", unduh: 1321806,
    kenapa: "Mendukung suara kustom — artinya Aria bisa punya suara SENDIRI, bukan suara sewaan " +
      "yang sama dengan ribuan produk lain.",
  },
  {
    id: "openai/whisper-large-v3-turbo", peran: "asr", lisensi: "mit", unduh: 7527387,
    kenapa: "MIT, dan 'turbo' berarti cukup cepat untuk percakapan. Bahasa Indonesianya kuat.",
  },
  {
    id: "Qwen/Qwen3-ASR-0.6B", peran: "asr", lisensi: "apache-2.0", unduh: 2949610,
    kenapa: "0,6B — kalau whisper terlalu berat untuk VPS bersama beban lain.",
  },
];

const HF = "https://huggingface.co/api/models/";

/**
 * Tanya HuggingFace: lisensi apa SEKARANG, dan masih bisa diakses atau tidak.
 * Sengaja tidak memakai nilai di DAFTAR sebagai jawaban — nilai itu cuma harapan
 * yang akan dibandingkan dengan kenyataan.
 */
export async function periksaLisensi(id) {
  try {
    // JANGAN encodeURIComponent(id): itu mengubah "/" jadi %2F dan HF menolak dengan HTTP 400.
    // Id model adalah dua ruas jalur (pemilik/nama), jadi tiap ruas disandikan sendiri-sendiri.
    const jalur = String(id).split("/").map(encodeURIComponent).join("/");
    const r = await fetch(HF + jalur, { headers: { "User-Agent": "migancore" } });
    if (r.status === 404) return { ada: false, sebab: "repo tidak ditemukan" };
    if (!r.ok) return { ada: null, sebab: "HTTP " + r.status };
    const d = await r.json();
    const lisensi = (d.cardData || {}).license || "";
    return {
      ada: true, lisensi, gated: Boolean(d.gated),
      unduh: d.downloads || 0, suka: d.likes || 0,
      bebas: LISENSI_BEBAS.has(String(lisensi).toLowerCase()),
    };
  } catch (e) {
    return { ada: null, sebab: String(e.message || e).slice(0, 50) };
  }
}

/** Ambil satu entri daftar berdasarkan id. */
export const ambil = (id) => DAFTAR.find((m) => m.id === id) || null;

/** Semua model dengan peran tertentu. */
export const perPeran = (peran) => DAFTAR.filter((m) => m.peran === peran);

/**
 * Gerbang untuk pipa latih: lempar kalau model ini tidak boleh dipakai SEKARANG.
 * Panggil ini SEBELUM mengunduh bobot atau menyewa GPU, bukan sesudah.
 */
export async function wajibBebas(id) {
  const p = await periksaLisensi(id);
  if (p.ada === false) throw new Error(`${id}: repo sudah tidak ada`);
  if (p.ada === null) throw new Error(`${id}: lisensi tidak bisa diperiksa (${p.sebab}) — JANGAN dipakai sampai jelas`);
  if (!p.bebas) throw new Error(`${id}: lisensi "${p.lisensi}" tidak mengizinkan turunan/komersial`);
  if (p.gated) throw new Error(`${id}: gated — perlu persetujuan pemilik dulu`);
  return p;
}

// ── CLI
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
    process.argv[1]?.endsWith("model-terbuka.mjs")) {
  const argPeran = (process.argv.find((x) => x.startsWith("--peran=")) || "").split("=")[1];
  const jsonSaja = process.argv.includes("--json");
  const daftar = argPeran ? perPeran(argPeran) : DAFTAR;

  const hasil = [];
  for (const m of daftar) hasil.push({ ...m, hidup: await periksaLisensi(m.id) });

  if (jsonSaja) { console.log(JSON.stringify(hasil, null, 1)); process.exit(0); }

  let masalah = 0, peranAkhir = "";
  const nama = { guru: "GURU DISTILASI", vision: "VISION", ocr: "OCR / DOKUMEN",
    embedding: "EMBEDDING (jalur baca)", reranker: "RERANKER", tts: "TEKS -> SUARA", asr: "SUARA -> TEKS" };
  console.log("MODEL TERBUKA — lisensi diperiksa LANGSUNG ke HuggingFace,", new Date().toISOString().slice(0, 10));
  console.log("=".repeat(78));
  for (const m of hasil) {
    if (m.peran !== peranAkhir) { peranAkhir = m.peran; console.log(`\n── ${nama[m.peran] || m.peran}`); }
    const h = m.hidup;
    let tanda = "✅", ket = `${h.lisensi} · ${(h.unduh || 0).toLocaleString("id-ID")} unduhan`;
    if (h.ada === false) { tanda = "❌"; ket = h.sebab; masalah++; }
    else if (h.ada === null) { tanda = "⚠️ "; ket = "tak bisa diperiksa: " + h.sebab; masalah++; }
    else if (!h.bebas) { tanda = "❌"; ket = `lisensi "${h.lisensi}" TIDAK bebas`; masalah++; }
    else if (h.gated) { tanda = "⚠️ "; ket += " · GATED (perlu persetujuan)"; masalah++; }
    else if (m.lisensi && m.lisensi !== h.lisensi) { tanda = "⚠️ "; ket += ` · BERUBAH dari "${m.lisensi}"`; masalah++; }
    console.log(` ${tanda} ${m.id.padEnd(46)} ${ket}`);
    console.log(`      ${m.kenapa}`);
    if (m.catatan) console.log(`      catatan: ${m.catatan}`);
  }
  console.log("\n" + "=".repeat(78));
  console.log(masalah ? `${masalah} perlu perhatian — jangan pakai yang bertanda ❌` : `${hasil.length} model, semua lisensinya masih bebas`);
  process.exit(masalah ? 1 : 0);
}
