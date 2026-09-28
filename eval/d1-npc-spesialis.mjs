#!/usr/bin/env node
/**
 * d1-npc-spesialis.mjs — pelari episode D1 (pra-daftar flywheel/PRA-DAFTAR-D1-NPC-SPESIALIS.json).
 *
 * Enam NPC spesialis Gedung Pabrik Aset (beban eval/beban-d1-npc-spesialis.json). Persona = identitas + pengetahuan
 * sendiri + gaya + paragraf batas E2' (disalin kata demi kata ke pra-daftar D1; uji menuntut sama dengan E2') + daftar
 * rekan (nama + bidang) + satu kalimat penutup. Satu dial: BOBOT —
 *   M = migancore:0.14                    (badan = badan jawabNPC E1 apa adanya)
 *   B = qwen3:4b-instruct-2507-q4_K_M     (model diganti + options.top_k 40 · top_p 0,9 = sampler EFEKTIF 0.14, pola A3I lengan B)
 * Permintaan dibuat jawabNPC() E1 (temperature 0,7 · num_predict 160 · think:false + " /no_think" · keep_alive 30m ·
 * riwayat PERSIS); pembungkus fetch hanya menjalankan gantiModel() E2A lalu sisipkanBadan() SB1 — keduanya dipakai
 * ulang tanpa disunting, dan badan M↔B diuji hanya berbeda di model + dua opsi itu.
 *
 * Pelari ini HANYA mengumpulkan data + keabsahan run (galat, bocor, terpotong, digest) + latensi deskriptif.
 * Hasil per lengan TIDAK dihitung di sini: validasi buta dulu (eval/nilai-d1.mjs --sampel → --siapkan-juri → juri →
 * --gabung → --vonis). Pelari menolak jalan bila pra-daftar belum dikunci, medan keputusannya berubah sesudah kunci
 * (sidikKeputusan), atau sidik berkas ≠ sidikWajib.
 *
 *   node eval/d1-npc-spesialis.mjs --uji
 *   OLLAMA_HOST=http://measure-host.local:11434 node eval/d1-npc-spesialis.mjs --asap     # sesi 1, kedua lengan
 *   OLLAMA_HOST=http://measure-host.local:11434 node eval/d1-npc-spesialis.mjs            # run penuh (pra-daftar dikunci)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const impor = (f) => import(pathToFileURL(path.join(DI_SINI, f)).href);
const E1 = await impor('e1-latensi-npc.mjs');
const E2A = await impor('e2a-bobot-atau-paragraf.mjs');
const { sisipkanBadan } = await impor('ukur-jujur2-seleksi.mjs');
const N = await impor('nilai-d1.mjs');
const { urutkanKalimat, jawabNPC, entriRiwayat, persentil, bangunPersona } = E1;

/** Model yang ditulis jawabNPC() E1 di setiap badan permintaan (tidak disunting di E1). */
export const MODEL_ASAL_E1 = 'migancore:0.14';

/** Sembilan kalimat satu NPC di satu sesi (rotasi beban D1), SEBELUM diacak. */
export function kalimatSesiD1(npc, s) {
  const i = 2 * (s - 1);
  const tahu = [i % 5, (i + 1) % 5].map((k) => ({ k: 'tahu', q: npc.tahu[k].q }));
  const antar = [i % 6, (i + 1) % 6].map((k) => ({ k: 'antar', q: npc.antar[k].q, pemilik: npc.antar[k].rekan }));
  const luar = [0, 1, 2].map((d) => ({ k: 'luar', q: npc.luar[(3 * (s - 1) + d) % 12] }));
  return [...npc.sapa.map((q) => ({ k: 'sapa', q })), ...tahu, ...antar, ...luar];
}

/** Urutan giliran = urutkanKalimat() E1 (sapa pembuka, sisanya diacak benih sesi×1000 + indeks NPC). */
export const urutanSesiD1 = (npc, s, idxNpc) => urutkanKalimat({ kalimat: kalimatSesiD1(npc, s) }, s, idxNpc);

/** Urutan lengan per sesi: ganjil M→B, genap B→M (drift mesin tersebar ke kedua lengan). */
export const urutanLengan = (s) => (s % 2 ? ['M', 'B'] : ['B', 'M']);

