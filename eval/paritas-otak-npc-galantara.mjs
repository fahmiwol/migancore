#!/usr/bin/env node
/**
 * paritas-otak-npc-galantara.mjs — penjaga: otak NPC Galantara mengirim permintaan yang SAMA
 * byte-demi-byte dengan lengan 'batas' E2' (F-267). Yang diukur E2' hanya berlaku untuk yang
 * dilayankan selama keduanya identik; satu byte persona/paragraf/opsi berubah = keluar dari data.
 *
 * Yang dibandingkan (semua dari sumbernya, tidak ada yang diketik ulang di sini):
 *   - paragraf batas: galantara-server/otak-npc.js TEKS_BATAS  ==  pra-daftar E2' dial.teksBatas
 *   - persona tiap NPC: persona(config.js NPC)  ==  personaLengan(beban-e2 NPC, 'batas')
 *   - badan permintaan: bangunBadan(...)  ==  badan jawabNPC() harness E1 (dicegat lewat fetch palsu)
 *   - model bawaan: migancore:0.14 (yang diukur E2')
 * NPC yang ada di Galantara tetapi tidak di beban E2' = BELUM DIUKUR (peringatan, bukan gagal).
 *
 * Repo Galantara dicari di GALANTARA_REPO, lalu <local-dir>, lalu <local-dir>.
 * Tidak ditemukan (mesin lain) → LEWAT dengan catatan, kode 0.
 *
 *   node eval/paritas-otak-npc-galantara.mjs [--uji] [--config <jalur-atau-URL config.js>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const E1 = await import(pathToFileURL(path.join(DI_SINI, 'e1-latensi-npc.mjs')).href);
const E2 = await import(pathToFileURL(path.join(DI_SINI, 'e2-kejujuran-npc.mjs')).href);
const MODEL_DIUKUR = 'migancore:0.14';

export function cariGalantara(calon = [process.env.GALANTARA_REPO, '<local-dir>', '<local-dir>']) {
  return calon.filter(Boolean).find((d) => fs.existsSync(path.join(d, 'galantara-server', 'otak-npc.js'))) || null;
}

/**
 * Muat config.js Galantara persis seperti server memuatnya (data: URL, modul ES).
 * `sumberConfig` = jalur berkas ATAU URL (E5-pasang: config.js situs statis yang LIVE — yang benar-benar
 * dibaca server lewat OTAK_NPC_CONFIG; deploy statis yang tertinggal membuat persona berbeda).
 */
