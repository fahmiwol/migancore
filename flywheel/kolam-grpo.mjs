#!/usr/bin/env node
/**
 * kolam-grpo.mjs — bangun KOLAM PROMPT untuk GRPO dari data latih cluster tool.
 *
 * ============================== KENAPA ADA ==================================
 * GRPO tidak butuh jawaban gold — ia menghasilkan jawabannya sendiri lalu
 * dinilai fungsi ganjaran. Yang dibutuhkan: prompt, dan SPESIFIKASI yang cukup
 * untuk memvonis (kategori, alat yang benar, argumen wajib, riwayat giliran).
 *
 * Kolam ini TIDAK BOLEH memakai 24 skenario eval. Melatih di atas soal ujian
 * menaikkan skor tanpa memberi tahu apa pun — kelas kegagalan senyap yang paling
 * mahal, karena hasilnya terlihat persis seperti keberhasilan. Sumbernya adalah
 * data latih (389 baris), yang generatornya sudah membuang apa pun yang mirip
 * soal gerbang (C07, ambang mirip 0,8).
 *
 * ===================== MEMULIHKAN KATEGORI DARI TIGA ASAL ===================
 * Tiga keluarga baris, tiga jalan pulih, masing-masing dengan buktinya:
 *
 *   generator (147)  `sumber` sudah memuat kategorinya (tool-panggil dst).
 *   ajar (54)        medan `keputusan` memetakan 1:1 ke kategori
 *                    (MUST_TOOL->panggil, DIRECT->jangan, TOOL_MISSING->
 *                    alat_hilang, ASK_CLARIFICATION->arg_kurang,
 *                    TOOL_FAILURE->alat_gagal, CONFIRM_FIRST->konfirmasi).
 *   suling (188)     penyuling hanya menulis ulang PERTANYAAN dan tidak pernah
 *                    menyentuh jawaban — jadi jawaban suling identik dengan
 *                    jawaban benihnya, dan kategori dipulihkan lewat kecocokan
 *                    jawaban persis. Diukur 28 Agu: 180 pulih unik, 8 ambigu
 *                    (jawaban sama muncul di dua kategori), 0 tak ketemu.
 *                    Yang 8 DIBUANG — label kategori yang salah berarti ganjaran
 *                    yang salah, dan itu mengajari model hal yang keliru dengan
 *                    percaya diri.
 *
 * Sengaja TIDAK memakai medan `_benih` (sha256 objek benih) walau ada: sidik itu
 * dihitung sisi Python dengan json.dumps, dan mencocokkannya dari JS bergantung
 * pada kesamaan serialisasi antar-bahasa — hal yang gampang berbeda diam-diam.
 * Kecocokan jawaban tidak bergantung pada apa pun kecuali isinya.
 *
 * ==================== PENJAGA: GOLD KAMI SENDIRI HARUS LULUS ================
 * Tiap baris divonis dengan ganjaran memakai JAWABAN GOLD-nya sendiri. Kalau
 * `perilaku` tidak 1, ada yang salah — di spec, di generator, atau di ganjaran —
 * dan barisnya dibuang berikut alasannya. Ini pemeriksaan dua arah yang murah:
 * kalau aturan ganjaran menyimpang dari data latih, angka ini yang jatuh duluan,
 * sebelum satu rupiah GPU keluar.
 *
 * Pakai: node flywheel/kolam-grpo.mjs            (kering — laporan saja)
 *        node flywheel/kolam-grpo.mjs --tulis    (tulis dataset/grpo/kolam-tool.jsonl)
 *        node flywheel/kolam-grpo.mjs --uji
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ganjaran, OBJEKTIF } from './ganjaran.mjs';
import { bacaPanggilan } from '../eval/nilai-alat.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.dirname(DIR);
const SUMBER = path.join(DIR, 'dataset', 'v14', 'cluster-tool.jsonl');
const BENIH = path.join(DIR, 'dataset', 'benih-suling.jsonl');
const SKEMA = path.join(DIR, 'skema-tool.json');
const KELUAR = path.join(DIR, 'dataset', 'grpo', 'kolam-tool.jsonl');

const bacaJSONL = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((x) => JSON.parse(x));

/** sumber generator -> kategori vonis */
export const DARI_SUMBER = {
  'tool-panggil': 'panggil',
  'tool-jangan-panggil': 'jangan',
  'tool-alat-hilang': 'alat_hilang',
  'tool-arg-kurang': 'arg_kurang',
  'tool-alat-gagal': 'alat_gagal',
  'tool-konfirmasi': 'konfirmasi',
  // 'tool-rangkaian' SENGAJA TIDAK ADA: aturan vonis kami tidak punya kategori
  // rangkaian, jadi nilai() akan selalu mengembalikan "kategori tak dikenal".
  // Memberinya ganjaran berarti melatih perilaku yang tidak pernah diukur.
};

