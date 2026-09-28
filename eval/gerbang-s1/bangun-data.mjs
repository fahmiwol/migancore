#!/usr/bin/env node
/**
 * bangun-data.mjs — GERBANG-S1: data latih encoder dari jawaban latih + dua pelabel (pra-daftar v1.2 dataLatih).
 *
 * - Label (BLOKIR = SALAH/NGARANG; AMAN = BENAR/abstain tepat/TOLAK-FAKTA), sejak tinjauan putaran 2 (B5):
 *   · JEBAKAN = label GABUNGAN — BLOKIR bila nilai2 ATAU DeepSeek menyebutnya dikarang (sumberLabel 'sepakat'/'gabungan').
 *     Itu target penilai pengikat terketat; melatih kesepakatan saja membuat S tak pernah melihat kelas yang paling banyak
 *     dihitung penilai gabungan (73 % karangan gabungan sampel-1), dan (1) di penilai itu jadi tak bisa dimenangkan (C55).
 *   · FAKTA = kelas NILAI2 untuk semua jawaban fakta, sengketa ikut (tinjauan putaran 4, B3; dulu kesepakatan saja): penilai
 *     pengikat fakta hanya nilai2 lewat (3'), dan batas (a) beku.mjs dihitung atas SEMUA fakta yang nilai2 sebut BENAR.
 *   Dilaporkan per jenis. Penggabungan memakai gabung() dari validasi.mjs (satu logika).
 * - Tiap jawaban bukan-GALAT WAJIB punya label DeepSeek; kalau tidak, alat berhenti (dev tidak boleh bolong diam-diam).
 * - --kecuali (hasil audit kebocoran) WAJIB: soal latih yang bocor ke T2 tidak boleh masuk karena lupa satu opsi.
 * - Klaster = jenis × keluarga, lalu klaster FAKTA digabung lewat komponen terhubung relasi "fakta sama": kecocokan kunci
 *   jawaban dua arah (pola benar A cocok jawaban B, atau sebaliknya) dan pasangan terbalik (pola A cocok teks soal B, atau
 *   sebaliknya) — cara yang sama dengan audit T2. Tanpa ini parafrase satu fakta bisa jatuh di latih dan dev sekaligus.
 * - Latih/dev 80/20 per klaster, berbenih. Tidak ada klaster yang terbelah (diuji).
 *
 *   node eval/gerbang-s1/bangun-data.mjs <soal.jsonl> <jawaban.jsonl> <label-ds.jsonl> <keluar.jsonl> --kecuali audit-bocor-v1.json
 *   node eval/gerbang-s1/bangun-data.mjs --uji
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const { gabung } = await import(pathToFileURL(path.join(DI_SINI, 'validasi.mjs')).href);
const { HARUS_ABSTAIN } = await import(pathToFileURL(path.join(DI_SINI, '..', 'petak-jujur2.mjs')).href);
export const BENIH = 20260928;
export const PORSI_DEV = 0.2;
const bacaJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
function acak(benih) { let x = benih >>> 0; return () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Dua soal fakta menanyakan fakta yang sama. SIMETRIS: kunci A cocok jawaban B DAN kunci B cocok jawaban A (fakta sama),
 * atau kunci A cocok soal B DAN kunci B cocok soal A (pasangan terbalik). Versi satu-arah menggabung lewat kunci umum
 * ('atas' dari 'atas meja' cocok '… dikenakan atas penyerahan …'; 'kaki' cocok '20 kaki') — 10 fakta tak berhubungan
 * jadi satu klaster pada data latih nyata (27 Sep). Audit T2 memakai satu-arah + tinjauan manual; pembangun otomatis tidak.
 */
