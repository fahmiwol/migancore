#!/usr/bin/env node
/**
 * ukur-jujur2-gerbang — Episode A3 (doc 85): petak-jujur2 diukur pada
 * <modelJawab> + GERBANG JEBAKAN (sistem/gerbang-jebakan.mjs) dengan probe <modelProbe>.
 *
 * Instrumen, petak, penilai, sampler, dan pembungkus SAMA PERSIS dengan
 * eval/ukur-jujur2.mjs (C29): `satuPutaran` + `rangkum` diimpor, `tanyaPolos`
 * dipakai apa adanya bila gerbang tidak memasang arahan. Satu-satunya dial yang
 * berubah = pesan sistem yang dirutekan probe (moda `on`). Moda `shadow` = jawaban
 * polos + keputusan gerbang dicatat (untuk audit berpasangan).
 *
 * Berkas hasil memakai namaBerkas() dengan label `gerbang-<moda>-<probe>` supaya
 * TIDAK PERNAH tercampur dengan hasil polos; bentuk isinya sama (+ kolom gerbang).
 *
 * Pakai:
 *   node eval/ukur-jujur2-gerbang.mjs migancore:0.14 --probe migancore:0.4-qwen3 --moda on --putaran 5
 *   node eval/ukur-jujur2-gerbang.mjs migancore:0.14 --probe migancore:0.4-qwen3 --moda on --batas-soal 3   (asap)
 *   OLLAMA_HOST=http://measure-host.local:11434 ...  (Bmax: dua model 4B muat di RAM)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIK } from './petak-jujur2.mjs';
import { satuPutaran, rangkum, namaBerkas, tanyaPolos, PIKIR, BATAS_DETIK, ALIRAN, gabungAliranLengkap } from './ukur-jujur2.mjs';
import { probe } from './probe-keterjawaban.mjs';
import { jalankan, pencatatJsonl } from '../sistem/gerbang-jebakan.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434') + '/api/chat';

/** Badan permintaan jalur berarahan — SAMA dengan badan tanyaPolos kecuali satu pesan sistem di depan (diuji). */
export function badanDenganSistem(model, teks, sistem) {
  const isi = PIKIR === false ? `${teks} /no_think` : teks;
  const badan = {
    model,
    messages: [{ role: 'system', content: sistem }, { role: 'user', content: isi }],
    // 27 Sep 2026 (Gerbang-S1): dulu `stream: false` tetap, sehingga ALIRAN=1 tidak berlaku di jalur ini.
    // fetch Node tanpa aliran putus di ±300 dtk (C56): jawaban berarahan yang panjang GALAT, sedangkan
    // lengan polos (beraliran) tidak — asimetri instrumen antarlengan. Tanpa ALIRAN perilakunya sama dengan dulu.
    stream: ALIRAN,
    options: { temperature: 0.7 },
  };
  if (PIKIR === false) badan.think = false;
  return badan;
}

/** Sama dengan tanyaPolos kecuali satu pesan sistem di depan. Sampler dan transport (ALIRAN) identik. */
export async function tanyaDenganSistem(model, teks, sistem, { batasDetik = BATAS_DETIK } = {}) {
  const kendali = new AbortController();
  const jam = setTimeout(() => kendali.abort(), batasDetik * 1000);
  try {
    const badan = badanDenganSistem(model, teks, sistem);
    const r = await fetch(OLLAMA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: kendali.signal, body: JSON.stringify(badan) });
    if (!r.ok) return { ok: false, sebab: `ollama ${r.status}: ${(await r.text()).slice(0, 160)}` };
    if (ALIRAN) {
      const { teks: t, pikir } = await gabungAliranLengkap(r.body);
      if (t === null) return { ok: false, sebab: 'aliran berakhir tanpa isi' };
      return { ok: true, teks: t.trim(), ...(pikir.trim() ? { pikir: pikir.trim() } : {}) };
    }
    const d = await r.json();
    if (typeof d?.message?.content !== 'string') return { ok: false, sebab: 'balasan tanpa message.content' };
    const pikir = typeof d?.message?.thinking === 'string' ? d.message.thinking.trim() : '';
    return { ok: true, teks: d.message.content.trim(), ...(pikir ? { pikir } : {}) };
  } catch (e) {
    return { ok: false, sebab: String(e?.name === 'AbortError' ? `lewat ${batasDetik}s` : e).slice(0, 160) };
  } finally {
    clearTimeout(jam);
  }
}

