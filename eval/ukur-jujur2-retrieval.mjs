#!/usr/bin/env node
/**
 * ukur-jujur2-retrieval — L2b (HANDOFF-8SEP §4): petak-jujur2 diukur pada
 * <modelJawab> + GERBANG JEBAKAN + RETRIEVAL PRODUKSI, yaitu jalur yang benar-benar
 * dipakai `migancore_tanya`. Sampai hari ini seluruh papan MENGARANG mengukur model
 * POLOS; produksi menjawab dari korpus. Telusur kegagalan 8 Sep memberi kelas
 * terbesar SALAH-FAKTA 40 % — dan pertanyaannya: hilangkah ia kalau modelnya
 * membaca catatan?
 *
 * Instrumen, petak, penilai SAMA PERSIS dengan ukur-jujur2.mjs (`satuPutaran` +
 * `rangkum` diimpor, C29). Pembungkus, opsi sampling, num_ctx, dan retrieval
 * diambil dari `mcp/kanon.js` — modul yang SAMA yang di-require server.js — jadi
 * yang diukur adalah jalur produksi, bukan salinannya.
 *
 * TIGA LENGAN (`--sumber`), karena satu angka saja tidak bisa dibaca:
 *
 *   bersih   retrieval produksi TANPA transkrip sesi (`type=session` dibuang).
 *            Ini pengukuran yang SAH. Sebabnya: liputan-retrieval.mjs (9 Sep)
 *            menemukan 67 % potongan yang ditarik untuk petak adalah transkrip
 *            sesi Claude kami sendiri — termasuk kunci jawaban petak, verbatim
 *            ("#7/#8/#13: memukul", "yang benar timah"). Model yang membaca itu
 *            tidak sedang menjawab; ia sedang menyontek (C54).
 *   penuh    retrieval produksi apa adanya, termasuk transkrip. DIAGNOSTIK:
 *            selisihnya terhadap `bersih` = ukuran kebocoran kunci jawaban ke
 *            serving produksi hari ini.
 *   plasebo  pembungkus produksi (pesan sistem, suhu 0,3, num_ctx 8192) dengan
 *            catatan KOSONG — persis cabang "tidak ada yang cocok" di produksi.
 *            Mengisolasi PEMBUNGKUS dari ISI retrieval: selisih bersih − plasebo
 *            = sumbangan isi catatan; selisih plasebo − 15,5 % = sumbangan
 *            pembungkus (suhu/prompt/ctx). Tanpa lengan ini, kenaikan apa pun
 *            tidak bisa dialamatkan.
 *
 * Yang SENGAJA berbeda dari produksi, dan dicatat:
 *   - batas waktu per jawaban (produksi tidak punya; pengukur wajib — C33)
 *   - `penjagaSitasi` (catatan kaki orkestrasi) TIDAK ditempel ke teks yang
 *     dinilai. Ia mengubah apa yang dilihat pengguna, bukan apa yang dikatakan
 *     model, dan kosakatanya ("KARANGAN") bisa mengecoh penilai regex. Jumlah
 *     berkas karangan tetap dihitung per baris (`sitasiKarangan`).
 *
 * Pakai:
 *   node eval/ukur-jujur2-retrieval.mjs migancore:0.4-qwen3 --probe migancore:0.4-qwen3 --sumber bersih --putaran 3
 *   node eval/ukur-jujur2-retrieval.mjs migancore:0.4-qwen3 --probe migancore:0.4-qwen3 --sumber plasebo --batas-soal 3   (asap)
 *   node eval/ukur-jujur2-retrieval.mjs --uji
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PUBLIK } from './petak-jujur2.mjs';
import { BAYANGAN } from './petak-bayangan.mjs';
import { satuPutaran, rangkum, namaBerkas, BATAS_DETIK } from './ukur-jujur2.mjs';
import { probe } from './probe-keterjawaban.mjs';
import { jalankan, pencatatJsonl } from '../sistem/gerbang-jebakan.mjs';

const require = createRequire(import.meta.url);
const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434') + '/api/chat';
const OMIGA_DIR = process.env.OMIGA_DIR || '<memory-dir>';
const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', A = '\x1b[2m', R = '\x1b[0m';

export const SUMBER = ['bersih', 'penuh', 'plasebo'];
export const K_BAWAAN = 6; // sama dengan serving (`cariCatatan(q, a.k)` → 6)

// 9 Sep: run pertama kehilangan 8 dari 9 putaran karena Ollama berhenti di tengah
// dan pelari TERUS BERJALAN — putaran 3-9 hanya membuang waktu koneksi (3-11 dtk
// masing-masing, 36/36 `fetch failed`). Ambang GALAT ada dan bekerja (semua ditandai
// TIDAK SAH), tapi ia hanya menilai putaran, tidak menghentikan run.
//
// Setengah petak gagal jaringan bukan derau — itu 18 kegagalan berturut-turut, dan
// pra-daftar sudah membuang putaran itu (>10 % GALAT = TIDAK SAH). Meneruskannya
// tidak bisa menghasilkan apa pun kecuali berkas kosong.
//
// Yang TIDAK berubah: cara satu pun angka dihitung. Ini hanya menentukan KAPAN
// berhenti, jadi ia tidak menyentuh perbandingan yang dikunci pra-daftar.
export const AMBANG_BATAL_GALAT = 0.5;
export const KODE_KELUAR_SERVER_MATI = 3;

/** Modul produksi: kanon.js (pembungkus + retrieval) dan corpus.js omiga-brain. */
export function muatProduksi(omigaDir = OMIGA_DIR) {
  const KANON = require(path.join(DI_SINI, '..', 'mcp', 'kanon.js'));
  let C = null, galatKorpus = null;
  try { C = require(path.join(omigaDir, 'mcp', 'omiga-brain', 'corpus.js')); }
  catch (e) { galatKorpus = e?.message || String(e); }
  return { KANON, C, galatKorpus };
}

