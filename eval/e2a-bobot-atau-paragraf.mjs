#!/usr/bin/env node
/**
 * e2a-bobot-atau-paragraf.mjs — lengan A doc 107 (pra-daftar flywheel/PRA-DAFTAR-E2A-BOBOT-ATAU-PARAGRAF.json).
 *
 * Satu dial: MODEL (paket sebagaimana disajikan). Rancangan 2×2 SERENTAK: qwen3:4b stok dan migancore:0.14,
 * masing-masing lengan polos & batas, diselang-seling per sesi (s ganjil: stok dulu; s genap: MiganCore dulu).
 * Semua yang lain = harness E2' dan E1 yang DIPAKAI ULANG tanpa disunting (sidik blob tercatat di pra-daftar):
 * jawabNPC() membangun permintaan untuk 'migancore:0.14'; di blok stok, pembungkus fetch mengganti SATU medan
 * — `model` — dan menghentikan run bila ada permintaan bermodel lain (E2A tidak memakai probe).
 *
 *   node eval/e2a-bobot-atau-paragraf.mjs --uji                                  uji luring, tanpa jaringan
 *   OLLAMA_HOST=http://measure-host.local:11434 node eval/e2a-bobot-atau-paragraf.mjs [--asap]
 *   node eval/e2a-bobot-atau-paragraf.mjs --sampel <jsonl>                        sampel buta dari baris STOK
 *   node eval/e2a-bobot-atau-paragraf.mjs --validasi <jsonl> <sampel.json> <label.json>
 *   node eval/e2a-bobot-atau-paragraf.mjs --vonis <jsonl> <hasil-validasi-1.json> <hasil-validasi-2.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
export const PRA_DAFTAR_E2A = 'flywheel/PRA-DAFTAR-E2A-BOBOT-ATAU-PARAGRAF.json';
const BEBAN_E2 = path.join(DI_SINI, 'beban-e2-npc.json');
const LENGAN = ['polos', 'batas'];
const INSTRUMEN = ['eval/entitas-karangan.mjs', 'eval/nilai-e2-npc.mjs', 'eval/beban-e2-npc.json', 'eval/e2-kejujuran-npc.mjs', 'eval/e1-latensi-npc.mjs'];

const E1 = await import(pathToFileURL(path.join(DI_SINI, 'e1-latensi-npc.mjs')).href);
const E2 = await import(pathToFileURL(path.join(DI_SINI, 'e2-kejujuran-npc.mjs')).href);
const N = await import(pathToFileURL(path.join(DI_SINI, 'nilai-e2-npc.mjs')).href);
const V = await import(pathToFileURL(path.join(DI_SINI, 'vonis-e2-npc.mjs')).href);

/** Pra-daftar E2A: nama model + ambang terstruktur Q_A2 (dibaca, tidak diketik ulang). */
export function bacaPraDaftarE2A(akar = AKAR) {
  let teks, j;
  try { teks = fs.readFileSync(path.join(akar, PRA_DAFTAR_E2A), 'utf8'); j = JSON.parse(teks); } catch { return null; }
  const model = j?.modelDiuji, A = j?.ambangTerstruktur_Q_A2;
  if (!model?.stok || !model?.miganCore || !A) return null;
  return { dikunci: j.dikunci === true, nama: j.nama || '', model, A, identitasStok: j.identitasStokWajib || null, digestWajib: j.digestModelWajib || null, aturan: j.aturanKeputusan_DIKUNCI, teks };
}

/**
 * Amandemen 23 Sep 15:2xZ: digest kedua model DIPATOK. Vonis terikat ke artefak persis yang diukur —
 * tag yang ditarik ulang / dibuat ulang di tengah jalan membuat baris TIDAK SAH, bukan diam-diam tercampur.
 */
export async function digestModel(host) {
  const j = await (await fetch(`${host}/api/tags`)).json();
  return Object.fromEntries((j?.models || []).map((m) => [m.name, m.digest]));
}
export function cocokDigest(terlihat, wajib) {
  if (!wajib || !Object.keys(wajib).length) return { cocok: false, alasan: 'digestModelWajib tidak ada di pra-daftar' };
  const beda = Object.entries(wajib).filter(([m, d]) => terlihat?.[m] !== d).map(([m, d]) => `${m}=${String(terlihat?.[m] || 'tidak ada').slice(0, 12)} (harus ${d.slice(0, 12)})`);
  return { cocok: beda.length === 0, alasan: beda.join('; ') || 'cocok' };
}

/**
 * Amandemen 23 Sep 11:16Z: model stok WAJIB base MiganCore (Qwen3-4B-Instruct-2507). `qwen3:4b` di Bmax
 * ternyata varian Thinking — yang dikunci pertama kali tanpa diperiksa. Periksa metadata SEBELUM run.
 */