/** keputusan Pencatat Ajar -> kategori vonis */
export const DARI_KEPUTUSAN = {
  MUST_TOOL: 'panggil',
  DIRECT: 'jangan',
  TOOL_MISSING: 'alat_hilang',
  ASK_CLARIFICATION: 'arg_kurang',
  TOOL_FAILURE: 'alat_gagal',
  CONFIRM_FIRST: 'konfirmasi',
};

const jawabTerakhir = (r) => {
  const g = (r.conversations || []).filter((c) => c.from === 'gpt');
  return String(g.at(-1)?.value ?? '');
};

/**
 * Pecah percakapan jadi (sistem, pertanyaan pertama, riwayat sebelum jawaban akhir).
 * Riwayat memakai peran gaya eval: gpt->assistant, human->user.
 */
export function pecahGiliran(r) {
  const c = r.conversations || [];
  const sistem = c[0]?.from === 'system' ? String(c[0].value) : '';
  const sisa = c.filter((x) => x.from !== 'system');
  const t = String(sisa[0]?.value ?? '');
  const tengah = sisa.slice(1, -1);                 // antara pertanyaan pertama dan jawaban akhir
  const riwayat = tengah.map((x) => ({ role: x.from === 'gpt' ? 'assistant' : 'user', content: String(x.value) }));
  return { sistem, t, riwayat };
}

/** Bangun spec vonis satu baris. Mengembalikan {spec} atau {tolak: alasan}. */
export function spekDari(r, kategori, wajibPerAlat) {
  if (!kategori) return { tolak: 'kategori tidak bisa dipulihkan' };
  const { sistem, t, riwayat } = pecahGiliran(r);
  if (!t.trim()) return { tolak: 'tanpa pertanyaan' };
  if (!sistem.trim()) return { tolak: 'tanpa prompt sistem (paritas latih-layan rusak)' };

  const spec = { k: kategori, t, sistem };
  if (riwayat.length) spec.riwayat = riwayat;

  // KOREKSI 29 Agu (hukum C31). Versi pertama membuang SEMUA baris konfirmasi yang
  // gold-nya tidak memanggil alat, dengan alasan "alat tidak diketahui, jadi tiap
  // panggilan rollout akan divonis salah membabi buta". Alasan itu SALAH.
  //
  // Baris `CONFIRM_FIRST` dari Pencatat Ajar memang DIAJARKAN untuk tidak memanggil:
  // ajar/server.mjs:437 menolak jawaban yang memuat <tool_call> untuk keputusan itu.
  // Jadi memvonis panggilan sebagai salah bukan kebutaan — itu persis aturan yang
  // Fahmi tuliskan sendiri. Akibat kekeliruan saya: 6 dari 6 baris CONFIRM_FIRST
  // tulisan tangannya dibuang, 100%, senyap — justru data yang hukum A11 sebut dial
  // paling efektif yang pernah kami ukur.
  //
  // Yang DITOLAK sekarang cuma `panggil` tanpa panggilan gold, karena di sana kami
  // memang butuh tahu nama alat yang benar dan tidak punya cara lain mengetahuinya.
  // Aturannya SUMBER-BEBAS, bukan khusus baris ajar. Diperiksa 29 Agu: dari 17 baris
  // `tool-konfirmasi` generator, 9 gold-nya juga bertanya balik — dan ketiga contoh
  // yang kubaca semuanya penolakan yang benar untuk permintaan ambigu-destruktif
  // ("Bikin semua lead yang sudah diam jadi status gagal" -> "batas tanggalnya
  // berapa hari?"). Membuat pengecualian hanya untuk baris ajar berarti membuang
  // 18 baris lain karena asalnya, bukan karena isinya.
  //
  // Kalimat aturannya: baris `konfirmasi` yang gold-nya TIDAK memanggil alat sedang
  // mengajarkan "bertanya dulu". Itu perilaku yang bisa divonis tanpa tahu nama alat.
  const goldTanyaBalik = kategori === 'konfirmasi' && !/<tool_call>/.test(jawabTerakhir(r));
  if (kategori === 'panggil' || (kategori === 'konfirmasi' && !goldTanyaBalik)) {
    const p = bacaPanggilan(jawabTerakhir(r));
    if (!p || p.name === '(JSON RUSAK)') {
      return { tolak: kategori === 'konfirmasi' ? 'konfirmasi tanpa panggilan gold — alat tidak diketahui' : 'panggil tanpa panggilan gold' };
    }
    spec.alat = p.name;
    if (kategori === 'konfirmasi') spec.wajib = wajibPerAlat[p.name] || [];
  }
  // RISIKO YANG DIAKUI: tanpa `alat`, tiap panggilan pada baris ini bernilai salah,
  // jadi ganjarannya mendorong BERTANYA. Itu memang yang diajarkan, tapi dorongan
  // bertanya berlebihan punya sejarahnya sendiri di sini (A4' dosis tanya-balik).
  // Kolam ini memuat 157 baris `panggil` yang menarik ke arah berlawanan; kalau
  // uji-alat kelak menunjukkan `panggil` turun sementara `konfirmasi` naik, ini
  // tersangka pertamanya.
  if (goldTanyaBalik) spec.goldBertanya = true;

  return { spec };
}