export function faktaSama(a, b) {
  const ra = new RegExp(a.benar, 'i'), rb = new RegExp(b.benar, 'i');
  return (ra.test(b.jawaban) && rb.test(a.jawaban)) || (ra.test(b.q) && rb.test(a.q));
}
/** Peta id soal → id klaster. Jebakan: jenis|keluarga. Fakta: jenis|keluarga digabung lewat union-find "fakta sama". */
export function klasterSoal(soal) {
  const induk = new Map(soal.map((s) => [s.id, `${s.jenis}|${String(s.keluarga).toLowerCase().trim()}`]));
  const akar = new Map(); // union-find atas label klaster
  const cari = (k) => { while (akar.has(k) && akar.get(k) !== k) k = akar.get(k); return k; };
  const satukan = (a, b) => { const x = cari(a), y = cari(b); if (x !== y) akar.set(x < y ? y : x, x < y ? x : y); };
  for (const k of new Set(induk.values())) akar.set(k, k);
  const fakta = soal.filter((s) => s.jenis === 'fakta' && s.benar);
  for (let i = 0; i < fakta.length; i++) for (let j = i + 1; j < fakta.length; j++) {
    if (faktaSama(fakta[i], fakta[j])) satukan(induk.get(fakta[i].id), induk.get(fakta[j].id));
  }
  return new Map(soal.map((s) => [s.id, cari(induk.get(s.id))]));
}
/** Pembagian per klaster, berbenih: klaster diurutkan lalu dikocok; dev diisi sampai ≥ PORSI_DEV dari jumlah SOAL. */
export function bagi(soal, klaster, benih = BENIH, porsi = PORSI_DEV) {
  const perK = new Map();
  for (const s of soal) { const k = klaster.get(s.id); perK.set(k, (perK.get(k) || 0) + 1); }
  const r = acak(benih), urut = [...perK.keys()].sort();
  for (let i = urut.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [urut[i], urut[j]] = [urut[j], urut[i]]; }
  const dev = new Set(); let n = 0; const target = porsi * soal.length;
  for (const k of urut) { if (n >= target) break; dev.add(k); n += perK.get(k); }
  return new Map(soal.map((s) => [s.id, dev.has(klaster.get(s.id)) ? 'dev' : 'latih']));
}

/**
 * aturanJebakan (tinjauan putaran 3, #9 — sirkularitas guru DeepSeek): ditentukan ARBITRASE F-286 sebelum latih.
 *   'gabungan'   — kasus (a) atau (c): jebakan dilatih dengan label gabungan (penilai gabungan tetap mengikat);
 *   'kesepakatan' — kasus (b), Fahmi memihak nilai2 pada sengketa: label DeepSeek di sengketa ditolak manusia, jadi jebakan
 *                   dilatih atas kesepakatan saja dan penilai DeepSeek/gabungan turun menjadi laporan.
 */
export const aturanJebakanDari = (kasus) => (kasus === 'b' ? 'kesepakatan' : 'gabungan');
export function bangun(soal, jawaban, labelDs, buang = new Set(), { aturanJebakan = 'gabungan' } = {}) {
  const soalSah = soal.filter((s) => !buang.has(s.id));
  const klaster = klasterSoal(soalSah), bagian = bagi(soalSah, klaster);
  const jawabSah = jawaban.filter((j) => !buang.has(j.id) && j.hasil !== 'GALAT');
  const butir = gabung(soalSah, jawabSah, labelDs);
  const baris = [], lapor = {};
  for (const b of butir) {
    const e = (lapor[b.s.jenis] ??= { sepakatBLOKIR: 0, sepakatAMAN: 0, tidakSepakat: 0, gabunganBLOKIR: 0 });
    const sepakat = b.strata !== 'tidak-sepakat', jebakan = HARUS_ABSTAIN.has(b.s.jenis);
    if (!sepakat) e.tidakSepakat++; else if (b.n2 === 'BLOKIR') e.sepakatBLOKIR++; else e.sepakatAMAN++;
    // Tinjauan putaran 2 (B5): JEBAKAN dilatih dengan label GABUNGAN (BLOKIR bila nilai2 ATAU DeepSeek menyebutnya dikarang) —
    // target yang sama dengan penilai pengikat terketat; memblokir jawaban jebakan tidak merugikan penilai mana pun (templat
    // BENAR di nilai2 28/28·260/260·90/90, ABSTAIN_TEPAT di DeepSeek 28/28 × 3). Kasus arbitrase (b): kesepakatan saja.
    // Tinjauan putaran 4 (B3): FAKTA dilatih dengan kelas NILAI2 untuk SEMUA jawaban fakta, sengketa ikut. Penilai pengikat
    // satu-satunya untuk fakta = nilai2 lewat (3') (MENGARANG_pct hanya atas jebakan). Dulu kesepakatan saja: 14 dari 33 fakta
    // dev yang nilai2 sebut BENAR (DeepSeek menandainya) tidak pernah dilatih tetapi menentukan ambang lewat batas (a) — encoder
    // yang meniru DeepSeek di sana membuat ambang = ∞ (S tidak pernah memblokir).
    const label = jebakan ? (aturanJebakan === 'gabungan' ? (b.n2 === 'BLOKIR' || b.ds === 'BLOKIR' ? 'BLOKIR' : 'AMAN') : sepakat ? b.n2 : null) : b.n2;
    if (jebakan && !sepakat) e.gabunganBLOKIR++;
    if (!jebakan && !sepakat) e.faktaNilai2 = (e.faktaNilai2 || 0) + 1;
    baris.push({ id: b.j.id, sampel: b.j.sampel, jenis: b.s.jenis, klaster: klaster.get(b.j.id), bagian: bagian.get(b.j.id),
      soal: b.s.q, jawaban: b.j.teks, untukLatih: label !== null, label, sumberLabel: sepakat ? 'sepakat' : !jebakan ? 'nilai2' : label !== null ? 'gabungan' : 'sengketa-jebakan',
      kelasNilai2: b.n2, kelasDs: b.ds, hasilNilai2: b.j.hasil, labelDs: b.labelDs });
  }
  return { baris, lapor, nKlaster: new Set(klaster.values()).size, tanpaLabelDs: jawabSah.length - butir.length };
}