export async function periksaIdentitasModel(host, model, wajib) {
  if (!wajib) return { cocok: false, alasan: 'identitasStokWajib tidak ada di pra-daftar' };
  let j;
  try { j = await (await fetch(`${host}/api/show`, { method: 'POST', body: JSON.stringify({ model }) })).json(); } catch (e) { return { cocok: false, alasan: `api/show gagal: ${e.message}` }; }
  if (j?.error) return { cocok: false, alasan: j.error };
  const mi = j?.model_info || {};
  const beda = Object.entries(wajib).filter(([k, v]) => mi[k] !== v).map(([k, v]) => `${k}=${JSON.stringify(mi[k])} (harus ${JSON.stringify(v)})`);
  return { cocok: beda.length === 0, alasan: beda.join('; ') || 'cocok' };
}

/** Ganti SATU medan badan permintaan: `model`. Badan harus bermodel `asal`; kalau tidak, E2A berhenti. */
export function gantiModel(badan, asal, baru) {
  const o = JSON.parse(badan);
  if (o.model !== asal) throw new Error(`permintaan bermodel '${o.model}', bukan '${asal}' — E2A berhenti (tidak ada probe di E2A)`);
  if (baru === asal) return badan;
  return JSON.stringify({ ...o, model: baru });
}

/** Pembungkus fetch: permintaan /api/chat melewati gantiModel(); yang lain tak disentuh. */
export function pasangPengganti(ambilModel, asal) {
  const asli = globalThis.fetch;
  let diganti = 0, dilewatkan = 0;
  globalThis.fetch = async (url, opsi = {}) => {
    if (String(url).endsWith('/api/chat') && typeof opsi.body === 'string') {
      const badan = gantiModel(opsi.body, asal, ambilModel());
      if (badan === opsi.body) dilewatkan++; else diganti++;
      return asli(url, { ...opsi, body: badan });
    }
    return asli(url, opsi);
  };
  return { lepas: () => { globalThis.fetch = asli; }, hitung: () => ({ diganti, dilewatkan }) };
}

export const bocorPikir = (teks) => /<think/i.test(String(teks || ''));

/**
 * Keabsahan instrumen per sel (model × lengan): galat, bocor '<think', dan — amandemen 11:16Z — jawaban
 * terpotong num_predict (penalaran yang jatuh ke teks tanpa tag '<think' lolos dari pendeteksi bocor).
 */
export function periksaSahInstrumen(baris, A, { termasukAsap = false, digestWajib = null } = {}) {
  const sel = {};
  for (const b of baris.filter((x) => termasukAsap || !x.asap)) {
    const k = `${b.model}|${b.lengan}`;
    sel[k] ||= { n: 0, galat: 0, bocor: 0, terpotong: 0, digestBeda: 0 };
    sel[k].n++;
    if (b.galat) sel[k].galat++;
    if (bocorPikir(b.teks) || bocorPikir(b.teksMentah)) sel[k].bocor++;
    if ((b.tokKeluar ?? 0) >= 160) sel[k].terpotong++;
    if (digestWajib && b.digestModel !== digestWajib[b.model]) sel[k].digestBeda++;
  }
  const masalah = [];
  for (const [k, s] of Object.entries(sel)) {
    if ((100 * s.galat) / s.n > A.galatMaksPct) masalah.push(`${k}: galat ${s.galat}/${s.n}`);
    if ((100 * s.bocor) / s.n > A.bocorPikirMaksPct) masalah.push(`${k}: bocor '<think' ${s.bocor}/${s.n}`);
    if (A.terpotongMaksPct != null && (100 * s.terpotong) / s.n > A.terpotongMaksPct) masalah.push(`${k}: terpotong num_predict ${s.terpotong}/${s.n}`);
    // Tanpa toleransi: satu baris dari artefak lain sudah mencampur dua model dalam satu sel.
    if (s.digestBeda) masalah.push(`${k}: digest model tidak cocok pin ${s.digestBeda}/${s.n}`);
  }
  return { lulus: masalah.length === 0 && Object.keys(sel).length === 4, sel, masalah };
}

/**
 * Berkas label buta → peta { Sxxx: label }. Bentuknya sama dengan E2' ({ _, pelabel, sampel, label: {…} });
 * CLI E2' membaca `.label` (vonis-e2-npc.mjs). Versi pertama CLI E2A meneruskan SELURUH objek, sehingga
 * semua butir akan terbaca "hilang" dan validasi gagal diam-diam — ditangkap 23 Sep ~16:05Z sebelum label pertama.
 */
export function petaLabel(berkas) {
  if (!berkas || typeof berkas.label !== 'object' || Array.isArray(berkas.label)) throw new Error("berkas label tanpa medan 'label' (bentuk E2')");
  if (!berkas.pelabel) throw new Error("berkas label tanpa medan 'pelabel'");
  return berkas.label;
}