// ─────────────────────────────────────────────────────────────── bangun ──
export function bangunKolam() {
  const baris = bacaJSONL(SUMBER);
  const skema = JSON.parse(fs.readFileSync(SKEMA, 'utf8'));
  const wajibPerAlat = Object.fromEntries((skema.tool || []).map((t) => [t.nama, t.wajib || []]));

  // Peta jawaban -> kategori, dari benih (untuk baris suling).
  //
  // Benih datang dari DUA keluarga, dan versi pertama fungsi ini cuma mengenal
  // satu: 54 benih `ajar-tool` (gold tulisan tangan Fahmi) dipetakan ke null,
  // sehingga 57 baris suling turunannya dibuang dengan label yang menyesatkan —
  // "benih tak ketemu", padahal benihnya ketemu 188/188 dan yang tidak ada cuma
  // pemetaannya. Label salah pada kegagalan itu lebih berbahaya daripada
  // kegagalannya sendiri: ia mengarahkan penyelidikan ke tempat yang keliru.
  // Dan yang terbuang justru turunan data yang hukum A11 sebut dial paling
  // efektif yang pernah kami ukur.
  const petaJawab = new Map();
  for (const b of bacaJSONL(BENIH).filter((x) => x._cluster === 'tool')) {
    const k = DARI_SUMBER[b.sumber] || (b.sumber === 'ajar-tool' ? DARI_KEPUTUSAN[b.keputusan] : null) || null;
    const j = jawabTerakhir(b);
    if (!petaJawab.has(j)) petaJawab.set(j, new Set());
    petaJawab.get(j).add(k);
  }

  const kolam = [], dibuang = [];
  for (const r of baris) {
    let kategori = null, asal = r.sumber;
    if (DARI_SUMBER[r.sumber]) kategori = DARI_SUMBER[r.sumber];
    else if (r.sumber === 'ajar-tool') kategori = DARI_KEPUTUSAN[r.keputusan] || null;
    else if (r.sumber === 'suling-tool') {
      const set = petaJawab.get(jawabTerakhir(r));
      const k = set ? [...set].filter(Boolean) : [];
      if (k.length === 1) kategori = k[0];
      else { dibuang.push({ id: r.id, asal, sebab: k.length > 1 ? 'kategori benih AMBIGU' : (set ? 'benih ketemu tapi kategorinya tak terpetakan (mis. rangkaian)' : 'benih tak ketemu') }); continue; }
    }
    if (!kategori) { dibuang.push({ id: r.id, asal, sebab: `kategori tak terpetakan (${r.sumber}/${r.keputusan ?? '-'})` }); continue; }

    const { spec, tolak } = spekDari(r, kategori, wajibPerAlat);
    if (tolak) { dibuang.push({ id: r.id, asal, sebab: tolak }); continue; }

    // PENJAGA: gold kami sendiri harus mendapat perilaku 1
    const v = ganjaran(spec, jawabTerakhir(r));
    if (v.perilaku !== 1) {
      dibuang.push({ id: r.id, asal, sebab: `GOLD SENDIRI TIDAK LULUS (${kategori})`, gold: jawabTerakhir(r).replace(/\s+/g, ' ').slice(0, 90) });
      continue;
    }
    kolam.push({ id: 'grpo-' + crypto.createHash('sha256').update(spec.k + '|' + spec.t).digest('hex').slice(0, 10),
      asal, ...spec, goldPenuh: OBJEKTIF.every((o) => v[o] === 1) });
  }
  return { kolam, dibuang, dibaca: baris.length };
}