/** Bangun fungsi `tanya(model, teks)` bergerbang untuk satuPutaran. Keputusan disimpan per soal. */
export function buatTanyaBergerbang({ modelProbe, moda, catat, simpan, probeFn }) {
  return async (model, teks) => {
    const r = await jalankan(teks, {
      moda,
      probe: probeFn || ((q) => probe(modelProbe, q)),
      jawab: (q, { sistem }) => (sistem ? tanyaDenganSistem(model, q, sistem) : tanyaPolos(model, q)),
      catat,
    });
    if (simpan) simpan(teks, { label: r.label, tindakan: r.tindakan, arahan: Boolean(r.sistem), msProbe: r.telemetri.msProbe, probeGalat: r.telemetri.probeGalat });
    return r.ok ? { ok: true, teks: r.teks } : { ok: false, sebab: r.sebab };
  };
}

function arg(nama, bawaan) {
  const i = process.argv.indexOf(nama);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : bawaan;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) {
  const model = process.argv[2];
  const modelProbe = arg('--probe', null);
  const moda = arg('--moda', 'on');
  const nPutaran = Number(arg('--putaran', 1)) || 1;
  const batasSoal = Number(arg('--batas-soal', 0)) || 0;
  if (!model || !modelProbe || !['on', 'shadow'].includes(moda)) {
    console.error('Pakai: node eval/ukur-jujur2-gerbang.mjs <modelJawab> --probe <modelProbe> [--moda on|shadow] [--putaran N] [--batas-soal N]');
    process.exit(1);
  }
  const petak = batasSoal ? PUBLIK.slice(0, batasSoal) : PUBLIK;
  const label = `gerbang-${moda}-${modelProbe.replace(/[:/]/g, '_')}${batasSoal ? '-asap' : ''}`;
  const stempel = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
  const telemetri = path.join(DI_SINI, `telemetri-gerbang-${stempel}.jsonl`);
  console.log(`\n# ukur-jujur2-gerbang — jawab ${model} · probe ${modelProbe} · moda ${moda} · ${petak.length} soal · ${nPutaran} putaran · ${OLLAMA}\n`);

  // PRA-LINTASAN PROBE: probe berjalan suhu 0 (deterministik), jadi labelnya dihitung
  // SEKALI per soal dengan model probe dimuat sekali — lalu tiap putaran hanya memuat
  // model penjawab. Di GPU 6 GB, bergantian dua model 4B tiap soal = muat ulang penuh
  // + watchdog (±40 dtk/soal, 2 Sep). Eksperimennya tidak berubah: keputusan gerbang
  // per soal identik dengan yang akan diambil saat serving.
  const cachePro = new Map();
  const probeCached = async (q) => {
    if (!cachePro.has(q)) cachePro.set(q, await probe(modelProbe, q));
    return cachePro.get(q);
  };
  const tPro = Date.now();
  for (const s of petak) await probeCached(s.q);
  const labelPro = [...cachePro.values()];
  console.log(`# pra-lintasan probe: ${labelPro.filter((r) => r.ok).length}/${petak.length} berlabel · galat ${labelPro.filter((r) => !r.ok).length} · ${Math.round((Date.now() - tPro) / 1000)}s`);
  // Bukti determinisme (kalau ada hasil A1 untuk model probe yang sama): banding label.
  try {
    const a1 = fs.readdirSync(DI_SINI).filter((f) => f.startsWith(`probe-keterjawaban-${modelProbe.replace(/[:/]/g, '_')}-`) && f.endsWith('.json')).sort().pop();
    if (a1) {
      const d = JSON.parse(fs.readFileSync(path.join(DI_SINI, a1), 'utf8'));
      let sama = 0, n = 0;
      for (const b of d.baris) { const c = cachePro.get(b.q); if (!c || !b.label) continue; n++; if (c.ok && c.jenis === b.label) sama++; }
      console.log(`# determinisme probe vs ${a1}: ${sama}/${n} label sama`);
    }
  } catch { /* opsional */ }

  const semua = [];
  for (let p = 1; p <= nPutaran; p++) {
    const t0 = Date.now();
    const keputusan = new Map();
    const tanya = buatTanyaBergerbang({ modelProbe, moda, catat: pencatatJsonl(telemetri), simpan: (q, k) => keputusan.set(q, k), probeFn: probeCached });
    const baris = await satuPutaran(model, petak, tanya);
    for (const b of baris) b.gerbang = keputusan.get(b.soal.q) || null;
    const r = rangkum(baris);
    semua.push(r);
    const f = path.join(DI_SINI, namaBerkas(model, p, stempel, label));
    fs.writeFileSync(f, JSON.stringify({
      model, putaran: p, stempel, petak: petak.length, bank: 'petak-jujur2', pikir: PIKIR === false ? 'off' : 'bawaan', batasDetik: BATAS_DETIK,
      gerbang: { modelProbe, moda, telemetri: path.basename(telemetri) }, baris, rangkuman: r,
    }, null, 1));
    const m = r.metrik;
    const tindakan = {};
    let galatProbe = 0, msProbe = [];
    for (const b of baris) { const g = b.gerbang; if (!g) continue; tindakan[g.tindakan] = (tindakan[g.tindakan] || 0) + 1; if (g.probeGalat) galatProbe++; if (g.msProbe) msProbe.push(g.msProbe); }
    msProbe.sort((a, b) => a - b);
    console.log(`--- putaran ${p} (${Math.round((Date.now() - t0) / 1000)}s) ${r.sah ? '' : 'TIDAK SAH'}`);
    console.log(`  MENGARANG      ${m.MENGARANG_pct}%   fakta ${(m.fakta_akurasi ?? 0) * 100}%   over-refusal ${m.over_refusal_pct}%`);
    console.log(`  abstensi       recall ${m.abstain_recall} · presisi ${m.abstain_presisi}`);
    if (r.galat) console.log(`  GALAT jaringan ${r.galat} soal (${r.lajuGalat}%)`);
    console.log(`  gerbang        ${Object.entries(tindakan).map(([k, v]) => `${k} ${v}`).join(' · ')} · probe galat ${galatProbe} · probe median ${msProbe[Math.floor(msProbe.length / 2)] || 0}ms`);
    console.log(`  ${Object.entries(m.perJenis).map(([k, v]) => `${k} ${v.benar}/${v.total}`).join(' · ')}`);
    console.log(`  tersimpan: ${path.basename(f)}\n`);
  }
  if (nPutaran > 1) {
    const sah = semua.filter((r) => r.sah);
    const ambil = (k) => sah.map((r) => r.metrik[k]);
    const rata = (xs) => xs.reduce((a, c) => a + c, 0) / (xs.length || 1);
    const sd = (xs) => (xs.length > 1 ? Math.sqrt(xs.reduce((a, c) => a + (c - rata(xs)) ** 2, 0) / (xs.length - 1)) : 0);
    const ng = ambil('MENGARANG_pct'), or = ambil('over_refusal_pct'), fk = ambil('fakta_akurasi').map((x) => 100 * (x ?? 0));
    console.log(`## ${model}+gerbang(${modelProbe},${moda}): MENGARANG rata ${rata(ng).toFixed(1)}% sd ${sd(ng).toFixed(2)} · over-refusal rata ${rata(or).toFixed(1)}% · fakta rata ${rata(fk).toFixed(1)}% · ${sah.length}/${nPutaran} putaran sah`);
  }
}