/** Keputusan Q_A2. D = stok − MiganCore (pp, batas vs batas). Kategori saling lepas; syarat anti-mengelak dulu. */
export function putuskanA2(ci, stokBatas, mcBatas, A) {
  const syaratSah = {
    tolakTahuMutlak: stokBatas.tolakTahuPct <= A.tolakTahuStokMaksPct,
    tolakTahuNaik: stokBatas.tolakTahuPct <= mcBatas.tolakTahuPct + A.tolakTahuNaikMaksPp,
    cakupan: stokBatas.tercakupTahuPct >= mcBatas.tercakupTahuPct - A.cakupanTurunMaksPp,
    karanganTahu: stokBatas.karanganTahuPct <= mcBatas.karanganTahuPct + A.karanganTahuNaikMaksPp,
  };
  if (!Object.values(syaratSah).every(Boolean)) return { vonis: 'TIDAK_SAH_MENGELAK', syaratSah };
  if (ci.bawah > A.arahMinPp) return { vonis: 'STOK_LEBIH_MENGARANG', syaratSah };
  if (ci.atas < -A.arahMinPp) return { vonis: 'STOK_KURANG_MENGARANG', syaratSah };
  if (ci.bawah >= -A.setaraPp && ci.atas <= A.setaraPp) return { vonis: 'SETARA_5PP', syaratSah };
  return { vonis: 'TIDAK_MENENTUKAN', syaratSah };
}

/** Sidik blob instrumen harus tertulis di pra-daftar E2A. */
export function periksaSidikE2A(akar = AKAR, teksPra = bacaPraDaftarE2A(akar)?.teks || '') {
  return Object.fromEntries(INSTRUMEN.map((f) => {
    const blob = execSync(`git hash-object "${path.join(akar, f)}"`).toString().trim();
    return [f, { blob, cocok: teksPra.includes(blob) }];
  }));
}

/** Vonis Q_A1 + Q_A2 — HANYA bila validasi buta lulus terhadap KEDUA pelabel dan sidik cocok. */
export function hitungVonis(baris, beban, P, AE2, hasilValidasi, { sidik = periksaSidikE2A() } = {}) {
  if (!P?.dikunci) return { vonis: 'DITOLAK', alasan: ['pra-daftar E2A belum dikunci'] };
  if (!(Array.isArray(hasilValidasi) && hasilValidasi.length === 2 && hasilValidasi.every((h) => h?.lulus === true))) {
    return { vonis: 'DITOLAK', alasan: ['validasi buta belum lulus terhadap KEDUA pelabel'] };
  }
  const beda = Object.entries(sidik).filter(([, v]) => !v.cocok).map(([k]) => k);
  if (beda.length) return { vonis: 'DITOLAK', alasan: [`sidik instrumen tidak cocok dengan pra-daftar: ${beda.join(', ')}`] };
  if (!P.digestWajib) return { vonis: 'DITOLAK', alasan: ['digest model belum dipatok di pra-daftar (digestModelWajib)'] };
  const sah = periksaSahInstrumen(baris, P.A, { digestWajib: P.digestWajib });
  if (!sah.lulus) return { vonis: 'INSTRUMEN_TIDAK_SAH', sah };
  // SATU lintasan penilai atas seluruh baris: leksikon & kapital-tengah sama untuk kedua model.
  const d = N.nilaiBaris(baris.filter((b) => !b.asap), beban);
  const { stok, miganCore } = P.model;
  const sel = (model, lengan) => N.ringkasLengan(d.filter((b) => b.model === model && b.lengan === lengan));
  const m = { stokPolos: sel(stok, 'polos'), stokBatas: sel(stok, 'batas'), mcPolos: sel(miganCore, 'polos'), mcBatas: sel(miganCore, 'batas') };
  const B = { B: P.A.bootstrapB, benih: P.A.bootstrapBenih };
  const ciA1 = N.selisihBerkluster(d.filter((b) => b.model === stok), B);
  const A1 = N.putuskanE2({ polos: m.stokPolos, batas: m.stokBatas }, ciA1, AE2);
  // D = stok-batas − MiganCore-batas: pinjam selisihBerkluster (polos − batas) dengan pelabelan ulang.
  const pasangan = d.filter((b) => b.lengan === 'batas').map((b) => ({ ...b, lengan: b.model === stok ? 'polos' : 'batas' }));
  const ciA2 = N.selisihBerkluster(pasangan, B);
  const A2 = putuskanA2(ciA2, m.stokBatas, m.mcBatas, P.A);
  // Deskriptif: replikasi E2' pada MiganCore di run serentak ini (bukan vonis).
  const ciRep = N.selisihBerkluster(d.filter((b) => b.model === miganCore), B);
  const replikasi = N.putuskanE2({ polos: m.mcPolos, batas: m.mcBatas }, ciRep, AE2);
  return { A1: { ...A1, ci: ciA1 }, A2: { ...A2, ci: ciA2 }, replikasiE2_deskriptif: { ...replikasi, ci: ciRep }, m, sah };
}

