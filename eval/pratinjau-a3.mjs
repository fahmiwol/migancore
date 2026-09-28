/**
 * Pratinjau A3 — gerbang 2 (validasi di data NYATA) sebelum membayar 5 putaran.
 *
 * Kenapa ada: base mentah `qwen3:4b` sudah 11 kali diukur dan 11 kali TIDAK SAH.
 * Kegagalannya tidak merata — 5 soal yang SAMA habis waktu di hampir tiap
 * putaran (J2-A1, J2-A4, J2-B5 di 5/5; J2-D2, J2-G2 di 4/5), menyumbang 23 dari
 * 44 kegagalan 1 Sep. Jadi tuas BATAS bisa diuji dengan 5 soal, bukan 180.
 *
 * Yang alat ini JAWAB : berapa detik yang sebenarnya dibutuhkan soal terkeras.
 * Yang alat ini TIDAK jawab: berapa laju galat seluruh petak nanti.
 *
 * Rancangan pertama mencoba meramal laju galat petak dari laju sisa 1 Sep
 * (21/155 = 13,5 %) — dan ujinya sendiri menolaknya: dengan 5 soal keras LULUS
 * pun ramalannya 11,7 %, di atas ambang 10 %. Ramalan itu memang salah: 21
 * kegagalan sisa itu SENDIRI habis-waktu di 120 dtk, dan bagaimana kelakuannya
 * di 300 dtk tidak diketahui. Memakai laju 120 dtk untuk meramal putaran 300 dtk
 * = memakai instrumen di luar jangkauannya (C38 dalam bentuk kecil).
 *
 * Jadi aturannya diganti jadi yang bisa DIUKUR: soal terkeras harus selesai
 * dengan RUANG SISA, bukan mepet di batas. Vonis laju galat sebenarnya diambil
 * dari satu putaran NYATA sesudah ini, bukan dari sini.
 *
 * Yang TIDAK diubah: pembungkusnya. PIKIR tetap bawaan (C29 — jangkar harus
 * diukur dengan pembungkus yang sama dengan model yang dibandingkan padanya).
 * Yang boleh dinaikkan hanya batas waktunya.
 *
 *   OLLAMA_HOST=http://measure-host.local:11434 BATAS=300 node eval/pratinjau-a3.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tanyaPolos, BATAS_DETIK, ALIRAN } from './ukur-jujur2.mjs';
import { PUBLIK as PETAK } from './petak-jujur2.mjs';

/** Vonis pratinjau yang bisa dibaca pelari sebelum berangkat. */
export const BERKAS_VONIS = 'eval/PRATINJAU-A3.json';

/**
 * Sidik jari MESIN penyaji, bukan alamatnya.
 *
 * 10 Sep: Bmax dinyalakan ulang dan DHCP memberinya alamat baru —
 * laptop.local → measure-host.local. Semua skrip, dokumen, dan memori menyebut .78,
 * jadi mesin yang sehat terbaca "mati" di setiap pemeriksaan. Alamat IP adalah
 * fakta yang berubah sendiri; menyimpannya sebagai tetapan berarti menyimpan
 * sesuatu yang akan basi tanpa memberi tahu siapa pun.
 *
 * Yang benar-benar dijaga gerbang bukan "alamatnya sama" melainkan "mesinnya
 * sama" — karena mencampur dua mesin berarti mencampur kecepatan, versi, dan
 * muatan model (C29). Daftar model + versi Ollama adalah sidik jari yang cukup:
 * empat model `migancore:*` di sana adalah bangunan kami sendiri dan tidak ada
 * di mesin lain mana pun.
 */
export async function sidikMesin(host) {
  const ambil = async (jalur) => {
    const r = await fetch(`${host}${jalur}`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`${jalur} ${r.status}`);
    return r.json();
  };
  const [tags, versi] = await Promise.all([ambil('/api/tags'), ambil('/api/version').catch(() => ({}))]);
  const model = (tags.models || []).map((m) => m.name).sort();
  return { model, versi: versi.version || null, cap: capMesin(model, versi.version) };
}

/** Cap ringkas dari daftar model + versi. Murni — bisa diuji tanpa jaringan. */
export function capMesin(model, versi) {
  const inti = [...(model || [])].sort().join('|');
  let h = 5381;
  for (let i = 0; i < inti.length; i++) h = ((h * 33) ^ inti.charCodeAt(i)) >>> 0;
  return `${(model || []).length}m-${h.toString(16)}-${versi || 'tanpa-versi'}`;
}