/** Saringan hit per lengan. `null` = tidak disaring (produksi apa adanya). */
export function saringanUntuk(sumber) {
  if (sumber === 'bersih') return (h) => h && h.type !== 'session';
  if (sumber === 'plasebo') return () => false;
  if (sumber === 'penuh') return null;
  throw new Error(`--sumber harus salah satu dari ${SUMBER.join('|')}, bukan "${sumber}"`);
}

/**
 * Label berkas hasil — memisahkan L2b dari SEMUA hasil lain by construction.
 *
 * `petak` dan `prompt` IKUT ke nama berkas (L2c-P). Tanpa itu, hasil petak
 * bayangan akan dibaca `bacaPapan()` sebagai baris petak-jujur2 dan dirata-ratakan
 * ke angka yang petaknya berbeda — C29 dalam bentuk paling senyap. `bank` di isi
 * berkas juga diisi, jadi ada dua lapis yang harus salah bersamaan sebelum
 * tercampur.
 */
export function labelBerkas(sumber, modelProbe, batasSoal = 0, petak = 'jujur2', prompt = 'lama') {
  const p = petak === 'jujur2' ? '' : `-${petak}`;
  const q = prompt === 'lama' ? '' : `-prompt_${prompt}`;
  return `retrieval-${sumber}${p}${q}-gerbang-on-${modelProbe.replace(/[:/]/g, '_')}${batasSoal ? '-asap' : ''}`;
}

/** Cermin `tanyaOllama` produksi + batas waktu. Opsi & num_ctx dari kanon.js. */
export async function tanyaProduksi(KANON, model, teks, sistem, { batasDetik = BATAS_DETIK, numCtx = KANON.NUM_CTX_BERINGATAN_BAWAAN } = {}) {
  const kendali = new AbortController();
  const jam = setTimeout(() => kendali.abort(), batasDetik * 1000);
  const badan = JSON.stringify({
    model,
    messages: [{ role: 'system', content: sistem }, { role: 'user', content: teks }],
    stream: false,
    options: Object.assign({}, KANON.OPSI_PRODUKSI, { num_ctx: numCtx }),
  });
  const kirim = () => fetch(OLLAMA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: kendali.signal, body: badan });
  try {
    let r = await kirim();
    // produksi: sekali ulang sesudah 3 dtk pada 400/5xx (pemuatan ulang model di GPU 6 GB)
    if (!r.ok && (r.status === 400 || r.status >= 500)) { await new Promise((s) => setTimeout(s, 3000)); r = await kirim(); }
    if (!r.ok) return { ok: false, sebab: `ollama ${r.status}: ${(await r.text()).slice(0, 160)}` };
    const d = await r.json();
    if (typeof d?.message?.content !== 'string') return { ok: false, sebab: 'balasan tanpa message.content' };
    return { ok: true, teks: d.message.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() };
  } catch (e) {
    return { ok: false, sebab: String(e?.name === 'AbortError' ? `lewat ${batasDetik}s` : e).slice(0, 160) };
  } finally {
    clearTimeout(jam);
  }
}

