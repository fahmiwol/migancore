#!/usr/bin/env node
/**
 * B1 — menguji backend sumbu KEBENARAN terhadap set berlabel adjudikator.
 *
 * Urutan backend DIKUNCI di pra-daftar (PRA-DAFTAR-B1): yang tidak menambah satu pun
 * dependensi diukur DULU; mDeBERTa ONNX (dependensi npm pertama + ~500 MB) hanya
 * diajukan bila keduanya gagal ambang — dengan angka yang membenarkannya, bukan
 * karena rencana lama menyebutnya.
 *
 * Ambang (dikunci sebelum angka):
 *   LULUS    sepakat >=0,85 DAN recall 'tidak-didukung' >=0,80 DAN <=2 dtk/kalimat
 *   SEBAGIAN sepakat 0,70-0,84 -> belum dipasang, lanjut backend berikutnya
 *   GAGAL    sepakat <0,70
 *
 * `tidak-didukung` diberi bobot tersendiri karena itulah sisi yang menjadi alasan
 * modul ini ada: meloloskan kalimat karangan adalah kegagalan senyap, sedangkan
 * menahan kalimat yang benar hanya membuat jawaban lebih berhati-hati.
 *
 * Pakai: node eval/b1-uji-nli.mjs --set eval/set-nli-*.json [--backend ollama|embedding] [--model qwen2.5:7b]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nilaiOllama, nilaiEmbedding, LABEL_NLI } from '../sistem/nli-id.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const arg = process.argv.slice(2);
const ambil = (n, d) => (arg.includes(n) ? arg[arg.indexOf(n) + 1] : d);
const SET = ambil('--set', null);
const BACKEND = ambil('--backend', 'ollama');
const MODEL = ambil('--model', BACKEND === 'ollama' ? 'qwen2.5:7b' : 'bge-m3');
const HOST = process.env.OLLAMA_HOST || null;
export const AMBANG_B1 = { sepakat: 0.85, recallTidakDidukung: 0.80, msPerKalimat: 2000 };
const NLI_URL = process.env.NLI_URL || 'http://measure-host.local:11500';

/**
 * Backend `nvidia`: model raksasa lewat kursi majelis (DeepSeek V4 Pro, 1,6 rb jt
 * parameter). Bedanya dengan mDeBERTa bukan cuma ukuran — ia menerima SELURUH sumber
 * sekaligus (konteks 1 jt token) alih-alih dipecah per kalimat, jadi yang diuji di sini
 * adalah "model besar + konteks penuh" melawan "model kecil khusus + potongan".
 *
 * BATAS KERAS: kursi ini hanya boleh menerima soal PUBLIK. Layar NVIDIA sendiri
 * memperingatkan jangan mengunggah data rahasia dan pemakaian dicatat; korpus OMIGA
 * memuat lead, harga, kontak, dan infrastruktur Fahmi. Set NLI ini memuat potongan
 * BRIEF (identitas & bisnis) — karena itu backend ini dijalankan hanya atas permintaan
 * eksplisit, dan hasilnya TIDAK menjadikannya jalur serving.
 */
async function nilaiNvidia(kalimat, sumber) {
  const t0 = Date.now();
  const kunci = (() => { try { return fs.readFileSync('<memory-dir>/.nvidia-token.txt', 'utf8').trim(); } catch { return ''; } })();
  if (!kunci) return { ok: false, sebab: 'kunci nvidia tidak ada di gudang', ms: 0 };
  const { promptNLI, uraiNLI } = await import('../sistem/nli-id.mjs');
  try {
    const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${kunci}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.NVIDIA_MODEL || 'deepseek-ai/deepseek-v4-pro-0813',
        messages: [{ role: 'user', content: promptNLI(kalimat, sumber) }],
        temperature: 0, max_tokens: 200,
      }),
      signal: AbortSignal.timeout(300000),
    });
    const d = await r.json();
    const teks = d.choices?.[0]?.message?.content || '';
    if (!teks) return { ok: false, sebab: `balasan kosong: ${JSON.stringify(d).slice(0, 120)}`, ms: Date.now() - t0 };
    const u = uraiNLI(teks);
    return { ...u, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, sebab: e.message, ms: Date.now() - t0 };
  }
}

