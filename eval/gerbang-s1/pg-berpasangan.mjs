#!/usr/bin/env node
/**
 * pg-berpasangan.mjs — GERBANG-S1 T1: lengan P (base polos) dan G (base + gerbang GERBANG-ON) BERPASANGAN, hari
 * yang sama, urutan dibalik tiap pasangan. Pra-daftar: flywheel/PRA-DAFTAR-GERBANG-S1.json. TIDAK menghitung vonis
 * (itu vonis-s1.mjs, sekali, sesudah encoder beku dan AUDIT-UJI).
 *
 * Kenapa bukan eval/ukur-jujur2-berpasangan.mjs apa adanya:
 *   - ia menulis eval/HASIL-GERBANG-ON-<stempel>.json, dan statusKelahiran() (eval/ambang-bibit.mjs) membaca berkas
 *     TERBARU dengan pola itu sebagai "0.14 + gerbang" → run base S1 akan diam-diam mencemari status MAKSARA;
 *   - vonis mekanisnya memakai ambang GERBANG-ON, bukan S1.
 * Yang DIPAKAI ulang apa adanya (hanya diimpor): satuPutaran/rangkum/tanyaPolos (ukur-jujur2, terpatok D1), probe
 * (probe-keterjawaban, terpatok D1), gerbang (sistem/gerbang-jebakan, terpatok D1), buatTanyaBergerbang
 * (ukur-jujur2-gerbang; transport arahannya diseragamkan ke ALIRAN 27 Sep — badan sama dengan P selain pesan sistem).
 *
 *   OLLAMA_HOST=http://127.0.0.1:11434 ALIRAN=1 BATAS=1260 node eval/gerbang-s1/pg-berpasangan.mjs --pasangan 16
 *   ... --asap          # 3 soal, 1 pasangan, berkas berlabel asap (tidak dihitung)
 *   node eval/gerbang-s1/pg-berpasangan.mjs --uji
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..', '..');
const imp = (p) => import(pathToFileURL(path.join(AKAR, p)).href);
const U = await imp('eval/ukur-jujur2.mjs');
const { PUBLIK } = await imp('eval/petak-jujur2.mjs');
const { probe } = await imp('eval/probe-keterjawaban.mjs');
const { pencatatJsonl } = await imp('sistem/gerbang-jebakan.mjs');
const { buatTanyaBergerbang, badanDenganSistem } = await imp('eval/ukur-jujur2-gerbang.mjs');

const INTI = await import(pathToFileURL(path.join(DI_SINI, 'inti-s1.mjs')).href);
export const MODEL = 'qwen3:4b-instruct-2507-q4_K_M';
export const PROBE = 'migancore:0.4-qwen3';
// Satu sumber (dulu disalin di sini): pin digest, inventaris T1 (sha256 baris 'id TAB q' 36 soal PUBLIK) dan fungsinya.
export const { DIGEST_PIN, INVENTARIS_T1, inventaris } = INTI;
/**
 * Asap (tinjauan putaran 2, S4): 1 fakta + 3 jebakan berjenis berbeda, supaya jalur ARAHAN G ikut teruji (dulu 3 soal
 * pertama = 3 fakta → arahan tak pernah jalan). Pemuat vonis menuntut ≥ 1 baris G asap dengan tindakan gerbang ≠ 'jawab'.
 */
export const petakAsap = (petak) => {
  const fakta = petak.filter((s) => s.jenis === 'fakta').slice(0, 1), jenis = new Set(), jeb = [];
  for (const s of petak) if (s.jenis !== 'fakta' && !jenis.has(s.jenis) && jeb.length < 3) { jenis.add(s.jenis); jeb.push(s); }
  return [...fakta, ...jeb];
};
/** Pasangan ganjil: P dulu; genap: G dulu (membatalkan hanyutan mesin). */
export const urutan = (p) => (p % 2 === 1 ? ['P', 'G'] : ['G', 'P']);
/** Bungkus fungsi tanya: catat milidetik per soal (ujung-ke-ujung giliran), tanpa menyentuh berkas terpatok. */
export function berwaktu(tanya, peta) {
  return async (model, teks) => { const t0 = Date.now(); const j = await tanya(model, teks); peta.set(teks, Date.now() - t0); return j; };
}
export const namaHasil = (lengan, p, stempel, asap = false) => `s1-${lengan}-p${String(p).padStart(2, '0')}-${stempel}${asap ? '-asap' : ''}.json`;

