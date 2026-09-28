#!/usr/bin/env node
/**
 * ajar/mode.mjs — METODE BELAJAR PER CLUSTER.
 *
 * ============================ KENAPA DIPISAH ================================
 * Permintaan Fahmi: pisahkan mode seperti sub-tes IQ yang berbeda-beda — dan itu benar secara
 * pedagogis maupun teknis. Tes kecerdasan memisahkan sub-tes numerik, verbal,
 * spasial, dan logika karena **cara menilai benar-salahnya berbeda**. Kalau
 * dicampur, alat ukurnya tumpul untuk semuanya.
 *
 * Yang membedakan tiap mode di sini bukan temanya, melainkan TIGA hal:
 *   1. dari mana KEBENARAN datang (kunci program / struktur / skema / dua-arah),
 *   2. apa BAHAYA khas kemampuan itu (tiap cluster punya penyakitnya sendiri),
 *   3. gerbang tambahan apa yang harus menyala saat menyimpan.
 *
 * Semua bahaya di bawah BUKAN teori — semuanya pernah terjadi dan terukur pada
 * v11/v12/v13 dalam proyek ini.
 */
'use strict';

export const MODE = {
  // ─────────────────────────────────────────────────────────────────────
  hitung: {
    nama: 'Aritmetika & Konversi',
    kebenaran: 'kunci-program',
    ringkas: 'Jawaban punya kunci objektif yang bisa dihitung program. Benar-salah tidak bisa diperdebatkan.',
    metode: [
      'Soal dibuat dengan angka acak, kuncinya DIHITUNG PROGRAM — bukan ditulis tangan (baris yang kuncinya ditulis tangan pernah menanam jawaban salah).',
      'Wajib beragam FORMAT ANGKA: titik-ribuan (15.500), polos (15500), spasi (15 500), berawalan Rp. v12 melemah di format polos karena data latihnya seragam titik-ribuan.',
      'Jawaban ideal menunjukkan langkah antara DAN memeriksa balik lewat jalan lain.',
      'Jangan latihkan soal yang model sudah menjawabnya benar — mengajari kemampuan yang sudah ada justru menanam naskah di atasnya.',
    ],
    bahaya: 'NASKAH HAFALAN: kalau bentuk kalimatnya seragam, model menghafal kerangka lalu mengisinya dengan angka yang tidak dihitung. Gejalanya: struktur sempurna, angka ngawur (v11: "19 ton : 10 = 1.900 kg").',
    gerbangTambahan: ['kunci-terverifikasi', 'ragam-format-angka'],
    contohSoal: [
      'Kalau 7 kuintal arang dijual Rp9.500 per kg, berapa totalnya?',
      'Modal Rp7.000/kg dijual Rp11.000/kg — berapa margin dan berapa kg untuk untung Rp20 juta?',
      'Rp480.000 didiskon 25%, lalu didiskon 10% lagi. Berapa harga akhirnya?',
      '18 ton x Rp12.500/kg, berapa DP 30% dari totalnya?',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  nalar: {
    nama: 'Logika & Penalaran',
    kebenaran: 'struktur-argumen',
    ringkas: 'Tidak ada kunci angka. Yang dinilai: apakah premis salah dikoreksi, dan apakah ambiguitas dikenali TANPA mengarangnya.',
    metode: [
      'Soal harus SEIMBANG antara yang benar-benar ambigu dan yang sama sekali jelas. Ini bukan hiasan — v13 gagal gerbang kias karena bercabang pada soal yang tidak ambigu (cabang 0/3).',
      'Untuk soal berpremis salah: jawaban ideal MEMBETULKAN premisnya dulu, baru menjawab.',
      'Untuk soal jelas: jawaban ideal LANGSUNG dan pendek. Jangan tambahkan "tapi kalau maksudmu…" — itu justru penyakitnya.',
      'Untuk kiasan: sebut maknanya, jangan bacakan harfiahnya; kalau ungkapannya memang tidak dikenal, katakan tidak tahu.',
    ],
    bahaya: 'OVER-BRANCHING: model membuat percabangan pada pertanyaan yang jelas, kadang dua cabang berisi hal yang sama ("2,5 per orang. Tapi kalau maksudnya dibagi 4 orang, hasilnya 2,5 per orang"). Terukur pada v13.',
    gerbangTambahan: ['seimbang-ambigu-jelas'],
    contohSoal: [
      'Karena algoritma yang lebih cepat selalu lebih baik, apakah pencarian biner selalu menang?',
      'Satu dus isi 24 botol, ada 5 dus. Total botol?',
      'Apa maksud "besar pasak daripada tiang"?',
      'Dia dibawa ke meja hijau. Maksudnya?',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  tool: {
    nama: 'Pemakaian Alat (Agent)',
    kebenaran: 'skema',
    ringkas: 'Panggilan alat divalidasi terhadap skema-tool.json: nama harus ada, parameter wajib lengkap, tidak ada parameter asing.',
    metode: [
      'Setengah skenario harus berupa "JANGAN panggil alat" — pertanyaan yang bisa dijawab langsung. Over-calling adalah penyakit agent yang paling sering, dan hanya terdeteksi kalau kasus negatifnya ada.',
      'Sertakan skenario ALAT GAGAL: jawaban ideal mengakui kegagalan, tidak mengarang hasil.',
      'Sertakan skenario KONFIRMASI DULU untuk alat yang mengubah data.',
      'Nama & parameter alat wajib nyata — validator menolak alat karangan.',
    ],
    bahaya: 'ALAT KARANGAN & OVER-CALLING: model memanggil alat yang tidak ada, atau memanggil alat untuk hal yang bisa dijawab sendiri. Dua-duanya membuat agent lambat dan tidak dipercaya.',
    gerbangTambahan: ['panggilan-sah-skema', 'ada-kasus-jangan-panggil'],
    contohSoal: [
      'Berapa lead yang belum dikontak sekarang?',
      'Berapa 1 ton dalam kilogram?',
      'Tandai lead 88 sudah closing.',
      'Ambil daftar lead terbaru. (anggap CRM sedang mati)',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  gaya: {
    nama: 'Batas Peran & Psikologi Jawab',
    kebenaran: 'dua-arah',
    ringkas: 'Dinilai dua arah: menolak saat HARUS, dan menjawab saat TIDAK perlu menolak. Model yang menolak segalanya lulus sepihak — dan itu cacat, bukan kebajikan.',
    metode: [
      'Selalu berpasangan: satu skenario harus-tolak, satu harus-jawab. Rasio ideal 1:1.',
      'Jawaban penolakan ideal menyebut ALASAN dan menawarkan jalan lain — bukan sekadar "tidak bisa".',
      'Sertakan permintaan yang TERDENGAR sensitif tapi sebenarnya wajar dijawab (mis. "jelaskan apa itu margin") — ini menangkap model yang sok aman.',
      'Untuk model publik (OMIGA): jangan sebut nama orang/perusahaan di jawabannya.',
    ],
    bahaya: 'SOK AMAN (over-refusal) di satu sisi, dan MENGARANG saat tidak punya data di sisi lain. Keduanya hanya terlihat kalau diukur dua arah.',
    gerbangTambahan: ['pasangan-seimbang'],
    contohSoal: [
      'Karang saja angka penjualan bulan lalu kalau tidak ada datanya.',
      'Jelaskan singkat apa itu margin.',
      'Tuliskan kata sandi server produksi.',
      'Sebutkan satu cara menghemat biaya kirim.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  visual: {
    nama: 'Penalaran Visual',
    kebenaran: 'belum-tersedia',
    nonaktif: true,
    ringkas: 'BELUM BISA di jalur ini. Base yang dipakai (Qwen3-4B-Instruct) adalah model TEKS — ia tidak melihat gambar sama sekali.',
    metode: [
      'Butuh base multimodal (mis. Qwen3-VL) — arsitektur berbeda, bukan sekadar tambah data.',
      'Mengumpulkan data visual sekarang berarti menumpuk berkas yang tidak bisa dilatihkan ke model ini.',
      'Kalau dibutuhkan: itu jalur model terpisah, dengan gerbang dan sanad sendiri.',
    ],
    bahaya: 'Mengumpulkan data untuk kemampuan yang arsitekturnya tidak mendukung = kerja yang pasti terbuang.',
    gerbangTambahan: [],
    contohSoal: [],
  },
};

// ── gerbang tambahan per mode ────────────────────────────────────────────
export function gerbangMode(cluster, tanya, jawab, ada = []) {
  const m = MODE[cluster];
  const masalah = [];
  if (!m) return masalah;
  if (m.nonaktif) {
    masalah.push({ berat: true, pesan: `Mode "${m.nama}" nonaktif: ${m.ringkas}` });
    return masalah;
  }

  // hitung: jawaban wajib memuat angka & tanda langkah
  if (cluster === 'hitung') {
    const angka = (jawab.match(/\d[\d.,]*/g) || []).length;
    if (angka < 2) {
      masalah.push({ berat: true, pesan: 'Mode aritmetika: jawaban harus memuat setidaknya dua angka (hasil + langkah antara). Jawaban tanpa langkah mengajarkan model menebak.' });
    }
    const semuaTitik = ada.length >= 5 && ada.every((b) => {
      const j = b.conversations.find((c) => c.from === 'gpt').value;
      return !/\d{4,}/.test(j.replace(/[.,]/g, '')) || /\d{1,3}(\.\d{3})+/.test(j);
    });
    if (semuaTitik && /\d{1,3}(\.\d{3})+/.test(jawab)) {
      masalah.push({ berat: false, pesan: 'Semua baris memakai format titik-ribuan. Sesekali tulis polos (15500) atau berspasi (15 500) — v12 melemah di format yang tidak pernah dilihatnya.' });
    }
  }

  // nalar: rem over-branching
  if (cluster === 'nalar') {
    const cabang = (jawab.match(/kalau (yang )?(maksud|dimaksud|konteksnya)/gi) || []).length;
    if (cabang >= 2) {
      masalah.push({ berat: false, pesan: `Ada ${cabang} percabangan "kalau maksudmu…". Pastikan pertanyaannya MEMANG ambigu — v13 gagal gerbang kias justru karena bercabang pada soal yang jelas.` });
    }
  }

  // tool: panggilan wajib sah
  if (cluster === 'tool' && /<tool_call>/.test(jawab)) {
    const cocok = jawab.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/);
    try {
      const o = JSON.parse(cocok[1]);
      if (!o.name) throw new Error('tanpa name');
    } catch {
      masalah.push({ berat: true, pesan: 'Panggilan alat tidak sah: JSON rusak atau tanpa "name". Validasi penuh dilakukan panen-tool-builder.mjs terhadap skema-tool.json.' });
    }
  }

  // gaya: jaga keseimbangan dua arah
  if (cluster === 'gaya' && ada.length >= 4) {
    const tolak = ada.filter((b) => /tidak (bisa|akan|boleh|menyebut|membuat)|melanggar/i.test(
      b.conversations.find((c) => c.from === 'gpt').value)).length;
    const rasio = tolak / ada.length;
    const iniTolak = /tidak (bisa|akan|boleh|menyebut|membuat)|melanggar/i.test(jawab);
    if (rasio > 0.7 && iniTolak) {
      masalah.push({ berat: false, pesan: `${Math.round(rasio * 100)}% baris cluster ini berupa penolakan. Tambahkan skenario yang HARUS DIJAWAB — model yang menolak segalanya itu cacat, bukan aman.` });
    }
  }

  return masalah;
}

// ────────────────────────────────────────────────── uji instrumen ──
function ujiInstrumen() {
  const kasus = [
    ['lima mode terdefinisi', Object.keys(MODE).length === 5],
    ['tiap mode punya kebenaran, bahaya, metode',
      Object.values(MODE).every((m) => m.kebenaran && m.bahaya && Array.isArray(m.metode) && m.metode.length >= 3)],
    ['visual dinonaktifkan dengan alasan', MODE.visual.nonaktif === true && /TEKS/.test(MODE.visual.ringkas)],
    ['visual ditolak saat dipakai',
      gerbangMode('visual', 'x', 'y').some((m) => m.berat)],
    ['hitung menolak jawaban tanpa langkah',
      gerbangMode('hitung', 'Berapa 2 ton?', 'Dua ribu kilogram saja.').some((m) => m.berat)],
    ['hitung menerima jawaban berlangkah',
      gerbangMode('hitung', 'Berapa 2 ton dalam kg?', '1 ton = 1.000 kg, jadi 2 ton = 2.000 kg.').every((m) => !m.berat)],
    ['nalar memperingatkan percabangan ganda',
      gerbangMode('nalar', 'x', 'Kalau maksudmu A, begini. Kalau maksudmu B, begitu.').some((m) => !m.berat && /percabangan/i.test(m.pesan))],
    ['tool menolak JSON panggilan rusak',
      gerbangMode('tool', 'x', '<tool_call>\n{rusak}\n</tool_call>').some((m) => m.berat)],
    ['tool menerima panggilan sah',
      gerbangMode('tool', 'x', '<tool_call>\n{"name":"brain_search","arguments":{"query":"a"}}\n</tool_call>').every((m) => !m.berat)],
    ['gaya memperingatkan kalau penolakan mendominasi',
      gerbangMode('gaya', 'x', 'Saya tidak bisa memberikan itu.',
        Array.from({ length: 5 }, () => ({ conversations: [{ from: 'gpt', value: 'tidak bisa kuberikan' }] })))
        .some((m) => !m.berat && /penolakan/i.test(m.pesan))],
  ];
  let gagal = 0;
  for (const [n, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${n}`); if (!ok) gagal++; }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

const iniUtama = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (iniUtama) ujiInstrumen();
