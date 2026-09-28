#!/usr/bin/env node
/**
 * vonis-hipotesis.mjs — vonis MEKANIS hipotesis varian-resep vs run kontrol.
 *
 * Pra-daftar H-wd-0.01 / H-epoch-1 (23 Agu) memakai klausul yang sama bentuknya:
 *   ringkasan SAHIH (resepBedaDiizinkan = [kunci yang diubah])
 *   arit-dengan >= kontrol - 1 · ton-dengan 4/4 · kenari 0/12 · kode7 true
 *   petakTahan.lossAdapter <= kontrol.petakTahan.lossAdapter + toleransi
 * plus klausul MENANG (bonus): petak-tahan < kontrol - 0.05 ATAU arit-tanpa > kontrol
 * ATAU arit-latih > kontrol (naskah bersyarat berkurang).
 *
 * Alat ini membaca dua ringkasan format-2, memeriksa tiap klausul, mencetak tabel
 * sandingan, dan keluar 0 (LULUS) / 1 (GAGAL). Tidak menafsirkan — menghitung.
 *
 * Pakai: node vonis-hipotesis.mjs <ringkasan-kontrol.json> <ringkasan-varian.json> --beda latih.weight_decay [--toleransi-tahan 0.02]
 *        node vonis-hipotesis.mjs --uji-instrumen
 */
'use strict';
import fs from 'node:fs';

const n = (s) => Number(String(s).split('/')[0]);

export function vonis(kontrol, varian, beda, toleransiTahan = 0.02) {
  const k = [];
  const cek = (nama, ok, bukti) => k.push({ nama, ok, bukti });
  cek('ringkasan varian formatKontrak=2', varian.formatKontrak === 2, String(varian.formatKontrak));
  cek(`resepBedaDiizinkan hanya [${beda}]`,
    Array.isArray(varian.resepBedaDiizinkan) && varian.resepBedaDiizinkan.length === 1 && varian.resepBedaDiizinkan[0].startsWith(beda + ':'),
    JSON.stringify(varian.resepBedaDiizinkan));
  cek('sidik data varian = kontrol', varian.sidik?.data === kontrol.sidik?.data, `${varian.sidik?.data} vs ${kontrol.sidik?.data}`);
  const ad = varian['arit-dengan']?.benar, adK = kontrol['arit-dengan']?.benar;
  cek('arit-dengan >= kontrol - 1', ad >= adK - 1, `${ad} vs ${adK}`);
  cek('ton-dengan 4/4', varian['arit-dengan']?.ton === '4/4', String(varian['arit-dengan']?.ton));
  cek('kenari 0/12', n(varian.kenari) === 0, String(varian.kenari));
  cek('kode7 true', varian.kode7 === true, String(varian.kode7));
  const pt = varian.petakTahan?.lossAdapter, ptK = kontrol.petakTahan?.lossAdapter;
  cek(`petakTahan.lossAdapter <= kontrol + ${toleransiTahan}`, typeof pt === 'number' && typeof ptK === 'number' && pt <= ptK + toleransiTahan, `${pt} vs ${ptK}`);
  const lulus = k.every((x) => x.ok);
  const menang = [];
  if (typeof pt === 'number' && typeof ptK === 'number' && pt < ptK - 0.05) menang.push(`petak-tahan membaik ${(ptK - pt).toFixed(3)}`);
  if ((varian['arit-tanpa']?.benar ?? 0) > (kontrol['arit-tanpa']?.benar ?? 0)) menang.push(`arit-tanpa ${varian['arit-tanpa'].benar} > ${kontrol['arit-tanpa'].benar}`);
  if ((varian['arit-latih']?.benar ?? 0) > (kontrol['arit-latih']?.benar ?? 0)) menang.push(`arit-latih ${varian['arit-latih'].benar} > ${kontrol['arit-latih'].benar} (naskah bersyarat berkurang)`);
  return { klausul: k, lulus, menang };
}

export function sanding(kontrol, varian) {
  const r = (x, k) => x?.[k];
  const baris = [
    ['arit-dengan', `${r(kontrol['arit-dengan'], 'benar')}/10 · ton ${r(kontrol['arit-dengan'], 'ton')} · rata ${r(kontrol['arit-dengan'], 'rata')}`, `${r(varian['arit-dengan'], 'benar')}/10 · ton ${r(varian['arit-dengan'], 'ton')} · rata ${r(varian['arit-dengan'], 'rata')}`],
    ['arit-tanpa', `${r(kontrol['arit-tanpa'], 'benar')}/10 · rata ${r(kontrol['arit-tanpa'], 'rata')}`, `${r(varian['arit-tanpa'], 'benar')}/10 · rata ${r(varian['arit-tanpa'], 'rata')}`],
    ['arit-latih', `${r(kontrol['arit-latih'], 'benar')}/10 · rata ${r(kontrol['arit-latih'], 'rata')}`, `${r(varian['arit-latih'], 'benar')}/10 · rata ${r(varian['arit-latih'], 'rata')}`],
    ['kenari · kode7', `${kontrol.kenari} · ${kontrol.kode7}`, `${varian.kenari} · ${varian.kode7}`],
    ['loss rata · akhir', `${kontrol.lossRata?.toFixed?.(4)} · ${kontrol.kurva?.lossAkhir?.toFixed?.(4)}`, `${varian.lossRata?.toFixed?.(4)} · ${varian.kurva?.lossAkhir?.toFixed?.(4)}`],
    ['petak tahan base→adapter', `${kontrol.petakTahan?.lossBase?.toFixed?.(4)} → ${kontrol.petakTahan?.lossAdapter?.toFixed?.(4)}`, `${varian.petakTahan?.lossBase?.toFixed?.(4)} → ${varian.petakTahan?.lossAdapter?.toFixed?.(4)}`],
    ['token dilatih · terpotong', `${kontrol.tokenDilatihPersen}% · ${kontrol.token?.terpotong}`, `${varian.tokenDilatihPersen}% · ${varian.token?.terpotong}`],
    ['menit · GPU', `${kontrol.menit} · ${kontrol.lingkungan?.gpu}`, `${varian.menit} · ${varian.lingkungan?.gpu}`],
  ];
  return baris;
}

