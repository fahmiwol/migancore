#!/usr/bin/env node
/**
 * audit-klaim-gerbang — memvalidasi ulang SEMUA angka gerbang jebakan (doc 85 /
 * PRA-DAFTAR-GERBANG-JEBAKAN.json) dari berkas hasil mentah, bukan dari ringkasan.
 *
 * Untuk tiap run (A3, polos berpasangan, A3b, A3d, A3f): berkas hasil diambil dari
 * baris "tersimpan:" di lognya, metrik dihitung ULANG dari `baris` lewat penilai yang
 * sama (instrumen-jujur2.metrik), lalu dibandingkan dengan angka yang DIKLAIM.
 * Selisih >0,1 pp pada rata/sd atau syarat mana pun = GAGAL (kode keluar 1).
 * Juga menghitung CI95 gabungan (10 & 15 putaran) yang dikutip di vonis.
 *
 * Pakai: node eval/audit-klaim-gerbang.mjs   (offline, <2 detik; dipasang di migan periksa)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metrik } from './instrumen-jujur2.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const T = { 5: 2.776, 10: 2.262, 15: 2.145 }; // t dua sisi 95% untuk dk = n-1

// Angka yang DIKLAIM (pra-daftar & doc 85, 2 Sep) — dikunci di sini supaya audit
// bisa berteriak kalau berkas dan klaim berbeda.
export const KLAIM = {
  A3: { log: 'a3-gerbang-laptop.log', bagian: ['# ukur-jujur2-gerbang', '# polos berpasangan'], rata: 41.8, sd: 6.18, overRefusal: 2.5, fakta: 42.5 },
  polos: { log: 'a3-gerbang-laptop.log', bagian: ['# polos berpasangan', '# probe base'], rata: 47.8, sd: 3.94 },
  A3b: { log: 'a3b-gerbang-laptop.log', bagian: ['# ukur-jujur2-gerbang', '# SELESAI'], rata: 32.1, sd: 8.36, overRefusal: 0.0, fakta: 47.5 },
  A3d: { log: 'a3d-gerbang-bmax.log', bagian: ['# ukur-jujur2-gerbang', '# SELESAI'], rata: 34.3, sd: 6.50, overRefusal: 2.5, fakta: 45.0 },
  A3f: { log: 'a3f-gerbang-laptop.log', bagian: ['# ukur-jujur2-gerbang', '# SELESAI'], rata: 37.9, sd: 4.83, overRefusal: 0.0, fakta: 40.0 },
};
export const KLAIM_GABUNGAN = {
  'A3b+A3d (10)': { run: ['A3b', 'A3d'], rata: 33.2, ciBawah: 28.1, ciAtas: 38.3 },
  'A3b+A3d+A3f (15)': { run: ['A3b', 'A3d', 'A3f'], rata: 34.8, ciBawah: 31.1, ciAtas: 38.5 },
};

export function berkasDariLog(namaLog, [awal, akhir]) {
  const teks = fs.readFileSync(path.join(DI_SINI, namaLog), 'utf8');
  const i0 = teks.indexOf(awal); if (i0 < 0) throw new Error(`penanda '${awal}' tidak ada di ${namaLog}`);
  const i1 = teks.indexOf(akhir, i0 + awal.length);
  const potongan = teks.slice(i0, i1 < 0 ? undefined : i1);
  return [...potongan.matchAll(/tersimpan: (hasil-jujur2-[^\s]+\.json)/g)].map((m) => m[1]);
}

export function statistik(xs, t) {
  const n = xs.length, m = xs.reduce((a, c) => a + c, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, c) => a + (c - m) ** 2, 0) / (n - 1)) : 0;
  const h = (t || T[n] || 2.0) * sd / Math.sqrt(n);
  return { n, rata: +m.toFixed(1), sd: +sd.toFixed(2), ciBawah: +(m - h).toFixed(1), ciAtas: +(m + h).toFixed(1) };
}

/** Hitung ulang metrik satu run dari berkas mentah (baris → metrik()), abaikan GALAT (C33). */
export function hitungUlang(berkas) {
  const perPutaran = [];
  for (const f of berkas) {
    const d = JSON.parse(fs.readFileSync(path.join(DI_SINI, f), 'utf8'));
    const sah = d.baris.filter((b) => b.hasil !== 'GALAT');
    const galat = d.baris.length - sah.length;
    if (galat / d.baris.length > 0.10) continue; // putaran tidak sah — sama dengan pelari
    const m = metrik(sah);
    // pemeriksaan silang: ringkasan yang tersimpan harus sama dengan hitungan ulang
    const simpan = d.rangkuman?.metrik;
    if (simpan && Math.abs(simpan.MENGARANG_pct - m.MENGARANG_pct) > 0.05) throw new Error(`${f}: ringkasan tersimpan ${simpan.MENGARANG_pct} ≠ hitung ulang ${m.MENGARANG_pct}`);
    perPutaran.push({ f, MENGARANG: m.MENGARANG_pct, overRefusal: m.over_refusal_pct, fakta: 100 * (m.fakta_akurasi ?? 0), galat });
  }
  const ng = perPutaran.map((p) => p.MENGARANG);
  const rata = (k) => +(perPutaran.reduce((a, p) => a + p[k], 0) / perPutaran.length).toFixed(1);
  return { putaran: perPutaran.length, ...statistik(ng), overRefusal: rata('overRefusal'), fakta: rata('fakta'), angka: ng };
}