/** Persona D1. Paragraf batas dan kalimat penutup rekan DIBACA dari pra-daftar (tidak diketik ulang di sini). */
export function personaD1(npc, beban, dial) {
  const rekan = beban.rekan.filter((r) => r.id !== npc.id).map((r) => `- ${r.nama}: ${r.bidang}`);
  return [
    `Kamu ${npc.nama}, ${npc.peran} di ${beban.dunia}.`,
    'Yang kamu tahu:',
    ...npc.pengetahuan.map((p) => `- ${p}`),
    `Gaya: ${npc.gaya}`,
    'Bahasa Indonesia sehari-hari. Jawab SINGKAT, 1–2 kalimat.',
    dial.teksBatas,
    dial.judulRekan,
    ...rekan,
    dial.teksPenutupRekan,
  ].join('\n');
}

/** Badan lengan: model E1 → model lengan (gantiModel E2A), lalu sisipan opsi lengan (sisipkanBadan SB1, tak menimpa). */
export function badanLengan(badan, L) {
  return sisipkanBadan(E2A.gantiModel(badan, MODEL_ASAL_E1, L.model), L.model, L.badanTambahan);
}

/** Pembungkus fetch: hanya /api/chat yang diubah; contoh badan pertama per lengan disimpan untuk uji kesetaraan. */
export function pasangLenganD1(ambilLengan) {
  const asli = globalThis.fetch;
  let diubah = 0, apaAdanya = 0;
  const contoh = {};
  globalThis.fetch = async (url, opsi = {}) => {
    if (String(url).endsWith('/api/chat') && typeof opsi.body === 'string') {
      const L = ambilLengan();
      const badan = badanLengan(opsi.body, L);
      if (badan === opsi.body) apaAdanya++; else diubah++;
      contoh[L.id] ||= badan;
      return asli(url, { ...opsi, body: badan });
    }
    return asli(url, opsi);
  };
  return { lepas: () => { globalThis.fetch = asli; }, hitung: () => ({ diubah, apaAdanya }), contoh };
}

/** M = badan E1 persis (model 0.14, tanpa opsi tambahan); B = M kecuali model + opsi terpatok. */
export function periksaBadanSetaraD1(contoh, lengan) {
  const M = lengan.find((L) => L.id === 'M'), B = lengan.find((L) => L.id === 'B');
  if (!contoh.M || !contoh.B) return { lulus: false, alasan: 'contoh badan tidak lengkap' };
  const oM = JSON.parse(contoh.M), oB = JSON.parse(contoh.B);
  const mPolos = oM.model === MODEL_ASAL_E1 && M.model === MODEL_ASAL_E1 && Object.keys(M.badanTambahan || {}).length === 0;
  const tambahB = B.badanTambahan?.options || {};
  const opsiTepat = Object.entries(tambahB).every(([k, v]) => oB.options?.[k] === v) && Object.keys(B.badanTambahan || {}).every((k) => k === 'options');
  const buang = (o, opsi) => { const x = JSON.parse(JSON.stringify(o)); delete x.model; for (const k of opsi) delete x.options[k]; return JSON.stringify(x); };
  const sisaSama = buang(oM, []) === buang(oB, Object.keys(tambahB));
  const modelB = oB.model === B.model;
  return { lulus: mPolos && opsiTepat && sisaSama && modelB, mPolos, opsiTepat, sisaSama, modelB };
}

export function bacaPraDaftarLari(akar = AKAR) {
  const P = N.bacaPraDaftarD1(akar);
  if (!P) return null;
  const d = P.j.dial || {};
  if (!d.teksBatas || !d.judulRekan || !d.teksPenutupRekan || !P.lengan || !P.digestWajib || !P.A) return null;
  return { ...P, dial: { teksBatas: d.teksBatas, judulRekan: d.judulRekan, teksPenutupRekan: d.teksPenutupRekan }, identitasWajib: P.j.identitasWajib || null, rancangan: P.j.rancangan || {} };
}

/**
 * Boleh jalan? Asap pun hanya sesudah kunci (tinjauan 25 Sep, butir 10): jawaban berlabel lengan tidak boleh ada sebelum
 * rancangan beku. Urutan: dikunci → belum bervonis (F-278) → medan keputusan tak berubah sesudah kunci → sidik berkas.
 * Mengembalikan null (boleh) atau { alasan, kode }.
 */
