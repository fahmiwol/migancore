/**
 * kunci-acuan.mjs — menolak mengukur ulang model yang angkanya SEDANG DIPAKAI
 * sebagai acuan oleh pra-daftar yang belum divonis.
 *
 * ====================== BAHAYA YANG DIJAGA ======================
 * `PRA-DAFTAR-V18.json` mengunci acuan `migancore:0.14`: mengarang 50,0 % dengan
 * sd 5,22 pada n=13. Ambang MENANG (turun >= 5,4 pp) DIHITUNG dari n itu:
 *
 *   se acuan   = 5,22 / sqrt(13) = 1,45
 *   se kandidat= 5,22 / sqrt(5)  = 2,33
 *   se selisih = sqrt(1,45^2 + 2,33^2) = 2,74  ->  1,96 x 2,74 = 5,4 pp
 *
 * Menjalankan satu putaran lagi pada `0.14` menambah berkas hasil, menggeser
 * rata-ratanya, dan mengubah n — sehingga ambang 5,4 pp tidak lagi berpasangan
 * dengan acuan yang dipakai menghitungnya. Gerbang tetap akan mencetak vonis,
 * dengan penuh percaya diri, memakai ambang yang sudah tidak menjaga apa pun.
 * Itu C38 (ambang hidup lebih lama dari instrumennya) dalam bentuk yang paling
 * mudah terjadi: seseorang cuma ingin "menyegarkan angkanya".
 *
 * Bahayanya nyata justru pada operator yang TELITI: runbook menyuruh mengukur
 * kandidat di lima sumbu, dan mengukur acuannya sekalian terasa seperti
 * kerapian, bukan kerusakan.
 *
 * ====================== SIKAP ======================
 * Ia MENOLAK, bukan memperingatkan — peringatan yang bisa dilewati sama dengan
 * tidak ada saat orangnya sedang buru-buru. Yang mau melanggarnya harus menulis
 * `--acuan-sengaja`, dan sesudah itu WAJIB mengunci ulang pra-daftarnya lewat
 * amendemen bertanggal.
 *
 * C27: modul ini tidak punya efek samping saat diimpor.
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const FLY = path.join(DI_SINI, '..', 'flywheel');

/** Pra-daftar dianggap AKTIF selama vonisnya belum diisi. */
export const VONIS_BELUM = 'BELUM DIJALANKAN';

/**
 * Cari pra-daftar aktif yang memakai `model` sebagai acuan.
 * Mengembalikan daftar (bisa lebih dari satu) — kosong berarti aman.
 */
export function acuanTerkunci(model, dir = FLY) {
  const kena = [];
  let berkas = [];
  try { berkas = fs.readdirSync(dir).filter((f) => /^PRA-DAFTAR-.*\.json$/.test(f)); } catch { return kena; }
  for (const f of berkas) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    if (j?.vonis?.hasil !== VONIS_BELUM) continue;          // sudah divonis = tidak menjaga apa pun lagi
    // Acuan bisa ditulis di dua tempat, dan keduanya dibaca: `resep.acuanPromosi`
    // (V18 dan sesudahnya) atau medan `acuan` lama. Membaca satu saja akan
    // gagal-senyap pada bentuk yang lain.
    const teks = `${j.resep?.acuanPromosi ?? ''} ${j.acuan ?? ''}`;
    if (!teks.includes(model)) continue;
    // Ambang menang & angka acuan TIDAK tinggal di pra-daftar — keduanya ada di
    // RESEP, yang pra-daftar tunjuk lewat `resep.berkasResep`. Itu disengaja
    // (gerbang membacanya lewat --resep, satu sumber angka), dan dugaan pertama
    // saya keliru: mencarinya di pra-daftar mengembalikan null tanpa galat.
    let sasaran = null, angka = null;
    const relResep = j.resep?.berkasResep;
    if (relResep) {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(dir, '..', relResep), 'utf8'));
        sasaran = r.sasaranMenang ?? null;
        angka = Object.entries(r.acuanTerukur ?? {}).find(([k]) => k.startsWith(model))?.[1] ?? null;
      } catch { /* resep tak terbaca: nama pra-daftarnya tetap dilaporkan */ }
    }
    kena.push({ berkas: f, nama: j.nama ?? f, resep: relResep ?? null, angka, sasaran });
  }
  return kena;
}