function utama() {
  let gagal = 0;
  const cek = (nama, klaim, nyata) => {
    for (const k of ['rata', 'sd', 'overRefusal', 'fakta', 'ciBawah', 'ciAtas']) {
      if (klaim[k] == null) continue;
      const beda = Math.abs(klaim[k] - nyata[k]);
      const ok = beda <= 0.1 + 1e-9;
      if (!ok) gagal++;
      console.log(`  ${ok ? '✓' : '✗'} ${nama.padEnd(18)} ${k.padEnd(12)} klaim ${String(klaim[k]).padStart(6)}  berkas ${String(nyata[k]).padStart(6)}`);
    }
  };
  const hasil = {};
  console.log('# audit klaim gerbang jebakan — hitung ulang dari berkas mentah');
  for (const [nama, k] of Object.entries(KLAIM)) {
    const berkas = berkasDariLog(k.log, k.bagian);
    if (berkas.length !== 5) { console.log(`  ✗ ${nama}: ${berkas.length} berkas (harus 5) dari ${k.log}`); gagal++; continue; }
    const r = hitungUlang(berkas);
    hasil[nama] = r;
    console.log(`${nama}: ${r.putaran}/5 sah · ${r.angka.join(' · ')} → rata ${r.rata} sd ${r.sd} CI95 [${r.ciBawah}; ${r.ciAtas}] · over-refusal ${r.overRefusal} · fakta ${r.fakta}`);
    cek(nama, k, r);
  }
  for (const [nama, k] of Object.entries(KLAIM_GABUNGAN)) {
    const semua = k.run.flatMap((r) => hasil[r]?.angka || []);
    if (!semua.length) { console.log(`  ✗ ${nama}: run tidak lengkap`); gagal++; continue; }
    const s = statistik(semua);
    console.log(`${nama}: n=${s.n} rata ${s.rata} sd ${s.sd} CI95 [${s.ciBawah}; ${s.ciAtas}]`);
    cek(nama, k, s);
  }
  // Garis dasar (Bmax n=5) dari PRA-DAFTAR-PAPAN-N5: 51,4 ±6,95 → CI95 harus tidak bertumpang tindih dengan gabungan 10.
  const dasar = statistik([51.4], 0); dasar.sd = 6.95; const hDasar = T[5] * 6.95 / Math.sqrt(5);
  const dasarBawah = +(51.4 - hDasar).toFixed(1);
  const gab10 = statistik(['A3b', 'A3d'].flatMap((r) => hasil[r]?.angka || []));
  const terpisah = gab10.ciAtas < dasarBawah;
  console.log(`garis dasar 51,4 ±6,95 → CI95 bawah ${dasarBawah}; gabungan 10 CI95 atas ${gab10.ciAtas} → ${terpisah ? 'TERPISAH (penurunan nyata)' : 'BERTUMPANG TINDIH'}`);
  if (!terpisah) gagal++;
  console.log(gagal ? `\nAUDIT GAGAL: ${gagal} ketidaksesuaian` : '\nAUDIT LULUS: semua klaim sama dengan berkas (toleransi 0,1)');
  process.exit(gagal ? 1 : 0);
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) utama();