/** Hitung berkas yang disebut model tapi tidak ada di sumber (cermin penjagaSitasi, tanpa menempel teks). */
export function sitasiKarangan(teks, sumber, KANON, omigaDir = OMIGA_DIR) {
  const disebut = new Set();
  for (const m of String(teks).matchAll(/[\w][\w./\\-]{2,80}\.(?:md|jsonl?|txt|pdf|csv)\b/gi)) disebut.add(m[0]);
  if (!disebut.size) return [];
  let bukuSah = '';
  try { bukuSah = KANON.muatKanon(omigaDir).map((z) => z.berkas).join(' '); } catch { bukuSah = ''; }
  const sah = ((sumber || []).map((s) => `${s.judul || ''} ${s.path || ''}`).join(' ') + ' BRIEF.md ' + bukuSah).toLowerCase();
  return [...disebut].filter((d) => !sah.includes(d.toLowerCase().split(/[\\/]/).pop()));
}

/**
 * Bangun `tanya(model, q)` untuk satuPutaran: retrieval → gerbang → jawab produksi.
 * Semua I/O bisa disuntik (uji tanpa jaringan). Keputusan per soal disimpan lewat `simpan`.
 */
export function buatTanyaRetrieval({ KANON, C, galatKorpus, sumber, k = K_BAWAAN, omigaDir = OMIGA_DIR, probeFn, jawabFn, catat, simpan, prompt = 'lama' }) {
  const saring = saringanUntuk(sumber);
  // L2c-P: dial tunggal. `lama` = pembungkus produksi hari ini, `baru` = kandidat V2.
  // Dipilih DI SINI supaya seluruh sisa jalur (retrieval, gerbang, sampler, num_ctx)
  // tetap identik — kalau dua hal berubah sekaligus, tidak ada yang bisa ditafsirkan.
  if (prompt !== 'lama' && prompt !== 'baru') throw new Error(`--prompt harus lama|baru, bukan "${prompt}"`);
  const bungkus = prompt === 'baru' ? KANON.SISTEM_BERINGATAN_V2 : KANON.SISTEM_BERINGATAN;
  const jawab = jawabFn || ((model, q, sistem) => tanyaProduksi(KANON, model, q, sistem));
  return async (model, q) => {
    const r = KANON.cariCatatan(C, q, k, omigaDir, { saringHit: saring, galatKorpus });
    if (r.galat) return { ok: false, sebab: `korpus: ${r.galat}` };
    const g = await jalankan(q, {
      moda: 'on',
      probe: probeFn,
      // persis server.js: arahan gerbang ditempel sebagai PETUNJUK KHUSUS di pesan sistem beringatan
      jawab: (qq, { sistem }) => jawab(model, qq, bungkus(r.catatan) + (sistem ? `\n\nPETUNJUK KHUSUS UNTUK PERTANYAAN INI: ${sistem}` : '')),
      catat,
    });
    if (simpan) {
      const hits = r.sumber.filter((s) => s.skor !== '-' && s.skor !== 'kanon');
      simpan(q, {
        gerbang: { label: g.label, tindakan: g.tindakan, arahan: Boolean(g.sistem), msProbe: g.telemetri.msProbe, probeGalat: g.telemetri.probeGalat },
        retrieval: {
          nHits: hits.length,
          nKanon: r.sumber.filter((s) => s.skor === 'kanon').length,
          judulTeratas: hits[0]?.judul || null,
          hurufCatatan: (r.catatan || '').length,
          sitasiKarangan: g.ok ? sitasiKarangan(g.teks, r.sumber, KANON, omigaDir) : [],
        },
      });
    }
    return g.ok ? { ok: true, teks: g.teks } : { ok: false, sebab: g.sebab };
  };
}

function arg(nama, bawaan) {
  const i = process.argv.indexOf(nama);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : bawaan;
}