/** Soal yang terbukti paling sering habis waktu, dari 5 putaran 1 Sep. */
export const SOAL_KERAS = ['J2-A1', 'J2-A4', 'J2-B5', 'J2-D2', 'J2-G2'];

/** Ruang sisa minimum: soal terkeras harus selesai di <= 2/3 batas. */
export const RUANG_SISA = 1.5;

/**
 * Vonis pratinjau. `detik` = lama tiap soal keras, `gagal` = yang tetap mentok.
 * Lulus hanya kalau SEMUA selesai DAN yang terlama masih punya ruang sisa —
 * selesai di detik 297 dari batas 300 bukan bukti batasnya cukup, itu kebetulan.
 */
export function vonisPratinjau(detik, gagal, batas = BATAS_DETIK) {
  const terlama = detik.length ? Math.max(...detik) : Infinity;
  const cukup = gagal === 0 && terlama * RUANG_SISA <= batas;
  return {
    terlama,
    gagal,
    cukup,
    saran: cukup ? batas : Math.ceil((terlama || batas) * RUANG_SISA / 60) * 60,
  };
}

/**
 * Daftar soal yang diuji. `--soal J2-A4,J2-B5` mempersempitnya — dipakai untuk
 * UJI LANGIT-LANGIT: satu soal yang mentok, dijalankan dengan batas sangat
 * longgar, untuk menjawab "apakah ia berhenti sama sekali?". Tanpa jawaban itu,
 * menaikkan BATAS cuma menebak lagi.
 */
export function pilihSoal(argv, petak = PETAK) {
  const i = argv.indexOf('--soal');
  const id = i >= 0 && argv[i + 1] ? argv[i + 1].split(',').map((x) => x.trim()) : SOAL_KERAS;
  return { id, soal: petak.filter((s) => id.includes(s.id)) };
}

/**
 * Bolehkah vonis pratinjau ini dipakai untuk BATAS yang berbeda?
 *
 * Boleh, tapi hanya ke ATAS dan hanya kalau TIDAK ADA yang gagal. Alasannya:
 * batas waktu hanya bisa MENYENSOR pengukuran, tidak bisa memanjangkannya.
 * Kalau kelima soal selesai sendiri di bawah batasnya, waktu yang tercatat
 * adalah sifat modelnya — bukan sifat batasnya — jadi angka yang sama berlaku
 * di batas mana pun yang lebih longgar.
 *
 * Kalau ada yang GAGAL, waktunya tersensor: yang kita tahu cuma "lebih dari
 * batas", dan itu tidak boleh dipakai menghitung ruang sisa di batas lain.
 *
 * Ini menghemat satu putaran pratinjau penuh (~45 menit mesin) tiap kali BATAS
 * dinaikkan — tanpa mengaku sudah mengukur sesuatu yang belum diukur.
 */
export function cukupUntukBatas(v, batas, ruangSisa = RUANG_SISA) {
  if (!v || v.gagal !== 0) return { boleh: false, sebab: 'ada soal yang GAGAL — waktunya tersensor' };
  if (!(v.batas <= batas)) return { boleh: false, sebab: `pratinjau diukur di batas ${v.batas}s, lebih longgar dari ${batas}s` };
  if (!(v.terlama > 0)) return { boleh: false, sebab: 'tidak ada waktu terukur' };
  return v.terlama * ruangSisa <= batas
    ? { boleh: true, sebab: `terlama ${v.terlama}s × ${ruangSisa} = ${Math.ceil(v.terlama * ruangSisa)}s <= ${batas}s` }
    : { boleh: false, sebab: `terlama ${v.terlama}s butuh batas >= ${Math.ceil(v.terlama * ruangSisa)}s` };
}

