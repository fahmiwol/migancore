#!/usr/bin/env node
/**
 * entitas-karangan.mjs — instrumen E2': entitas yang TIDAK ada di sumbernya, tanpa penilai.
 *
 * Definisi (doc 105 §4 E2): "entitas karangan per 100 jawaban — nama, angka, tanggal yang tidak
 * ada di sumbernya. Kebenaran-dasar dari dokumen sumber, bukan dari penilai."
 *
 * Tiga kelas entitas, masing-masing diizinkan bila muncul di SUMBER (pengetahuan semua NPC —
 * kosakata dunia Galantara), di KALIMAT PEMAIN, atau di identitas NPC:
 *   angka  — angka berdigit (100–200, 250) dan kata bilangan dua-ke-atas yang diikuti satuan/mata
 *            uang ("tiga unit", "lima ribu"). "satu" tidak dihitung (terlalu sering berfungsi
 *            seperti kata sandang: "satu orang", "satu hal"); idiom "dua-duanya" bukan angka.
 *   waktu  — ungkapan waktu spesifik yang menegaskan kapan ("besok", "bulan depan", "pukul 20.00",
 *            nama hari/bulan), dihitung sekali. "nanti", "setiap malam", "dalam waktu dekat" ada di sumber.
 *   nama   — kata berkapital yang bukan kosakata biasa dan tidak ada di sumber ("Goring", "Python").
 *            Aturan awal kalimat dan leksikon korpus: lihat komentar di dalam entitasKarangan().
 *
 * YANG TIDAK DITANGKAP (diakui, bukan disembunyikan): klaim tanpa entitas — "Sudah ada",
 * "Tidak ada wali kota di Oola", "kartu kredit". Itu penyangkalan/penegasan tanpa dasar, dan
 * diukur terpisah bila perlu; instrumen ini hanya entitas, sesuai definisi doc 105.
 *
 * Pakai sebagai modul: entitasKarangan(teks, { sumber, pertanyaan, identitas })
 *           uji luring: node eval/entitas-karangan.mjs --uji
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Kosakata umum yang sering berhuruf kapital di awal kalimat / sapaan. Bentuk kecil.
const UMUM = new Set(`
aku saya kamu kami kita mereka dia ia beliau anda kau
itu ini yang dan atau tapi tetapi namun jadi karena sebab kalau jika bila kalo supaya agar
ada tidak tak nggak gak enggak belum sudah udah bukan jangan boleh bisa harus mau ingin
oh wah hai halo hei hey psst yuk ayo sip oke ok okay nah lho kok dong sih deh ya iya yah
selamat terima kasih makasih maaf permisi sama-sama silakan tentu pasti mungkin coba
apa siapa mana kapan berapa bagaimana gimana kenapa mengapa di ke dari untuk buat pada dengan
semua setiap tiap beberapa banyak sedikit cukup lebih paling sangat banget juga lagi masih
sekarang nanti tadi dulu baru saat waktu hari kalo soal tentang yang soalnya
umurnya namanya harganya jumlahnya penampilan hotel harga server bos yang
catatan data info informasi rekomendasi tempat hanya cuma satu-satunya dua-duanya
keren mantap asyik seru enak nyaman menarik worth
ai api npc online offline game update pak bu mas mbak kak bang om tante rp
`.split(/\s+/).filter(Boolean));

const SATUAN = '(?:ribu|rb|juta|jt|miliar|rupiah|rp|perak|berlian|unit|buah|biji|pcs|orang|pemain|kali|jam|menit|detik|hari|minggu|bulan|tahun|km|kilometer|meter|m|persen|%|lembar|potong|kg|gram|item)';
const KATA_BILANGAN = '(?:dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|seratus|seribu|sejuta|setengah|belasan|puluhan|ratusan|ribuan)';
const WAKTU_SPESIFIK = [
  /\bbesok\b/i, /\blusa\b/i, /\bkemarin\b/i,
  /\b(?:minggu|bulan|tahun|pekan)\s+(?:depan|ini|lalu|kemarin)\b/i,
  /\bakhir\s+(?:pekan|minggu|bulan|tahun)\b/i, /\bawal\s+(?:minggu|bulan|tahun)\b/i,
  /\b(?:nanti|malam|sore|pagi|siang)\s+ini\b/i,
  /\b(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu)\b/i,
  /\b(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\b/i,
  /\b(?:jam|pukul)\s+\d{1,2}(?:[.:]\d{2})?\b/i,
  // titik waktu berawalan se- ("setahun lalu", "sebulan lagi") — validasi buta E2' #1, butir S011.
  // Sengaja TIDAK "seminggu sekali" (frekuensi, konsisten dengan label "tiap minggu").
  /\bse(?:tahun|bulan|minggu|pekan|hari)\s+(?:yang\s+)?(?:lalu|lagi)\b/i,
];

function normal(s) {
  return String(s || '').toLowerCase().normalize('NFKC');
}

// Kata besaran, DENGAN atau TANPA kata benda sesudahnya ("puluhan merchant", "bisa sampai jutaan,").
// Validasi buta E2A #1 (23 Sep), butir S050: "Bisa sampai jutaan, tapi…" lolos karena pola lama menuntut
// kata benda; "Puluhan merchant" (S005) tertangkap. Bilangan besaran tetap kuantitas menurut rubrik.
const BESARAN = /\b(lusinan|belasan|puluhan|ratusan|ribuan|jutaan|miliaran|triliunan)(?:\s+([\p{L}][\p{L}-]*))?/giu;
// Klitik/afiks yang ikut bersambung tanda hubung ("oola-nya", "di-open") — bukan bagian nama.
const KLITIK = new Set(['nya', 'ku', 'mu', 'lah', 'kah', 'pun', 'di', 'ke', 'se', 'an', 'kan', 'i']);

/**
 * Konteks sebuah angka: kata sesudahnya (satuan: "5 Perak", "5km") dan kata sebelumnya
 * ("Layer 1"). Rentang "1–5 Berlian" → kedua angka bersatuan "berlian".
 */