// ─────────────────────────────────────────────────────────────────── uji ──
async function uji() {
  let ok = 0, bad = 0;
  const cek = (n, c) => { if (c) ok++; else { bad++; console.log(`  ${M}GAGAL${R} ${n}`); } };

  cek('saringan bersih membuang session', saringanUntuk('bersih')({ type: 'session' }) === false && saringanUntuk('bersih')({ type: 'doc' }) === true);
  cek('saringan plasebo membuang semua', saringanUntuk('plasebo')({ type: 'doc' }) === false);
  cek('saringan penuh = null (produksi apa adanya)', saringanUntuk('penuh') === null);
  let lempar = false; try { saringanUntuk('kotor'); } catch { lempar = true; } cek('sumber tak dikenal → lempar', lempar);
  cek('label memisahkan sumber & probe', labelBerkas('bersih', 'migancore:0.4-qwen3') === 'retrieval-bersih-gerbang-on-migancore_0.4-qwen3');
  cek('label asap', labelBerkas('plasebo', 'x:y', 3).endsWith('-asap'));
  // L2c-P: petak & prompt WAJIB terlihat di nama berkas, kalau tidak hasil petak
  // bayangan akan dibaca sebagai baris petak-jujur2.
  cek('label L2b tidak berubah (bawaan tetap jujur2/lama)',
    labelBerkas('bersih', 'p:1', 0, 'jujur2', 'lama') === labelBerkas('bersih', 'p:1'));
  cek('petak bayangan terlihat di label', labelBerkas('bersih', 'p:1', 0, 'bayangan', 'lama').includes('-bayangan-'));
  cek('prompt baru terlihat di label', labelBerkas('bersih', 'p:1', 0, 'bayangan', 'baru').includes('-prompt_baru-'));
  cek('empat kombinasi petak x prompt semuanya berbeda',
    new Set(['jujur2', 'bayangan'].flatMap((pt) => ['lama', 'baru'].map((pr) => labelBerkas('bersih', 'p:1', 0, pt, pr)))).size === 4);
  // Dial prompt harus benar-benar memilih pembungkus lain, bukan diam-diam sama.
  let lemparPrompt = false;
  try { buatTanyaRetrieval({ KANON, C: Cpalsu, sumber: 'bersih', prompt: 'ngaco' }); } catch { lemparPrompt = true; }
  cek('prompt tak dikenal → lempar', lemparPrompt);

  // Korpus palsu: dua hit, satu transkrip sesi berisi kunci jawaban, satu dokumen biasa.
  const Cpalsu = { search: () => [
    { type: 'session', title: 'Session migancore', text: 'jawabannya timah', score: 40, path: 'x.jsonl' },
    { type: 'doc', title: 'RISET.md', text: 'kelapa sawit', score: 10, path: 'y.md' },
  ] };
  const KANON = require(path.join(DI_SINI, '..', 'mcp', 'kanon.js'));
  const dirKosong = path.join(DI_SINI, '..', 'nonexistent-omiga'); // kanon & brief kosong → catatan = hits saja
  const probeJawab = async () => ({ ok: true, jenis: 'fakta', alasan: 'uji', ms: 1 });
  const probeAbstain = async () => ({ ok: true, jenis: 'tak-terjawab', alasan: 'uji', ms: 1 });
  const tangkap = [];
  const jawabPalsu = async (model, q, sistem) => { tangkap.push(sistem); return { ok: true, teks: 'jawaban' }; };

  const kepBersih = new Map();
  const tBersih = buatTanyaRetrieval({ KANON, C: Cpalsu, sumber: 'bersih', omigaDir: dirKosong, probeFn: probeJawab, jawabFn: jawabPalsu, simpan: (q, x) => kepBersih.set(q, x) });
  const rb = await tBersih('m', 'Bangka Belitung logam apa?');
  cek('bersih: jalan', rb.ok && rb.teks === 'jawaban');
  cek('bersih: transkrip sesi TIDAK sampai ke model', !tangkap.at(-1).includes('jawabannya timah') && tangkap.at(-1).includes('kelapa sawit'));
  cek('bersih: nHits = 1', kepBersih.get('Bangka Belitung logam apa?').retrieval.nHits === 1);
  cek('bersih: pesan sistem = SISTEM_BERINGATAN produksi', tangkap.at(-1).startsWith('Kamu MiganCore') && tangkap.at(-1).includes('=== CATATAN ==='));
  cek('bersih: tindakan jawab → tanpa PETUNJUK KHUSUS', !tangkap.at(-1).includes('PETUNJUK KHUSUS'));

  const tPenuh = buatTanyaRetrieval({ KANON, C: Cpalsu, sumber: 'penuh', omigaDir: dirKosong, probeFn: probeJawab, jawabFn: jawabPalsu });
  await tPenuh('m', 'q');
  cek('penuh: transkrip sesi SAMPAI ke model (diagnostik bocor)', tangkap.at(-1).includes('jawabannya timah'));

  const kepPlasebo = new Map();
  const tPlasebo = buatTanyaRetrieval({ KANON, C: Cpalsu, sumber: 'plasebo', omigaDir: dirKosong, probeFn: probeAbstain, jawabFn: jawabPalsu, simpan: (q, x) => kepPlasebo.set(q, x) });
  await tPlasebo('m', 'q2');
  cek('plasebo: catatan = cabang "tidak ada yang cocok" produksi', tangkap.at(-1).includes('tidak ada catatan yang cocok'));
  cek('plasebo: nol hit', kepPlasebo.get('q2').retrieval.nHits === 0);
  cek('plasebo: tindakan abstain → PETUNJUK KHUSUS ditempel', tangkap.at(-1).includes('PETUNJUK KHUSUS UNTUK PERTANYAAN INI:'));
  cek('plasebo: keputusan gerbang tersimpan', kepPlasebo.get('q2').gerbang.tindakan === 'abstain' && kepPlasebo.get('q2').gerbang.label === 'tak-terjawab');

  const tGalat = buatTanyaRetrieval({ KANON, C: null, galatKorpus: 'tidak ada', sumber: 'bersih', probeFn: probeJawab, jawabFn: jawabPalsu });
  const rg = await tGalat('m', 'q');
  cek('korpus mati → GALAT (bukan NGARANG, C33)', rg.ok === false && /korpus/.test(rg.sebab));

  // Ambang batal: dinyatakan sebagai angka supaya bisa diuji tanpa menjalankan pelari.
  // Kasus NYATA 9 Sep: 27/36 lalu 36/36 gagal — keduanya harus membatalkan; 3/36
  // (di bawah ambang GALAT pra-daftar) tidak boleh.
  const batal = (galat, n) => galat / n >= AMBANG_BATAL_GALAT;
  cek('27/36 gagal (kasus nyata 9 Sep) → batal', batal(27, 36) === true);
  cek('36/36 gagal → batal', batal(36, 36) === true);
  cek('3/36 gagal (masih sah menurut pra-daftar) → JANGAN batal', batal(3, 36) === false);
  cek('17/36 gagal (tidak sah tapi bukan server mati) → jangan batal', batal(17, 36) === false);
  cek('kode keluar server mati bukan 0 (supaya shell bisa break)', KODE_KELUAR_SERVER_MATI !== 0);

  cek('sitasiKarangan: berkas tak ada di sumber tertangkap', sitasiKarangan('lihat rahasia.md', [{ judul: 'RISET.md', path: 'y.md' }], KANON, dirKosong).join() === 'rahasia.md');
  cek('sitasiKarangan: berkas ada di sumber lolos', sitasiKarangan('lihat RISET.md', [{ judul: 'RISET.md', path: 'y.md' }], KANON, dirKosong).length === 0);

  console.log(bad === 0 ? `${H}${ok} lulus${R}` : `${M}${bad} gagal${R}, ${ok} lulus`);
  return bad === 0 ? 0 : 1;
}