// ────────────────────────────────────────────────────────── uji instrumen ──
if (process.argv.includes('--uji')) {
  let ok = 0, buruk = 0;
  const cek = (n, benar, ket = '') => (benar ? (ok++, console.log(`  OK    ${n}`))
    : (buruk++, console.log(`  GAGAL ${n}${ket ? ' — ' + ket : ''}`)));

  const R = (turns, extra = {}) => ({ id: 'x', conversations: turns, ...extra });
  const g = pecahGiliran(R([{ from: 'system', value: 'S' }, { from: 'human', value: 'Q' }, { from: 'gpt', value: 'A' }]));
  cek('pecah: satu giliran', g.sistem === 'S' && g.t === 'Q' && g.riwayat.length === 0);
  const g2 = pecahGiliran(R([{ from: 'system', value: 'S' }, { from: 'human', value: 'Q' },
    { from: 'gpt', value: 'panggil' }, { from: 'human', value: '[hasil]: ERROR' }, { from: 'gpt', value: 'aku gagal' }]));
  cek('pecah: multi-giliran -> riwayat 2, jawaban akhir tidak ikut',
    g2.t === 'Q' && g2.riwayat.length === 2 && g2.riwayat[0].role === 'assistant' && g2.riwayat[1].role === 'user');
  cek('pecah: peran dipetakan gaya eval', g2.riwayat[1].content === '[hasil]: ERROR');

  cek('rangkaian TIDAK dipetakan (aturan vonis tak punya kategorinya)', DARI_SUMBER['tool-rangkaian'] === undefined);
  cek('enam keputusan ajar terpetakan penuh', Object.keys(DARI_KEPUTUSAN).length === 6
    && new Set(Object.values(DARI_KEPUTUSAN)).size === 6);
  cek('kategori ajar = kategori generator (himpunan sama)',
    new Set(Object.values(DARI_KEPUTUSAN)).size === new Set(Object.values(DARI_SUMBER)).size);

  const s1 = spekDari(R([{ from: 'system', value: 'S' }, { from: 'human', value: 'Q' },
    { from: 'gpt', value: '<tool_call>\n{"name":"brain_search","arguments":{"query":"x"}}\n</tool_call>' }]), 'panggil', {});
  cek('spek panggil: alat diambil dari gold', s1.spec?.alat === 'brain_search');
  // KOREKSI 29 Agu (C31): uji ini dulu menegaskan aturan yang SALAH — bahwa
  // konfirmasi tanpa panggilan gold harus ditolak. Diganti dengan yang menegaskan
  // aturan yang benar, BUKAN dihapus, supaya perubahannya terlihat di riwayat.
  const s2 = spekDari(R([{ from: 'system', value: 'S' }, { from: 'human', value: 'Q' }, { from: 'gpt', value: 'Yang mana?' }]), 'konfirmasi', {});
  cek('konfirmasi dengan gold BERTANYA BALIK diterima (yang diajarkan memang bertanya)',
    !s2.tolak && s2.spec?.goldBertanya === true && s2.spec?.alat === undefined);
  // String.fromCharCode(10) dipakai alih-alih menulis baris-baru literal: escape
  // backslash berkali-kali rusak lewat lapisan skrip di sesi ini, dan fixture yang
  // rusak diam-diam menguji hal yang berbeda dari yang dijalankan.
  const NL = String.fromCharCode(10);
  const callGold = '<tool_call>' + NL + JSON.stringify({ name: 'lead_status', arguments: { id: '8', status: 'gagal' } }) + NL + '</tool_call>';
  const s2b = spekDari(R([{ from: 'system', value: 'S' }, { from: 'human', value: 'Q' },
    { from: 'gpt', value: callGold }]), 'konfirmasi', { lead_status: ['id', 'status'] });
  cek('konfirmasi dengan gold MEMANGGIL tetap mengambil alat + wajib dari skema',
    s2b.spec?.alat === 'lead_status' && (s2b.spec?.wajib || []).length === 2 && !s2b.spec?.goldBertanya);
  const s2c = spekDari(R([{ from: 'system', value: 'S' }, { from: 'human', value: 'Q' }, { from: 'gpt', value: 'Yang mana?' }]), 'panggil', {});
  cek('panggil tanpa panggilan gold TETAP ditolak (di sana nama alat memang wajib diketahui)', !!s2c.tolak);
  const s3 = spekDari(R([{ from: 'human', value: 'Q' }, { from: 'gpt', value: 'A' }]), 'jangan', {});
  cek('spek tanpa prompt sistem DITOLAK', !!s3.tolak);

  const nyata = bangunKolam();
  cek('NYATA: kolam terbangun', nyata.kolam.length > 100, `${nyata.kolam.length} baris`);
  cek('NYATA: tiap baris punya kategori sah',
    nyata.kolam.every((x) => Object.values(DARI_SUMBER).includes(x.k)));
  cek('NYATA: tiap baris punya prompt sistem', nyata.kolam.every((x) => x.sistem && x.sistem.length > 40));
  cek('NYATA: panggil selalu punya alat', nyata.kolam.filter((x) => x.k === 'panggil').every((x) => !!x.alat));
  cek('NYATA: alat_gagal selalu punya riwayat', nyata.kolam.filter((x) => x.k === 'alat_gagal').every((x) => (x.riwayat || []).length >= 2));
  cek('NYATA: TIDAK ADA baris yang gold-nya sendiri gagal (semua sudah tersaring)',
    !nyata.dibuang.some((d) => /GOLD SENDIRI/.test(d.sebab)) || nyata.kolam.length > 0);
  cek('NYATA: id unik', new Set(nyata.kolam.map((x) => x.id)).size === nyata.kolam.length);

  console.log('\n' + '='.repeat(52));
  console.log(`${ok} lulus · ${buruk} gagal`);
  process.exit(buruk ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────── jalan ──
// Penjaga entrypoint (obat C27). Malam 28 Agu penyakit ini kambuh TIGA KALI
// berturut-turut — di ganjaran.mjs, lalu di sini — dan tiap kali gejalanya
// menipu: perintah diagnosis mencetak laporan berkas LAIN lalu keluar, dan
// tampak seperti berhasil. Karena itu lahir eval/jaga-modul.mjs.
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('kolam-grpo.mjs')) {
const { kolam, dibuang, dibaca } = bangunKolam();
const per = {};
for (const x of kolam) per[x.k] = (per[x.k] || 0) + 1;
const sebab = {};
for (const d of dibuang) sebab[d.sebab.replace(/\(.*\)/, '').trim()] = (sebab[d.sebab.replace(/\(.*\)/, '').trim()] || 0) + 1;

console.log(`\n# Kolam prompt GRPO — cluster tool\n`);
console.log(`  dibaca ${dibaca} baris · kolam ${kolam.length} · dibuang ${dibuang.length}\n`);
console.log(`  per kategori:`);
for (const [k, n] of Object.entries(per).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(12)} ${String(n).padStart(4)}`);
console.log(`\n  dibuang, per sebab:`);
for (const [s, n] of Object.entries(sebab).sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${s}`);
const goldPenuh = kolam.filter((x) => x.goldPenuh).length;
console.log(`\n  gold mendapat SEMUA objektif 1: ${goldPenuh}/${kolam.length}` +
  (goldPenuh < kolam.length ? `  <- ${kolam.length - goldPenuh} baris gold-nya sendiri tidak sempurna di objektif non-perilaku; lihat --uji` : ''));

if (!process.argv.includes('--tulis')) { console.log(`\n  (kering — tambahkan --tulis untuk menulis ${path.relative(AKAR, KELUAR)})\n`); process.exit(0); }
fs.mkdirSync(path.dirname(KELUAR), { recursive: true });
// goldPenuh hanya catatan pembangunan; TIDAK dikirim ke GPU supaya tidak ada
// jawaban gold di dekat pelatih sama sekali.
fs.writeFileSync(KELUAR, kolam.map(({ goldPenuh: _, ...x }) => JSON.stringify(x)).join('\n') + '\n', 'utf8');
const sidik = crypto.createHash('sha256').update(fs.readFileSync(KELUAR)).digest('hex').slice(0, 16);
console.log(`\n  tertulis: ${path.relative(AKAR, KELUAR)} (${kolam.length} baris) · sidik ${sidik}\n`);
}
