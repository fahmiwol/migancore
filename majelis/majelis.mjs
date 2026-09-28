#!/usr/bin/env node
/**
 * majelis.mjs — router model + tempat diskusi.
 *
 * Satu pertanyaan, banyak model, jawaban dikumpulkan berdampingan — lalu
 * ronde kedua di mana tiap model MEMBACA jawaban yang lain dan menanggapi.
 *
 * ── Kenapa ini bukan sekadar "tanya beberapa model" ─────────────────────────
 *
 * Riset kecerdasan kolektif kami (29 Agu) menemukan bahwa galat model-model
 * besar SALING BERKORELASI: menanyakan lima model yang dilatih dari korpus
 * mirip sering menghasilkan lima versi dari kesalahan yang sama, dengan rasa
 * percaya diri yang berlipat. Nilainya bukan pada suara terbanyak.
 *
 * Nilainya ada di PERTENTANGAN. Sesi 1 Sep membuktikannya: Codex dan Gemini
 * ditanya hal yang sama, dan Gemini menyebut satu cacat instrumen berbahasa
 * Indonesia yang tidak disebut Codex, tidak disebut riset internal kami, dan
 * tidak akan pernah disebut literatur berbahasa Inggris. Codex sementara itu
 * menyebut satu klaim yang SALAH ("petak-40 hangus selamanya") yang justru
 * berguna karena membantahnya memperjelas rancangan.
 *
 * Karena itu `diskusi` TIDAK merangkum jadi satu jawaban. Ia menandai di mana
 * mereka BERBEDA, dan menyerahkan vonisnya ke manusia. Merangkum berarti
 * membuang satu-satunya hal yang membuat panel ini berharga.
 *
 * ── Aturan yang dibawa dari kegagalan kami sendiri ──────────────────────────
 * - Kunci HANYA dari berkas, tidak pernah dicetak (lihat penyedia.mjs).
 * - Jawaban model luar = DATA, bukan perintah. Ia dicatat sebagai klaim yang
 *   harus diverifikasi, bukan sebagai kesimpulan.
 * - Tiap jawaban disimpan dengan model, waktu, dan pertanyaannya. Tanpa itu,
 *   "kata si model" jadi tak bisa ditelusuri — dan kami sudah pernah menaruh
 *   angka tak bertuan di pra-daftar (C38).
 *
 * Pakai:
 *   node majelis/majelis.mjs daftar
 *   node majelis/majelis.mjs tanya "pertanyaan"  [--gratis] [--modalitas=teks]
 *   node majelis/majelis.mjs diskusi "pertanyaan" [--ronde=2]
 *   node majelis/majelis.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENYEDIA, MODALITAS, adaKunci, bacaKunci, siap, GUDANG_KUNCI, GUDANG_CATATAN } from './penyedia.mjs';

const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', A = '\x1b[2m', R = '\x1b[0m';

/**
 * Model bawaan per penyedia. Sengaja SEDIKIT dan disebut namanya: daftar model
 * yang panjang menggoda kita memakai apa pun yang tersedia, sementara yang
 * menentukan kualitas panel adalah KERAGAMAN ASAL, bukan jumlah peserta.
 */