const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
async function digest(nama) {
  try { const j = await (await fetch(`${OLLAMA}/api/tags`)).json(); return j.models?.find((m) => m.name === nama)?.digest ?? null; } catch { return null; }
}
/** Tinjauan putaran 4 (B2): /api/tags bisa sehat sementara generasi gagal cepat (HTTP 500) → uji satu token sungguhan. */
async function bisaMenjawab(nama) {
  try {
    const r = await fetch(`${OLLAMA}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: nama, prompt: '1+1=', stream: false, options: { num_predict: 1, temperature: 0 } }), signal: AbortSignal.timeout(180e3) });
    if (!r.ok) return false;
    return typeof (await r.json()).response === 'string';
  } catch { return false; }
}
/**
 * Tinjauan putaran 4 (B2): hanya run yang LENGKAP dan SAH yang menulis s1-selesai. Semua alasan lain — pasangan sah kurang dari
 * target sesudah maks pasangan, digest model/probe di akhir tidak sah — dicatat sebagai s1-berhenti (boleh diulang). Semua
 * alasan ini buta hasil: hanya GALAT dan digest, tidak ada laju karangan.
 */
export function sebabBerhenti({ pasanganSah, target, dAkhir, pAkhir, pAwal, digestPin }) {
  if (pasanganSah.length < target) return `hanya ${pasanganSah.length} pasangan sah (target ${target}) — run tidak lengkap karena GALAT`;
  if (dAkhir !== digestPin) return `digest model di akhir run (${dAkhir}) ≠ pin`;
  if (!pAkhir || pAkhir !== pAwal) return `digest probe di akhir run (${pAkhir}) ≠ awal (${pAwal})`;
  return null;
}
/** Dua pasangan tidak sah berturut-turut = gangguan sistematis → berhenti sebelum anggaran 20 pasangan habis. */
export const beruntunTidakSah = (riwayatSah) => riwayatSah.length >= 2 && riwayatSah.slice(-2).every((x) => !x);

async function uji() {
  let gagal = 0; const cek = (n, ok, info = '') => { console.log(`${ok ? '✓' : '✗'} ${n}${ok ? '' : `  ← ${info}`}`); if (!ok) gagal++; };
  cek('inventaris T1 = hash beku pra-daftar v1.2', inventaris(PUBLIK) === INVENTARIS_T1, inventaris(PUBLIK));
  cek('urutan dibalik tiap pasangan', urutan(1).join() === 'P,G' && urutan(2).join() === 'G,P' && urutan(15).join() === 'P,G');
  const pa = petakAsap(PUBLIK);
  cek('petak asap: 1 fakta + 3 jebakan berjenis berbeda', pa.length === 4 && pa.filter((s) => s.jenis === 'fakta').length === 1 && new Set(pa.filter((s) => s.jenis !== 'fakta').map((s) => s.jenis)).size === 3);
  const peta = new Map();
  const f = berwaktu(async () => { await new Promise((r) => setTimeout(r, 30)); return { ok: true, teks: 'x' }; }, peta);
  await f('m', 'soal-a');
  cek('berwaktu mencatat ms per soal', peta.get('soal-a') >= 25, String(peta.get('soal-a')));
  // Badan P vs G (berarahan) setara selain pesan sistem — diuji dengan fetch tiruan.
  let tangkap = null; const asli = globalThis.fetch;
  globalThis.fetch = async (u, o) => { tangkap = JSON.parse(o.body); throw new Error('henti'); };
  await U.tanyaPolos(MODEL, 'halo'); const bp = tangkap;
  globalThis.fetch = asli;
  const bs = badanDenganSistem(MODEL, 'halo', 'ARAHAN');
  const tanpa = (o) => { const c = { ...o }; delete c.messages; return JSON.stringify(c); };
  cek('badan G = badan P + satu pesan sistem (transport & sampler sama)', tanpa(bp) === tanpa(bs) && bs.messages[0].role === 'system' && bs.messages[1].content === bp.messages[0].content, `${tanpa(bp)} vs ${tanpa(bs)}`);
  const pin = 'd'.repeat(64);
  cek('keputusan akhir (B2 putaran 4): 16 sah + digest sah → selesai; 15 sah / digest model beda / probe null → berhenti',
    sebabBerhenti({ pasanganSah: Array(16).fill(1), target: 16, dAkhir: pin, pAkhir: 'p', pAwal: 'p', digestPin: pin }) === null
    && /tidak lengkap/.test(sebabBerhenti({ pasanganSah: Array(15).fill(1), target: 16, dAkhir: pin, pAkhir: 'p', pAwal: 'p', digestPin: pin }))
    && /digest model/.test(sebabBerhenti({ pasanganSah: Array(16).fill(1), target: 16, dAkhir: null, pAkhir: 'p', pAwal: 'p', digestPin: pin }))
    && /digest probe/.test(sebabBerhenti({ pasanganSah: Array(16).fill(1), target: 16, dAkhir: pin, pAkhir: null, pAwal: 'p', digestPin: pin })));
  cek('dua pasangan tidak sah berturut-turut → berhenti; tidak sah berselang → lanjut',
    beruntunTidakSah([true, false, false]) && !beruntunTidakSah([false, true, false]) && !beruntunTidakSah([false]));
  const n = namaHasil('G', 3, '2026-09-28T00-00-00');
  cek('nama berkas: per lengan & pasangan, bukan pola HASIL-GERBANG-ON / hasil-jujur2-*', n === 's1-G-p03-2026-09-28T00-00-00.json' && !/^HASIL-GERBANG-ON|^hasil-jujur2-/.test(n));
  console.log(gagal ? `${gagal} uji gagal` : 'pg-berpasangan: semua uji lulus'); return gagal ? 1 : 0;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(await uji());
  const asap = arg.includes('--asap');
  // Aturan berhenti v1.3 (tinjauan putaran 2, S5): jalan sampai 16 pasangan SAH atau 20 pasangan (inti-s1 pilihPasanganSah).
  const target = asap ? 1 : INTI.PASANGAN_WAJIB, maks = asap ? 1 : INTI.PASANGAN_MAKS;
  const keluar = path.join(DI_SINI, 'hasil-uji');
  if (!U.ALIRAN || U.BATAS_DETIK !== 1260) { console.error(`BERHENTI: badan harus = SB1-Q3 (ALIRAN=1 BATAS=1260); dapat ALIRAN=${U.ALIRAN} BATAS=${U.BATAS_DETIK}`); process.exit(1); }
  if (inventaris(PUBLIK) !== INVENTARIS_T1) { console.error('BERHENTI: inventaris T1 ≠ hash beku'); process.exit(1); }
  const dAwal = await digest(MODEL), pAwal = await digest(PROBE);
  if (dAwal !== DIGEST_PIN) { console.error(`BERHENTI: digest ${MODEL} ${dAwal} ≠ pin ${DIGEST_PIN}`); process.exit(1); }
  if (!pAwal) { console.error(`BERHENTI: probe ${PROBE} tidak ada di ${OLLAMA}`); process.exit(1); }
  const petak = asap ? petakAsap(PUBLIK) : PUBLIK;
  const stempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  fs.mkdirSync(keluar, { recursive: true });
  // Tinjauan putaran 3 (B3, #4): sebelum asap MAUPUN run utama — pra-daftar dikunci & dipatok, kode yang akan berjalan = kode
  // beku (ketahuan SEBELUM 20 jam run, bukan sesudahnya). Run utama juga menuntut asap sah sesudah patok dan belum ada run
  // utama yang selesai sesudah patok (hanya run PERTAMA yang dinilai).
  {
    const tolak = (x) => { console.error(`BERHENTI (pra-periksa): ${x}`); process.exit(1); };
    const fPd = path.join(AKAR, 'flywheel', 'PRA-DAFTAR-GERBANG-S1.json'), fBeku = path.join(DI_SINI, 'beku-v1.json');
    if (!fs.existsSync(fPd) || !fs.existsSync(fBeku)) tolak('pra-daftar atau beku-v1.json tidak ada di arsip commit kunci');
    const pd = JSON.parse(fs.readFileSync(fPd, 'utf8')), pin = pd.kunciPascaBeku, beku = JSON.parse(fs.readFileSync(fBeku, 'utf8'));
    if (!INTI.isoUtc(pd.dikunci) || !pin || !INTI.isoUtc(pin.ditulis)) tolak('pra-daftar belum dikunci/dipatok (dikunci & kunciPascaBeku.ditulis = ISO UTC)');
    if (INTI.shaTeks(fBeku) !== pin.sha256Manifes) tolak('beku-v1.json ≠ sha yang dipatok');
    const beda = INTI.bedaKode(INTI.penutupanKode(), beku.sha256Kode);
    if (beda.length) tolak(`kode di mesin ini ≠ kode beku (${beda.slice(0, 3).join(', ')}) — pakai git archive <commitKunci>`);
    if (INTI.sidikKode(beku.sha256Kode) !== pd.kunciAwal?.sha256Kode) tolak('kode beku ≠ kode saat pra-daftar DIKUNCI (kunciAwal.sha256Kode) — aturan berubah sesudah kunci');
    if (!asap) {
      const a = INTI.periksaAsap(keluar, { sesudahIso: pin.ditulis, kodeBeku: beku.sha256Kode });
      if (!a.stempel || a.masalah.length) tolak(`asap belum sah: ${a.masalah.join('; ')}`);
      const selesai = fs.readdirSync(keluar).map((f) => f.match(/^s1-selesai-(.+)\.json$/)).filter((m) => m && !m[1].endsWith('-asap'))
        .map((m) => m[1]).filter((s) => Date.parse(INTI.stempelKeIso(s)) > Date.parse(pin.ditulis));
      if (selesai.length) tolak(`sudah ada run utama SELESAI sesudah patok (${selesai.join(', ')}) — hanya run pertama yang dinilai`);
    }
  }
  // Tinjauan putaran 3 (B1): GALAT transport kembali dalam milidetik dan bisa menghabiskan anggaran 20 pasangan dalam sedetik.
  // Sebelum tiap pasangan dan di akhir: tunggu sampai digest model & probe sehat (≤ 60 menit). Bila tidak pulih, run BERHENTI
  // TANPA s1-selesai dan menulis s1-berhenti-<stempel> (alasan infrastruktur) — pra-daftar mengizinkan run seperti itu diulang.
  const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
  const sehat = async () => (await digest(MODEL)) === DIGEST_PIN && (await digest(PROBE)) === pAwal && (await bisaMenjawab(MODEL));
  const tungguSehat = async (menit = 60) => { const batas = Date.now() + menit * 60e3; while (Date.now() < batas) { if (await sehat()) return true; await tidur(30e3); } return false; };
  const berhenti = (sebab) => {
    fs.writeFileSync(path.join(keluar, `s1-berhenti-${stempel}${asap ? '-asap' : ''}.json`), JSON.stringify({ stempel, sebab, t: new Date().toISOString() }, null, 1));
    console.error(`BERHENTI: ${sebab} — run dihentikan TANPA s1-selesai (alasan infrastruktur tercatat; boleh diulang)`); process.exit(3);
  };
  const telemetri = path.join(keluar, `s1-telemetri-G-${stempel}${asap ? '-asap' : ''}.jsonl`);
  console.log(`# GERBANG-S1 P/G — ${MODEL} (digest pin ✓) · probe ${PROBE} ${pAwal.slice(0, 12)} · ${petak.length} soal · sampai ${target} pasangan sah (maks ${maks}) · ${OLLAMA}`);

  // Pra-lintasan probe: sekali per soal (probe suhu 0, deterministik — sama dengan GERBANG-ON); ms-nya = latensi keputusan G.
  // Tinjauan adversarial 28 Sep #8: probe yang gagal membuat G fail-open (G menjawab tanpa gerbang → G melemah → S diuntungkan).
  // Ulang ≤ 3 kali per soal; bila masih ada yang gagal, run TIDAK dimulai. ms = percobaan terakhir; jumlah percobaan dicatat.
  const cache = new Map(), msProbe = new Map(), cobaProbe = new Map();
  for (const s of petak) {
    let h = null, ms = null, coba = 0;
    while (coba < 3 && !h?.ok) { coba++; const t0 = Date.now(); h = await probe(PROBE, s.q); ms = Date.now() - t0; }
    cache.set(s.q, h); msProbe.set(s.q, ms); cobaProbe.set(s.q, coba);
  }
  const probeCached = async (q) => cache.get(q) ?? probe(PROBE, q);
  const lintas = petak.map((s) => ({ id: s.id, label: cache.get(s.q)?.jenis ?? null, ok: Boolean(cache.get(s.q)?.ok), ms: msProbe.get(s.q), coba: cobaProbe.get(s.q), sebab: cache.get(s.q)?.ok ? undefined : cache.get(s.q)?.sebab }));
  fs.writeFileSync(path.join(keluar, `s1-pralintas-probe-${stempel}${asap ? '-asap' : ''}.json`), JSON.stringify({ stempel, probe: PROBE, digestProbe: pAwal, lintas }, null, 1));
  console.log(`# pra-lintasan probe: ${lintas.filter((x) => x.ok).length}/${petak.length} berlabel · median ${[...msProbe.values()].sort((a, b) => a - b)[Math.floor(petak.length / 2)]} ms · diulang ${lintas.filter((x) => x.coba > 1).length} soal`);
  const gagalProbe = lintas.filter((x) => !x.ok);
  if (gagalProbe.length) { console.error(`BERHENTI: probe gagal pada ${gagalProbe.length} soal sesudah 3 percobaan (${gagalProbe.map((x) => `${x.id}: ${x.sebab}`).join('; ')}) — G tidak boleh fail-open; periksa Bmax lalu jalankan ulang`); process.exit(1); }

  const jalankan = async (lengan) => {
    const ms = new Map(), keputusan = new Map();
    const tanya = lengan === 'P' ? berwaktu(U.tanyaPolos, ms)
      : berwaktu(buatTanyaBergerbang({ modelProbe: PROBE, moda: 'on', catat: pencatatJsonl(telemetri), simpan: (q, k) => keputusan.set(q, k), probeFn: probeCached }), ms);
    const baris = await U.satuPutaran(MODEL, petak, tanya);
    for (const b of baris) { b.ms = ms.get(b.soal.q) ?? null; if (lengan === 'G') b.gerbang = keputusan.get(b.soal.q) || null; }
    return { baris, r: U.rangkum(baris) };
  };
  const pasanganSah = [], pasanganTidakSah = [], riwayatSah = [];
  for (let p = 1; pasanganSah.length < target && p <= maks; p++) {
    if (!(await tungguSehat())) berhenti(`Ollama/digest tidak sehat 60 menit sebelum pasangan ${p}`);
    const t0 = Date.now(), hasil = {};
    for (const lengan of urutan(p)) hasil[lengan] = await jalankan(lengan);
    for (const lengan of ['P', 'G']) {
      fs.writeFileSync(path.join(keluar, namaHasil(lengan, p, stempel, asap)), JSON.stringify({
        praDaftar: 'flywheel/PRA-DAFTAR-GERBANG-S1.json', lengan, putaran: p, urutan: urutan(p).join('→'), stempel, model: MODEL, digestModel: dAwal,
        probe: lengan === 'G' ? { model: PROBE, digest: pAwal, moda: 'on', telemetri: path.basename(telemetri) } : null,
        petak: petak.length, inventarisT1: inventaris(petak), aliran: U.ALIRAN, batasDetik: U.BATAS_DETIK, pikir: U.PIKIR === false ? 'off' : 'bawaan',
        baris: hasil[lengan].baris, rangkuman: hasil[lengan].r,
      }, null, 1));
    }
    // Keabsahan pasangan = fungsi yang SAMA dengan pemuat vonis. Laju karangan TIDAK dicetak (tinjauan putaran 2, S6: tidak
    // ada godaan mengulang run sesudah mengintip); hanya keabsahan dan jumlah GALAT.
    const sah = INTI.putaranSah(hasil.P.baris) && INTI.putaranSah(hasil.G.baris);
    (sah ? pasanganSah : pasanganTidakSah).push(p);
    riwayatSah.push(sah);
    const galat = (l) => hasil[l].baris.filter((b) => b.hasil === 'GALAT').length;
    console.log(`pasangan ${p} (${urutan(p).join('→')}) ${sah ? 'SAH' : 'TIDAK SAH'} · GALAT P ${galat('P')} G ${galat('G')} · sah ${pasanganSah.length}/${target} · ${Math.round((Date.now() - t0) / 1000)}s`);
    if (beruntunTidakSah(riwayatSah)) berhenti(`dua pasangan tidak sah berturut-turut (sampai pasangan ${p}) — gangguan sistematis`);
  }
  if (!(await tungguSehat())) berhenti('Ollama/digest tidak sehat 60 menit di akhir run');
  const dAkhir = await digest(MODEL), pAkhir = await digest(PROBE);
  // Tinjauan putaran 4 (B2): hanya run LENGKAP & SAH yang menulis s1-selesai; selain itu berhenti (buta hasil, boleh diulang).
  const sebab = sebabBerhenti({ pasanganSah, target, dAkhir, pAkhir, pAwal, digestPin: DIGEST_PIN });
  if (sebab) berhenti(sebab);
  // Asal-usul (tinjauan putaran 2, S7): sidik kode yang BENAR-BENAR berjalan di mesin ini (penutupan transitif, CRLF dinormalkan).
  // Putaran 4 (SF9): sha tiap berkas putaran run ini + sha pra-daftar arsip (bukti run berjalan dari arsip YANG SUDAH dipatok).
  const shaPutaran = Object.fromEntries(fs.readdirSync(keluar).filter((f) => new RegExp(`^s1-[PG]-p\\d{2}-${stempel}${asap ? '-asap' : ''}\\.json$`).test(f)).sort().map((f) => [f, INTI.shaTeks(path.join(keluar, f))]));
  fs.writeFileSync(path.join(keluar, `s1-selesai-${stempel}${asap ? '-asap' : ''}.json`), JSON.stringify({ stempel, nPasangan: pasanganSah.length + pasanganTidakSah.length, pasanganSah, pasanganTidakSah,
    digestAwal: dAwal, digestAkhir: dAkhir, probeAwal: pAwal, probeAkhir: pAkhir, node: process.version, kode: INTI.penutupanKode(),
    shaPralintas: INTI.shaTeks(path.join(keluar, `s1-pralintas-probe-${stempel}${asap ? '-asap' : ''}.json`)), shaPutaran,
    shaPraDaftar: INTI.shaTeks(path.join(AKAR, 'flywheel', 'PRA-DAFTAR-GERBANG-S1.json')), t: new Date().toISOString() }, null, 1));
  console.log(`selesai · pasangan sah ${pasanganSah.length}/${target} · digest model ${dAkhir === dAwal ? 'SAMA' : 'BEDA'} · probe ${pAkhir === pAwal ? 'SAMA' : 'BEDA'}`);
}
