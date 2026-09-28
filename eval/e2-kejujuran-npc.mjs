#!/usr/bin/env node
/**
 * e2-kejujuran-npc.mjs — harness E2' (pra-daftar flywheel/PRA-DAFTAR-E2-KEJUJURAN-NPC.json).
 *
 * Satu dial: paragraf BATAS (dibaca dari pra-daftar, tidak diketik ulang) di akhir persona.
 * Lengan 'polos' vs 'batas'; tanpa gerbang/probe; riwayat PERSIS; soal & urutan sama per sesi.
 * Permintaan ke model dibuat oleh jawabNPC() milik harness E1 — identik byte-demi-byte dengan
 * E1b kecuali pesan sistemnya.
 *
 * Harness ini HANYA mengumpulkan data + menilai Q_LATENSI. Q_JUJUR dihitung eval/nilai-e2-npc.mjs
 * SESUDAH validasi buta instrumen lulus (aturan pra-daftar).
 *
 *   node eval/e2-kejujuran-npc.mjs --uji                       # uji luring, tanpa jaringan
 *   OLLAMA_HOST=http://measure-host.local:11434 node eval/e2-kejujuran-npc.mjs [--sesi 5] [--mulai 1] [--asap]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
export const PRA_DAFTAR_E2 = 'flywheel/PRA-DAFTAR-E2-KEJUJURAN-NPC.json';
const BEBAN_E2 = path.join(DI_SINI, 'beban-e2-npc.json');

const E1 = await import(pathToFileURL(path.join(DI_SINI, 'e1-latensi-npc.mjs')).href);
const { urutkanKalimat, bangunPersona, jawabNPC, entriRiwayat, persentil, nilaiPertanyaan, ambangDariTeks } = E1;

/** Pra-daftar E2': teks batas (dial) + ambang Q_LATENSI (pengurai E1) + ambang Q_JUJUR terstruktur. */
export function bacaPraDaftarE2(akar = AKAR) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(akar, PRA_DAFTAR_E2), 'utf8')); } catch { return null; }
  const batasTeks = j?.dial?.teksBatas;
  const ambangLatensi = ambangDariTeks(j?.aturanKeputusan_DIKUNCI?.Q_LATENSI?.LULUS);
  const ambangJujur = j?.ambangTerstruktur_Q_JUJUR;
  if (!batasTeks || !ambangLatensi || !ambangJujur) return null;
  return { batasTeks, ambangLatensi, ambangJujur, dikunci: j.dikunci === true, nama: j.nama || '', teksAturan: j.aturanKeputusan_DIKUNCI };
}

/**
 * Delapan kalimat satu NPC di satu sesi, dalam urutan E1 (sapa, tahu, luar) SEBELUM diacak.
 * Rotasi (beban-e2): tahu = indeks (s-1)%5, s%5, (s+1)%5; luar = 3·((s-1)%5) … +2.
 */
export function kalimatSesi(npc, sesi) {
  const r = (sesi - 1) % 5;
  const tahu = [r, (r + 1) % 5, (r + 2) % 5].map((i) => ({ k: 'tahu', q: npc.tahu[i].q }));
  const luar = [0, 1, 2].map((d) => ({ k: 'luar', q: npc.luar[3 * r + d] }));
  return [...npc.sapa.map((q) => ({ k: 'sapa', q })), ...tahu, ...luar];
}

/** Urutan giliran = urutkanKalimat() E1 atas kalimat sesi itu (benih sesi×1000 + indeks NPC). */
export function urutanSesi(npc, sesi, idxNpc) {
  return urutkanKalimat({ kalimat: kalimatSesi(npc, sesi) }, sesi, idxNpc);
}

/** Persona lengan. 'batas' = persona polos + baris baru + teks batas — polos adalah AWALANNYA. */
export function personaLengan(npc, lengan, batasTeks) {
  const polos = bangunPersona(npc);
  if (lengan === 'polos') return polos;
  if (lengan === 'batas') return `${polos}\n${batasTeks}`;
  throw new Error(`lengan tak dikenal: ${lengan}`);
}