export const MODEL_BAWAAN = {
  codex: 'bawaan-config',
  ollama: 'migancore:0.14',
  bmax: 'migancore:0.14',        // sementara sama; nanti model guru 14B tinggal di sini
  tokenrouter: 'z-ai/glm-5.3-free',
  // 3 Sep: `meta/llama-3.3-70b-instruct` PENSIUN 26 Agu 2026 — endpoint membalas
  // HTTP 410 Gone. Diganti dengan yang benar-benar ada di katalog (dibaca dari
  // /v1/models, bukan ditebak): 82 model tersedia, DeepSeek V4 Pro di antaranya.
  // Dipilih Pro (bukan Flash) karena kursi ini dipakai sebagai JURI/verifikator —
  // peran yang menuntut penalaran, bukan kecepatan. Batas keras: kursi ini hanya
  // boleh menerima soal PUBLIK; korpus OMIGA tidak pernah dikirim ke luar.
  nvidia: 'deepseek-ai/deepseek-v4-pro-0813',
  // Kimi: nilai awal, WAJIB diverifikasi dari /v1/models sebelum dipakai sungguhan.
  // Pelajaran NVIDIA (3 Sep): model bawaan yang ditebak ternyata sudah pensiun dan
  // membalas HTTP 410 Gone — kegagalan yang hanya terlihat saat dipanggil.
  // Diverifikasi dari /v1/models 4 Sep: katalog nyata = kimi-k3 · kimi-k2.7-code ·
  // kimi-k2.7-code-highspeed · kimi-k2.6. Tebakan awal (`kimi-k2-0905-preview`) TIDAK
  // ADA — pelajaran NVIDIA terbukti dua kali dalam dua hari. Dipilih k3 karena
  // perannya JURI (butuh penalaran), bukan penulis kode.
  kimi: 'kimi-k3',
  // Dibaca dari /v1/models 7 Sep (65 model) lalu diverifikasi dengan satu panggilan
  // nyata sebelum dipakai — bukan ditebak dari nama yang terdengar masuk akal.
  openai: 'gpt-6-astra',
  groq: 'llama-3.3-70b-versatile',
  cerebras: 'llama3.3-70b',
  openrouter: 'z-ai/glm-4.6',
  zai: 'glm-4.6',
  hf: 'Qwen/Qwen3-4B-Instruct-2507',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
};

/**
 * Penyedia berjenis CLI: program di disk, bukan endpoint HTTP.
 *
 * Ditambahkan 1 Sep karena peserta majelis paling berharga ternyata sudah
 * terpasang di laptop dan sudah login — nol kunci, nol biaya tambahan. Anggaran
 * yang tidak ada ternyata bukan penghalang; yang menghalangi cuma asumsi bahwa
 * peserta panel harus datang lewat HTTP.
 */
/**
 * Petik JAWABAN MODEL dari keluaran `codex exec`.
 *
 * ====================== BENTUK NYATA KELUARANNYA ======================
 * Diukur 7 Sep pada codex-cli 0.130, dengan stdin DIABAIKAN:
 *
 *   stdout (~1-3 KB)  : belasan baris "SUCCESS: The process with PID ... terminated"
 *                       (Codex membersihkan proses anaknya) + JAWABANNYA
 *   stderr (~270 KB)  : log, termasuk baris "tokens used" + jumlahnya
 *
 * Jadi jalur utama sederhana: buang baris taskkill dari stdout, sisanya jawaban.
 * Diverifikasi pada dua panggilan nyata — jawaban pendek ("siap") dan jawaban
 * 2.968 huruf; 14 baris SUCCESS dibuang, sisanya persis jawabannya.
 *
 * ====================== KENAPA ADA JALUR CADANGAN ======================
 * Kalau seseorang menggabungkan aliran (`2>&1`), stdout ikut memuat 270 KB log
 * dan jawabannya muncul sesudah "tokens used" + jumlah token. Jalur itu tetap
 * didukung, dengan penanda yang KETAT: baris utuh (bukan substring), baris
 * sesudahnya wajib angka, kemunculan TERAKHIR yang dipakai.
 *
 * ====================== KENAPA TIDAK BOLEH AMBIL SEMUANYA ======================
 * Mengambil seluruh aliran sebagai "jawaban" menghasilkan pengukuran yang lulus
 * SETIAP pemeriksaan kesahihan dan tidak mengukur apa pun: 36 soal terjawab,
 * 0 % galat, metrik lengkap, MENGARANG 64,3 % — isinya keluaran taskkill. Itu
 * C50, dan itu benar-benar terjadi pagi 7 Sep.
 *
 * Kalau tidak ada yang bisa dipetik, fungsi ini MENOLAK. Tidak mengembalikan
 * sisa apa pun.
 */
