#!/usr/bin/env node
/**
 * jaga-vonis-basi.mjs — vonis yang TERBACA belum tentu vonis yang MUTAKHIR.
 *
 * 15 Sep 2026 (F-233): A3 punya tiga putaran sah selama lima hari, sementara
 * vonis pra-daftarnya tetap berbunyi "1 dari 5". Berkas putaran kedua tersimpan,
 * tidak di-commit, dan tidak ada langkah — mesin maupun manusia — yang menulis
 * vonis sesudahnya. `jaga-vonis.mjs` lulus sepanjang waktu itu, karena yang ia
 * periksa adalah vonisnya BISA DIBACA, bukan vonisnya SESUAI dengan berkas.
 *
 * Penjaga ini membandingkan angka yang DIKLAIM vonis dengan jumlah yang DIHITUNG
 * dari berkas hasil, memakai aturan hitung yang sama dengan pelari A3
 * (`eval/jalankan-a3-base.sh`): rangkuman.sah, petak 36, tanpa gerbang/retrieval.
 *
 * Akibat yang disengaja: begitu satu putaran baru mendarat, penjaga ini GAGAL
 * sampai vonisnya diperbarui. Itu intinya — angka baru tanpa vonis baru adalah
 * persis keadaan yang lolos lima hari.
 *
 *   node eval/jaga-vonis-basi.mjs         periksa repo
 *   node eval/jaga-vonis-basi.mjs --uji   uji logika tanpa berkas
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Pra-daftar yang vonisnya memuat klaim hitungan putaran, dan cara menghitungnya dari berkas. */
export const DAFTAR = [
  {
    berkas: 'flywheel/PRA-DAFTAR-A3-JANGKAR.json',
    model: 'qwen3:4b',
    pola: /^hasil-jujur2-qwen3_4b-p\d+-.+\.json$/,
    target: 5,
  },
];

/** Hitung putaran polos SAH — aturan yang sama dengan pelari A3. */
export function hitungSah(dirEval, { model, pola }) {
  let n = 0;
  for (const f of fs.readdirSync(dirEval).filter((x) => pola.test(x))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dirEval, f), 'utf8'));
      if (j.model === model && j.rangkuman?.sah && j.petak === 36 && !j.gerbang && !j.retrieval) n++;
    } catch { /* berkas rusak tidak dihitung sah */ }
  }
  return n;
}

/**
 * Bandingkan klaim di teks vonis dengan hitungan berkas.
 * @returns {{status:'mutakhir'|'basi'|'lewati', pesan:string}}
 */
export function periksaKlaim(hasil, keadaan, dihitung, target) {
  const m = String(hasil ?? '').match(/(\d+)\s+dari\s+(\d+)\s+putaran\s+sah/i);
  if (keadaan !== 'belum') return { status: 'lewati', pesan: `vonis sudah berkeadaan "${keadaan}"` };
  if (!m) {
    return dihitung >= target
      ? { status: 'basi', pesan: `berkas sudah ${dihitung}/${target} sah, tapi vonis masih "belum" dan tidak menyebut hitungan` }
      : { status: 'lewati', pesan: 'vonis tidak memuat klaim hitungan putaran' };
  }
  const klaim = Number(m[1]);
  if (klaim !== dihitung) return { status: 'basi', pesan: `vonis mengklaim ${klaim} putaran sah, berkas menunjukkan ${dihitung}` };
  if (dihitung >= target) return { status: 'basi', pesan: `${dihitung}/${target} sah — syarat terpenuhi, tapi vonis masih "belum"` };
  return { status: 'mutakhir', pesan: `${klaim} dari ${target} sesuai berkas` };
}

// ─────────────────────────────────────────────────────────────────── uji ──
const LANGSUNG = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('jaga-vonis-basi.mjs');