/**
 * Penjaga untuk dipanggil pelari pengukur. MELEMPAR kalau terkunci.
 * `izin` = true (biasanya dari --acuan-sengaja) melewatinya, dengan pesan.
 */
export function jagaAcuan(model, { izin = false, apa = 'pengukuran' } = {}) {
  const kena = acuanTerkunci(model);
  if (!kena.length) return { ok: true, terkunci: false };
  const daftar = kena.map((k) => `  ${k.berkas} (${k.nama})${k.sasaran ? ` — ambang menang ${k.sasaran.minTurunPp} pp dihitung dari n acuan saat ini` : ''}`).join('\n');
  if (izin) {
    console.error(`\n[--acuan-sengaja] ${apa} pada acuan terkunci "${model}" TETAP DIJALANKAN.\n${daftar}\n`
      + '  WAJIB sesudahnya: kunci ulang angka acuan di pra-daftar lewat AMENDEMEN BERTANGGAL,\n'
      + '  dan hitung ulang ambang menangnya. Kalau tidak, vonisnya memakai ambang yang sudah lepas.\n');
    return { ok: true, terkunci: true, dilewati: true, kena };
  }
  throw new Error(`"${model}" adalah ACUAN terkunci di pra-daftar yang belum divonis — ${apa} DITOLAK.\n${daftar}\n`
    + '\nMenambah putaran menggeser rata-rata DAN n, sehingga ambang menang tidak lagi berpasangan\n'
    + 'dengan acuan yang dipakai menghitungnya (C38). Gerbang tetap akan mencetak vonis, dengan\n'
    + 'ambang yang sudah tidak menjaga apa pun.\n'
    + '\nKalau memang disengaja: tambahkan --acuan-sengaja, lalu kunci ulang pra-daftarnya.');
}

// ─────────────────────────────────────────────────────────────────── uji ──
const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (LANGSUNG && process.argv.includes('--uji')) {
  let n = 0, bad = 0;
  const ok = (nama, cond, ket = '') => { if (cond) { n++; console.log(`  OK    ${nama}`); } else { bad++; console.log(`  GAGAL ${nama}${ket ? ' — ' + ket : ''}`); } };
  const lempar = (f) => { try { f(); return null; } catch (e) { return e.message; } };
  console.log('# Uji kunci-acuan\n');

  // Berkas NYATA di repo — penjaga yang cuma diuji dengan umpan buatan sendiri
  // tidak membuktikan apa pun tentang keadaan sungguhan.
  const kena = acuanTerkunci('migancore:0.14');
  ok('migancore:0.14 TERBACA terkunci oleh pra-daftar aktif', kena.length > 0,
    `${kena.length} pra-daftar`);
  ok('yang mengunci adalah V18', kena.some((k) => /V18/.test(k.berkas)));
  ok('ambang menang ikut terbaca dari RESEP yang ditunjuk pra-daftar',
    kena.some((k) => k.sasaran?.minTurunPp === 5.4), JSON.stringify(kena[0]?.sasaran)?.slice(0, 80));
  ok('angka acuan terukur ikut terbaca', kena.some((k) => k.angka?.mengarang === 50),
    JSON.stringify(kena[0]?.angka)?.slice(0, 80));

  ok('model yang bukan acuan TIDAK terkunci', acuanTerkunci('qwen2.5:7b').length === 0);
  ok('kandidat sendiri TIDAK terkunci (ia memang harus diukur)',
    acuanTerkunci('migancore:uji-tahan-1').length === 0);

  const pesan = lempar(() => jagaAcuan('migancore:0.14'));
  ok('jagaAcuan MENOLAK acuan terkunci', /DITOLAK/.test(pesan || ''));
  ok('penolakan menyebut SEBABNYA dan jalan keluarnya', /C38/.test(pesan || '') && /--acuan-sengaja/.test(pesan || ''));
  ok('jagaAcuan meloloskan model biasa', jagaAcuan('qwen2.5:7b').ok === true);
  ok('--acuan-sengaja melewatinya, dan menandainya', jagaAcuan('migancore:0.14', { izin: true }).dilewati === true);

  // Pra-daftar yang SUDAH divonis tidak menjaga apa pun lagi
  ok('pra-daftar yang sudah divonis tidak mengunci', acuanTerkunci('migancore:0.13').length === 0);

  console.log(`\nkunci-acuan: ${n}/${n + bad} uji lulus\n`);
  process.exit(bad ? 1 : 0);
}