async function utama() {
  const model = process.argv.slice(2).find((a) => !a.startsWith('--') && !SOAL_KERAS.some((s) => a.includes(s))) || 'qwen3:4b';
  const { id, soal } = pilihSoal(process.argv);
  if (soal.length !== id.length) {
    console.error(`BERHENTI — hanya ${soal.length}/${id.length} soal ketemu di petak`);
    process.exit(2);
  }
  console.log(`## pratinjau A3 · ${model} · batas ${BATAS_DETIK}s · aliran ${ALIRAN ? 'ON' : 'off'} · ${soal.length} soal`);
  if (!ALIRAN) {
    console.log('   PERINGATAN: aliran MATI → langit-langit 300 dtk undici berlaku,');
    console.log('   dan BATAS di atas 300 tidak akan pernah tercapai. Pakai ALIRAN=1.');
  }
  console.log('');

  let gagal = 0;
  const detik = [];
  const baris = [];
  for (const s of soal) {
    const t0 = Date.now();
    const r = await tanyaPolos(model, s.q);
    const d = Math.round((Date.now() - t0) / 1000);
    if (r.ok) detik.push(d); else gagal++;
    // `tanyaPolos` mengembalikan `sebab`, bukan `galat`. Versi pertama membaca
    // kunci yang salah dan mencetak "undefined" untuk tiap kegagalan — persis
    // kelas gagal-SENYAP yang proyek ini paling sering kena: alat berjalan,
    // hasilnya keluar, isinya kosong.
    baris.push({ id: s.id, jenis: s.jenis, detik: d, ok: !!r.ok,
      huruf: r.ok ? r.teks.length : 0, sebab: r.ok ? null : r.sebab });
    console.log(`${r.ok ? 'OK   ' : 'GALAT'} ${s.id.padEnd(7)} ${String(d).padStart(4)}s  ${s.jenis.padEnd(14)} ${r.ok ? `${String(r.teks.length).padStart(5)} hrf  ` + String(r.teks).replace(/\s+/g, ' ').slice(0, 50) : r.sebab}`);
  }

  const v = vonisPratinjau(detik, gagal);
  const lajuHrf = baris.filter((b) => b.ok && b.detik > 0);
  const hrfPerDetik = lajuHrf.length
    ? Math.round(lajuHrf.reduce((a, b) => a + b.huruf / b.detik, 0) / lajuHrf.length) : null;

  console.log(`\n  gagal   : ${v.gagal}/${soal.length}`);
  console.log(`  detik   : ${detik.join(', ') || '—'}`);
  console.log(`  terlama : ${Number.isFinite(v.terlama) ? v.terlama + 's' : '—'} (butuh <= ${Math.floor(BATAS_DETIK / RUANG_SISA)}s untuk punya ruang sisa)`);
  if (hrfPerDetik) console.log(`  laju    : ~${hrfPerDetik} huruf/dtk (~${(hrfPerDetik / 3.5).toFixed(1)} token/dtk)`);

  // Vonis yang bisa DIBACA MESIN. Tanpa ini, "sudah diuji" cuma ingatan, dan
  // pelari 5 putaran bisa berangkat dengan setelan yang belum pernah lulus.
  const mesin = await sidikMesin(process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').catch(() => null);
  fs.writeFileSync(BERKAS_VONIS, JSON.stringify({
    stempel: new Date().toISOString(), model, host: process.env.OLLAMA_HOST || null,
    mesin,
    batas: BATAS_DETIK, aliran: ALIRAN, ruangSisa: RUANG_SISA, soal: id,
    terlama: Number.isFinite(v.terlama) ? v.terlama : null,
    gagal: v.gagal, cukup: v.cukup, saran: v.saran, hurufPerDetik: hrfPerDetik, baris,
  }, null, 1) + '\n');
  console.log(`  vonis   : ${BERKAS_VONIS}`);

  console.log(v.cukup
    ? '\n  LANJUT — jalankan SATU putaran nyata dulu:\n    BATAS=' + BATAS_DETIK + ' node eval/ukur-jujur2.mjs ' + model + ' --putaran 1'
    : `\n  JANGAN JALAN — naikkan BATAS ke ~${v.saran}s. JANGAN ubah pembungkus.`);
  process.exit(v.cukup ? 0 : 1);
}

function uji() {
  let lulus = 0, gagal = 0;
  const cek = (n, k) => { k ? lulus++ : (gagal++, console.log(`  GAGAL: ${n}`)); };

  cek('5 soal keras semuanya ada di petak',
    SOAL_KERAS.every((id) => PETAK.some((s) => s.id === id)));
  cek('soal keras tidak ada yang kembar', new Set(SOAL_KERAS).size === SOAL_KERAS.length);

  cek('semua cepat → cukup', vonisPratinjau([40, 55, 90, 120, 150], 0, 300).cukup);
  cek('satu tetap mentok → tidak cukup', vonisPratinjau([40, 55, 90, 120], 1, 300).cukup === false);
  cek('selesai tapi MEPET batas → tidak cukup (inti aturannya)',
    vonisPratinjau([40, 55, 90, 120, 297], 0, 300).cukup === false);
  cek('mepet → saran batas naik, bukan tetap',
    vonisPratinjau([297], 0, 300).saran > 300);
  cek('cukup → saran = batas sekarang, tidak menaikkan tanpa sebab',
    vonisPratinjau([100], 0, 300).saran === 300);
  cek('semua gagal → terlama tak terhingga, tidak cukup',
    vonisPratinjau([], 5, 300).cukup === false);
  cek('saran dibulatkan ke menit penuh', vonisPratinjau([250], 0, 300).saran % 60 === 0);

  // Pakai-ulang vonis di batas lain — hanya ke ATAS, hanya kalau nol gagal.
  const v900 = { batas: 900, gagal: 0, terlama: 811 };
  cek('nol gagal + batas lebih longgar → boleh dipakai ulang',
    cukupUntukBatas(v900, 1260).boleh === true);
  cek('batas yang sama tapi ruang sisa kurang → tidak boleh',
    cukupUntukBatas(v900, 900).boleh === false);
  cek('batas LEBIH KETAT dari saat diukur → tidak boleh (arah salah)',
    cukupUntukBatas({ batas: 1260, gagal: 0, terlama: 400 }, 900).boleh === false);
  cek('ada yang GAGAL → tidak boleh, waktunya tersensor',
    cukupUntukBatas({ batas: 300, gagal: 1, terlama: 284 }, 1260).boleh === false);
  cek('tepat di ambang ruang sisa → boleh',
    cukupUntukBatas({ batas: 600, gagal: 0, terlama: 400 }, 600).boleh === true);
  cek('vonis kosong/null → tidak boleh', cukupUntukBatas(null, 900).boleh === false);
  cek('sebab selalu disebut', typeof cukupUntukBatas(v900, 900).sebab === 'string');

  // Sidik mesin: yang dibandingkan MESINNYA, bukan alamatnya.
  const dftr = ['migancore:0.14', 'qwen3:4b', 'phi4:14b'];
  cek('cap sama untuk daftar yang sama, urutan berbeda',
    capMesin(dftr, '0.33.2') === capMesin([...dftr].reverse(), '0.33.2'));
  cek('satu model berbeda → cap berbeda',
    capMesin(dftr, '0.33.2') !== capMesin([...dftr, 'llama3.1:8b'], '0.33.2'));
  cek('versi berbeda → cap berbeda',
    capMesin(dftr, '0.33.2') !== capMesin(dftr, '0.34.0'));
  cek('cap menyebut jumlah model di depan', capMesin(dftr, '0.33.2').startsWith('3m-'));
  cek('daftar kosong tidak melempar', typeof capMesin([], null) === 'string');
  cek('cap TIDAK memuat alamat — itu intinya',
    capMesin(dftr, '0.33.2').includes('192.168') === false);

  cek('tanpa --soal → seluruh soal keras', pilihSoal(['node', 'x']).id.length === SOAL_KERAS.length);
  cek('--soal mempersempit', pilihSoal(['node', 'x', '--soal', 'J2-A4']).soal.length === 1);
  cek('--soal terima banyak dipisah koma',
    pilihSoal(['node', 'x', '--soal', 'J2-A4,J2-B5']).soal.length === 2);
  cek('--soal id ngawur → soal lebih sedikit dari yang diminta (dihentikan pemanggil)',
    pilihSoal(['node', 'x', '--soal', 'J2-TIDAK-ADA']).soal.length === 0);

  console.log(`\n  ${lulus} lulus · ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
}

// Hanya jalan kalau berkas ini yang DIPANGGIL. Tanpa penjaga ini, `import`
// dari gerbang pelari akan memulai pengukuran — gerbang yang memicu hal yang
// seharusnya ia jaga.
const dipanggilLangsung = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (dipanggilLangsung) {
  if (process.argv.includes('--uji')) uji();
  else utama().catch((e) => { console.error(e); process.exit(2); });
}
