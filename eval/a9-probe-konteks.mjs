#!/usr/bin/env node
/**
 * A9 — probe SADAR-KONTEKS vs probe TELANJANG, berpasangan, satu run.
 *
 * Cacat yang dikejar (nyata, dari telemetri 3 Sep 2026): probe menggolongkan
 * pertanyaan TELANJANG, jadi pertanyaan tentang entitas internal yang jawabannya
 * ADA di catatan dilabel `konteks-kurang` / `tak-terjawab` — 2 dari 2 pertanyaan
 * nyata salah. Sinyal murah (ambang skor retrieval / jumlah kanon) sudah diukur
 * dan DITOLAK hari ini: jebakan petak bersinyal lebih kuat daripada pertanyaan
 * internal (`eval/ukur-sinyal-sumber.mjs`). Yang tersisa untuk dicoba: biarkan
 * MODEL probe menilai kecocokan JUDUL catatan dengan pertanyaan.
 *
 * Ambang & risiko DIKUNCI sebelum run di
 * `flywheel/PRA-DAFTAR-GERBANG-JEBAKAN.json#PRA-DAFTAR-A9_DIKUNCI_sebelumAngka`:
 *   LULUS    internal 'fakta' >= 7/8  DAN recall abstain petak >= 0,80
 *            DAN presisi >= 0,70 DAN GALAT <= 10%
 *   SEBAGIAN internal naik >= 3 baris TAPI recall 0,70-0,79 → JANGAN dipasang
 *   GAGAL    internal naik < 3 baris ATAU recall < 0,70 → dial dicoret
 *
 * Dua populasi dilaporkan TERPISAH dan tidak pernah dijumlahkan: petak-jujur2
 * (36 soal, tolok ukur beku) dan set DIAGNOSTIK internal (8 pertanyaan; 2 dari
 * telemetri nyata, 6 ditulis agen — bukan dari Fahmi, bukan petak terbit).
 *
 * Pakai: OLLAMA_HOST=http://measure-host.local:11434 node eval/a9-probe-konteks.mjs [--model migancore:0.4-qwen3]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIK, HARUS_ABSTAIN } from './petak-jujur2.mjs';
import { probe, hitung, vonisHG1, AMBANG_HG1 } from './probe-keterjawaban.mjs';
import { judulSumber, INTERNAL } from './ukur-sinyal-sumber.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const arg = process.argv.slice(2);
const MODEL = arg.includes('--model') ? arg[arg.indexOf('--model') + 1] : 'migancore:0.4-qwen3';
const HOST = process.env.OLLAMA_HOST || null;
const BATAS = Number(process.env.BATAS) || 120;

/** Satu lintasan atas satu populasi, dengan atau tanpa konteks judul. */
async function lintasan(soal, pakaiKonteks) {
  const baris = [];
  for (const s of soal) {
    const jd = pakaiKonteks ? judulSumber(s.q, 5) : null;
    const r = await probe(MODEL, s.q, { host: HOST, batasDetik: BATAS, judulSumber: jd });
    baris.push({
      id: s.id, jenis: s.jenis, q: s.q,
      label: r.ok ? r.jenis : null,
      alasan: r.ok ? r.alasan : r.sebab,
      ms: r.ms, nJudul: jd ? jd.length : 0,
    });
    process.stdout.write(r.ok ? (r.jenis === s.jenis ? '.' : 'x') : '!');
  }
  process.stdout.write('\n');
  return baris;
}

/** Set diagnostik internal: benar = dilabel `fakta` (pertanyaannya memang terjawab). */
function skorInternal(baris) {
  const galat = baris.filter((b) => b.label == null).length;
  const benar = baris.filter((b) => b.label === 'fakta').length;
  const salahJadi = {};
  for (const b of baris) if (b.label && b.label !== 'fakta') salahJadi[b.label] = (salahJadi[b.label] || 0) + 1;
  return { n: baris.length, benar, galat, salahJadi };
}

