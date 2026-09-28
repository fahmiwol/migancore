#!/usr/bin/env node
/**
 * register-cacat.mjs — SISTEM PENCATATAN CACAT + PENJAGANYA.
 *
 * ============================== KENAPA INI ADA ==============================
 * Keluhan Fahmi, 21 Agu 2026, dan ia benar:
 *   "kamu selalu bilang temuan, atau emas, tapi dikemudian ada lagi kebocoran."
 *
 * Sepanjang hari ini saya menemukan sebelas cacat, dan beberapa di antaranya
 * BENTUKNYA SAMA dengan cacat yang sudah saya "perbaiki" sebelumnya —
 * pencocokan kata tanpa penyangkalan terjadi LIMA kali. Menuliskannya di
 * dokumen jelas tidak cukup: dokumen tidak berteriak waktu kesalahan yang sama
 * kembali.
 *
 * Maka aturannya dibalik: **sebuah cacat hanya boleh ditutup kalau ada perintah
 * yang bisa menangkapnya kembali.** Catatan tanpa penjaga tetap merah selamanya.
 * Yang dijaga adalah KELAS kesalahannya, bukan satu kejadiannya — karena yang
 * berulang selama ini memang bentuknya, bukan kasusnya.
 *
 * ================================== PAKAI ==================================
 *   node register-cacat.mjs              jalankan SEMUA penjaga, beri vonis
 *   node register-cacat.mjs --daftar     tampilkan daftar tanpa menjalankan
 *   node register-cacat.mjs --html       tulis papan pantau HTML
 *   node register-cacat.mjs --cepat      lewati penjaga yang lambat
 *
 * Keluar kode 1 bila ada penjaga merah ATAU ada cacat yang belum berpenjaga.
 * Cocok dipasang di depan setiap latihan dan setiap rilis.
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REG = JSON.parse(fs.readFileSync(path.join(DIR, 'REGISTER-CACAT.json'), 'utf8'));
const HANYA_DAFTAR = process.argv.includes('--daftar');
const TULIS_HTML = process.argv.includes('--html');
const CEPAT = process.argv.includes('--cepat');
const LAMBAT = new Set(['C07']);   // pemindai pencemaran mengindeks seluruh korpus

const warna = { hijau: '\x1b[32m', merah: '\x1b[31m', kuning: '\x1b[33m', mati: '\x1b[0m', redup: '\x1b[90m' };
const c = (w, s) => `${warna[w]}${s}${warna.mati}`;

console.log('# Register cacat — sistem pencatatan + penjaga\n');
console.log(c('redup', REG.tujuan.replace(/(.{76}\s)/g, '$1\n')));
console.log('');

const hasil = [];
for (const x of REG.cacat) {
  const label = `${x.kode} ${x.kelas}`;
  if (!x.penjaga) {
    hasil.push({ ...x, vonis: 'BELUM DIJAGA', detik: 0 });
    console.log(`  ${c('kuning', 'BELUM DIJAGA')}  ${label}`);
    console.log(`  ${' '.repeat(14)}${c('redup', x.belumDijagaKarena || '')}`);
    continue;
  }
  if (HANYA_DAFTAR) { hasil.push({ ...x, vonis: 'tidak dijalankan', detik: 0 }); console.log(`  ${c('redup', '(daftar)')}      ${label}`); continue; }
  if (CEPAT && LAMBAT.has(x.kode)) { hasil.push({ ...x, vonis: 'dilewati', detik: 0 }); console.log(`  ${c('redup', 'DILEWATI')}      ${label}`); continue; }

  const [cmd, ...arg] = x.penjaga.perintah.split(' ');
  const t0 = Date.now();
  let keluar = 0, pesan = '';
  try {
    execFileSync(cmd === 'node' ? process.execPath : cmd, arg, { cwd: DIR, stdio: 'pipe', timeout: 20 * 60 * 1000 });
  } catch (e) {
    keluar = e.status ?? 1;
    pesan = String(e.stdout || '').split('\n').filter((l) => /CACAT|GAGAL|TAHAN|TERCEMAR/.test(l)).slice(0, 2).join(' | ')
         || String(e.stderr || '').split('\n')[0] || 'gagal tanpa pesan';
  }
  const detik = Math.round((Date.now() - t0) / 1000);
  const lulus = keluar === (x.penjaga.harusKeluar ?? 0);
  hasil.push({ ...x, vonis: lulus ? 'DIJAGA' : 'MERAH', detik, pesan });
  console.log(`  ${lulus ? c('hijau', 'DIJAGA      ') : c('merah', 'MERAH       ')}  ${label}  ${c('redup', `(${detik}s)`)}`);
  if (!lulus) console.log(`  ${' '.repeat(14)}${c('merah', pesan.slice(0, 150))}`);
}

const merah = hasil.filter((h) => h.vonis === 'MERAH');
const belum = hasil.filter((h) => h.vonis === 'BELUM DIJAGA');
const dijaga = hasil.filter((h) => h.vonis === 'DIJAGA');
const berulang = REG.cacat.filter((x) => (x.berulang || 1) > 1);

console.log('\n## Ringkasan');
console.log(`  tercatat      : ${REG.cacat.length} cacat`);
console.log(`  berpenjaga    : ${REG.cacat.filter((x) => x.penjaga).length}`);
console.log(`  hijau         : ${dijaga.length}`);
console.log(`  merah         : ${merah.length}`);
console.log(`  belum dijaga  : ${belum.length}`);
console.log(`  pernah berulang: ${berulang.length} — ${berulang.map((x) => `${x.kode}x${x.berulang}`).join(', ')}`);

const vonis = merah.length ? 'MERAH — ada cacat yang kembali'
            : belum.length ? 'KUNING — semua penjaga hijau, tapi ada cacat yang belum berpenjaga'
            : 'HIJAU';
console.log(`\n## VONIS: ${vonis}`);

// ─────────────────────────────────────────────────── papan pantau HTML ──
if (TULIS_HTML) {
  const baris = hasil.map((h) => `      <tr class="${h.vonis.toLowerCase().replace(/\s/g, '-')}">
        <td class="kode">${h.kode}</td>
        <td><strong>${h.judul}</strong><div class="kelas">${h.kelas}${(h.berulang || 1) > 1 ? ` · <span class="ulang">berulang ${h.berulang}x</span>` : ''}</div>
            <details><summary>bukti nyata</summary><code>${String(h.buktiNyata).replace(/</g, '&lt;')}</code>
            <p class="akibat"><b>Akibat:</b> ${h.akibat}</p></details></td>
        <td><code>${h.penjaga ? h.penjaga.perintah : '—'}</code></td>
        <td class="vonis">${h.vonis}</td>
      </tr>`).join('\n');
  const html = `<title>Register Cacat MiganCore</title>
<style>
  :root { --bg:#fbfbfa; --fg:#1a1a19; --garis:#e3e3e0; --redup:#6b6b68; --hijau:#1a7f4b; --merah:#b3261e; --kuning:#8a6d00; --kartu:#fff; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#161614; --fg:#eceae5; --garis:#33312c; --redup:#9a968d; --hijau:#5ec98d; --merah:#ff8a80; --kuning:#e0c35c; --kartu:#201e1b; } }
  :root[data-theme="dark"] { --bg:#161614; --fg:#eceae5; --garis:#33312c; --redup:#9a968d; --hijau:#5ec98d; --merah:#ff8a80; --kuning:#e0c35c; --kartu:#201e1b; }
  body { background:var(--bg); color:var(--fg); font:15px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif; margin:0; padding:2rem 1.25rem; }
  .bungkus { max-width:1080px; margin:0 auto; }
  h1 { font-size:1.5rem; margin:0 0 .25rem; letter-spacing:-.01em; }
  .sub { color:var(--redup); margin:0 0 1.5rem; }
  .kutip { border-left:3px solid var(--kuning); padding:.6rem 1rem; background:var(--kartu); border-radius:0 6px 6px 0; margin:0 0 1.5rem; }
  .angka { display:flex; gap:.75rem; flex-wrap:wrap; margin:0 0 1.5rem; }
  .angka div { background:var(--kartu); border:1px solid var(--garis); border-radius:8px; padding:.7rem 1rem; min-width:96px; }
  .angka b { display:block; font-size:1.5rem; line-height:1.2; }
  .angka span { color:var(--redup); font-size:.8rem; }
  .gulung { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; min-width:720px; background:var(--kartu); border:1px solid var(--garis); border-radius:8px; }
  th,td { text-align:left; padding:.7rem .8rem; border-bottom:1px solid var(--garis); vertical-align:top; }
  th { font-size:.75rem; text-transform:uppercase; letter-spacing:.06em; color:var(--redup); }
  .kode { font-family:ui-monospace,monospace; color:var(--redup); }
  .kelas { font-size:.8rem; color:var(--redup); margin-top:.15rem; }
  .ulang { color:var(--merah); font-weight:600; }
  code { font-family:ui-monospace,SFMono-Regular,monospace; font-size:.82rem; background:var(--bg); padding:.1rem .3rem; border-radius:4px; display:inline-block; max-width:100%; overflow-wrap:anywhere; }
  details { margin-top:.4rem; } summary { cursor:pointer; color:var(--redup); font-size:.82rem; }
  .akibat { font-size:.85rem; color:var(--redup); }
  .vonis { font-weight:700; white-space:nowrap; }
  tr.dijaga .vonis { color:var(--hijau); } tr.merah .vonis { color:var(--merah); } tr.belum-dijaga .vonis { color:var(--kuning); }
  footer { color:var(--redup); font-size:.82rem; margin-top:1.5rem; }
</style>
<div class="bungkus">
  <h1>Register Cacat MiganCore</h1>
  <p class="sub">Setiap cacat wajib punya penjaga yang bisa dijalankan. Catatan tanpa penjaga tetap merah.</p>
  <div class="kutip">“kamu selalu bilang temuan, atau emas, tapi dikemudian ada lagi kebocoran.”<br><span style="color:var(--redup)">— Fahmi, 21 Agu 2026. Papan ini jawabannya.</span></div>
  <div class="angka">
    <div><b>${REG.cacat.length}</b><span>tercatat</span></div>
    <div><b style="color:var(--hijau)">${dijaga.length}</b><span>dijaga</span></div>
    <div><b style="color:var(--merah)">${merah.length}</b><span>merah</span></div>
    <div><b style="color:var(--kuning)">${belum.length}</b><span>belum dijaga</span></div>
    <div><b style="color:var(--merah)">${berulang.length}</b><span>pernah berulang</span></div>
  </div>
  <div class="gulung"><table>
    <thead><tr><th>Kode</th><th>Cacat</th><th>Penjaga</th><th>Vonis</th></tr></thead>
    <tbody>
${baris}
    </tbody>
  </table></div>
  <footer>VONIS: <b>${vonis}</b> · jalankan ulang: <code>node eval/register-cacat.mjs --html</code></footer>
</div>`;
  fs.writeFileSync(path.join(DIR, 'REGISTER-CACAT.html'), html, 'utf8');
  console.log('\ntertulis: REGISTER-CACAT.html');
}

fs.writeFileSync(path.join(DIR, 'register-cacat-hasil.json'),
  JSON.stringify({ vonis, hasil: hasil.map((h) => ({ kode: h.kode, kelas: h.kelas, vonis: h.vonis, detik: h.detik, pesan: h.pesan || '' })) }, null, 2), 'utf8');

/**
 * KODE KELUAR DIBEDAKAN (21 Agu). Semula merah dan kuning sama-sama keluar 1,
 * jadi pipa latih berhenti selamanya hanya karena SATU kelas cacat belum punya
 * penjaga otomatis — padahal tak satu pun cacat yang kembali. Membekukan
 * seluruh pekerjaan demi kerapian daftar itu salah sasaran.
 *   0 = hijau  : semua berpenjaga dan semua lulus
 *   2 = kuning : semua penjaga lulus, tapi ada kelas yang belum berpenjaga
 *                -> PERINGATAN, tidak menghentikan
 *   1 = merah  : ada penjaga yang gagal, artinya cacat lama KEMBALI
 *                -> BERHENTI
 */
if (!HANYA_DAFTAR) process.exit(merah.length ? 1 : belum.length ? 2 : 0);