async function muatNpcsGalantara(akar, sumberConfig = null) {
  const src = sumberConfig && /^https?:\/\//.test(sumberConfig)
    ? await (await fetch(sumberConfig, { signal: AbortSignal.timeout(20000) })).text()
    : fs.readFileSync(sumberConfig || path.join(akar, 'src', 'data', 'config.js'), 'utf8');
  return (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(src)}`)).NPCS;
}

/** Badan yang dikirim jawabNPC() E1 untuk (sistem, riwayat, q) — dicegat, tanpa jaringan. */
async function badanE1(sistem, riwayat, q) {
  const asli = globalThis.fetch;
  let badan = null;
  globalThis.fetch = async (_u, o) => { badan = o.body; throw new Error('dicegat'); };
  try { await E1.jawabNPC(sistem, riwayat, q); } finally { globalThis.fetch = asli; }
  return badan;
}

/** Posisi byte pertama yang berbeda (untuk laporan), atau -1. */
export function bedaPertama(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return -1;
}

/** Muat otak-npc.js dengan satu penggantian teks di SUMBERNYA (di memori) — untuk uji mutasi. */
function muatDenganMutasi(akar, cari, ganti) {
  const berkas = path.join(akar, 'galantara-server', 'otak-npc.js');
  const src = fs.readFileSync(berkas, 'utf8');
  if (!src.includes(cari)) return null;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', '__dirname', '__filename', src.replace(cari, ganti))(m, m.exports, createRequire(berkas), path.dirname(berkas), berkas);
  return m.exports;
}
const MUTASI = [
  ['temperature: 0.7', 'temperature: 0.8'],
  ['Jangan mengarang', 'Jangan  mengarang'],
  ["'Yang kamu tahu:'", "'Yang kamu ketahui:'"],
];

export async function periksa(akar, { O: Oganti = null, sumberConfig = null } = {}) {
  const hasil = [];
  const cek = (nama, ok, info = '') => hasil.push({ nama, ok: !!ok, info });
  const O = Oganti || createRequire(path.join(akar, 'galantara-server', 'index.js'))('./otak-npc.js');
  const P = E2.bacaPraDaftarE2();
  const beban = JSON.parse(fs.readFileSync(path.join(DI_SINI, 'beban-e2-npc.json'), 'utf8'));
  const npcs = await muatNpcsGalantara(akar, sumberConfig);

  cek("paragraf batas = dial pra-daftar E2'", O.TEKS_BATAS === P?.batasTeks, `beda di byte ${bedaPertama(O.TEKS_BATAS, P?.batasTeks || '')}`);
  for (const nb of beban.npc) {
    const ng = npcs.find((n) => n.id === nb.id);
    if (!ng) { cek(`persona ${nb.id}: ada di Galantara`, false, 'NPC terukur hilang dari config.js'); continue; }
    const g = O.persona(ng), e = E2.personaLengan(nb, 'batas', P?.batasTeks);
    const i = bedaPertama(g, e);
    cek(`persona ${nb.id} = lengan batas E2'`, i === -1, `beda di byte ${i}: Galantara «${g.slice(Math.max(0, i - 20), i + 30)}» vs E2' «${e.slice(Math.max(0, i - 20), i + 30)}»`);
  }
  const belum = npcs.filter((n) => !beban.npc.some((b) => b.id === n.id)).map((n) => n.id);

  const sistem = E2.personaLengan(beban.npc[1], 'batas', P?.batasTeks);
  const riwayat = [{ role: 'user', content: 'Halo /no_think' }, { role: 'assistant', content: ' Halo juga! ' }];
  const bE1 = await badanE1(sistem, riwayat, 'Kamu suka ke mana?');
  const bG = O.bangunBadan(O.bacaPengaturan({}).model, sistem, riwayat, 'Kamu suka ke mana? /no_think');
  cek('badan permintaan = jawabNPC() E1, byte-demi-byte', bE1 !== null && bG === bE1, `beda di byte ${bedaPertama(bG, bE1 || '')}`);
  cek(`model bawaan = ${MODEL_DIUKUR} (yang diukur E2')`, O.bacaPengaturan({}).model === MODEL_DIUKUR, O.bacaPengaturan({}).model);
  cek('bawaan MATI tanpa OTAK_NPC=hidup + host', O.bacaPengaturan({}).hidup === false && O.bacaPengaturan({ OTAK_NPC: 'hidup' }).hidup === false);

  // Penjaga harus MENANGKAP mutasi kecil di sumber otak-npc.js (C56: periksa instrumennya dulu).
  if (!Oganti) {
    const tertangkap = [];
    for (const [cari, ganti] of MUTASI) {
      const Om = muatDenganMutasi(akar, cari, ganti);
      if (!Om) { tertangkap.push(`«${cari}» tak ada di sumber`); continue; }
      const r = await periksa(akar, { O: Om, sumberConfig });
      if (r.hasil.every((h) => h.ok)) tertangkap.push(`LOLOS: «${cari}» → «${ganti}»`);
    }
    cek(`penjaga menangkap ${MUTASI.length}/${MUTASI.length} mutasi sumber (opsi, paragraf batas, templat persona)`, tertangkap.length === 0, tertangkap.join('; '));
  }
  return { hasil, belum };
}

async function utama() {
  const akar = cariGalantara();
  if (!akar) { console.log('LEWAT: repo Galantara dengan galantara-server/otak-npc.js tidak ada di mesin ini.'); return 0; }
  const i = process.argv.indexOf('--config');
  const sumberConfig = i > 0 ? process.argv[i + 1] : null;
  const { hasil, belum } = await periksa(akar, { sumberConfig });
  console.log(`Galantara: ${akar}${sumberConfig ? ` · config: ${sumberConfig}` : ''}`);
  for (const h of hasil) console.log(`${h.ok ? '✓' : '✗'} ${h.nama}${h.ok ? '' : `  ← ${h.info}`}`);
  if (belum.length) console.log(`⚠ NPC belum diukur E2' (persona mengikuti templat yang sama, tapi tanpa data): ${belum.join(', ')}`);
  const gagal = hasil.filter((h) => !h.ok).length;
  console.log(gagal ? `${gagal} GAGAL — yang dilayankan Galantara keluar dari yang diukur E2'.` : `LULUS ${hasil.length}/${hasil.length}.`);
  return gagal ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await utama());