// ───────────────────────────────────────────────────────────────── jalan ──
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG && process.argv.includes('--uji')) {
  uji().then((kode) => process.exit(kode));
} else if (LANGSUNG) {
  const model = process.argv[2];
  const modelProbe = arg('--probe', null);
  const sumber = arg('--sumber', null);
  const nPutaran = Number(arg('--putaran', 1)) || 1;
  const batasSoal = Number(arg('--batas-soal', 0)) || 0;
  const k = Number(arg('--k', K_BAWAAN)) || K_BAWAAN;
  const namaPetak = arg('--petak', 'jujur2');       // jujur2 | bayangan
  const prompt = arg('--prompt', 'lama');           // lama | baru  (L2c-P, dial tunggal)
  if (!model || !modelProbe || !SUMBER.includes(sumber) || !['jujur2', 'bayangan'].includes(namaPetak) || !['lama', 'baru'].includes(prompt)) {
    console.error(`Pakai: node eval/ukur-jujur2-retrieval.mjs <modelJawab> --probe <modelProbe> --sumber ${SUMBER.join('|')} [--petak jujur2|bayangan] [--prompt lama|baru] [--putaran N] [--batas-soal N] [--k ${K_BAWAAN}]`);
    process.exit(1);
  }
  const { KANON, C, galatKorpus } = muatProduksi();
  if (galatKorpus) { console.error(`${M}Korpus OMIGA tidak terbaca${R}: ${galatKorpus}`); process.exit(2); }
  let korpusMeta = null;
  // Bentuk NYATA meta.json corpus.js (dibaca 9 Sep): { N, avgdl, lengths, built_at }.
  // Tebakan pertama (`docs`/`chunks`/`built`) mencetak null tiga kali di uji asap —
  // berkas hasil tanpa jejak generasi korpus tidak bisa direproduksi.
  try { const m = typeof C.meta === 'function' ? C.meta() : C.meta; korpusMeta = m ? { potongan: m.N ?? null, dibangun: m.built_at ?? null } : null; } catch { korpusMeta = null; }

  const bank = namaPetak === 'bayangan' ? BAYANGAN : PUBLIK;
  const petak = batasSoal ? bank.slice(0, batasSoal) : bank;
  const label = labelBerkas(sumber, modelProbe, batasSoal, namaPetak, prompt);
  const stempel = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
  const telemetri = path.join(DI_SINI, `telemetri-gerbang-${stempel}.jsonl`);
  console.log(`\n# ukur-jujur2-retrieval (L2b) — jawab ${model} · probe ${modelProbe} · sumber ${K}${sumber}${R} · k=${k} · ${petak.length} soal · ${nPutaran} putaran · ${OLLAMA}`);
  console.log(`# pembungkus produksi: suhu ${KANON.OPSI_PRODUKSI.temperature} · num_ctx ${KANON.NUM_CTX_BERINGATAN_BAWAAN} · num_predict ${KANON.OPSI_PRODUKSI.num_predict}${korpusMeta ? ` · korpus ${JSON.stringify(korpusMeta)}` : ''}\n`);

  // Pra-lintasan probe (pola ukur-jujur2-gerbang): probe suhu 0 = deterministik, dihitung
  // sekali per soal. Di sini nilainya ganda: penjawab memakai num_ctx 8192 sedangkan probe
  // bawaan — Ollama memuat ulang model tiap kali num_ctx berganti. Semua probe dulu,
  // lalu semua jawaban = satu pemuatan ulang per putaran, bukan dua per soal.
  const cachePro = new Map();
  const probeCached = async (q) => { if (!cachePro.has(q)) cachePro.set(q, await probe(modelProbe, q)); return cachePro.get(q); };
  const tPro = Date.now();
  for (const s of petak) await probeCached(s.q);
  const labelPro = [...cachePro.values()];
  console.log(`# pra-lintasan probe: ${labelPro.filter((r) => r.ok).length}/${petak.length} berlabel · galat ${labelPro.filter((r) => !r.ok).length} · ${Math.round((Date.now() - tPro) / 1000)}s`);

  const semua = [];
  for (let p = 1; p <= nPutaran; p++) {
    const t0 = Date.now();
    const keputusan = new Map();
    const tanya = buatTanyaRetrieval({ KANON, C, galatKorpus, sumber, k, prompt, probeFn: probeCached, catat: pencatatJsonl(telemetri), simpan: (q, x) => keputusan.set(q, x) });
    const baris = await satuPutaran(model, petak, tanya);
    for (const b of baris) { const x = keputusan.get(b.soal.q); b.gerbang = x?.gerbang || null; b.retrieval = x?.retrieval || null; }
    const r = rangkum(baris);
    semua.push(r);
    const f = path.join(DI_SINI, namaBerkas(model, p, stempel, label));
    fs.writeFileSync(f, JSON.stringify({
      // `bank` menentukan apakah baris ini boleh masuk papan. Petak bayangan
      // memakai bank SENDIRI supaya bacaPapan() dan vonis-l2b menolaknya — dua
      // petak berbeda tidak pernah boleh dirata-ratakan (C29).
      model, putaran: p, stempel, petak: petak.length,
      bank: namaPetak === 'bayangan' ? 'petak-bayangan' : 'petak-jujur2',
      prompt, pikir: 'bawaan', batasDetik: BATAS_DETIK,
      gerbang: { modelProbe, moda: 'on', telemetri: path.basename(telemetri) },
      retrieval: { sumber, k, numCtx: KANON.NUM_CTX_BERINGATAN_BAWAAN, opsi: KANON.OPSI_PRODUKSI, saringan: sumber === 'bersih' ? 'type!=session' : sumber === 'plasebo' ? 'semua-dibuang' : null, omigaDir: OMIGA_DIR, korpusMeta },
      baris, rangkuman: r,
    }, null, 1));

    const m = r.metrik;
    const tindakan = {}; let galatProbe = 0, totalHits = 0, karangan = 0;
    for (const b of baris) {
      if (b.gerbang) { tindakan[b.gerbang.tindakan] = (tindakan[b.gerbang.tindakan] || 0) + 1; if (b.gerbang.probeGalat) galatProbe++; }
      if (b.retrieval) { totalHits += b.retrieval.nHits; karangan += b.retrieval.sitasiKarangan.length; }
    }
    console.log(`--- putaran ${p} (${Math.round((Date.now() - t0) / 1000)}s) ${r.sah ? '' : M + 'TIDAK SAH' + R}`);
    console.log(`  MENGARANG      ${m.MENGARANG_pct}%   fakta ${(m.fakta_akurasi ?? 0) * 100}%   over-refusal ${m.over_refusal_pct}%`);
    console.log(`  abstensi       recall ${m.abstain_recall} · presisi ${m.abstain_presisi}`);
    if (r.galat) console.log(`  ${K}GALAT jaringan ${r.galat} soal (${r.lajuGalat}%)${R}`);
    console.log(`  gerbang        ${Object.entries(tindakan).map(([a, v]) => `${a} ${v}`).join(' · ')} · probe galat ${galatProbe}`);
    console.log(`  retrieval      rata hits ${(totalHits / baris.length).toFixed(1)} · sitasi karangan ${karangan}`);
    console.log(`  ${A}${Object.entries(m.perJenis).map(([a, v]) => `${a} ${v.benar}/${v.total}`).join(' · ')}${R}`);
    console.log(`  ${A}tersimpan: ${path.basename(f)}${R}\n`);

    if (r.galat / baris.length >= AMBANG_BATAL_GALAT) {
      const contoh = baris.find((b) => b.hasil === 'GALAT')?.sebab || '(tanpa sebab)';
      console.error(`${M}DIBATALKAN — ${r.galat}/${baris.length} soal gagal jaringan (>= ${AMBANG_BATAL_GALAT * 100} %).${R}`);
      console.error(`${M}Server jawaban kemungkinan mati. Contoh sebab: ${contoh}${R}`);
      console.error(`${A}Putaran sisa lengan ini TIDAK dijalankan; berkas yang sudah ditulis tetap ada dan tetap bertanda TIDAK SAH.${R}`);
      console.error(`${A}Periksa: curl ${OLLAMA.replace('/api/chat', '/api/tags')}${R}`);
      process.exit(KODE_KELUAR_SERVER_MATI);
    }
  }
  if (nPutaran > 1) {
    const sah = semua.filter((r) => r.sah);
    const ambil = (kk) => sah.map((r) => r.metrik[kk]);
    const rata = (xs) => xs.reduce((a, c) => a + c, 0) / (xs.length || 1);
    const sd = (xs) => (xs.length > 1 ? Math.sqrt(xs.reduce((a, c) => a + (c - rata(xs)) ** 2, 0) / (xs.length - 1)) : 0);
    const ng = ambil('MENGARANG_pct'), or = ambil('over_refusal_pct'), fk = ambil('fakta_akurasi').map((x) => 100 * (x ?? 0));
    console.log(`## ${model}+gerbang+retrieval(${sumber}): MENGARANG rata ${rata(ng).toFixed(1)}% sd ${sd(ng).toFixed(2)} · over-refusal rata ${rata(or).toFixed(1)}% · fakta rata ${rata(fk).toFixed(1)}% · ${sah.length}/${nPutaran} putaran sah`);
  }
}