if (process.argv.includes('--uji-instrumen')) {
  const K = { formatKontrak: 2, sidik: { data: 'D' }, 'arit-dengan': { benar: 10, ton: '4/4', rata: '2/2' }, 'arit-tanpa': { benar: 8 }, 'arit-latih': { benar: 8 }, kenari: '0/12', kode7: true, petakTahan: { lossBase: 3.6, lossAdapter: 2.46 }, lossRata: 0.9, kurva: { lossAkhir: 0.46 }, tokenDilatihPersen: 51.8, token: { terpotong: 0 }, menit: 7, lingkungan: { gpu: 'X' } };
  const V = { ...K, resepBedaDiizinkan: ['latih.weight_decay: 0.0 != 0.01'] };
  const kasus = [];
  const cek = (nm, ok) => kasus.push([nm, ok]);
  cek('varian identik kontrol + beda tercatat = LULUS', vonis(K, V, 'latih.weight_decay').lulus === true);
  cek('beda tidak tercatat = GAGAL', vonis(K, { ...V, resepBedaDiizinkan: [] }, 'latih.weight_decay').lulus === false);
  cek('beda kunci lain = GAGAL', vonis(K, { ...V, resepBedaDiizinkan: ['latih.epoch: 2 != 1'] }, 'latih.weight_decay').lulus === false);
  cek('arit-dengan turun 2 = GAGAL', vonis(K, { ...V, 'arit-dengan': { benar: 8, ton: '4/4' } }, 'latih.weight_decay').lulus === false);
  cek('arit-dengan turun 1 = masih LULUS', vonis(K, { ...V, 'arit-dengan': { benar: 9, ton: '4/4' } }, 'latih.weight_decay').lulus === true);
  cek('ton 3/4 = GAGAL', vonis(K, { ...V, 'arit-dengan': { benar: 10, ton: '3/4' } }, 'latih.weight_decay').lulus === false);
  cek('kenari 1/12 = GAGAL', vonis(K, { ...V, kenari: '1/12' }, 'latih.weight_decay').lulus === false);
  cek('petak tahan +0.03 = GAGAL (toleransi 0.02)', vonis(K, { ...V, petakTahan: { lossBase: 3.6, lossAdapter: 2.49 } }, 'latih.weight_decay').lulus === false);
  cek('petak tahan -0.06 = LULUS + menang', (() => { const v = vonis(K, { ...V, petakTahan: { lossBase: 3.6, lossAdapter: 2.40 } }, 'latih.weight_decay'); return v.lulus && v.menang.length === 1; })());
  cek('arit-latih 9 > 8 = menang', vonis(K, { ...V, 'arit-latih': { benar: 9 } }, 'latih.weight_decay').menang.some((m) => /arit-latih/.test(m)));
  cek('sidik data beda = GAGAL', vonis(K, { ...V, sidik: { data: 'LAIN' } }, 'latih.weight_decay').lulus === false);
  cek('sanding: 8 baris', sanding(K, V).length === 8);
  let gagal = 0;
  for (const [nm, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nm}`); if (!ok) gagal++; }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

const argv = process.argv.slice(2);
const [fK, fV] = argv.filter((a) => !a.startsWith('--'));
const beda = argv.includes('--beda') ? argv[argv.indexOf('--beda') + 1] : null;
const tol = argv.includes('--toleransi-tahan') ? Number(argv[argv.indexOf('--toleransi-tahan') + 1]) : 0.02;
if (!fK || !fV || !beda) { console.error('pakai: node vonis-hipotesis.mjs <kontrol.json> <varian.json> --beda <kunci.resep> [--toleransi-tahan 0.02]'); process.exit(2); }
const K = JSON.parse(fs.readFileSync(fK, 'utf8')), V = JSON.parse(fs.readFileSync(fV, 'utf8'));
console.log(`# Vonis hipotesis — beda: ${beda}\n`);
console.log('| Ukuran | kontrol | varian |\n|---|---|---|');
for (const [a, b, c] of sanding(K, V)) console.log(`| ${a} | ${b} | ${c} |`);
const v = vonis(K, V, beda, tol);
console.log('');
for (const x of v.klausul) console.log(`${x.ok ? 'LULUS' : 'GAGAL'}  ${x.nama}   [${x.bukti}]`);
console.log(`\nVONIS: ${v.lulus ? 'LULUS' : 'GAGAL'}${v.menang.length ? ' · MENANG: ' + v.menang.join('; ') : ' · tidak ada klausul menang'}`);
process.exit(v.lulus ? 0 : 1);