export function alasanTolakLari(P, sidik) {
  if (!P.dikunci) return { alasan: 'pra-daftar D1 belum dikunci (asap juga)', kode: 1 };
  if (P.sudahBervonis) return { alasan: 'pra-daftar D1 sudah bervonis — tidak dijalankan ulang (F-278)', kode: 2 };
  if (!P.sidikKeputusanCocok) return { alasan: 'medan keputusan pra-daftar berubah sesudah kunci (sidikKeputusan tidak cocok)', kode: 1 };
  if (!sidik.cocok) return { alasan: `sidik tidak cocok dengan pra-daftar: ${sidik.beda.join(', ')}`, kode: 1 };
  return null;
}

// ── uji luring ────────────────────────────────────────────────────────────────
async function uji() {
  let n = 0, bad = 0;
  const cek = (nama, ok, info = '') => { n++; if (!ok) { bad++; console.log(`  GAGAL ${nama}${info ? ` — ${info}` : ''}`); } };
  const beban = JSON.parse(fs.readFileSync(N.BEBAN_D1, 'utf8'));
  const P = bacaPraDaftarLari();
  cek('pra-daftar D1 terbaca (dial, lengan, digest, ambang)', !!P);
  if (!P) { console.log(`d1-npc-spesialis: ${bad} gagal dari ${n}`); return 1; }
  const E2 = await impor('e2-kejujuran-npc.mjs');
  cek("paragraf batas = teks E2' kata demi kata", P.dial.teksBatas === E2.bacaPraDaftarE2()?.batasTeks);
  cek('lengan: M = migancore:0.14 polos · B = instruct-2507 + options top_k 40 / top_p 0,9 / num_ctx 4096 (0.14 memakai 4096 dari Modelfile-nya)',
    JSON.stringify(P.lengan) === JSON.stringify([{ id: 'M', model: 'migancore:0.14', badanTambahan: {} }, { id: 'B', model: 'qwen3:4b-instruct-2507-q4_K_M', badanTambahan: { options: { top_k: 40, top_p: 0.9, num_ctx: 4096 } } }]), JSON.stringify(P.lengan));
  cek('num_ctx lengan B = ambang numCtx pra-daftar', P.lengan[1].badanTambahan.options.num_ctx === P.A.numCtx);
  cek('digest kedua model dipatok = pin E2A (artefak yang sama)', JSON.stringify(P.digestWajib) === JSON.stringify(E2A.bacaPraDaftarE2A()?.digestWajib), JSON.stringify(P.digestWajib));

  // Rotasi sepanjang rancangan (20 sesi × 9 kalimat): tahu tiap soal 8×; antar 7,7,7,7,6,6; luar tiap soal 5× (= penyebutPerLengan).
  const SESI = P.rancangan.sesi;
  cek('rancangan: 20 sesi (pra-daftar)', SESI === 20);
  let ukuranOk = true;
  for (const npc of beban.npc) for (let s = 1; s <= SESI; s++) {
    const k = kalimatSesiD1(npc, s);
    const c = (x) => k.filter((y) => y.k === x).length;
    if (k.length !== 9 || c('sapa') !== 2 || c('tahu') !== 2 || c('antar') !== 2 || c('luar') !== 3) ukuranOk = false;
  }
  cek('tiap sesi: 9 kalimat = 2 sapa + 2 tahu + 2 antar + 3 luar', ukuranOk);
  const frek = (kat, npc = beban.npc[0]) => { const m = {}; for (let s = 1; s <= SESI; s++) for (const x of kalimatSesiD1(npc, s).filter((y) => y.k === kat)) m[x.q] = (m[x.q] || 0) + 1; return m; };
  const ft = frek('tahu'), fa = frek('antar'), fl = frek('luar');
  cek('tahu: kelima soal masing-masing 8×', Object.keys(ft).length === 5 && Object.values(ft).every((v) => v === 8), JSON.stringify(ft));
  cek('antar: keenam soal muncul (7,7,7,7,6,6)', Object.keys(fa).length === 6 && beban.npc[0].antar.map((a) => fa[a.q]).join(',') === '7,7,7,7,6,6', JSON.stringify(fa));
  cek('luar: 12 soal masing-masing 5×', Object.keys(fl).length === 12 && beban.npc[0].luar.map((q) => fl[q]).every((v) => v === 5), JSON.stringify(fl));
  cek('per lengan = penyebut pra-daftar: 240 tahu · 240 antar · 360 luar · 240 sapa (6 NPC × 20 sesi)', (() => {
    let t = 0, a = 0, l = 0, sp = 0;
    for (const npc of beban.npc) for (let s = 1; s <= SESI; s++) for (const x of kalimatSesiD1(npc, s)) { if (x.k === 'tahu') t++; else if (x.k === 'antar') a++; else if (x.k === 'luar') l++; else sp++; }
    return t === 240 && a === 240 && l === 360 && sp === 240 && t + a + l + sp === P.A.gilirPerLengan;
  })());
  // Frekuensi saja tidak cukup (rotasi +2 juga memberi 4× per soal — mutasi R1 lolos): posisi dicek terhadap rumus beban.
  const posisiOk = beban.npc.every((npc) => [1, 3, 6, 10].every((s) => {
    const k = kalimatSesiD1(npc, s), i = 2 * (s - 1);
    return k.filter((x) => x.k === 'tahu').map((x) => x.q).join('|') === [npc.tahu[i % 5].q, npc.tahu[(i + 1) % 5].q].join('|')
      && k.filter((x) => x.k === 'antar').map((x) => x.q).join('|') === [npc.antar[i % 6].q, npc.antar[(i + 1) % 6].q].join('|')
      && k.filter((x) => x.k === 'luar').map((x) => x.q).join('|') === [0, 1, 2].map((d) => npc.luar[(3 * (s - 1) + d) % 12]).join('|');
  }));
  cek('rotasi: indeks tahu/antar/luar per sesi = rumus beban.rotasi', posisiOk && /\(2\(s-1\)\)%5/.test(beban.rotasi.tahu) && /\(2\(s-1\)\)%6/.test(beban.rotasi.antar) && /\(3\(s-1\)\+d\)%12/.test(beban.rotasi.luar));
  cek('antar membawa pemilik dari beban', kalimatSesiD1(beban.npc[2], 3).filter((x) => x.k === 'antar').every((x) => beban.npc[2].antar.find((a) => a.q === x.q)?.rekan === x.pemilik));
  const u = urutanSesiD1(beban.npc[1], 4, 1);
  cek('urutan: kalimat pertama = sapa pembuka; himpunan kalimat = kalimat sesi', u[0].k === 'sapa' && u.length === 9 && JSON.stringify(u.map((x) => x.q).sort()) === JSON.stringify(kalimatSesiD1(beban.npc[1], 4).map((x) => x.q).sort()));
  cek('urutan deterministik (benih sesi×1000 + indeks)', JSON.stringify(urutanSesiD1(beban.npc[1], 4, 1)) === JSON.stringify(urutanSesiD1(beban.npc[1], 4, 1)) && JSON.stringify(urutanSesiD1(beban.npc[1], 4, 1)) !== JSON.stringify(urutanSesiD1(beban.npc[1], 5, 1)));
  const ok = { cocok: true, beda: [] }, P0 = { dikunci: true, sudahBervonis: false, sidikKeputusanCocok: true };
  cek('boleh jalan: hanya bila dikunci, belum bervonis, medan keputusan tetap, sidik cocok (kode 2 untuk sudah bervonis)',
    alasanTolakLari(P0, ok) === null && /belum dikunci/.test(alasanTolakLari({ ...P0, dikunci: false }, ok)?.alasan) && alasanTolakLari({ ...P0, sudahBervonis: true }, ok)?.kode === 2
    && /medan keputusan/.test(alasanTolakLari({ ...P0, sidikKeputusanCocok: false }, ok)?.alasan) && /sidik tidak cocok/.test(alasanTolakLari(P0, { cocok: false, beda: ['x'] })?.alasan));
  cek('urutan lengan: sesi ganjil M→B, genap B→M; tiap lengan 10× pertama dari 20', urutanLengan(1).join() === 'M,B' && urutanLengan(2).join() === 'B,M' && Array.from({ length: SESI }, (_, i) => i + 1).filter((s) => urutanLengan(s)[0] === 'M').length === SESI / 2);

  // Persona
  const pr = personaD1(beban.npc[0], beban, P.dial);
  cek('persona: tanpa diri di daftar rekan, kelima rekan lain ada', !pr.includes('- Hana Hunter:') && beban.rekan.filter((r) => r.id !== 'hunter').every((r) => pr.includes(`- ${r.nama}: ${r.bidang}`)));
  cek('persona: paragraf batas lalu judul rekan lalu penutup, penutup = baris terakhir', pr.indexOf(P.dial.teksBatas) < pr.indexOf(P.dial.judulRekan) && pr.endsWith(P.dial.teksPenutupRekan));
  cek('persona: semua kalimat pengetahuan sendiri ada, pengetahuan rekan TIDAK ada', beban.npc[0].pengetahuan.every((p) => pr.includes(p)) && beban.npc.slice(1).every((x) => x.pengetahuan.every((p) => !pr.includes(p))));
  cek('persona: contoh lengkap di pra-daftar = persona yang dibangun (hunter)', P.j.contohPersonaLengkap_hunter === pr);
  cek('persona E1 tidak dipakai (dunia D1, bukan Galantara)', !pr.includes('Galantara') && bangunPersona(beban.npc[0]).includes('Galantara'));

  // Badan: ujung-ke-ujung dengan fetch palsu — M persis E1; B hanya model + dua opsi
  const terkirim = [];
  const fetchAsli = globalThis.fetch;
  globalThis.fetch = async (_url, opsi) => {
    terkirim.push(JSON.parse(opsi.body));
    return { ok: true, body: (async function* () {
      yield JSON.stringify({ message: { content: ' Halo juga! ' } }) + '\n';
      yield JSON.stringify({ message: { content: '' }, done: true, eval_count: 5, eval_duration: 5e8, prompt_eval_count: 10, prompt_eval_duration: 1e8 }) + '\n';
    })() };
  };
  let aktif = P.lengan[0];
  const pasang = pasangLenganD1(() => aktif);
  try {
    for (const L of P.lengan) {
      aktif = L;
      const riwayat = [];
      for (const kal of urutanSesiD1(beban.npc[2], 1, 2).slice(0, 3)) {
        const j = await jawabNPC(personaD1(beban.npc[2], beban, P.dial), riwayat, kal.q);
        riwayat.push(...entriRiwayat('persis', kal.q, j));
      }
    }
  } finally { pasang.lepas(); globalThis.fetch = fetchAsli; }
  const [a, b] = [terkirim.slice(0, 3), terkirim.slice(3, 6)];
  cek('fetch palsu: 3 permintaan per lengan', a.length === 3 && b.length === 3);
  cek('M: model 0.14, tanpa top_k/top_p (badan E1 apa adanya)', a.every((x) => x.model === 'migancore:0.14' && !('top_k' in x.options) && !('top_p' in x.options)));
  cek('B: model instruct + top_k 40 · top_p 0,9 · num_ctx 4096; suhu 0,7 & num_predict 160 TIDAK tertimpa', b.every((x) => x.model === 'qwen3:4b-instruct-2507-q4_K_M' && x.options.top_k === 40 && x.options.top_p === 0.9 && x.options.num_ctx === 4096 && x.options.temperature === 0.7 && x.options.num_predict === 160));
  const tanpaBeda = (x) => { const y = JSON.parse(JSON.stringify(x)); delete y.model; delete y.options.top_k; delete y.options.top_p; delete y.options.num_ctx; return JSON.stringify(y); };
  cek('M↔B: permintaan IDENTIK kecuali model + tiga opsi (termasuk riwayat & sistem)', a.every((x, i) => tanpaBeda(x) === tanpaBeda(b[i])));
  cek('periksaBadanSetaraD1 lulus pada contoh nyata pembungkus', periksaBadanSetaraD1(pasang.contoh, P.lengan).lulus, JSON.stringify(periksaBadanSetaraD1(pasang.contoh, P.lengan)));
  const rusak = { M: pasang.contoh.M, B: JSON.stringify({ ...JSON.parse(pasang.contoh.B), options: { ...JSON.parse(pasang.contoh.B).options, temperature: 0.6 } }) };
  cek('periksaBadanSetaraD1 menolak B yang suhunya berubah', !periksaBadanSetaraD1(rusak, P.lengan).lulus);
  cek('think:false + " /no_think" tetap dari E1 di kedua lengan', [...a, ...b].every((x) => x.think === false && x.messages.at(-1).content.endsWith(' /no_think')));
  let tertolak = false;
  try { badanLengan(JSON.stringify({ model: 'lain', options: {} }), P.lengan[1]); } catch { tertolak = true; }
  cek('badan bermodel selain E1 → pelari berhenti (gantiModel)', tertolak);

  console.log(bad === 0 ? `d1-npc-spesialis: ${n} uji lulus` : `d1-npc-spesialis: ${bad} gagal dari ${n}`);
  return bad === 0 ? 0 : 1;
}