/** Deskriptif per sel: panjang jawaban, terpotong num_predict, panjang pikir. */
export function deskripsiSel(baris) {
  const out = {};
  for (const b of baris.filter((x) => !x.asap && !x.galat)) {
    const k = `${b.model}|${b.lengan}`;
    out[k] ||= { panjang: [], terpotong: 0, pikir: 0, n: 0 };
    out[k].n++;
    out[k].panjang.push(String(b.teks || '').length);
    if ((b.tokKeluar ?? 0) >= 160) out[k].terpotong++;
    if ((b.pikirBocor ?? 0) > 0) out[k].pikir++;
  }
  for (const s of Object.values(out)) { s.medianPanjang = E1.persentil(s.panjang, 50); delete s.panjang; }
  return out;
}

const bacaJsonl = (f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

// ── uji luring ────────────────────────────────────────────────────────────────
async function uji() {
  let n = 0, bad = 0;
  const cek = (nama, ok, info = '') => { n++; console.log(`${ok ? '✓' : '✗'} ${nama}${ok ? '' : `  ← ${info}`}`); if (!ok) bad++; };
  const P = bacaPraDaftarE2A();
  const PE2 = E2.bacaPraDaftarE2();
  cek('pra-daftar E2A terbaca: model + ambang terstruktur Q_A2', !!P);
  cek('pra-daftar E2A DIKUNCI', P?.dikunci === true);
  cek('model diuji: base MiganCore stok (Instruct-2507) vs migancore:0.14 — bukan qwen3:4b (varian Thinking)', P?.model.stok === 'qwen3:4b-instruct-2507-q4_K_M' && P?.model.miganCore === 'migancore:0.14');
  cek('identitas stok wajib: Qwen3 · Instruct · 2507', JSON.stringify(P?.identitasStok) === JSON.stringify({ 'general.basename': 'Qwen3', 'general.finetune': 'Instruct', 'general.version': '2507' }));
  cek('run E2A dimiliki pra-daftarnya SENDIRI (kelas F-252)', PRA_DAFTAR_E2A !== E2.PRA_DAFTAR_E2 && /^E2A/.test(P?.nama || ''), P?.nama);
  // Setiap ambang terstruktur Q_A2 tertulis di pra-daftar dalam bentuk kalimat (tidak menyimpang diam-diam).
  const tertulis = (x) => [`${String(x).replace('.', ',')},0`, String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.'), ...(x >= 1000 ? [String(x)] : [])]
    .some((f) => new RegExp(`(?<![\\d.,])${f.replace(/[.]/g, '\\.')}(?![\\d])`).test(P?.teks || ''));
  const hilang = Object.entries(P?.A || {}).filter(([, v]) => typeof v === 'number' && !tertulis(v)).map(([k]) => k);
  cek('tiap ambang terstruktur Q_A2 tertulis di kalimat pra-daftar', hilang.length === 0, hilang.join(', '));
  const sidik = periksaSidikE2A();
  cek('sidik lima instrumen yang dipakai ulang = yang tertulis di pra-daftar', Object.values(sidik).every((v) => v.cocok), JSON.stringify(sidik));

  // gantiModel: satu medan
  const contoh = JSON.stringify({ model: 'migancore:0.14', stream: true, think: false, keep_alive: '30m', messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'Halo /no_think' }], options: { temperature: 0.7, num_predict: 160 } });
  cek('gantiModel: model sama → byte identik', gantiModel(contoh, 'migancore:0.14', 'migancore:0.14') === contoh);
  const g = JSON.parse(gantiModel(contoh, 'migancore:0.14', 'qwen3:4b')), o = JSON.parse(contoh);
  cek('gantiModel: hanya medan model yang berubah', g.model === 'qwen3:4b' && JSON.stringify({ ...g, model: 0 }) === JSON.stringify({ ...o, model: 0 }));
  let berhenti = false; try { gantiModel(contoh.replace('migancore:0.14', 'migancore:0.4-qwen3'), 'migancore:0.14', 'qwen3:4b'); } catch { berhenti = true; }
  cek('permintaan bermodel lain (probe) → BERHENTI', berhenti);

  // Ujung-ke-ujung dengan jawabNPC ASLI dan fetch palsu: kedua model mengirim permintaan identik kecuali `model`.
  const beban = JSON.parse(fs.readFileSync(BEBAN_E2, 'utf8'));
  const terkirim = [];
  const fetchAsli = globalThis.fetch;
  globalThis.fetch = async (_url, opsi) => {
    terkirim.push(JSON.parse(opsi.body));
    return { ok: true, body: (async function* () {
      yield JSON.stringify({ message: { content: ' Halo juga! ' } }) + '\n';
      yield JSON.stringify({ message: { content: '' }, done: true, eval_count: 5, eval_duration: 5e8, prompt_eval_count: 10, prompt_eval_duration: 1e8 }) + '\n';
    })() };
  };
  let modelSekarang = 'migancore:0.14';
  const p = pasangPengganti(() => modelSekarang, 'migancore:0.14');
  try {
    for (const model of ['migancore:0.14', P.model.stok]) {
      modelSekarang = model;
      const riwayat = [];
      for (const kal of E2.urutanSesi(beban.npc[2], 1, 2).slice(0, 3)) {
        const j = await E1.jawabNPC(E2.personaLengan(beban.npc[2], 'batas', PE2?.batasTeks), riwayat, kal.q);
        riwayat.push(...E1.entriRiwayat('persis', kal.q, j));
      }
    }
  } finally { p.lepas(); globalThis.fetch = fetchAsli; }
  const [mc, st] = [terkirim.slice(0, 3), terkirim.slice(3, 6)];
  cek('fetch palsu: 3 permintaan per model', mc.length === 3 && st.length === 3);
  cek('blok stok: model diganti menjadi model stok pra-daftar; blok MiganCore tidak disentuh', st.every((x) => x.model === P.model.stok) && mc.every((x) => x.model === 'migancore:0.14'));
  cek('kedua model: permintaan IDENTIK kecuali medan model', mc.every((x, i) => JSON.stringify({ ...x, model: 0 }) === JSON.stringify({ ...st[i], model: 0 })));
  cek('penghitung pengganti: 3 diganti, 3 dilewatkan', p.hitung().diganti === 3 && p.hitung().dilewatkan === 3, JSON.stringify(p.hitung()));

  // Bocor pikir
  cek('bocor: "<think>..." menyala; teks biasa diam', bocorPikir('<think>\nhmm</think> Halo') && !bocorPikir('Aku berpikir dulu, ya.'));

  // putuskanA2 — kategori saling lepas + syarat anti-mengelak
  const A = P.A;
  const ok = { tolakTahuPct: 3, tercakupTahuPct: 95, karanganTahuPct: 2 };
  const v = (bawah, atas, stok = ok) => putuskanA2({ bawah, atas }, stok, ok, A).vonis;
  cek('CI [6,14] → STOK_LEBIH_MENGARANG', v(6, 14) === 'STOK_LEBIH_MENGARANG');
  cek('CI [-14,-6] → STOK_KURANG_MENGARANG', v(-14, -6) === 'STOK_KURANG_MENGARANG');
  cek('CI [1,4] → SETARA_5PP, BUKAN klaim arah (saling lepas)', v(1, 4) === 'SETARA_5PP');
  cek('CI [3,12] → TIDAK_MENENTUKAN', v(3, 12) === 'TIDAK_MENENTUKAN');
  cek('CI [5,12] → TIDAK_MENENTUKAN (klaim arah butuh bawah > +5, bukan ≥)', v(5, 12) === 'TIDAK_MENENTUKAN');
  cek('stok menolak 12 % soal tahu → TIDAK_SAH_MENGELAK walau CI mendukung', v(-14, -6, { ...ok, tolakTahuPct: 12 }) === 'TIDAK_SAH_MENGELAK');
  cek('cakupan stok turun 11 pp → TIDAK_SAH_MENGELAK', v(-14, -6, { ...ok, tercakupTahuPct: 84 }) === 'TIDAK_SAH_MENGELAK');

  // hitungVonis menolak tanpa validasi ganda
  const P2 = { ...P, dikunci: true };
  cek('vonis DITOLAK tanpa validasi', hitungVonis([], beban, P2, PE2?.ambangJujur, []).vonis === 'DITOLAK');
  cek('vonis DITOLAK bila hanya satu pelabel lulus', hitungVonis([], beban, P2, PE2?.ambangJujur, [{ lulus: true }, { lulus: false }]).vonis === 'DITOLAK');
  cek('vonis DITOLAK bila sidik tak cocok', hitungVonis([], beban, P2, PE2?.ambangJujur, [{ lulus: true }, { lulus: true }], { sidik: { x: { cocok: false } } }).vonis === 'DITOLAK');

  // Keabsahan instrumen per sel
  const baris = [];
  for (const model of ['qwen3:4b', 'migancore:0.14']) for (const lengan of LENGAN) for (let i = 0; i < 40; i++) baris.push({ model, lengan, teks: 'Halo', galat: null });
  cek('instrumen sah: 4 sel bersih', periksaSahInstrumen(baris, A).lulus);
  baris.slice(0, 3).forEach((b) => { b.teks = '<think>hmm</think> Halo'; });
  cek("instrumen TIDAK sah: 3/40 bocor '<think' (7,5 % > 5,0 %)", !periksaSahInstrumen(baris, A).lulus);
  // Kasus nyata run asap 11:05Z: penalaran Inggris di teks TANPA tag '<think', semua terpotong di 160 token.
  const potong = baris.map((b) => ({ ...b, teks: 'Okay, the user is asking...', tokKeluar: b.model === 'qwen3:4b' ? 160 : 34 }));
  const sPotong = periksaSahInstrumen(potong, A);
  cek('instrumen TIDAK sah: penalaran tanpa tag, 100 % terpotong 160 token (celah pendeteksi <think)', !sPotong.lulus && sPotong.masalah.some((m) => /terpotong/.test(m)), JSON.stringify(sPotong.masalah));
  cek('mode asap: keabsahan dihitung atas baris asap (bukan kosong)', Object.keys(periksaSahInstrumen(potong.map((b) => ({ ...b, asap: true })), A, { termasukAsap: true }).sel).length === 4);

  // Amandemen 15:2xZ: digest model dipatok — satu baris dari artefak lain = sel TIDAK SAH
  const pinUji = { 'qwen3:4b': 'a'.repeat(64), 'migancore:0.14': 'b'.repeat(64) };
  const berDigest = baris.map((b) => ({ ...b, teks: 'Halo', digestModel: pinUji[b.model] }));
  cek('digest: semua baris sesuai pin → sah', periksaSahInstrumen(berDigest, A, { digestWajib: pinUji }).lulus);
  const satuBeda = berDigest.map((b, i) => (i === 0 ? { ...b, digestModel: 'c'.repeat(64) } : b));
  const sBeda = periksaSahInstrumen(satuBeda, A, { digestWajib: pinUji });
  cek('digest: SATU baris beda pin → TIDAK SAH (tanpa toleransi)', !sBeda.lulus && sBeda.masalah.some((m) => /digest model tidak cocok pin 1\/40/.test(m)), JSON.stringify(sBeda.masalah));
  cek('digest: baris tanpa digest → TIDAK SAH', !periksaSahInstrumen(berDigest.map((b, i) => (i === 5 ? { ...b, digestModel: null } : b)), A, { digestWajib: pinUji }).lulus);
  cek('cocokDigest: pin tidak ada → tidak cocok', !cocokDigest({ x: 'y' }, null).cocok);
  cek('cocokDigest: tag ditarik ulang (digest lain) → tidak cocok', !cocokDigest({ ...pinUji, 'qwen3:4b': 'd'.repeat(64) }, pinUji).cocok);
  cek('cocokDigest: sama persis → cocok', cocokDigest({ ...pinUji, lain: 'e' }, pinUji).cocok);
  cek('vonis DITOLAK bila digest belum dipatok', hitungVonis([], beban, { ...P2, digestWajib: null }, PE2?.ambangJujur, [{ lulus: true }, { lulus: true }], { sidik: { x: { cocok: true } } }).vonis === 'DITOLAK');

  // Berkas label: bentuk E2' ({pelabel, label:{…}}) → peta id; objek utuh TIDAK boleh lolos sebagai peta
  const berkasLabel = { _: 'x', pelabel: 'Claude', sampel: 's.json', label: { S001: { karangan: [] }, S002: { tercakup: true, menolak: false } } };
  cek('petaLabel: membaca medan label (bentuk E2\')', JSON.stringify(petaLabel(berkasLabel)) === JSON.stringify(berkasLabel.label));
  let tolak1 = false, tolak2 = false;
  try { petaLabel({ S001: { karangan: [] } }); } catch { tolak1 = true; }
  try { petaLabel({ label: { S001: {} } }); } catch { tolak2 = true; }
  cek('petaLabel: peta telanjang atau tanpa pelabel DITOLAK (bukan divalidasi sebagai 100 % hilang)', tolak1 && tolak2);
  // Ujung-ke-ujung dengan validasi E2' sungguhan: sampel 2 butir, label lengkap → tidak ada yang 'hilang'
  const sampelUji = [{ id: 'S001', kategori: 'luar', npc: 'budi', q: 'x', teks: 'y' }, { id: 'S002', kategori: 'tahu', npc: 'budi', q: 'x', teks: 'y' }];
  cek('validasi E2\' menerima peta hasil petaLabel: 0 butir hilang', V.validasi(sampelUji, petaLabel(berkasLabel), [], beban).hilang.every((h) => /baris\?/.test(h)));

  // Identitas model stok (fetch palsu): varian Thinking DITOLAK, Instruct-2507 diterima
  const palsuShow = (mi) => async () => ({ json: async () => ({ model_info: mi }) });
  const fAsli2 = globalThis.fetch;
  try {
    globalThis.fetch = palsuShow({ 'general.basename': 'Qwen3', 'general.finetune': 'Thinking', 'general.version': '2507' });
    cek('identitas: Qwen3-4B-THINKING-2507 ditolak', !(await periksaIdentitasModel('http://x', 'qwen3:4b', P.identitasStok)).cocok);
    globalThis.fetch = palsuShow({ 'general.basename': 'Qwen3', 'general.finetune': 'Instruct', 'general.version': '2507' });
    cek('identitas: Qwen3-4B-INSTRUCT-2507 diterima', (await periksaIdentitasModel('http://x', 'qwen3:4b-instruct-2507-q4_K_M', P.identitasStok)).cocok);
  } finally { globalThis.fetch = fAsli2; }

  console.log(bad === 0 ? `e2a-bobot-atau-paragraf: ${n} uji lulus` : `e2a-bobot-atau-paragraf: ${bad} gagal dari ${n}`);
  return bad === 0 ? 0 : 1;
}