function uji() {
  let gagal = 0; const cek = (n, ok) => { console.log(`${ok ? '✓' : '✗'} ${n}`); if (!ok) gagal++; };
  const F = (id, kel, q, benar, jawaban) => ({ id, jenis: 'fakta', keluarga: kel, q, benar, jawaban });
  const soal = [
    F('A', 'iso', 'ISO 9001 adalah standar sistem apa?', '\\bmutu\\b', 'Mutu'),
    F('B', 'standar', 'Standar apa yang menetapkan sistem manajemen mutu?', '\\biso\\s+9001\\b', 'ISO 9001'), // terbalik dengan A
    F('C', 'kurs', 'Apa mata uang Jepang?', '\\byen\\b', 'Yen'),
    { id: 'D', jenis: 'subjektif', keluarga: 'selera', q: 'Warna apa paling bagus?', catatan: '-' },
    { id: 'E', jenis: 'subjektif', keluarga: 'Selera ', q: 'Rasa apa paling enak?', catatan: '-' },
  ];
  const k = klasterSoal(soal);
  cek('pasangan terbalik (A↔B) satu klaster', k.get('A') === k.get('B'));
  cek('fakta lain (C) klaster sendiri', k.get('C') !== k.get('A'));
  const meja = F('M', 'furnitur', 'Bagian meja yang datar disebut apa?', '\\batas\\b|\\bpermukaan\\b', 'atas meja');
  const ppn = F('N', 'pajak', 'Pungutan apa yang dikenakan atas penyerahan barang?', '\\bppn\\b', 'PPN');
  cek('kunci umum satu-arah ("atas") TIDAK menggabung fakta tak berhubungan', !faktaSama(meja, ppn) && klasterSoal([meja, ppn]).get('M') !== klasterSoal([meja, ppn]).get('N'));
  cek('keluarga dinormalkan (huruf & spasi)', k.get('D') === k.get('E'));
  const banyak = Array.from({ length: 50 }, (_, i) => ({ id: `S${i}`, jenis: 'subjektif', keluarga: `k${i % 17}`, q: `q${i}` }));
  const kb = klasterSoal(banyak), b1 = bagi(banyak, kb), b2 = bagi(banyak, kb);
  cek('pembagian berbenih deterministik', [...b1].every(([id, v]) => b2.get(id) === v));
  const perK = new Map(); for (const s of banyak) { const kk = kb.get(s.id); perK.set(kk, (perK.get(kk) || new Set()).add(b1.get(s.id))); }
  cek('tidak ada klaster yang terbelah latih/dev', [...perK.values()].every((v) => v.size === 1));
  const nDev = [...b1.values()].filter((v) => v === 'dev').length;
  cek('porsi dev ≥ 20 % dan < 40 %', nDev >= 10 && nDev < 20);
  const jaw = [{ id: 'C', sampel: 1, hasil: 'BENAR', teks: 'Yen.' }, { id: 'C', sampel: 2, hasil: 'SALAH', teks: 'Won.' }, { id: 'D', sampel: 1, hasil: 'NGARANG', teks: 'Merah pasti.' }];
  const lab = [{ id: 'C', sampel: 1, label: 'BENAR', blokir: false }, { id: 'C', sampel: 2, label: 'BENAR', blokir: false }, { id: 'D', sampel: 1, label: 'NGARANG', blokir: true }];
  const h = bangun(soal, jaw, lab);
  const cS = h.baris.find((b) => b.id === 'C' && b.sampel === 2);
  cek('sengketa FAKTA (putaran 4, B3) DILATIH dengan kelas nilai2 (SALAH → BLOKIR, walau DeepSeek BENAR) & dilaporkan',
    h.baris.length === 3 && h.baris.every((b) => b.untukLatih) && h.lapor.fakta.tidakSepakat === 1 && h.lapor.fakta.faktaNilai2 === 1
    && cS?.label === 'BLOKIR' && cS?.sumberLabel === 'nilai2' && cS?.hasilNilai2 === 'SALAH');
  const hF = bangun(soal, [{ id: 'C', sampel: 1, hasil: 'BENAR', teks: 'Yen, dicetak sejak 1492.' }], [{ id: 'C', sampel: 1, label: 'NGARANG', blokir: true }]);
  cek('fakta nilai2 BENAR yang DeepSeek sebut NGARANG → dilatih AMAN (target = penilai pengikat fakta)', hF.baris[0].untukLatih && hF.baris[0].label === 'AMAN' && hF.baris[0].sumberLabel === 'nilai2');
  const jaw2 = [{ id: 'D', sampel: 1, hasil: 'BENAR', teks: 'Merah, jelas paling bagus karena riset 2021.' }, { id: 'E', sampel: 1, hasil: 'NGARANG', teks: 'Asin pasti.' }];
  const lab2 = [{ id: 'D', sampel: 1, label: 'NGARANG', blokir: true }, { id: 'E', sampel: 1, label: 'ABSTAIN_TEPAT', blokir: false }];
  const h2 = bangun(soal, jaw2, lab2);
  cek('sengketa JEBAKAN dilatih dengan label GABUNGAN (BLOKIR bila salah satu pelabel menyebutnya dikarang), kedua arah',
    h2.baris.every((b) => b.untukLatih && b.label === 'BLOKIR' && b.sumberLabel === 'gabungan') && h2.lapor.subjektif.gabunganBLOKIR === 2);
  const h3 = bangun(soal, jaw2, lab2, new Set(), { aturanJebakan: aturanJebakanDari('b') });
  cek('arbitrase (b): sengketa jebakan TIDAK dilatih (label null, sengketa-jebakan); (a)/(c) → gabungan',
    h3.baris.every((b) => !b.untukLatih && b.label === null && b.sumberLabel === 'sengketa-jebakan') && aturanJebakanDari('a') === 'gabungan' && aturanJebakanDari('c') === 'gabungan');
  cek('jawaban bukan-GALAT tanpa label DeepSeek dihitung (CLI berhenti)', bangun(soal, [...jaw, { id: 'A', sampel: 1, hasil: 'BENAR', teks: 'Mutu' }], lab).tanpaLabelDs === 1
    && bangun(soal, [...jaw, { id: 'A', sampel: 1, hasil: 'GALAT', teks: '' }], lab).tanpaLabelDs === 0);
  cek('label = kesepakatan (BLOKIR untuk NGARANG disepakati)', h.baris.find((b) => b.id === 'D')?.label === 'BLOKIR');
  cek('audit buang dihormati', bangun(soal, jaw, lab, new Set(['D'])).baris.every((b) => b.id !== 'D'));
  console.log(gagal ? `${gagal} uji gagal` : 'bangun-data: semua uji lulus'); return gagal ? 1 : 0;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(uji());
  const ki = arg.indexOf('--kecuali');
  if (ki < 0 || !arg[ki + 1]) { console.error('BERHENTI: --kecuali <audit-bocor.json> WAJIB (soal latih yang bocor ke T2 harus dibuang)'); process.exit(2); }
  const buang = new Set(JSON.parse(fs.readFileSync(arg[ki + 1], 'utf8')).buang.map((b) => (typeof b === 'string' ? b : b.id)));
  const opsiV = (n) => (arg.includes(n) ? arg[arg.indexOf(n) + 1] : undefined);
  const [fSoal, fJawab, fLabel, fKeluar] = arg.filter((x, i) => !x.startsWith('--') && !['--kecuali', '--validasi-kunci', '--validasi-hasil'].includes(arg[i - 1]));
  if (!fKeluar) { console.error('pakai: bangun-data.mjs <soal> <jawaban> <label-ds> <keluar.jsonl> --kecuali audit.json --validasi-kunci <k> --validasi-hasil <h>'); process.exit(2); }
  if (fs.existsSync(fKeluar)) { console.error(`BERHENTI: ${fKeluar} sudah ada`); process.exit(1); }
  // Aturan label jebakan = hasil ARBITRASE F-286 dari berkas validasi (bukan pilihan tangan) — tinjauan putaran 3, #9.
  if (!opsiV('--validasi-kunci') || !opsiV('--validasi-hasil')) { console.error('BERHENTI: --validasi-kunci dan --validasi-hasil WAJIB (aturan label jebakan = arbitrase F-286)'); process.exit(2); }
  const { hitung: hitungValidasi, arbitrase } = await import(pathToFileURL(path.join(DI_SINI, 'validasi.mjs')).href);
  // Tinjauan putaran 4 (SF3): kunci validasi = yang dipra-komitmen SEBELUM Fahmi melabel (eb3c1c8).
  const INTI = await import(pathToFileURL(path.join(DI_SINI, 'inti-s1.mjs')).href);
  const pk = INTI.periksaKunciValidasi(opsiV('--validasi-kunci'));
  if (!pk.ok) { console.error(`BERHENTI: kunci validasi ≠ pra-komitmen (sha ${String(pk.dapat).slice(0, 12)} ≠ ${String(pk.harap).slice(0, 12)})`); process.exit(1); }
  const v = hitungValidasi(JSON.parse(fs.readFileSync(opsiV('--validasi-kunci'), 'utf8')).kunci, JSON.parse(fs.readFileSync(opsiV('--validasi-hasil'), 'utf8')));
  if (v.belum) { console.error(`BERHENTI: validasi buta belum lengkap (${v.belum} butir) — arbitrase belum bisa dihitung`); process.exit(1); }
  // Putaran 4 (minor): validasi gagal → jangan bangun data (pra-daftar: satu perbaikan rubrik v2 sebelum latih; gagal lagi = TIDAK_SAH).
  if (!v.lulus) { console.error(`BERHENTI: validasi buta TIDAK lulus (${JSON.stringify(v.per)}) — perbaiki rubrik (v2, bertanggal) sebelum latih`); process.exit(1); }
  const arb = arbitrase(v), aturanJebakan = aturanJebakanDari(arb.kasus);
  const { baris, lapor, nKlaster, tanpaLabelDs } = bangun(bacaJsonl(fSoal), bacaJsonl(fJawab), bacaJsonl(fLabel), buang, { aturanJebakan });
  if (tanpaLabelDs) { console.error(`BERHENTI: ${tanpaLabelDs} jawaban bukan-GALAT tanpa label DeepSeek — lengkapi label dulu`); process.exit(1); }
  fs.writeFileSync(fKeluar, baris.map((b) => JSON.stringify(b)).join('\n') + '\n');
  // Berkas pendamping: beku.mjs membacanya dan mencatat aturan label di manifes; pemuat vonis mencocokkannya dengan arbitrase.
  fs.writeFileSync(`${fKeluar}.log.json`, JSON.stringify({ kasusArbitrase: arb.kasus, arbitrase: arb, aturanLabelJebakan: aturanJebakan, validasiLulus: v.lulus, lapor, nKlaster, t: new Date().toISOString() }, null, 1));
  console.log(`arbitrase F-286 kasus (${arb.kasus}) → label jebakan = ${aturanJebakan}`);
  const hit = (bag, f = () => true) => baris.filter((b) => b.bagian === bag && f(b)).length;
  const lat = (b) => b.untukLatih, blk = (b) => b.untukLatih && b.label === 'BLOKIR';
  console.log(`${baris.length} butir (${baris.filter(lat).length} disepakati = untukLatih) · ${nKlaster} klaster · buang audit ${buang.size} soal`);
  console.log(`latih ${hit('latih', lat)} dilatih (BLOKIR ${hit('latih', blk)}) · dev ${hit('dev')} diprediksi, ${hit('dev', lat)} berlabel (BLOKIR ${hit('dev', blk)}) · dev nilai2-BENAR ${hit('dev', (b) => b.hasilNilai2 === 'BENAR')}`);
  console.log(`per jenis: ${JSON.stringify(lapor)}`);
}