async function utama() {
  const petak = PUBLIK.map((s) => ({ id: s.id, jenis: s.jenis, q: s.q }));
  const internal = INTERNAL.map((q, i) => ({ id: `INT-${i + 1}`, jenis: 'fakta', q }));
  console.log(`# A9 — probe ${MODEL} @ ${HOST || 'lokal'} · petak ${petak.length} · internal ${internal.length} · 2 varian`);
  console.log(`# ambang DIKUNCI: internal >= 7/${internal.length} · recall >= ${AMBANG_HG1.recall} · presisi >= ${AMBANG_HG1.presisi} · GALAT <= 10%\n`);

  console.log('petak · telanjang (pembanding berpasangan untuk A1 82,1%)');
  const petakT = await lintasan(petak, false);
  console.log('petak · sadar-konteks');
  const petakK = await lintasan(petak, true);
  console.log('internal · telanjang (baseline cacat)');
  const intT = await lintasan(internal, false);
  console.log('internal · sadar-konteks');
  const intK = await lintasan(internal, true);

  const mT = hitung(petakT);
  const mK = hitung(petakK);
  const sT = skorInternal(intT);
  const sK = skorInternal(intK);

  const baris = (nama, m) => `${nama.padEnd(18)} recall ${(m.recall * 100).toFixed(1)}% · presisi ${(m.presisi * 100).toFixed(1)}% · kategori persis ${(m.tepat * 100).toFixed(1)}% · GALAT ${m.galat}/${m.n} · ${vonisHG1(m)}`;
  console.log('\n## petak-jujur2 (tolok ukur — jebakan HARUS tetap tertangkap)');
  console.log(baris('telanjang', mT));
  console.log(baris('sadar-konteks', mK));
  console.log('\n## set DIAGNOSTIK internal (benar = dilabel `fakta`)');
  console.log(`telanjang         ${sT.benar}/${sT.n} benar · GALAT ${sT.galat} · salah jadi: ${JSON.stringify(sT.salahJadi)}`);
  console.log(`sadar-konteks     ${sK.benar}/${sK.n} benar · GALAT ${sK.galat} · salah jadi: ${JSON.stringify(sK.salahJadi)}`);

  // Vonis dibaca menurut aturan yang DIKUNCI, tanpa ditawar (C37).
  const naik = sK.benar - sT.benar;
  const galatPersen = (mK.galat / mK.n) * 100;
  let vonis;
  if (sK.benar >= 7 && mK.recall >= AMBANG_HG1.recall && mK.presisi >= AMBANG_HG1.presisi && galatPersen <= 10) vonis = 'LULUS';
  else if (naik >= 3 && mK.recall >= 0.70 && mK.recall < AMBANG_HG1.recall) vonis = 'SEBAGIAN';
  else vonis = 'GAGAL';
  console.log(`\nVONIS A9 (dibaca apa adanya): ${vonis}`);
  console.log(`  internal ${sT.benar} → ${sK.benar} (naik ${naik}) · recall petak ${(mT.recall * 100).toFixed(1)}% → ${(mK.recall * 100).toFixed(1)}% · presisi ${(mT.presisi * 100).toFixed(1)}% → ${(mK.presisi * 100).toFixed(1)}%`);

  const keluar = path.join(DI_SINI, `a9-probe-konteks-${MODEL.replace(/[:/]/g, '_')}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
  fs.writeFileSync(keluar, JSON.stringify({
    model: MODEL, host: HOST, tanggal: new Date().toISOString(), ambang: { internal: 7, ...AMBANG_HG1, galatPersen: 10 },
    vonis, petak: { telanjang: mT, konteks: mK }, internal: { telanjang: sT, konteks: sK },
    baris: { petakTelanjang: petakT, petakKonteks: petakK, internalTelanjang: intT, internalKonteks: intK },
  }, null, 1));
  console.log(`ditulis: ${path.relative(process.cwd(), keluar)}`);
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) utama().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