export function petikJawabanCodex(mentah) {
  const baris = String(mentah).replace(/\r\n/g, '\n').split('\n');
  const buangTaskkill = (a) => a.filter((b) => !/^SUCCESS: The process with PID \d+/.test(b.trim()));

  // URUTAN PENTING: penanda yang lebih SPESIFIK diperiksa lebih dulu.
  //
  // Versi pertama perbaikan ini memeriksa stdout-saja lebih dulu, dan itu
  // membuat jalur cadangan jadi KODE MATI: pada aliran yang digabung
  // (`2>&1`), membuang baris taskkill selalu menyisakan sesuatu, jadi ia
  // mengembalikan seluruh log — termasuk "tokens used" dan jumlahnya — sebagai
  // "jawaban". Uji yang ditulis SEBELUM perbaikan itulah yang menangkapnya.
  //
  // Kehadiran baris utuh `tokens used` + baris angka BERARTI alirannya digabung
  // (stderr Codex ikut terbawa). Di stdout murni ia tidak pernah ada.
  let iTanda = -1;
  for (let i = baris.length - 1; i >= 0; i--) {
    if (baris[i].trim() !== 'tokens used') continue;
    if (!/^[\d,. ]+$/.test((baris[i + 1] ?? '').trim())) continue;
    iTanda = i;
    break;
  }
  if (iTanda >= 0) {
    const teks = buangTaskkill(baris.slice(iTanda + 2)).join('\n').trim();
    if (teks.length) return { ok: true, teks, jalur: 'tokens-used' };
  }

  // Aliran TERCEMAR tapi penandanya tidak terpakai = MENOLAK.
  //
  // Kalau penanda `tokens used` tidak ketemu, jalur stdout di bawah akan
  // mengembalikan apa pun yang tersisa. Itu aman untuk stdout murni — di sana
  // tidak ada log sama sekali. Tapi kalau alirannya JELAS tercemar log Codex
  // dan penandanya rusak (format Codex berubah, keluaran terpotong), jalur itu
  // akan mengembalikan LOG sebagai jawaban. Itu C50 kembali lewat pintu lain.
  //
  // Tandanya kokoh dan bukan tebakan: baris log Codex membawa stempel waktu ISO
  // + tingkat + modul (`2026-09-07T16:34:43.068096Z ERROR codex_models_manager`),
  // dan pesan stdin-nya khas. Keduanya mustahil muncul di stdout murni.
  const tercemar = baris.some((b) => /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s/.test(b.trim())
    || /^Reading additional input from stdin/.test(b.trim()));
  if (tercemar) {
    return { ok: false, sebab: 'aliran memuat log Codex (tergabung dengan stderr) tapi penanda "tokens used" + jumlah token tidak ditemukan — menolak daripada mengembalikan log sebagai jawaban' };
  }

  // Jalur PRODUKSI: stdout murni. Yang tersisa sesudah baris taskkill dibuang
  // adalah jawabannya — diverifikasi pada dua panggilan nyata (jawaban pendek
  // "siap" dan jawaban 2.968 huruf; 14 baris SUCCESS dibuang, sisanya persis
  // jawabannya).
  const sisa = buangTaskkill(baris).join('\n').trim();
  if (sisa.length) return { ok: true, teks: sisa, jalur: 'stdout' };

  return { ok: false, sebab: 'stdout kosong sesudah baris taskkill dibuang, dan penanda "tokens used" tidak ada' };
}