if (LANGSUNG && process.argv.includes('--uji')) {
  let ok = 0, bad = 0;
  const cek = (n, c, x = '') => { if (c) { ok++; console.log(`  OK    ${n}`); } else { bad++; console.log(`  GAGAL ${n}${x ? ' — ' + x : ''}`); } };
  console.log('# Uji jaga-vonis-basi (tanpa berkas)\n');

  cek('klaim sesuai berkas = mutakhir', periksaKlaim('BELUM SELESAI — 3 dari 5 putaran sah (…)', 'belum', 3, 5).status === 'mutakhir');
  const f233 = periksaKlaim('BELUM SELESAI — 1 dari 5 putaran sah (53,6 %)', 'belum', 3, 5);
  cek('F-233 persis: klaim 1, berkas 3 = BASI', f233.status === 'basi' && /1 putaran sah, berkas menunjukkan 3/.test(f233.pesan), f233.pesan);
  cek('putaran baru mendarat sebelum vonis diperbarui = BASI', periksaKlaim('3 dari 5 putaran sah', 'belum', 4, 5).status === 'basi');
  cek('5/5 tapi masih "belum" = BASI (syarat terpenuhi, vonis tak ditulis)', periksaKlaim('5 dari 5 putaran sah', 'belum', 5, 5).status === 'basi');
  cek('vonis final dilewati', periksaKlaim('LULUS', 'lulus', 5, 5).status === 'lewati');
  cek('tanpa klaim & belum cukup = dilewati', periksaKlaim('BELUM DIJALANKAN', 'belum', 0, 5).status === 'lewati');
  cek('tanpa klaim tapi berkas sudah cukup = BASI', periksaKlaim('BELUM DIJALANKAN', 'belum', 5, 5).status === 'basi');

  // hitungSah pada folder tiruan: berkas gerbang, petak lain, galat, model lain TIDAK dihitung.
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP || process.env.TMP || '.'), 'vonis-basi-'));
  const tulis = (n, o) => fs.writeFileSync(path.join(tmp, n), JSON.stringify(o));
  tulis('hasil-jujur2-qwen3_4b-p1-2026-01-01T00-00-00.json', { model: 'qwen3:4b', petak: 36, rangkuman: { sah: true } });
  tulis('hasil-jujur2-qwen3_4b-p2-2026-01-01T00-00-00.json', { model: 'qwen3:4b', petak: 36, rangkuman: { sah: false } });
  tulis('hasil-jujur2-qwen3_4b-p3-2026-01-01T00-00-00.json', { model: 'qwen3:4b', petak: 36, gerbang: true, rangkuman: { sah: true } });
  tulis('hasil-jujur2-qwen3_4b-petak40-p1-2026-01-01T00-00-00.json', { model: 'qwen3:4b', petak: 40, rangkuman: { sah: true } });
  tulis('hasil-jujur2-qwen3_4b-p4-2026-01-01T00-00-00.json', '{rusak');
  const n = hitungSah(tmp, DAFTAR[0]);
  fs.rmSync(tmp, { recursive: true, force: true });
  cek('hitungSah: hanya polos-sah-36 yang dihitung (1 dari 5 tiruan)', n === 1, `n=${n}`);

  console.log(`\n${ok} lulus · ${bad} gagal\n`);
  process.exit(bad ? 1 : 0);
}

if (LANGSUNG && !process.argv.includes('--uji')) {
  let gagal = 0;
  for (const d of DAFTAR) {
    const pra = JSON.parse(fs.readFileSync(path.join(AKAR, d.berkas), 'utf8'));
    const n = hitungSah(path.join(AKAR, 'eval'), d);
    const r = periksaKlaim(pra.vonis?.hasil, pra.vonis?.keadaan, n, d.target);
    console.log(`  ${r.status === 'basi' ? 'BASI ' : 'OK   '} ${path.basename(d.berkas)} — ${r.pesan}`);
    if (r.status === 'basi') gagal++;
  }
  if (gagal) console.log('\n  Tulis vonis yang sesuai berkas ke pra-daftarnya, lalu periksa lagi.\n');
  process.exit(gagal ? 1 : 0);
}