/** Backend mDeBERTa: layanan HTTP di Bmax (repo laptop tetap nol-dependensi). */
async function nilaiMdeberta(kalimat, sumber) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${NLI_URL.replace(/\/$/, '')}/nli`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kalimat, sumber: (Array.isArray(sumber) ? sumber : [sumber]).map((s) => (typeof s === 'string' ? s : s.teks)) }),
    });
    const d = await r.json();
    if (!d.ok) return { ok: false, sebab: d.sebab || `HTTP ${r.status}`, ms: Date.now() - t0 };
    return { ok: true, label: d.label, skor: d.maxEnt, ms: d.ms ?? (Date.now() - t0) };
  } catch (e) {
    return { ok: false, sebab: e.message, ms: Date.now() - t0 };
  }
}

/**
 * Metrik BINER (amendemen 3 Sep, dikunci sebelum angka mDeBERTa dan dihitung ulang
 * untuk backend lama supaya adil): rubrik kami menyebut `tidak-didukung` untuk dua hal
 * yang NLI standar pisahkan — sumber menyatakan sebaliknya (contradiction) DAN kalimat
 * memuat nama/angka yang tidak ada di sumber (neutral). Pemetaan harfiah menghukum
 * model untuk hal yang secara teknis ia jawab benar. Yang menentukan di gerbang justru
 * biner: 'didukung' boleh lewat, selain itu ditandai hati-hati.
 */
export const biner = (l) => (l === 'didukung' ? 'didukung' : 'bukan-didukung');

export function ringkasan(baris) {
  const sah = baris.filter((b) => b.ok);
  const sepakat = sah.filter((b) => b.label === b.emas).length;
  const emasTD = baris.filter((b) => b.emas === 'tidak-didukung');
  const tertangkap = emasTD.filter((b) => b.ok && b.label === 'tidak-didukung').length;
  const sepakatBiner = sah.filter((b) => biner(b.label) === biner(b.emas)).length;
  const emasBukan = baris.filter((b) => biner(b.emas) === 'bukan-didukung');
  const tertangkapBiner = emasBukan.filter((b) => b.ok && biner(b.label) === 'bukan-didukung').length;
  const bingung = {};
  for (const b of sah) {
    const k = `${b.emas} → ${b.label}`;
    if (b.emas !== b.label) bingung[k] = (bingung[k] || 0) + 1;
  }
  return {
    n: baris.length,
    galat: baris.length - sah.length,
    sepakat: sah.length ? sepakat / sah.length : 0,
    sepakatN: `${sepakat}/${sah.length}`,
    recallTidakDidukung: emasTD.length ? tertangkap / emasTD.length : 0,
    recallTdN: `${tertangkap}/${emasTD.length}`,
    sepakatBiner: sah.length ? sepakatBiner / sah.length : 0,
    sepakatBinerN: `${sepakatBiner}/${sah.length}`,
    recallBiner: emasBukan.length ? tertangkapBiner / emasBukan.length : 0,
    recallBinerN: `${tertangkapBiner}/${emasBukan.length}`,
    bingung,
  };
}

async function utama() {
  if (!SET) throw new Error('wajib --set <berkas set-nli berlabel>');
  const j = JSON.parse(fs.readFileSync(path.resolve(SET), 'utf8'));
  const berlabel = j.baris.filter((b) => LABEL_NLI.includes(b.label));
  if (berlabel.length !== j.baris.length) throw new Error(`${j.baris.length - berlabel.length} baris belum dilabeli — isi label dulu, alat tidak menebak`);
  console.log(`# B1 — backend ${BACKEND} (${MODEL}) @ ${HOST || 'lokal'} · ${berlabel.length} pasangan berlabel`);
  console.log(`# pelabelan: ${j.pelabelan ? j.pelabelan.oleh : '(tidak tercatat)'}`);

  const t0 = Date.now();
  const baris = [];
  for (const b of berlabel) {
    const r = BACKEND === 'ollama' ? await nilaiOllama(b.kalimat, b.sumber, { model: MODEL, host: HOST })
      : BACKEND === 'mdeberta' ? await nilaiMdeberta(b.kalimat, b.sumber)
        : BACKEND === 'nvidia' ? await nilaiNvidia(b.kalimat, b.sumber)
        : await nilaiEmbedding(b.kalimat, b.sumber, { model: MODEL, host: HOST });
    baris.push({ id: b.id, emas: b.label, ok: r.ok, label: r.ok ? r.label : null, sebab: r.ok ? null : r.sebab, skor: r.skor, ms: r.ms });
    process.stdout.write(r.ok ? (r.label === b.label ? '.' : 'x') : '!');
  }
  process.stdout.write('\n');
  const msPerKalimat = (Date.now() - t0) / berlabel.length;
  const m = ringkasan(baris);

  console.log(`\n3-kelas : sepakat ${(m.sepakat * 100).toFixed(1)}% (${m.sepakatN}) · recall tidak-didukung ${(m.recallTidakDidukung * 100).toFixed(1)}% (${m.recallTdN})`);
  console.log(`BINER   : sepakat ${(m.sepakatBiner * 100).toFixed(1)}% (${m.sepakatBinerN}) · recall bukan-didukung ${(m.recallBiner * 100).toFixed(1)}% (${m.recallBinerN})  <- metrik produk`);
  console.log(`GALAT ${m.galat}/${m.n} · ${msPerKalimat.toFixed(0)} ms/kalimat`);
  console.log('salah yang paling sering:');
  for (const [k, n] of Object.entries(m.bingung).sort((a, b2) => b2[1] - a[1]).slice(0, 6)) console.log(`  ${n}× ${k}`);

  // Vonis dibaca pada metrik BINER (amendemen dikunci sebelum angka mDeBERTa,
  // berlaku sama untuk semua backend). Angka 3-kelas tetap dilaporkan apa adanya.
  let vonis;
  if (m.sepakatBiner >= AMBANG_B1.sepakat && m.recallBiner >= AMBANG_B1.recallTidakDidukung && msPerKalimat <= AMBANG_B1.msPerKalimat) vonis = 'LULUS';
  else if (m.sepakatBiner >= 0.70) vonis = 'SEBAGIAN';
  else vonis = 'GAGAL';
  console.log(`\nVONIS B1 (${BACKEND}, dibaca apa adanya): ${vonis}`);
  console.log(`  ambang: sepakat >=${AMBANG_B1.sepakat} · recall tidak-didukung >=${AMBANG_B1.recallTidakDidukung} · <=${AMBANG_B1.msPerKalimat} ms/kalimat`);
  console.log(`  CATATAN UKURAN: n=${m.n} kalimat — satu kalimat ≈ ${(100 / m.n).toFixed(1)} pp. Vonis = "layak/tidak layak dilanjutkan", bukan "terbukti".`);

  const keluar = path.join(DI_SINI, `b1-nli-${BACKEND}-${MODEL.replace(/[:/]/g, '_')}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
  fs.writeFileSync(keluar, JSON.stringify({ tanggal: new Date().toISOString(), backend: BACKEND, model: MODEL, set: path.basename(SET), ambang: AMBANG_B1, vonis, metrik: m, msPerKalimat, baris }, null, 1));
  console.log(`ditulis: ${path.relative(process.cwd(), keluar)}`);
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) utama().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