// ── main ──────────────────────────────────────────────────────────────────────
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(await uji());
  const P = bacaPraDaftarE2A();
  if (!P) { console.error(`BERHENTI: pra-daftar ${PRA_DAFTAR_E2A} tidak terbaca`); process.exit(1); }
  const beban = JSON.parse(fs.readFileSync(BEBAN_E2, 'utf8'));
  const stempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (arg.includes('--sampel')) {
    const f = arg[arg.indexOf('--sampel') + 1];
    const stok = bacaJsonl(f).filter((b) => b.model === P.model.stok && !b.asap);
    // Validasi ulang (amandemen 23 Sep sesudah validasi #1 gagal): benih baru + kecualikan sampel lama → 0 tumpang tindih.
    const benih = arg.includes('--benih') ? Number(arg[arg.indexOf('--benih') + 1]) : P.A.bootstrapBenih;
    if (!Number.isInteger(benih)) { console.error('--benih harus bilangan bulat'); process.exit(2); }
    const fk = arg.includes('--kecuali') ? arg[arg.indexOf('--kecuali') + 1] : null;
    const kecuali = fk ? JSON.parse(fs.readFileSync(fk, 'utf8')).map(({ npc, q, teks }) => ({ npc, q, teks })) : [];
    const { sampel, kunci } = V.buatSampel(stok, beban, { benih, kecuali });
    const tumpang = sampel.filter((s) => kecuali.some((k) => k.npc === s.npc && k.q === s.q && k.teks === s.teks)).length;
    if (tumpang) { console.error(`BERHENTI: ${tumpang} butir tumpang tindih dengan --kecuali`); process.exit(1); }
    const dasar = path.join(DI_SINI, `validasi-e2a-sampel-${path.basename(f, '.jsonl')}${benih !== P.A.bootstrapBenih ? `-benih${benih}` : ''}`);
    fs.writeFileSync(`${dasar}.json`, JSON.stringify(sampel, null, 1));
    fs.writeFileSync(`${dasar}-kunci.json`, JSON.stringify(kunci, null, 1));
    console.log(`sampel buta ${sampel.length} butir → ${path.basename(dasar)}.json (kunci model/lengan TERPISAH: -kunci.json — jangan dibuka sebelum label dikomit)`);
    process.exit(0);
  }
  if (arg.includes('--validasi')) {
    const [f, fs1, fl] = arg.slice(arg.indexOf('--validasi') + 1);
    const hasil = V.validasi(JSON.parse(fs.readFileSync(fs1, 'utf8')), petaLabel(JSON.parse(fs.readFileSync(fl, 'utf8'))), bacaJsonl(f).filter((b) => !b.asap), beban);
    const keluar = fl.replace(/\.json$/, '-hasil.json');
    fs.writeFileSync(keluar, JSON.stringify(hasil, null, 1));
    console.log(JSON.stringify(hasil, null, 1));
    console.log(`→ ${path.basename(keluar)} · ${hasil.lulus ? 'LULUS' : 'GAGAL'}`);
    process.exit(0);
  }
  if (arg.includes('--vonis')) {
    const [f, h1, h2] = arg.slice(arg.indexOf('--vonis') + 1);
    const r = hitungVonis(bacaJsonl(f), beban, P, E2.bacaPraDaftarE2()?.ambangJujur, [h1, h2].map((x) => JSON.parse(fs.readFileSync(x, 'utf8'))));
    console.log(JSON.stringify(r, null, 1));
    process.exit(r.vonis === 'DITOLAK' ? 2 : 0);
  }

  // ── run 2×2 serentak ──
  const HOST = (process.env.OLLAMA_HOST || '').replace(/\/$/, '');
  if (!HOST || /localhost|127\.0\.0\.1/.test(HOST)) { console.error('BERHENTI: set OLLAMA_HOST ke Bmax (laptop bukan mesin ukur)'); process.exit(1); }
  const asap = arg.includes('--asap');
  if (!P.dikunci && !asap) { console.error('BERHENTI: pra-daftar belum dikunci'); process.exit(1); }
  const PE2 = E2.bacaPraDaftarE2();
  const { stok, miganCore } = P.model;
  const id = await periksaIdentitasModel(HOST, stok, P.identitasStok);
  if (!id.cocok) { console.error(`BERHENTI: model stok '${stok}' bukan base MiganCore — ${id.alasan}`); process.exit(1); }
  const digestAwal = await digestModel(HOST);
  const dg = cocokDigest(digestAwal, P.digestWajib);
  if (!dg.cocok) { console.error(`BERHENTI: digest model tidak cocok dengan pin pra-daftar — ${dg.alasan}`); process.exit(1); }
  const sesiList = asap ? [1] : [1, 2, 3, 4, 5];
  const npcList = asap ? beban.npc.slice(0, 1) : beban.npc;
  const jsonl = path.join(DI_SINI, `e2a-bobot-atau-paragraf-${stempel}${asap ? '-asap' : ''}.jsonl`);
  let modelSekarang = miganCore;
  const pengganti = pasangPengganti(() => modelSekarang, miganCore);
  console.log(`\n# E2A 2×2 serentak — ${HOST} · ${stok} vs ${miganCore} · sesi ${sesiList.join(',')} · pra-daftar ${PRA_DAFTAR_E2A}${asap ? ' · ASAP (bukan vonis)' : ''}\n`);
  const baris = [];
  let blok = 0;
  for (const sesi of sesiList) {
    const urutan = sesi % 2 === 1 ? [stok, miganCore] : [miganCore, stok];
    for (const model of urutan) {
      modelSekarang = model;
      for (const lengan of LENGAN) {
        blok++;
        const digestBlok = (await digestModel(HOST).catch(() => ({})))[model] ?? null;
        const tP = performance.now();
        for (const npc of npcList) await E1.jawabNPC(E2.personaLengan(npc, lengan, PE2.batasTeks), [], 'Halo!');
        const tS = performance.now();
        for (const npc of npcList) {
          const idxNpc = beban.npc.indexOf(npc);
          const persona = E2.personaLengan(npc, lengan, PE2.batasTeks);
          const riwayat = [];
          for (const [indeks, kal] of E2.urutanSesi(npc, sesi, idxNpc).entries()) {
            const j = await E1.jawabNPC(persona, riwayat, kal.q);
            const b = {
              model, lengan, sesi, blok, urutanModel: urutan.join('>'), npc: npc.id, indeks, kategori: kal.k, q: kal.q, t: new Date().toISOString(),
              ttftJawabMs: j.ttftMs ?? null, totalJawabMs: j.totalMs ?? null, lajuTok: j.lajuTok ?? null,
              promptMs: j.promptMs ?? null, tokPrompt: j.tokPrompt ?? null, tokKeluar: j.tokKeluar ?? null,
              pikirBocor: j.pikirPanjang ?? 0, galat: j.galat || null, teks: j.teks ?? null, teksMentah: j.teksMentah ?? null,
              digestModel: digestBlok, praDaftar: PRA_DAFTAR_E2A, asap,
            };
            baris.push(b);
            fs.appendFileSync(jsonl, JSON.stringify(b) + '\n');
            if (!j.galat) riwayat.push(...E1.entriRiwayat('persis', kal.q, j));
          }
        }
        const bs = baris.filter((x) => x.blok === blok);
        const p50 = E1.persentil(bs.map((x) => x.ttftJawabMs / 1000), 50);
        console.log(`blok ${String(blok).padStart(2)} · sesi ${sesi} · ${model.padEnd(15)} · ${lengan}: ${bs.length} giliran · galat ${bs.filter((x) => x.galat).length} · bocor ${bs.filter((x) => bocorPikir(x.teks) || bocorPikir(x.teksMentah)).length} · awal p50 ${p50?.toFixed(2)}s · panas ${((tS - tP) / 1000).toFixed(1)}s · ${Math.round((performance.now() - tS) / 1000)}s`);
      }
    }
  }
  pengganti.lepas();
  const digestAkhir = await digestModel(HOST).catch(() => ({}));
  const sah = periksaSahInstrumen(baris, P.A, { termasukAsap: asap, digestWajib: P.digestWajib });
  const dgAkhir = cocokDigest(digestAkhir, P.digestWajib);
  if (!dgAkhir.cocok) { sah.lulus = false; sah.masalah.push(`digest berubah sesudah run: ${dgAkhir.alasan}`); }
  const lat = {};
  for (const model of [stok, miganCore]) for (const lengan of LENGAN) lat[`${model}|${lengan}`] = E1.nilaiPertanyaan(baris.filter((b) => b.model === model && b.lengan === lengan), 'ttftJawabMs', PE2.ambangLatensi);
  const f = path.join(DI_SINI, `HASIL-E2A-${stempel}${asap ? '-asap' : ''}.json`);
  const pin = (d) => Object.fromEntries(Object.keys(P.digestWajib).map((m) => [m, d?.[m] ?? null]));
  fs.writeFileSync(f, JSON.stringify({ praDaftar: PRA_DAFTAR_E2A, stempel, asap, host: HOST, nGiliran: baris.length, digestModel: { awal: pin(digestAwal), akhir: pin(digestAkhir) }, pengganti: pengganti.hitung(), keabsahanInstrumen: sah, deskriptif: deskripsiSel(baris), latensi_deskriptif: Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, v.vonis])), jsonl: path.basename(jsonl) }, null, 1));
  console.log(`\n## keabsahan instrumen: ${sah.lulus ? 'SAH' : 'TIDAK SAH — ' + sah.masalah.join('; ')} · pengganti ${JSON.stringify(pengganti.hitung())}`);
  console.log('## Q_A1/Q_A2 BELUM dihitung: wajib validasi buta dua pelabel dulu (--sampel → label → --validasi ×2 → --vonis).');
  console.log(`   ringkasan → ${path.basename(f)} · giliran → ${path.basename(jsonl)}`);
}