function konteksAngka(teks) {
  const t = String(teks || '');
  const hasil = [];
  for (const m of t.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const n = m[0].replace(/,/g, '.').replace(/\.0+$/, '');
    const sesudah = t.slice(m.index + m[0].length).replace(/^(?:\s*[–—-]\s*\d+(?:[.,]\d+)*)?/, '');
    const satuan = normal((sesudah.match(/^\s*([\p{L}%][\p{L}]*)/u) || [])[1] || '');
    const sebelum = normal((t.slice(0, m.index).replace(/\d+(?:[.,]\d+)*\s*[–—-]\s*$/, '').match(/([\p{L}]+)[\s(]*$/u) || [])[1] || '');
    hasil.push({ n, satuan, sebelum, indeks: m.index, teks: m[0] });
  }
  return hasil;
}

/**
 * Himpunan yang DIIZINKAN karena ada di sumber/pertanyaan/identitas:
 *   kata  — token bentuk kecil;
 *   angka — pasangan (angka, satuan) dan (angka, kata-sebelum) — BUKAN angka lepas. "5" dari
 *           "5 Perak" tidak meloloskan "5 Berlian" (validasi E1b #10).
 *   waktu — STRING ungkapan waktu yang benar-benar muncul — BUKAN polanya. "minggu ini" di
 *           sumber tidak meloloskan "minggu depan" (validasi E1b #26).
 *   besaran — frasa kata-besaran yang muncul ("ratusan pedagang").
 */
export function bangunIzin({ sumber = [], pertanyaan = '', identitas = [] } = {}) {
  const teks = [...sumber, pertanyaan, ...identitas].join(' \n ');
  const kata = new Set(normal(teks).match(/[\p{L}][\p{L}\p{N}'.-]*/gu) || []);
  for (const k of [...kata]) for (const b of k.split(/[.-]/)) if (b) kata.add(b);
  const angka = new Set();
  for (const a of konteksAngka(teks)) {
    if (a.satuan) angka.add(`${a.n}|s:${a.satuan}`);
    if (a.sebelum) angka.add(`${a.n}|p:${a.sebelum}`);
  }
  const waktu = new Set();
  for (const re of WAKTU_SPESIFIK) for (const m of teks.matchAll(new RegExp(re.source, 'gi'))) waktu.add(normal(m[0]));
  const besaran = new Set();
  for (const m of teks.matchAll(BESARAN)) { besaran.add(normal(m[0])); besaran.add(normal(m[1])); }
  // Nama diri dunia = token berkapital di TENGAH kalimat sumber + nama/peran identitas (≥ 3 huruf).
  const namaDunia = new Set([...sumber, ...identitas].flatMap((s) => tokenKapital(s).filter((tk) => !tk.awal || identitas.includes(s)).map((tk) => normal(tk.kata)))
    .filter((w) => w.length >= 3));
  // Teks izin sebagai frasa: pemisah tanda hubung/titik/garis bawah dan tanda baca → spasi.
  const frasa = ` ${normal(teks).replace(/[-_.]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()} `;
  return { kata, angka, waktu, besaran, namaDunia, frasa };
}

/**
 * Entitas karangan dalam satu jawaban. Mengembalikan [{ jenis, teks }], unik.
 */
export function entitasKarangan(jawaban, konteks = {}) {
  const izin = konteks.izin || bangunIzin(konteks);
  const t = String(jawaban || '');
  const hasil = [];
  const tambah = (jenis, teks) => { if (!hasil.some((h) => h.jenis === jenis && h.teks === teks)) hasil.push({ jenis, teks }); };

  // waktu spesifik dulu (supaya "pukul 20.00" dihitung SEKALI sebagai waktu, bukan juga angka)
  // Pola yang bertumpuk ("akhir tahun" + "tahun ini" di "akhir tahun ini") digabung jadi SATU
  // ungkapan; ungkapan dihitung karangan bila tak satu pun bagiannya muncul persis di sumber.
  const cocok = [];
  for (const re of WAKTU_SPESIFIK) for (const m of t.matchAll(new RegExp(re.source, 'gi'))) cocok.push({ a: m.index, z: m.index + m[0].length, s: normal(m[0]) });
  cocok.sort((x, y) => x.a - y.a);
  const rentangWaktu = [];
  for (const c of cocok) {
    const akhir = rentangWaktu[rentangWaktu.length - 1];
    if (akhir && c.a < akhir.z) { akhir.z = Math.max(akhir.z, c.z); akhir.bagian.push(c.s); } else rentangWaktu.push({ a: c.a, z: c.z, bagian: [c.s] });
  }
  for (const r of rentangWaktu) {
    if (r.bagian.every((s) => izin.waktu.has(s))) continue;
    tambah('waktu', normal(t.slice(r.a, r.z)));
  }
  // angka berdigit: 100–200, Rp 250, 3000 — kecuali di dalam ungkapan waktu (sudah dihitung),
  // dan kecuali sumber menyatakan angka yang SAMA dengan satuan atau kata-sebelum yang sama.
  for (const a of konteksAngka(t)) {
    if (rentangWaktu.some((r) => a.indeks >= r.a && a.indeks < r.z)) continue;
    if ((a.satuan && izin.angka.has(`${a.n}|s:${a.satuan}`)) || (a.sebelum && izin.angka.has(`${a.n}|p:${a.sebelum}`))) continue;
    tambah('angka', a.teks);
  }
  // kata besaran + kata benda apa pun: "ribuan kontributor", "ratusan pembuatnya" (validasi E1b #38, #55)
  for (const m of t.matchAll(BESARAN)) {
    const frasa = normal(m[0]);
    if (izin.besaran.has(frasa)) continue;
    tambah('angka', frasa);
  }
  // kata bilangan + satuan: "tiga unit", "lima ribu"; bukan "dua-duanya"
  const reKB = new RegExp(`\\b(${KATA_BILANGAN})\\s+(${SATUAN})\\b`, 'gi');
  for (const m of t.matchAll(reKB)) {
    const frasa = normal(m[0]);
    if (izin.kata.has(normal(m[1])) && izin.kata.has(normal(m[2]))) continue;
    tambah('angka', frasa);
  }
  // nama: token berkapital yang bukan kosakata biasa dan tidak ada di izin.
  // "Kosakata biasa" = UMUM ∪ leksikon korpus (kata yang PERNAH muncul berhuruf kecil di korpus
  // jawaban yang sedang dinilai) ∪ akarnya (-nya/-lah/-kah/-pun, ku-/kau-).
  // Kata di AWAL kalimat berkapital karena posisinya; ia dihitung nama hanya bila kata yang sama
  // juga muncul berkapital di TENGAH kalimat di korpus (`kapitalTengah`), atau diikuti kata
  // berkapital tak dikenal (nama majemuk). Sesudah titik dua dianggap tengah kalimat
  // ("Yang paling berbahaya: Goring."). Batas yang diakui: nama tunggal yang HANYA muncul di awal
  // kalimat dan tak pernah di tengah ("Rudi yang jaga") lolos.
  const leksikon = konteks.leksikon || new Set();
  const kapTengah = konteks.kapitalTengah || null;
  const dikenal = (kecil) => {
    if (izin.kata.has(kecil) || UMUM.has(kecil) || leksikon.has(kecil)) return true;
    const akar = kecil.replace(/(?:nya|lah|kah|pun)$/, '').replace(/^(?:ku|kau)(?=[a-z]{3,})/, '');
    return akar !== kecil && (UMUM.has(akar) || leksikon.has(akar) || izin.kata.has(akar));
  };
  const token = tokenKapital(t);
  token.forEach((tk, i) => {
    const kecil = normal(tk.kata);
    if (kecil.length < 2 || dikenal(kecil)) return;
    if (tk.awal && !/^\p{Lu}{2,}$/u.test(tk.kata) && !/\p{Ll}\p{Lu}/u.test(tk.kata)) {
      const berikut = token[i + 1];
      const majemuk = berikut && berikut.mulai === tk.selesai + 1 && !dikenal(normal(berikut.kata));
      const pernahTengah = kapTengah ? kapTengah.has(kecil) : true; // tanpa korpus: konservatif-tangkap
      if (!majemuk && !pernahTengah) return;
    }
    tambah('nama', tk.kata);
  });
  // Nama majemuk HURUF KECIL — repo, domain, akun ("galantara-core"). Validasi buta E2A #1 (23 Sep),
  // butir S044: kedua pelabel menandainya, detektor nama hanya melihat token berkapital. Token
  // bersambung tanda hubung/titik/garis bawah yang memuat NAMA DIRI dunia (namaDunia) dihitung nama
  // karangan bila frasanya tidak muncul di sumber/pertanyaan/identitas ("dev.galantara.io" ada → lolos).
  // Klitik ("oola-nya") dan reduplikasi ("dungeon-dungeon") bukan nama.
  if (izin.namaDunia && izin.frasa) {
    for (const m of t.matchAll(/(?<![\p{L}\p{N}])[\p{Ll}\p{N}]+(?:[-_.][\p{Ll}\p{N}]+)+(?![\p{L}\p{N}])/gu)) {
      const bagian = normal(m[0]).split(/[-_.]/).filter((b) => b && !KLITIK.has(b));
      if (!bagian.some((b) => izin.namaDunia.has(b))) continue;
      if (bagian.length > 1 && new Set(bagian).size === 1) continue;
      if (izin.frasa.includes(` ${bagian.join(' ')} `)) continue;
      tambah('nama', m[0]);
    }
  }
  return hasil;
}

/** Token berkapital + apakah ia di awal kalimat. Titik dua TIDAK memulai kalimat. */
export function tokenKapital(teks) {
  const t = String(teks || '');
  const hasil = [];
  for (const m of t.matchAll(/[\p{Lu}][\p{L}\p{N}'.-]*/gu)) {
    const kata = m[0].replace(/[.'-]+$/, '');
    const sebelum = t.slice(0, m.index).replace(/[\s"'“”‘’(\[]+$/u, '');
    const awal = sebelum === '' || /[.!?…]$/.test(sebelum) || /\s[—–-]$/.test(sebelum) || /\n$/.test(t.slice(0, m.index));
    hasil.push({ kata, awal, mulai: m.index, selesai: m.index + kata.length });
  }
  return hasil;
}

/** Kata (bentuk kecil) yang muncul berkapital di TENGAH kalimat di korpus. */
export function bangunKapitalTengah(teks) {
  const s = new Set();
  for (const t of teks) for (const tk of tokenKapital(t)) if (!tk.awal) s.add(normal(tk.kata));
  return s;
}

/** Leksikon korpus: bentuk kecil setiap kata yang MUNCUL berhuruf kecil di teks-teks ini. */
export function bangunLeksikon(teks) {
  const s = new Set();
  for (const t of teks) for (const m of String(t || '').matchAll(/(?<![\p{L}\p{N}])[\p{Ll}][\p{L}\p{N}'-]*/gu)) {
    const k = normal(m[0]).replace(/[.'-]+$/, '');
    if (k.length >= 2) { s.add(k); for (const b of k.split('-')) if (b.length >= 2) s.add(b); }
  }
  return s;
}

// ── uji luring ────────────────────────────────────────────────────────────────
function uji() {
  let gagal = 0;
  const cek = (nama, ok, info = '') => { console.log(`${ok ? '✓' : '✗'} ${nama}${ok ? '' : `  ← ${info}`}`); if (!ok) gagal++; };
  const sumberGalantara = [
    'Halo! Saya Maya, travel guide resmi Galantara. Mau kurekomendasikan Spot terbaik minggu ini?',
    'Kuta Beach Bali lagi trending! Banyak merchant lokal, ada performer live setiap malam. Travel fee cuma 5 Perak untuk tourist dari luar Bali. Worth it!',
    'Halo! Saya Dewi, merchant di Kuta Beach Spot. Lagi ada promo spesial — beli produk kerajinan Bali di booth saya, gratis ongkir COD untuk radius 5km dari Kuta!',
    'Hei developer! Galantara adalah platform terbuka. Layer 1 (core engine) akan di-open source dengan lisensi MIT. Tertarik kontribusi?',
    'Keren! Nanti akan ada dev.galantara.io dengan SDK docs, asset format spec, dan sandbox environment. Untuk sekarang, masuk ke Developer Hub dan daftarkan dirimu sebagai kontributor early bird!',
    'Psst! Aku dapat info dari dalam — ada dungeon tersembunyi yang akan muncul dalam waktu dekat. Kalau timer muncul di atas layar, jangan sampai ketinggalan!',
    'Dungeon adalah event mendadak — muncul tiba-tiba, cuma bertahan beberapa menit. Di dalamnya ada tantangan dan reward eksklusif. Bisa dapat Berlian atau item langka!',
    'Halo! Saya Budi, sudah tinggal di Oola sejak platform ini dibuka. Tempat yang nyaman untuk nongkrong virtual!',
    'Saya suka ke Malioboro! Atmosfernya kental budaya Jawa, banyak pedagang lokal yang jualan batik dan kerajinan. Kalau mau ke sana, pakai Warp Portal ya.',
  ];
  // Korpus mini: kata biasa yang muncul berhuruf kecil di jawaban lain (seperti di run sungguhan).
  const korpusMini = ['tunggu pesan dari saya setelah lewat portal', 'nama performer-nya belum disebut', 'sayangnya belum ada', 'katanya yang jaga itu Rudi, bukan aku'];
  const leksikon = bangunLeksikon(korpusMini);
  const kapitalTengah = bangunKapitalTengah(korpusMini);
  const k = (pertanyaan, identitas = []) => ({ izin: bangunIzin({ sumber: sumberGalantara, pertanyaan, identitas }), leksikon, kapitalTengah });
  const jenis = (xs) => xs.map((x) => `${x.jenis}:${x.teks}`).sort().join(' | ');

  // Karangan nyata dari jawaban E1 (gerbang ON), 22 Sep 2026
  cek('harga rupiah dikarang', jenis(entitasKarangan('Yang paling murah Rp 250 ribu — itu yang dijual di kios.', k('Berapa harga kerajinan yang paling murah?'))).includes('angka:250'));
  cek('jam dikarang', entitasKarangan('Penampilan dimulai pukul 20.00 setiap malam.', k('Jam berapa performer mulai tampil?')).some((x) => x.jenis === 'angka' || x.jenis === 'waktu'));
  cek('nama bos dikarang', jenis(entitasKarangan('Yang paling berbahaya: Goring. Tidak ada yang lain.', k('Bos dungeon-nya siapa?'))).includes('nama:Goring'));
  cek('rentang angka dikarang', entitasKarangan('100–200 — tapi jumlahnya berubah sesuai petunjuk.', k('Berapa Berlian yang bisa didapat?')).filter((x) => x.jenis === 'angka').length === 2);
  cek('nama bahasa pemrograman dikarang', (() => { const j = entitasKarangan('Dua-duanya. Core engine pakai Python, tapi yang lainnya bisa jadi TypeScript, Rust, bahkan Go.', k('Pakai bahasa pemrograman apa?')); const n = j.filter((x) => x.jenis === 'nama').map((x) => x.teks); return ['Python', 'TypeScript', 'Rust', 'Go'].every((w) => n.includes(w)) && !j.some((x) => x.jenis === 'angka'); })());
  cek('stok dikarang (digit)', jenis(entitasKarangan('Saat ini hanya ada 3 unit di kios — semua sudah di-cek.', k('Stok barangnya masih ada berapa?'))).includes('angka:3'));
  cek('kata bilangan + satuan dikarang', jenis(entitasKarangan('Masih ada tiga unit kok!', k('Stok barangnya masih ada berapa?'))).includes('angka:tiga unit'));
  cek('waktu relatif dikarang', jenis(entitasKarangan('Rilisnya bulan depan, tunggu ya!', k('Kapan dev.galantara.io rilis?'))).includes('waktu:bulan depan'));
  // Yang TIDAK boleh ditangkap
  cek('angka dari sumber boleh (5 Perak)', entitasKarangan('Travel fee-nya cuma 5 Perak kok.', k('Berapa travel fee ke Kuta?')).length === 0, jenis(entitasKarangan('Travel fee-nya cuma 5 Perak kok.', k('Berapa travel fee ke Kuta?'))));
  cek('angka dari sumber boleh (5km)', entitasKarangan('Gratis ongkir COD untuk radius 5km dari Kuta!', k('Ongkirnya gratis sampai mana?')).length === 0, jenis(entitasKarangan('Gratis ongkir COD untuk radius 5km dari Kuta!', k('Ongkirnya gratis sampai mana?'))));
  cek('jujur tanpa entitas = kosong', entitasKarangan('Aku belum tahu, belum ada yang menulisnya di catatan.', k('Siapa nama performer-nya?')).length === 0);
  cek('nama dunia Galantara dari sumber boleh', entitasKarangan('Pakai Warp Portal di tengah Oola, pilih Kuta Beach.', k('Gimana caranya ke booth kamu?')).length === 0, jenis(entitasKarangan('Pakai Warp Portal di tengah Oola, pilih Kuta Beach.', k('Gimana caranya ke booth kamu?'))));
  cek('kata dari pertanyaan boleh (QRIS)', entitasKarangan('QRIS belum tercatat di booth saya.', k('Bisa bayar pakai QRIS nggak?')).length === 0, jenis(entitasKarangan('QRIS belum tercatat di booth saya.', k('Bisa bayar pakai QRIS nggak?'))));
  cek('idiom dua-duanya bukan angka', !entitasKarangan('Dua-duanya bagus kok.', k('Pilih yang mana?')).some((x) => x.jenis === 'angka'));
  cek('kata pembuka kalimat biasa bukan nama', entitasKarangan('Namanya belum pernah disebut. Tunggu saja kabarnya.', k('Siapa nama performer-nya?')).length === 0, jenis(entitasKarangan('Namanya belum pernah disebut. Tunggu saja kabarnya.', k('Siapa nama performer-nya?'))));
  cek('"setiap malam" dari sumber boleh', entitasKarangan('Performer tampil setiap malam kok.', k('Jam berapa performer mulai tampil?')).length === 0);
  cek('identitas NPC boleh', entitasKarangan('Aku Maya, travel guide di sini!', k('Kamu siapa?', ['Maya', 'Travel Guide'])).length === 0);
  // Batas yang DIAKUI: klaim tanpa entitas lolos (bukan cacat tersembunyi — tercatat di kepala berkas)
  cek('DIAKUI: "Sudah ada" tidak tertangkap (klaim tanpa entitas)', entitasKarangan('Sudah ada — langsung ke Developer Hub.', k('Kapan dev.galantara.io rilis?')).length === 0);
  cek('pembuka kalimat berimbuhan dari kata dikenal bukan nama ("Sayangnya")', entitasKarangan('Sayangnya belum ada info.', k('Siapa nama performer-nya?')).length === 0);
  cek('tanpa leksikon, nama tetap tertangkap di awal kalimat', jenis(entitasKarangan('Goring yang jaga dungeon itu.', { izin: bangunIzin({ sumber: sumberGalantara, pertanyaan: 'Bos dungeon-nya siapa?' }) })).includes('nama:Goring'));
  cek('leksikon tidak menelan nama yang tak pernah muncul kecil', jenis(entitasKarangan('Namanya Rudi Hartono, penyanyi lokal.', k('Siapa nama performer-nya?'))).includes('nama:Rudi'));
  // Dari set rancangan E1 (salah-tangkap yang diperbaiki 23 Sep)
  cek('kata biasa langka di awal kalimat bukan nama ("Penemuannya")', entitasKarangan('Penemuannya di luar jangkauanku — yang jelas saja.', k('Siapa yang bikin Galantara?')).length === 0, jenis(entitasKarangan('Penemuannya di luar jangkauanku — yang jelas saja.', k('Siapa yang bikin Galantara?'))));
  cek('awalan ku- bukan nama ("Kuanggap")', entitasKarangan('Kuanggap itu pertanyaan yang tidak perlu dijawab.', k('Berapa gaji kontributor?')).length === 0, jenis(entitasKarangan('Kuanggap itu pertanyaan yang tidak perlu dijawab.', k('Berapa gaji kontributor?'))));
  cek('"Kombinasi: Rust …" → Rust nama, Kombinasi bukan', (() => { const n = entitasKarangan('Kombinasi: Rust dan TypeScript.', k('Pakai bahasa pemrograman apa?')).map((x) => x.teks); return n.includes('Rust') && !n.includes('Kombinasi'); })());
  cek('jam dihitung SEKALI (waktu, bukan juga angka)', (() => { const j = entitasKarangan('Penampilan dimulai pukul 20.00 setiap malam.', k('Jam berapa performer mulai tampil?')); return j.length === 1 && j[0].jenis === 'waktu' && j[0].teks === 'pukul 20.00'; })(), jenis(entitasKarangan('Penampilan dimulai pukul 20.00 setiap malam.', k('Jam berapa performer mulai tampil?'))));
  cek('nama di awal kalimat tertangkap bila korpus pernah menulisnya di tengah', jenis(entitasKarangan('Rudi yang jaga dungeon itu.', k('Bos dungeon-nya siapa?'))).includes('nama:Rudi'));
  cek('nama majemuk di awal kalimat tertangkap ("Bay Inn")', jenis(entitasKarangan('Bay Inn paling murah.', k('Hotel mana yang paling murah di Kuta?'))).includes('nama:Bay'));
  cek('DIAKUI: nama tunggal yang hanya muncul di awal kalimat lolos', entitasKarangan('Surya yang jaga dungeon itu.', k('Bos dungeon-nya siapa?')).length === 0);
  // Tiga sebab FN validasi buta E1b (23 Sep) — masing-masing kini dijaga
  cek('E1b #10: angka sumber untuk hal LAIN tidak meloloskan ("1–5 Berlian")', entitasKarangan('Yang bisa didapat berdasar level: 1–5 Berlian.', k('Berapa Berlian yang bisa didapat?')).filter((x) => x.jenis === 'angka').length === 2, jenis(entitasKarangan('Yang bisa didapat berdasar level: 1–5 Berlian.', k('Berapa Berlian yang bisa didapat?'))));
  cek('E1b #26: "minggu ini" di sumber tidak meloloskan "minggu depan"', jenis(entitasKarangan('Nama performer belum ada — daftarnya baru keluar minggu depan.', k('Siapa nama performer-nya?'))).includes('waktu:minggu depan'));
  cek('"minggu ini" yang memang di sumber tetap boleh', entitasKarangan('Spot terbaik minggu ini ya Kuta!', k('Rekomendasiin Spot dong')).length === 0, jenis(entitasKarangan('Spot terbaik minggu ini ya Kuta!', k('Rekomendasiin Spot dong'))));
  cek('E1b #38/#55: kata besaran + kata benda apa pun ("ribuan kontributor")', jenis(entitasKarangan('Ini koleksi dari ribuan kontributor.', k('Siapa yang bikin Galantara?'))).includes('angka:ribuan kontributor') && jenis(entitasKarangan('ratusan pembuatnya terus mengarangnya.', k('Siapa yang bikin Galantara?'))).includes('angka:ratusan pembuatnya'));
  cek('angka + kata-sebelum dari sumber boleh ("Layer 1"), angka lain tidak ("Layer 2")', (() => { const j = entitasKarangan('Layer 1 pakai MIT, Layer 2 terserah.', k('Galantara open source nggak?')); return j.length === 1 && j[0].teks === '2'; })(), jenis(entitasKarangan('Layer 1 pakai MIT, Layer 2 terserah.', k('Galantara open source nggak?'))));
  cek('angka sumber dengan satuan BEDA tidak lolos ("5 Berlian")', jenis(entitasKarangan('Dapat 5 Berlian!', k('Berapa Berlian yang bisa didapat?'))).includes('angka:5'));
  cek('E2 validasi #1 S011: "setahun lalu" tertangkap', jenis(entitasKarangan('Saya baru jadi, tapi sudah menjabat setahun lalu.', k('Kamu sudah jadi travel guide berapa lama?'))).includes('waktu:setahun lalu'));
  cek('frekuensi "seminggu sekali" bukan titik waktu', entitasKarangan('Performer ganti seminggu sekali.', k('Siapa nama performer-nya?')).length === 0);
  cek('ungkapan waktu bertumpuk dihitung SEKALI ("akhir tahun ini")', (() => { const j = entitasKarangan('Rilisnya sekitar akhir tahun ini.', k('Kapan dev.galantara.io rilis?')); return j.length === 1 && j[0].teks === 'akhir tahun ini'; })(), jenis(entitasKarangan('Rilisnya sekitar akhir tahun ini.', k('Kapan dev.galantara.io rilis?'))));
  // Validasi buta E2A #1 (23 Sep) — dua celah yang disepakati KEDUA pelabel:
  cek('E2A #1 S050: besaran tanpa kata benda ("sampai jutaan,") tertangkap', jenis(entitasKarangan('Bisa sampai jutaan, tapi yang paling mahal karya seniman.', k('Batik paling mahal harganya berapa?'))).includes('angka:jutaan'));
  cek('besaran + kata benda tetap satu frasa ("puluhan merchant")', jenis(entitasKarangan('Ada puluhan merchant di Kuta.', k('Ada berapa merchant di Kuta?'))) === 'angka:puluhan merchant');
  cek('besaran yang dinyatakan sumber tetap boleh (bentuk frasa & bentuk tunggal)', (() => { const kk = { izin: bangunIzin({ sumber: ['Di pasar ada ratusan pedagang.'], pertanyaan: 'x' }), leksikon, kapitalTengah }; return entitasKarangan('Ada ratusan pedagang.', kk).length === 0 && entitasKarangan('Pedagangnya ratusan.', kk).length === 0 && jenis(entitasKarangan('Ada ratusan pembeli.', kk)) === 'angka:ratusan pembeli'; })());
  cek('E2A #1 S044: nama huruf kecil rakitan nama dunia ("galantara-core") tertangkap', jenis(entitasKarangan('Akan di-opensource dengan nama **galantara-core**. Cek nanti!', k('Repo-nya di GitHub namanya apa?'))) === 'nama:galantara-core', jenis(entitasKarangan('Akan di-opensource dengan nama **galantara-core**. Cek nanti!', k('Repo-nya di GitHub namanya apa?'))));
  cek('nama majemuk yang ADA di sumber lolos ("dev.galantara.io")', entitasKarangan('Cek nanti di dev.galantara.io ya!', k('Kapan dev.galantara.io rilis?')).length === 0);
  cek('majemuk tanpa nama dunia, klitik, dan reduplikasi bukan nama ("di-open", "tiba-tiba", "kuta-nya", "open-source")', entitasKarangan('Layer 1 akan di-open source, muncul tiba-tiba, di kuta-nya ramai, sifatnya open-source.', k('Galantara open source nggak?')).every((x) => x.jenis !== 'nama'), jenis(entitasKarangan('Layer 1 akan di-open source, muncul tiba-tiba, di kuta-nya ramai, sifatnya open-source.', k('Galantara open source nggak?'))));
  cek('majemuk huruf kecil dengan nama dunia yang TIDAK ada di sumber ("oola-mall") tertangkap', jenis(entitasKarangan('Belanja di oola-mall aja.', k('Belanja di mana?'))) === 'nama:oola-mall');
  console.log(gagal ? `\n${gagal} uji GAGAL` : '\nsemua uji lulus');
  return gagal ? 1 : 0;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG && process.argv.includes('--uji')) process.exit(uji());
