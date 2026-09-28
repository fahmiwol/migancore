/**
 * periksa-data.mjs — memastikan potret `data-nyata.json` MASIH COCOK dengan sumbernya.
 *
 * 18 Sep 2026: versi pertama memaku angka ("temuan == 230", "hukum == 29") sehingga ia GAGAL
 * begitu dua temuan sah bertambah (F-248, F-249). Itu persis kelas C38 — ambang basi yang hidup
 * lebih lama dari instrumennya — dan pemeriksa seperti itu berakhir dimatikan orang, bukan
 * dihormati. Sekarang yang diperiksa adalah INVARIAN, bukan potret:
 *   1. tiap angka di potret harus sama dengan yang dihitung ULANG dari berkas sumber hari ini;
 *   2. bentuk datanya utuh (tidak ada id ganda, tidak ada bagian kosong);
 *   3. pernyataan tentang A4 mengikuti keadaan sumbernya (bukan dipaku — lihat bagian 3).
 * Angka boleh tumbuh; yang tidak boleh adalah potret yang berbohong tentang sumbernya.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { MODUL } from '../js/peta-modul.mjs';
import { FASE_CAHAYA } from '../js/siklus-cahaya.mjs';

const AKAR = '.';
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8');
// Pengurai hukum kanonik — dipakai ulang, tidak disalin (pola salinan melewatkan C22/C30/C31, 23 Sep).
const { kumpulkanHukum, kumpulkanTemuan } = await import(new URL('../../../../flywheel/bangun-silsilah.mjs', import.meta.url).href);

const raw = await readFile(new URL('../data-nyata.json', import.meta.url), 'utf8');
const data = JSON.parse(raw);
const kalibrasi = JSON.parse(await readFile(new URL('./kalibrasi-cahaya.json', import.meta.url), 'utf8'));

// --- 1. Hitung ULANG dari sumber, dengan pola yang sama dengan pembangkitnya ---
const sumber = {
  praDaftar: fs.readdirSync(path.join(AKAR, 'flywheel')).filter((f) => /^PRA-DAFTAR-.*\.json$/.test(f)).length,
  temuan: new Set(kumpulkanTemuan(baca('docs/jarvis/FINDINGS_LOG.md')).flatMap((e) => e.ids)).size,
  hukum: kumpulkanHukum(baca('PETA-DIAL-LATIH.md')).filter((h) => /^C/.test(h.kode)).length,
};
const cacat = JSON.parse(baca('eval/REGISTER-CACAT.json'));
const daftarCacat = Array.isArray(cacat) ? cacat : cacat.cacat || cacat.kelas || [];

// Sebagai penjaga `migan periksa` (--penjaga): potret yang TERTINGGAL dari sumber hanya diperingatkan —
// dunia sudah menandai data > 7 hari sebagai BASI, dan penjaga yang merah tiap ada temuan baru akan
// dimatikan orang (kelas C38). Yang tetap GAGAL: pernyataan yang salah arah, bentuk rusak, cahaya.
const PENJAGA = process.argv.includes('--penjaga');
const samakan = (potret, hitung, pesan) => {
  if (potret === hitung) return;
  if (PENJAGA) console.log(`PERINGATAN: ${pesan}`);
  else assert.equal(potret, hitung, pesan);
};
samakan(data.praDaftar.length, sumber.praDaftar,
  `potret menulis ${data.praDaftar.length} pra-daftar, sumbernya ${sumber.praDaftar} — bangkitkan ulang`);
samakan(data.temuan.jumlah, sumber.temuan,
  `potret menulis ${data.temuan.jumlah} temuan, sumbernya ${sumber.temuan} — bangkitkan ulang`);
samakan(data.hukum.jumlah, sumber.hukum,
  `potret menulis ${data.hukum.jumlah} hukum, sumbernya ${sumber.hukum} — bangkitkan ulang`);
samakan(data.registerCacat.jumlahKelas, daftarCacat.length,
  `potret menulis ${data.registerCacat.jumlahKelas} kelas cacat, registernya ${daftarCacat.length} — bangkitkan ulang`);

// --- 2. Bentuk data utuh ---
assert.ok(data.praDaftar.length > 0 && data.temuan.jumlah > 0 && data.hukum.jumlah > 0,
  'potret kosong — pembangkitnya gagal diam-diam');
assert.equal(new Set(data.praDaftar.map((i) => i.id)).size, data.praDaftar.length, 'id pra-daftar ganda');
assert.equal(data.sensus.lokasi.length, 4, 'sensus harus mencakup empat lokasi');
assert.equal(data.mesin.length, 3, 'tiga mesin: laptop, Bmax, VPS-2');
const totalVonis = Object.values(data.ringkasVonis).reduce((a, b) => a + b, 0);
assert.equal(totalVonis, data.praDaftar.length, 'distribusi vonis tidak menjumlah ke jumlah pra-daftar');

// --- 3. Pernyataan yang wajib tetap jujur ---
// 23 Sep: invarian lama menuntut "belum terdefinisi" SELAMANYA — sejak A4-BARU terpasang ia menuntut
// kebohongan, dan pemeriksa ini gagal diam-diam karena tidak terdaftar sebagai penjaga. Sekarang arahnya
// mengikuti keadaan sumber: klaim "belum terdefinisi" hanya boleh ada selama A4-BARU belum terpasang.
const a4Terpasang = fs.existsSync(path.join(AKAR, 'flywheel', 'PRA-DAFTAR-A4-BARU.json'))
  && /TERPASANG/i.test(String(JSON.parse(baca('flywheel/PRA-DAFTAR-A4-BARU.json')).vonis?.hasil ?? ''));
if (a4Terpasang) assert.doesNotMatch(data.sorotan.A4, /belum terdefinisi/i, 'A4-BARU sudah terpasang — dunia tidak boleh lagi mengklaim "belum terdefinisi"');
else assert.match(data.sorotan.A4, /belum terdefinisi/i, 'A4 harus dinyatakan BELUM TERDEFINISI sampai A4-BARU terpasang');

// --- 4. Cakupan UI dan bukti kalibrasi cahaya ---
assert.equal(MODUL.length, 18, 'Mode Baca/navigasi harus bersumber dari tepat 18 modul PRD');
assert.equal(new Set(MODUL.map((item) => item.id)).size, 18, 'id modul dunia harus unik');
assert.deepEqual(kalibrasi.phases.map((fase) => fase.id), FASE_CAHAYA.map((fase) => fase.id), 'fase terukur harus sama dengan tabel keyframe runtime');
assert.deepEqual(kalibrasi.uncontrolledLights, [], 'ada lampu yang tidak dikendalikan siklus');
assert.ok(kalibrasi.baselineStatic.sampleCount >= 10, 'pembanding lampu statis harus memakai titik tanah yang sama');
for (const fase of kalibrasi.phases) {
  assert.ok(fase.sampleCount >= 10, `${fase.id}: median harus memakai minimal 10 titik tanah`);
  assert.equal(fase.clippedChannels, 0, `${fase.id}: ada kanal >=250`);
  assert.ok(fase.maxChannel < 250, `${fase.id}: kanal maksimum ${fase.maxChannel} terpotong`);
  const channel = { r: 0, g: 1, b: 2 }[fase.target.channel];
  assert.ok(Math.abs(fase.medianRgb[channel] - fase.target.value) <= fase.target.tolerance, `${fase.id}: kanal target meleset`);
}

console.log(JSON.stringify({
  ok: true, commit: data._commit,
  praDaftar: data.praDaftar.length, hukum: data.hukum.jumlah, temuan: data.temuan.jumlah,
  kelasCacat: data.registerCacat.jumlahKelas, backlog: data.backlog.length,
  vonis: data.ringkasVonis, modul: MODUL.length,
  faseCahaya: kalibrasi.phases.map((fase) => ({ id: fase.id, medianRgb: fase.medianRgb, maxChannel: fase.maxChannel })),
}, null, 2));