// ── main ──────────────────────────────────────────────────────────────────────
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(await uji());
  const HOST = (process.env.OLLAMA_HOST || '').replace(/\/$/, '');
  if (!HOST || /localhost|127\.0\.0\.1/.test(HOST)) { console.error('BERHENTI: set OLLAMA_HOST ke alamat LAN Bmax (laptop bukan mesin ukur)'); process.exit(1); }
  const P = bacaPraDaftarLari();
  if (!P) { console.error(`BERHENTI: pra-daftar ${N.PRA_DAFTAR_D1} tidak terbaca/tidak lengkap`); process.exit(1); }
  const asap = arg.includes('--asap');
  // Asap pun hanya sesudah kunci (tinjauan 25 Sep, butir 10): jawaban berlabel lengan tidak boleh ada sebelum rancangan beku.
  const tolak = alasanTolakLari(P, N.periksaSidikD1(P.sidikWajib));
  if (tolak) { console.error(`BERHENTI: ${tolak.alasan}`); process.exit(tolak.kode); }
  const idB = await E2A.periksaIdentitasModel(HOST, P.lengan.find((L) => L.id === 'B').model, P.identitasWajib);
  if (!idB.cocok) { console.error(`BERHENTI: identitas lengan B: ${idB.alasan}`); process.exit(1); }
  const dgAwal = E2A.cocokDigest(await E2A.digestModel(HOST), P.digestWajib);
  if (!dgAwal.cocok) { console.error(`BERHENTI: digest: ${dgAwal.alasan}`); process.exit(1); }

  const beban = JSON.parse(fs.readFileSync(N.BEBAN_D1, 'utf8'));
  const sesiList = asap ? [1] : Array.from({ length: P.rancangan.sesi || 10 }, (_, i) => i + 1);
  const stempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonl = path.join(DI_SINI, `d1-npc-spesialis-${stempel}${asap ? '-asap' : ''}.jsonl`);
  console.log(`\n# D1 NPC spesialis — ${HOST} · ${os.hostname()} · sesi ${sesiList.join(',')} · ${asap ? 'ASAP (bukan data vonis)' : 'PENUH'} · pra-daftar ${N.PRA_DAFTAR_D1}\n`);

  let aktif = P.lengan[0];
  const pasang = pasangLenganD1(() => aktif);
  const baris = [];
  let blok = 0, berhenti = null;
  try {
    for (const s of sesiList) {
      for (const id of urutanLengan(s)) {
        blok++;
        aktif = P.lengan.find((L) => L.id === id);
        const digestBlok = (await E2A.digestModel(HOST))[aktif.model] || null;
        const tB = performance.now();
        for (const npc of beban.npc) await jawabNPC(personaD1(npc, beban, P.dial), [], 'Halo!');   // pemanasan, tidak dicatat
        for (const [idxNpc, npc] of beban.npc.entries()) {
          const persona = personaD1(npc, beban, P.dial);
          const riwayat = [];
          for (const [indeks, kal] of urutanSesiD1(npc, s, idxNpc).entries()) {
            const j = await jawabNPC(persona, riwayat, kal.q);
            const b = {
              lengan: id, model: aktif.model, sesi: s, blok, urutanLengan: urutanLengan(s).join('>'), npc: npc.id, indeks, kategori: kal.k, q: kal.q,
              ...(kal.pemilik ? { pemilik: kal.pemilik } : {}), t: new Date().toISOString(),
              ttftJawabMs: j.ttftMs ?? null, totalJawabMs: j.totalMs ?? null, lajuTok: j.lajuTok ?? null, promptMs: j.promptMs ?? null,
              tokPrompt: j.tokPrompt ?? null, tokKeluar: j.tokKeluar ?? null, pikirBocor: j.pikirPanjang ?? 0, galat: j.galat || null,
              teks: j.teks ?? null, teksMentah: j.teksMentah ?? null, digestModel: digestBlok, praDaftar: N.PRA_DAFTAR_D1, asap,
            };
            baris.push(b);
            fs.appendFileSync(jsonl, JSON.stringify(b) + '\n');
            if (!j.galat) riwayat.push(...entriRiwayat('persis', kal.q, j));
          }
        }
        const bs = baris.filter((x) => x.blok === blok);
        const g = bs.filter((x) => x.galat).length;
        // Hanya keabsahan & latensi — TIDAK ada metrik hasil per lengan sebelum validasi buta.
        console.log(`blok ${blok} · sesi ${s} · ${id}: ${bs.length} giliran · galat ${g} · awal p50 ${persentil(bs.map((x) => x.ttftJawabMs / 1000).filter(Number.isFinite), 50)?.toFixed(2)}s · ${Math.round((performance.now() - tB) / 1000)}s`);
        if (g > bs.length / 2) { berhenti = `blok ${blok}: galat ${g}/${bs.length}`; break; }
      }
      if (berhenti) break;
    }
  } finally { pasang.lepas(); }

  const dgAkhir = E2A.cocokDigest(await E2A.digestModel(HOST), P.digestWajib);
  const badan = periksaBadanSetaraD1(pasang.contoh, P.lengan);
  const Asah = asap ? { ...P.A, gilirPerLengan: 54 } : P.A;
  const sah = N.periksaSahRunD1(baris.map((b) => ({ ...b, asap: false })), Asah, P.digestWajib, P.lengan);
  const latensi = Object.fromEntries(N.LENGAN.map((L) => {
    const xs = baris.filter((b) => b.lengan === L && !b.galat);
    const ttft = xs.map((b) => b.ttftJawabMs / 1000).filter(Number.isFinite), tot = xs.map((b) => b.totalJawabMs / 1000).filter(Number.isFinite);
    return [L, { n: xs.length, ttftP50: persentil(ttft, 50), ttftP95: persentil(ttft, 95), totalP50: persentil(tot, 50), tokKeluarRata: xs.length ? xs.reduce((a, b) => a + (b.tokKeluar || 0), 0) / xs.length : null }];
  }));
  const lulus = !berhenti && dgAkhir.cocok && badan.lulus && sah.lulus;
  const f = path.join(DI_SINI, `HASIL-D1-${stempel}${asap ? '-asap' : ''}.json`);
  fs.writeFileSync(f, JSON.stringify({ praDaftar: N.PRA_DAFTAR_D1, stempel, asap, host: HOST, mesin: os.hostname(), sesi: sesiList, nGiliran: baris.length,
    berhenti, identitasB: idB, digestAwal: dgAwal, digestAkhir: dgAkhir, badanSetara: badan, pembungkus: pasang.hitung(), keabsahanRun: sah,
    latensi_DESKRIPTIF: latensi, jsonl: path.basename(jsonl), lulus }, null, 1));
  console.log(`\n## keabsahan: ${lulus ? 'LULUS' : 'GAGAL'} · badan setara ${badan.lulus} · digest akhir ${dgAkhir.cocok} · run ${sah.lulus ? 'sah' : sah.masalah.join('; ')}${berhenti ? ` · BERHENTI ${berhenti}` : ''}`);
  console.log(`## hasil per lengan BELUM dihitung — validasi buta dulu (eval/nilai-d1.mjs --sampel ${path.basename(jsonl)})`);
  console.log(`   ringkasan → ${path.basename(f)} · giliran → ${path.basename(jsonl)}\nKODE_KELUAR ${lulus ? 0 : 3}`);
  process.exit(lulus ? 0 : 3);
}