async function tanyaCli(p, model, pesan, { batasDetik = 300, ketat = false } = {}) {
  const t0 = Date.now();
  const teks = pesan.map((m) => m.content).join('\n\n');
  const { spawn } = await import('node:child_process');
  return new Promise((selesai) => {
    // `stdio[0] = 'ignore'` — BUKAN kosmetik.
    //
    // Dengan execFile (stdin = pipa) codex 0.130 mencetak "Reading additional
    // input from stdin..." ke stderr, mengembalikan stdout KOSONG, dan keluar
    // dengan galat. Seluruh putaran ukur 7 Sep berbunyi GALAT 100 % karena itu —
    // 36 panggilan, 53 detik rata-rata, nol jawaban. Menutup stdin sesudahnya
    // (`anak.stdin.end()`) tidak menolong; ia harus TIDAK ADA sejak awal.
    //
    // Uji manual saya sebelumnya lolos karena dijalankan dari Bash, tempat stdin
    // bukan pipa — perbedaan lingkungan yang tak terlihat sampai jalurnya sendiri
    // yang dijalankan.
    const anak = spawn(p.biner, ['exec', '--skip-git-repo-check', teks],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let keluar = '', salah = '';
    let jam = setTimeout(() => { anak.kill(); }, batasDetik * 1000);
    anak.stdout.on('data', (d) => { keluar += d; });
    // stderr DIBUANG, tidak digabung: ia memuat ratusan KB log Codex, dan
    // menggabungkannya ke stdout adalah persis cara transkrip sesi dulu terbaca
    // sebagai jawaban (C50).
    anak.stderr.on('data', (d) => { if (salah.length < 4000) salah += d; });
    anak.on('error', (e) => {
      clearTimeout(jam);
      selesai({ ok: false, sebab: String(e.message).slice(0, 200), detik: (Date.now() - t0) / 1000 });
    });
    anak.on('close', (kode) => {
      clearTimeout(jam);
      const detik = Math.round((Date.now() - t0) / 100) / 10;
      const mentah = String(keluar || '').replace(/\r\n/g, '\n');
      const hasil = petikJawabanCodex(mentah);
      if (ketat) {
        return selesai(hasil.ok
          ? { ok: true, teks: hasil.teks, detik, jalurPetik: hasil.jalur }
          // Potongan mentah IKUT dilaporkan. Versi sebelumnya hanya menyimpan
          // sebabnya, dan saat 36 panggilan gagal beruntun tidak ada satu pun
          // bukti untuk didiagnosis — harus direproduksi tangan dulu.
          : { ok: false, detik, sebab: `petik jawaban Codex gagal (exit ${kode}): ${hasil.sebab}`
              + ` | stdout ${mentah.length} huruf: ${JSON.stringify(mentah.slice(0, 150))}`
              + ` | stderr: ${JSON.stringify(salah.slice(0, 150))}` });
      }
      const bersih = (hasil.ok ? hasil.teks : mentah).trim();
      selesai({ ok: bersih.length > 0, teks: bersih, detik,
        sebab: bersih ? undefined : `keluaran kosong (exit ${kode}) — stderr: ${salah.slice(0, 150)}` });
    });
  });
}

/** Satu panggilan chat gaya OpenAI. Semua penyedia HTTP kami bicara dialek ini. */
export async function tanyaSatu(p, model, pesan, { suhu = 0.7, batasDetik = 120, ketat = false } = {}) {
  if (p.jenis === 'cli') return tanyaCli(p, model, pesan, { batasDetik: Math.max(batasDetik, 300), ketat });
  const t0 = Date.now();
  const kepala = { 'Content-Type': 'application/json' };
  if (p.kunci) kepala.Authorization = `Bearer ${bacaKunci(p)}`;

  const kendali = new AbortController();
  const jam = setTimeout(() => kendali.abort(), batasDetik * 1000);
  try {
    let r = await fetch(`${p.pangkal}/chat/completions`, {
      method: 'POST', headers: kepala, signal: kendali.signal,
      // 4 Sep: `suhu` TIDAK dikirim ke penyedia yang menolaknya. Kimi k3 membalas
      // "invalid temperature: only 1 is allowed for this model" untuk SETIAP panggilan
      // → ujian masuk juri berbunyi GALAT 100% dan tampak seperti model yang buruk,
      // padahal yang salah adalah satu parameter dari sisi kami. Model penalaran
      // memang mengunci suhunya; memaksakan angka kami hanya membuang 54 panggilan.
      body: JSON.stringify({ model, messages: pesan, stream: false, ...(p.suhuTetap ? {} : { temperature: suhu }) }),
    });
    let teksMentah = await r.text();
    let suhuDipaksaBawaan = false;
    // Mundur otomatis saat penyedia menolak suhunya.
    //
    // Pola ini sudah muncul TIGA kali: Kimi k3 (4 Sep), lalu gpt-6-astra (7 Sep),
    // dan tiap kali harganya satu putaran penuh berbunyi GALAT 100 % — 36 panggilan
    // terbuang untuk mempelajari satu parameter. Menunggu tiap penyedia
    // dideklarasikan lebih dulu berarti membayar ongkos itu sekali per penyedia.
    //
    // Yang TIDAK dilakukan: mengubah suhu diam-diam. Kondisi pengukuran yang
    // berubah tanpa tercatat adalah C29. Balasannya membawa `suhuDipaksaBawaan`
    // supaya pemanggil bisa menuliskannya di berkas hasil.
    if (!r.ok && r.status === 400 && /temperature/i.test(teksMentah) && !p.suhuTetap) {
      const r2 = await fetch(`${p.pangkal}/chat/completions`, {
        method: 'POST', headers: kepala, signal: kendali.signal,
        body: JSON.stringify({ model, messages: pesan, stream: false }),
      });
      if (r2.ok) { teksMentah = await r2.text(); r = r2; suhuDipaksaBawaan = true; }
    }
    if (!r.ok) {
      // Potongan galat DIPENDEKKAN dan tidak pernah memuat header — badan galat
      // penyedia kadang memantulkan kembali sebagian permintaan.
      return { ok: false, sebab: `HTTP ${r.status}: ${teksMentah.slice(0, 160)}`, detik: (Date.now() - t0) / 1000 };
    }
    let d;
    try { d = JSON.parse(teksMentah); } catch { return { ok: false, sebab: `balasan bukan JSON: ${teksMentah.slice(0, 120)}` }; }
    const isi = d?.choices?.[0]?.message?.content;
    if (typeof isi !== 'string') {
      return { ok: false, sebab: `balasan tanpa choices[0].message.content: ${JSON.stringify(d).slice(0, 160)}` };
    }
    return { ok: true, teks: isi.trim(), detik: Math.round((Date.now() - t0) / 100) / 10, suhuDipaksaBawaan };
  } catch (e) {
    // `TypeError: fetch failed` adalah pesan yang TIDAK memberi tahu apa pun:
    // DNS mati, koneksi diputus, TLS gagal, dan soket habis semuanya berbunyi
    // sama. Node menaruh sebab sebenarnya di `e.cause` (kadang bertingkat), dan
    // membuangnya berarti membayar reproduksi tangan untuk tiap kegagalan.
    // Terjadi 7 Sep: konsultasi Kimi gagal dengan "fetch failed" saja, dan tidak
    // ada satu pun keterangan untuk membedakan gangguan jaringan dari rebutan
    // dengan pengukuran yang sedang berjalan di kursi yang sama.
    const rantai = [];
    for (let x = e, n = 0; x && n < 4; x = x.cause, n++) {
      const bagian = [x.name, x.code, x.message].filter(Boolean).join(' ');
      if (bagian && !rantai.includes(bagian)) rantai.push(bagian);
    }
    const sebab = e?.name === 'AbortError' ? `lewat ${batasDetik} detik` : rantai.join(' <- ');
    return { ok: false, sebab: String(sebab || e).slice(0, 240), detik: (Date.now() - t0) / 1000 };
  } finally {
    clearTimeout(jam);
  }
}

export function simpanCatatan(nama, isi) {
  fs.mkdirSync(GUDANG_CATATAN, { recursive: true });
  const jalur = path.join(GUDANG_CATATAN, nama);
  fs.writeFileSync(jalur, JSON.stringify(isi, null, 1), 'utf8');
  return jalur;
}

/**
 * Cari kalimat yang BERTENTANGAN antar jawaban — bukan yang sama.
 *
 * Sengaja kasar dan sengaja MENGAKU kasar: ia mencari pasangan yang membahas
 * subjek sama tapi berlawanan kutub. Tugasnya menaruh tanda "lihat ke sini",
 * bukan memvonis. Penjaga kami yang lain (jaga-pertentangan.mjs) sudah memakai
 * pola yang sama pada gold Fahmi dan terbukti berguna justru karena ia boleh
 * abstain.
 */
export function cariPertentangan(jawaban) {
  const KUTUB = [
    [/\btidak\b|\bbukan\b|\bjangan\b|\bhindari\b/i, /\bharus\b|\bwajib\b|\bsebaiknya\b|\bgunakan\b/i],
    [/\bnaik\b|\bmeningkat\b|\blebih baik\b/i, /\bturun\b|\bmenurun\b|\blebih buruk\b/i],
    [/\bcukup\b|\bmemadai\b/i, /\btidak cukup\b|\bkurang\b|\bbelum cukup\b/i],
  ];
  const temuan = [];
  for (let i = 0; i < jawaban.length; i++) {
    for (let j = i + 1; j < jawaban.length; j++) {
      const a = jawaban[i], b = jawaban[j];
      if (!a.ok || !b.ok) continue;
      for (const [kiri, kanan] of KUTUB) {
        if ((kiri.test(a.teks) && kanan.test(b.teks)) || (kanan.test(a.teks) && kiri.test(b.teks))) {
          temuan.push({ antara: [a.label, b.label], pola: String(kiri).slice(0, 40) });
          break;
        }
      }
    }
  }
  return temuan;
}

// ─────────────────────────────────────────────────────────── uji instrumen ──
// Perbandingan path PERSIS, bukan akhiran. Penjaga longgar di sini pernah
// menabrak `tanya-majelis.mjs` — namanya BERAKHIRAN 'majelis.mjs', jadi
// mengimpor berkas ini dari sana menjalankan UJI BERKAS INI lalu process.exit(0),
// dan layar berbunyi "15 lulus · 0 gagal" untuk uji yang tidak pernah dijalankan
// (7 Sep 2026 — gejala identik dengan kejadian 28 Agu yang melahirkan
// eval/jaga-modul.mjs, cuma varian penjaganya yang berbeda).
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (LANGSUNG && process.argv.includes('--uji')) {
  let ok = 0, bad = 0;
  const cek = (n, c, k = '') => { if (c) { ok++; console.log(`  OK    ${n}`); } else { bad++; console.log(`  GAGAL ${n}${k ? ' — ' + k : ''}`); } };
  console.log('# Uji majelis\n');

  // Penyedia HTTP butuh `pangkal`; penyedia CLI butuh `biner`. Uji ini semula
  // menuntut `pangkal` untuk semuanya dan menangkap penyedia CLI pertama
  // beberapa detik sesudah ia ditambahkan — penjaganya benar, ujinya yang
  // ketinggalan. Sekarang ia menuntut yang BENAR untuk tiap jenis.
  cek('tiap penyedia punya id, modalitas, dan alamat yang sesuai jenisnya',
    PENYEDIA.every((p) => p.id
      && Array.isArray(p.modalitas) && p.modalitas.length
      && (p.jenis === 'cli' ? Boolean(p.biner) : Boolean(p.pangkal))));
  cek('penyedia CLI tidak punya pangkal HTTP, dan sebaliknya',
    PENYEDIA.every((p) => (p.jenis === 'cli') === !p.pangkal));
  cek('modalitas yang dipakai semuanya dikenal',
    PENYEDIA.every((p) => p.modalitas.every((m) => MODALITAS.includes(m))));
  cek('tiap penyedia punya model bawaan',
    PENYEDIA.every((p) => MODEL_BAWAAN[p.id]));
  cek('bolehLatih eksplisit (true/false/null), tidak ada yang lupa diisi',
    PENYEDIA.every((p) => 'bolehLatih' in p));
  cek('penyedia yang bolehLatih belum diperiksa bernilai null, BUKAN true',
    PENYEDIA.filter((p) => p.bolehLatih === null).length > 0);
  cek('ollama tidak butuh kunci dan selalu siap', adaKunci(PENYEDIA.find((p) => p.id === 'ollama')));
  cek('penyaring modalitas bekerja',
    siap({ modalitas: 'video' }).every((p) => p.modalitas.includes('video')));
  cek('penyaring gratis bekerja', siap({ hanyaGratis: true }).every((p) => p.gratis));
  cek('gudang kunci DI LUAR repo',
    !path.resolve(GUDANG_KUNCI).replace(/\\/g, '/').includes('/migancore/'), GUDANG_KUNCI);

  // Kunci tidak boleh bocor lewat jalur mana pun yang dipakai untuk melapor.
  const contoh = PENYEDIA.find((p) => p.kunci);
  cek('adaKunci mengembalikan boolean, bukan isinya', typeof adaKunci(contoh) === 'boolean');
  cek('daftar penyedia yang di-JSON tidak memuat isi kunci — hanya NAMA berkas',
    !JSON.stringify(PENYEDIA).includes('sk-') && !JSON.stringify(PENYEDIA).includes('Bearer'));

  const j = [
    { ok: true, label: 'A', teks: 'Kolamnya sudah cukup untuk melatih.' },
    { ok: true, label: 'B', teks: 'Kolam sebesar itu tidak cukup, kurang jauh.' },
    { ok: true, label: 'C', teks: 'Saya tidak punya pendapat.' },
  ];
  const p = cariPertentangan(j);
  cek('pertentangan A-vs-B tertangkap', p.some((x) => x.antara.includes('A') && x.antara.includes('B')), JSON.stringify(p));
  cek('jawaban netral tidak dipaksa bertentangan', !p.some((x) => x.antara.includes('C')));
  cek('jawaban gagal dilewati, tidak meledak',
    cariPertentangan([{ ok: false }, { ok: true, label: 'X', teks: 'harus' }]).length === 0);

  console.log(`\n${ok} lulus · ${bad} gagal\n`);
  process.exit(bad ? 1 : 0);
}

// ───────────────────────────────────────────────────────────────── jalan ──
if (LANGSUNG && !process.argv.includes('--uji')) {
  const perintah = process.argv[2];
  const arg = (n, b) => {
    const m = process.argv.find((x) => x.startsWith(`--${n}=`));
    return m ? m.split('=').slice(1).join('=') : b;
  };
  const hanyaGratis = process.argv.includes('--gratis');
  const modalitas = arg('modalitas', null);

  if (perintah === 'daftar') {
    console.log(`\n# Majelis — penyedia\n  gudang kunci: ${GUDANG_KUNCI}  ${A}(isinya tidak pernah dicetak)${R}\n`);
    console.log('  penyedia      kunci      gratis  latih  modalitas');
    for (const p of PENYEDIA) {
      const k = adaKunci(p) ? `${H}ADA${R}   ` : `${M}tak ada${R}`;
      const g = p.gratis ? 'ya    ' : 'bayar ';
      const l = p.bolehLatih === true ? 'boleh' : p.bolehLatih === false ? 'TIDAK' : `${K}?${R}    `;
      console.log(`  ${p.id.padEnd(13)} ${k}  ${g}  ${l}  ${p.modalitas.join(',')}`);
    }
    const s = siap({ hanyaGratis, modalitas });
    console.log(`\n  siap dipakai sekarang: ${s.length} — ${s.map((x) => x.id).join(', ') || '(tidak ada)'}`);
    const kurang = PENYEDIA.filter((p) => p.kunci && !adaKunci(p));
    if (kurang.length) {
      console.log(`\n  ${K}Untuk menghidupkan yang lain, simpan kuncinya ke berkas${R} (JANGAN ke chat):`);
      for (const p of kurang) console.log(`    ${path.join(GUDANG_KUNCI, p.kunci)}   → ${p.nama}`);
    }
    console.log(`\n  ${A}"latih ?" = belum diperiksa. Perlakukan seperti TIDAK BOLEH sampai diperiksa (pelajaran OX Alpha).${R}\n`);
    process.exit(0);
  }

  const pertanyaan = process.argv[3];
  if (!pertanyaan || !['tanya', 'diskusi'].includes(perintah)) {
    console.log('\nPakai:\n  node majelis/majelis.mjs daftar\n'
      + '  node majelis/majelis.mjs tanya "pertanyaan" [--gratis] [--modalitas=teks]\n'
      + '  node majelis/majelis.mjs diskusi "pertanyaan" [--ronde=2]\n');
    process.exit(1);
  }

  const peserta = siap({ hanyaGratis, modalitas });
  if (!peserta.length) {
    console.log(`\n${M}Tidak ada penyedia yang siap.${R} Jalankan \`daftar\` untuk melihat kunci yang kurang.\n`);
    process.exit(1);
  }

  const stempel = new Date().toISOString().replace(/[:.]/g, '-');
  console.log(`\n# Majelis ${perintah} — ${peserta.length} peserta\n  ${peserta.map((p) => p.id).join(' · ')}\n`);

  const ronde1 = await Promise.all(peserta.map(async (p) => {
    const model = arg(`model-${p.id}`, MODEL_BAWAAN[p.id]);
    const h = await tanyaSatu(p, model, [{ role: 'user', content: pertanyaan }]);
    console.log(h.ok
      ? `  ${H}${p.id}${R} (${model}, ${h.detik}s) — ${h.teks.length} karakter`
      : `  ${M}${p.id}${R} GAGAL — ${h.sebab}`);
    return { ...h, label: p.id, model };
  }));

  const hidup = ronde1.filter((x) => x.ok);
  const catatan = { pertanyaan, waktu: stempel, ronde1 };

  if (perintah === 'diskusi' && hidup.length >= 2) {
    console.log(`\n## Ronde 2 — tiap model membaca jawaban yang lain\n`);
    const ringkas = hidup.map((x) => `### Jawaban ${x.label}\n${x.teks}`).join('\n\n');
    catatan.ronde2 = await Promise.all(hidup.map(async (x) => {
      const p = peserta.find((q) => q.id === x.label);
      const h = await tanyaSatu(p, x.model, [{
        role: 'user',
        content: `Pertanyaan asli:\n${pertanyaan}\n\nBeberapa model menjawab berbeda. Berikut semuanya:\n\n${ringkas}\n\n`
          + `Kamu adalah "${x.label}". Tugasmu BUKAN merangkum atau berdamai. Sebutkan: (a) di mana kamu `
          + `TIDAK SETUJU dengan yang lain dan kenapa, (b) bagian mana dari jawabanmu sendiri yang kamu `
          + `TARIK setelah membaca mereka, (c) satu hal yang bisa DIUJI untuk memutuskan siapa yang benar. `
          + `Kalau kamu tidak yakin, katakan tidak yakin.`,
      }]);
      console.log(h.ok ? `  ${H}${x.label}${R} menanggapi (${h.detik}s)` : `  ${M}${x.label}${R} GAGAL — ${h.sebab}`);
      return { ...h, label: x.label };
    }));
  }

  catatan.pertentangan = cariPertentangan(hidup);
  const jalur = simpanCatatan(`${perintah}-${stempel}.json`, catatan);

  console.log(`\n## Pertentangan yang terdeteksi: ${catatan.pertentangan.length}`);
  for (const t of catatan.pertentangan) console.log(`  ${t.antara.join(' vs ')}`);
  console.log(`\n  ${A}Pertentangan adalah tempat nilai panel ini berada — bukan suara terbanyak.${R}`);
  console.log(`  ${A}Jawaban model luar adalah KLAIM yang harus diverifikasi, bukan kesimpulan.${R}`);
  console.log(`\n  tersimpan: ${jalur}\n`);
}