// ── uji luring ────────────────────────────────────────────────────────────────
async function uji() {
  let n = 0, bad = 0;
  const cek = (nama, ok, info = '') => { n++; console.log(`${ok ? '✓' : '✗'} ${nama}${ok ? '' : `  ← ${info}`}`); if (!ok) bad++; };
  const beban = JSON.parse(fs.readFileSync(BEBAN_E2, 'utf8'));
  const e1 = JSON.parse(fs.readFileSync(path.join(DI_SINI, 'beban-e1-npc.json'), 'utf8'));
  const P = bacaPraDaftarE2();
  cek('pra-daftar E2 terbaca: teks batas + ambang latensi + ambang jujur', !!P);
  cek('pra-daftar E2 DIKUNCI', P?.dikunci === true);
  cek("run E2 dimiliki pra-daftarnya SENDIRI (kelas F-252)", /^E2'/.test(P?.nama || '') && PRA_DAFTAR_E2 !== 'flywheel/PRA-DAFTAR-E1B-RIWAYAT.json', P?.nama);
  cek('ambang latensi E2 IDENTIK dengan E1 (kalimat disalin kata per kata)', JSON.stringify(P?.ambangLatensi) === JSON.stringify(E1.bacaAmbang()), JSON.stringify(P?.ambangLatensi));
  // Setiap angka terstruktur Q_JUJUR harus tertulis di kalimat aturannya (tidak menyimpang diam-diam).
  const teksJujur = JSON.stringify(P?.teksAturan?.Q_JUJUR || {});
  // Bentuk yang diterima: "15,0" · "10.000" (pemisah ribuan) · polos "20260923" (hanya ≥ 1000).
  // Harus berdiri sendiri: "5,0" di dalam "15,0" TIDAK dihitung.
  const angkaTertulis = (x) => {
    const s = String(x);
    const bentuk = [`${s.replace('.', ',')},0`, s.replace(/\B(?=(\d{3})+(?!\d))/g, '.')];
    if (x >= 1000) bentuk.push(s);
    return bentuk.some((f) => new RegExp(`(?<![\\d.,])${f.replace(/[.]/g, '\\.')}(?![\\d])`).test(teksJujur));
  };
  const A = P?.ambangJujur || {};
  const kunciAngka = Object.keys(A).filter((k) => typeof A[k] === 'number');
  const hilang = kunciAngka.filter((k) => !angkaTertulis(A[k]));
  cek('tiap ambang terstruktur Q_JUJUR tertulis di kalimat aturannya', hilang.length === 0, hilang.join(', '));

  // Beban: identitas & pengetahuan DISALIN dari E1, bukan diketik ulang
  cek('beban E2: 6 NPC, identitas & pengetahuan identik dengan E1', beban.npc.length === 6 && beban.npc.every((nb, i) => nb.id === e1.npc[i].id && nb.nama === e1.npc[i].nama && nb.peran === e1.npc[i].peran && JSON.stringify(nb.pengetahuan) === JSON.stringify(e1.npc[i].pengetahuan)));
  // Rotasi dan ukuran
  let ukuranOk = true, luarSekali = true;
  for (const nb of beban.npc) {
    const dipakai = [];
    for (let s = 1; s <= 10; s++) {
      const k = kalimatSesi(nb, s);
      if (k.length !== 8 || k.filter((x) => x.k === 'sapa').length !== 2 || k.filter((x) => x.k === 'tahu').length !== 3 || k.filter((x) => x.k === 'luar').length !== 3) ukuranOk = false;
      if (s <= 5) dipakai.push(...k.filter((x) => x.k === 'luar').map((x) => x.q));
    }
    if (new Set(dipakai).size !== 15 || dipakai.length !== 15) luarSekali = false;
  }
  cek('tiap sesi 1–10: 8 kalimat = 2 sapa + 3 tahu + 3 luar', ukuranOk);
  cek('sesi 1–5: 15 soal luar per NPC, masing-masing TEPAT sekali', luarSekali);
  const tahuHitung = {};
  for (let s = 1; s <= 5; s++) for (const x of kalimatSesi(beban.npc[0], s).filter((y) => y.k === 'tahu')) tahuHitung[x.q] = (tahuHitung[x.q] || 0) + 1;
  cek('sesi 1–5: tiap soal tahu muncul 3 kali', Object.values(tahuHitung).length === 5 && Object.values(tahuHitung).every((v) => v === 3), JSON.stringify(tahuHitung));
  // Sesi 1 = E1 persis, termasuk URUTAN (supaya data E1/E1b sebanding di sesi 1)
  cek('sesi 1: kalimat & urutan IDENTIK dengan E1 untuk keenam NPC', beban.npc.every((nb, i) => JSON.stringify(urutanSesi(nb, 1, i).map((x) => x.q)) === JSON.stringify(urutkanKalimat(e1.npc[i], 1, i).map((x) => x.q))));
  // Dial: satu-satunya beda persona adalah paragraf batas DI AKHIR (polos = awalan batas)
  const pp = personaLengan(beban.npc[1], 'polos', P?.batasTeks), pb = personaLengan(beban.npc[1], 'batas', P?.batasTeks);
  cek('persona polos = persona E1 persis', pp === bangunPersona(e1.npc[1]));
  cek('persona batas = polos + baris baru + teks batas (polos adalah awalannya)', pb.startsWith(pp) && pb.slice(pp.length) === `\n${P?.batasTeks}`);

  // Ujung-ke-ujung dengan fetch palsu: kedua lengan mengirim permintaan IDENTIK kecuali pesan sistem
  const terkirim = [];
  const fetchAsli = globalThis.fetch;
  globalThis.fetch = async (_url, opsi) => {
    terkirim.push(JSON.parse(opsi.body));
    return { ok: true, body: (async function* () {
      yield JSON.stringify({ message: { content: ' Halo juga! ' } }) + '\n';
      yield JSON.stringify({ message: { content: '' }, done: true, eval_count: 5, eval_duration: 5e8, prompt_eval_count: 10, prompt_eval_duration: 1e8 }) + '\n';
    })() };
  };
  try {
    for (const lengan of ['polos', 'batas']) {
      const riwayat = [];
      for (const kal of urutanSesi(beban.npc[1], 1, 1).slice(0, 3)) {
        const j = await jawabNPC(personaLengan(beban.npc[1], lengan, P?.batasTeks), riwayat, kal.q);
        riwayat.push(...entriRiwayat('persis', kal.q, j));
      }
    }
  } finally { globalThis.fetch = fetchAsli; }
  const [a, b] = [terkirim.slice(0, 3), terkirim.slice(3, 6)];
  const tanpaSistem = (x) => JSON.stringify({ ...x, messages: x.messages.slice(1) });
  cek('fetch palsu: 3 permintaan per lengan', a.length === 3 && b.length === 3);
  cek('kedua lengan: permintaan IDENTIK kecuali pesan sistem', a.every((x, i) => tanpaSistem(x) === tanpaSistem(b[i])));
  cek('pesan sistem TETAP sepanjang percakapan (awalan stabil, F-265)', [a, b].every((arm) => arm.every((x) => x.messages[0].content === arm[0].messages[0].content)));
  cek('riwayat persis: pesan pengguna giliran-2 di riwayat = yang dikirim di giliran-1', a[1].messages[1].content === a[0].messages.at(-1).content);
  cek('tanpa gerbang: tidak ada arahan di pesan sistem mana pun', [...a, ...b].every((x) => !/JANGAN menjawab isinya|Katakan dengan jujur bahwa kamu tidak tahu/.test(x.messages[0].content)));

  console.log(bad === 0 ? `e2-kejujuran-npc: ${n} uji lulus` : `e2-kejujuran-npc: ${bad} gagal dari ${n}`);
  return bad === 0 ? 0 : 1;
}

// ── main ──────────────────────────────────────────────────────────────────────
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(await uji());
  const HOST = (process.env.OLLAMA_HOST || '').replace(/\/$/, '');
  if (!HOST || /localhost|127\.0\.0\.1/.test(HOST)) { console.error('BERHENTI: set OLLAMA_HOST ke Bmax (laptop bukan mesin ukur)'); process.exit(1); }
  const P = bacaPraDaftarE2();
  if (!P) { console.error(`BERHENTI: pra-daftar ${PRA_DAFTAR_E2} tidak terbaca`); process.exit(1); }
  const asap = arg.includes('--asap');
  if (!P.dikunci && !asap) { console.error('BERHENTI: pra-daftar belum dikunci'); process.exit(1); }
  const nSesi = Number(arg[arg.indexOf('--sesi') + 1]) || 5;
  const mulai = arg.includes('--mulai') ? Number(arg[arg.indexOf('--mulai') + 1]) : 1;
  const beban = JSON.parse(fs.readFileSync(BEBAN_E2, 'utf8'));
  const stempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonl = path.join(DI_SINI, `e2-kejujuran-npc-${stempel}${asap ? '-asap' : ''}.jsonl`);
  const sesiList = Array.from({ length: nSesi }, (_, i) => mulai + i);
  console.log(`\n# E2' kejujuran NPC — ${HOST} · lengan polos → batas (blok) · sesi ${sesiList.join(',')} · pra-daftar ${PRA_DAFTAR_E2}${asap ? ' · ASAP (bukan vonis)' : ''}\n`);

  const baris = [];
  for (const lengan of ['polos', 'batas']) {
    // Pemanasan: keenam persona lengan ini (tidak dicatat) — bagian dari rancangan yang diuji.
    const tP = performance.now();
    for (const npc of beban.npc) await jawabNPC(personaLengan(npc, lengan, P.batasTeks), [], 'Halo!');
    console.log(`# ${lengan}: pemanasan 6 persona ${((performance.now() - tP) / 1000).toFixed(1)} dtk`);
    for (const sesi of sesiList) {
      const tS = performance.now();
      for (const [idxNpc, npc] of beban.npc.entries()) {
        const persona = personaLengan(npc, lengan, P.batasTeks);
        const riwayat = [];
        for (const [indeks, kal] of urutanSesi(npc, sesi, idxNpc).entries()) {
          const j = await jawabNPC(persona, riwayat, kal.q);
          const b = {
            lengan, sesi, npc: npc.id, indeks, kategori: kal.k, q: kal.q, t: new Date().toISOString(),
            ttftJawabMs: j.ttftMs ?? null, totalJawabMs: j.totalMs ?? null, lajuTok: j.lajuTok ?? null,
            promptMs: j.promptMs ?? null, tokPrompt: j.tokPrompt ?? null, tokKeluar: j.tokKeluar ?? null,
            pikirBocor: j.pikirPanjang ?? 0, galat: j.galat || null, teks: j.teks ?? null,
            praDaftar: PRA_DAFTAR_E2, asap,
          };
          baris.push(b);
          fs.appendFileSync(jsonl, JSON.stringify(b) + '\n');
          if (!j.galat) riwayat.push(...entriRiwayat('persis', kal.q, j));
        }
      }
      const bs = baris.filter((x) => x.lengan === lengan && x.sesi === sesi);
      const p = (q) => persentil(bs.map((x) => x.ttftJawabMs / 1000), q);
      console.log(`${lengan} sesi ${sesi}: ${bs.length} giliran · galat ${bs.filter((x) => x.galat).length} · awal p50 ${p(50)?.toFixed(2)}s p95 ${p(95)?.toFixed(2)}s · ${Math.round((performance.now() - tS) / 1000)}s`);
    }
  }
  const lat = {};
  for (const lengan of ['polos', 'batas']) lat[lengan] = nilaiPertanyaan(baris.filter((b) => b.lengan === lengan), 'ttftJawabMs', P.ambangLatensi);
  console.log(`\n## Q_LATENSI — lengan batas (divonis): ${lat.batas.vonis}`);
  for (const [k, s] of Object.entries(lat.batas.syarat || {})) console.log(`   ${s.lulus ? '✓' : '✗'} ${k}  ${s.nilai?.toFixed(2)}  (ambang ${s.ambang})`);
  console.log(`   (polos, deskriptif: ${lat.polos.vonis})`);
  console.log(`\n## Q_JUJUR — BELUM dihitung: wajib validasi buta instrumen dulu (eval/nilai-e2-npc.mjs).`);
  const f = path.join(DI_SINI, `HASIL-E2-KEJUJURAN-NPC-${stempel}${asap ? '-asap' : ''}.json`);
  fs.writeFileSync(f, JSON.stringify({ praDaftar: PRA_DAFTAR_E2, stempel, asap, host: HOST, sesi: sesiList, nGiliran: baris.length, Q_LATENSI: lat, jsonl: path.basename(jsonl) }, null, 1));
  console.log(`   ringkasan → ${path.basename(f)} · giliran → ${path.basename(jsonl)}`);
}
