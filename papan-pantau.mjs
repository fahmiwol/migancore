#!/usr/bin/env node
/**
 * papan-pantau.mjs — SATU HALAMAN yang menjawab "sistemnya mana, sekarang apa".
 *
 * Selama ini seluruh keadaan sistem tersebar di belasan berkas JSON yang hanya
 * bisa dibaca dengan menjalankan perintah satu per satu. Akibatnya sistemnya
 * ADA tapi tidak bisa DILIHAT — dan yang tidak bisa dilihat tidak bisa diawasi.
 *
 * Berkas ini membaca seluruh keluaran alat (tidak menjalankan ulang apa pun,
 * jadi aman dan cepat) lalu menyusunnya jadi satu halaman: apakah boleh latih,
 * apa yang menahan, skor tiap model, cacat mana yang pernah berulang, dan apa
 * yang belum bisa diukur sama sekali.
 *
 * Pakai: node papan-pantau.mjs        → papan-pantau.html
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const baca = (p) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8')); } catch { return null; } };

const pipa = baca('flywheel/siap-latih.json');
const audit = baca('flywheel/audit-menyeluruh.json');
const reg = baca('eval/register-cacat-hasil.json');
const regDef = baca('eval/REGISTER-CACAT.json');
const pra = baca('flywheel/PRA-DAFTAR.json');
const latih = baca('flywheel/periksa-latih.json');

// Skor model: dibaca dari berkas ULANG-*.json yang memang sudah ditulis gerbang.
const skor = [];
for (const f of fs.readdirSync(path.join(DIR, 'eval')).filter((x) => x.startsWith('ULANG-') && x.endsWith('.json'))) {
  const d = baca(path.join('eval', f));
  if (d?.keseluruhan) skor.push({ gerbang: String(d.berkas).replace('uji-', '').replace('.mjs', ''), model: d.model, ...d.keseluruhan });
}
const arit = [];
for (const f of fs.readdirSync(path.join(DIR, 'eval')).filter((x) => x.startsWith('hasil-aritmetika-'))) {
  const d = baca(path.join('eval', f));
  if (d?.ringkas) {
    const b = Object.values(d.ringkas).reduce((s, x) => s + x.benar, 0);
    const t = Object.values(d.ringkas).reduce((s, x) => s + x.total, 0);
    arit.push({ model: d.model, benar: b, coba: t });
  }
}

const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
const kartu = (n, l, w = '') => `<div><b${w ? ` style="color:var(--${w})"` : ''}>${n}</b><span>${l}</span></div>`;

const siap = pipa?.siap;
const gagalAudit = (audit?.hasil || []).filter((h) => h.vonis === 'GAGAL');
const belumAudit = (audit?.hasil || []).filter((h) => h.vonis === 'BELUM BISA');
const putusAudit = (audit?.hasil || []).filter((h) => h.vonis === 'PERLU KEPUTUSAN');
const berulang = (regDef?.cacat || []).filter((x) => (x.berulang || 1) > 1);

const barisPipa = (pipa?.hasil || []).map((h) => `<tr class="${String(h.vonis).toLowerCase()}">
  <td class="tahap">${esc(h.tahap)}</td><td>${esc(h.langkah)}</td>
  <td class="v">${esc(h.vonis)}</td><td class="ket">${esc(h.pesan || '')}</td></tr>`).join('');

const barisAudit = (audit?.hasil || []).map((h) => `<tr class="${String(h.vonis).toLowerCase().replace(/\s/g, '-')}">
  <td class="kode">${esc(h.kode)}</td><td class="tahap">${esc(h.kel)}</td>
  <td>${esc(h.nama)}</td><td class="v">${esc(h.vonis)}</td>
  <td class="ket">${esc(String(h.teks).slice(0, 110))}</td></tr>`).join('');

const barisCacat = (regDef?.cacat || []).map((x) => {
  const h = (reg?.hasil || []).find((y) => y.kode === x.kode);
  const v = h?.vonis || (x.penjaga ? '—' : 'BELUM DIJAGA');
  return `<tr class="${String(v).toLowerCase().replace(/\s/g, '-')}">
  <td class="kode">${esc(x.kode)}</td>
  <td><strong>${esc(x.judul)}</strong>${(x.berulang || 1) > 1 ? ` <span class="ulang">berulang ${x.berulang}×</span>` : ''}
      <details><summary>bukti nyata</summary><code>${esc(x.buktiNyata)}</code></details></td>
  <td><code>${esc(x.penjaga ? x.penjaga.perintah : '—')}</code></td>
  <td class="v">${esc(v)}</td></tr>`;
}).join('');

const barisSkor = skor.sort((a, b) => a.gerbang.localeCompare(b.gerbang) || a.model.localeCompare(b.model))
  .map((s) => `<tr><td>${esc(s.gerbang)}</td><td class="kode">${esc(s.model)}</td>
  <td>${s.lulus}/${s.coba}</td><td>${(s.lulus / s.coba * 100).toFixed(0)}%</td>
  <td class="v ${s.vonis === 'LULUS' ? 'lulus' : s.vonis === 'GAGAL' ? 'gagal' : ''}">${esc(s.vonis)}</td></tr>`).join('')
  + arit.map((a) => `<tr><td>aritmetika</td><td class="kode">${esc(a.model)}</td>
  <td>${a.benar}/${a.coba}</td><td>${(a.benar / a.coba * 100).toFixed(0)}%</td><td class="v"></td></tr>`).join('');

const html = `<title>Papan Pantau MiganCore</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  /* Palet dari dunia subjeknya: panel instrumen, bukan dokumen. Netralnya
     dicondongkan tipis ke sian supaya terbaca "terukur", bukan kertas. Warna
     semantik (hijau/merah/kuning) DIPISAH dari aksen — vonis tidak boleh
     berebut perhatian dengan hiasan. */
  :root{
    --bg:#f6f9f9; --kartu:#ffffff; --fg:#111a1c; --redup:#586a6d; --garis:#dce5e6;
    --aksen:#0f6d78; --aksen-lemah:#e2f0f1;
    --hijau:#1a7a52; --merah:#a92920; --kuning:#7d6410;
  }
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --bg:#0e1416; --kartu:#151d20; --fg:#e4ecec; --redup:#8fa0a3; --garis:#263236;
    --aksen:#4fc3cf; --aksen-lemah:#122e33;
    --hijau:#57cb95; --merah:#ff8f85; --kuning:#dcbe4e;
  }}
  :root[data-theme="dark"]{
    --bg:#0e1416; --kartu:#151d20; --fg:#e4ecec; --redup:#8fa0a3; --garis:#263236;
    --aksen:#4fc3cf; --aksen-lemah:#122e33;
    --hijau:#57cb95; --merah:#ff8f85; --kuning:#dcbe4e;
  }
  *{box-sizing:border-box}
  body{background:var(--bg);color:var(--fg);margin:0;padding:1.5rem 1rem 3rem;
       font:400 15px/1.6 "IBM Plex Sans","Segoe UI",system-ui,sans-serif;
       font-variant-numeric:tabular-nums}
  .bungkus{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:0}
  h1{font:600 1.55rem/1.15 "IBM Plex Sans",system-ui,sans-serif;margin:0 0 .15rem;letter-spacing:-.015em;text-wrap:balance}
  h2{font:600 .8rem/1.3 "IBM Plex Sans Condensed","IBM Plex Sans",system-ui,sans-serif;
     text-transform:uppercase;letter-spacing:.12em;color:var(--aksen);
     margin:2.2rem 0 .7rem;padding-bottom:.35rem;border-bottom:1px solid var(--garis)}
  .sub{color:var(--redup);margin:0 0 1.3rem;font-size:.9rem}

  /* Vonis utama: satu-satunya tempat yang boleh berteriak. */
  .vonis-besar{background:var(--kartu);border:1px solid var(--garis);
    border-left:5px solid ${siap ? 'var(--hijau)' : 'var(--merah)'};
    border-radius:4px;padding:1rem 1.15rem;margin:0 0 1.1rem}
  .vonis-besar b{font:600 1.5rem/1.2 "IBM Plex Sans Condensed","IBM Plex Sans",sans-serif;
    letter-spacing:.02em;color:${siap ? 'var(--hijau)' : 'var(--merah)'};display:block}
  .vonis-besar p{margin:.45rem 0 0;color:var(--redup);font-size:.87rem}

  .angka{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:.55rem;margin:0 0 .4rem}
  .angka div{background:var(--kartu);border:1px solid var(--garis);border-radius:4px;padding:.6rem .75rem}
  .angka b{display:block;font:500 1.5rem/1.15 "IBM Plex Mono",ui-monospace,monospace}
  .angka span{color:var(--redup);font-size:.72rem;letter-spacing:.02em}

  .gulung{overflow-x:auto;-webkit-overflow-scrolling:touch;
    background:var(--kartu);border:1px solid var(--garis);border-radius:4px}
  table{border-collapse:collapse;width:100%;min-width:640px;font-size:.86rem}
  th,td{text-align:left;padding:.52rem .75rem;border-bottom:1px solid var(--garis);vertical-align:top}
  tbody tr:last-child td{border-bottom:0}
  th{font:600 .68rem/1.3 "IBM Plex Sans Condensed","IBM Plex Sans",sans-serif;
     text-transform:uppercase;letter-spacing:.1em;color:var(--redup);white-space:nowrap}
  .kode,.tahap{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.78rem;color:var(--redup);white-space:nowrap}
  .ket{color:var(--redup);font-size:.79rem}
  .v{font-weight:600;white-space:nowrap;font-size:.8rem}

  /* Keadaan dikodekan DUA kali: warna dan garis tepi kiri. Warna saja gagal
     bagi mata yang tidak membedakannya, dan gagal juga waktu dipindai cepat. */
  tbody tr{border-left:3px solid transparent}
  tr.lulus,tr.dijaga{border-left-color:var(--hijau)}
  tr.gagal,tr.merah{border-left-color:var(--merah)}
  tr.peringatan,tr.belum-bisa,tr.belum-dijaga,tr.perlu-keputusan,tr.dilewati{border-left-color:var(--kuning)}
  tr.lulus .v,tr.dijaga .v,td.v.lulus{color:var(--hijau)}
  tr.gagal .v,tr.merah .v,td.v.gagal{color:var(--merah)}
  tr.peringatan .v,tr.belum-bisa .v,tr.belum-dijaga .v,tr.perlu-keputusan .v,tr.dilewati .v{color:var(--kuning)}

  .ulang{color:var(--merah);font-weight:600;font-size:.74rem;
    font-family:"IBM Plex Mono",monospace;border:1px solid currentColor;
    border-radius:2px;padding:0 .25rem;white-space:nowrap}
  code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.76rem;
    background:var(--bg);padding:.1rem .3rem;border-radius:3px;overflow-wrap:anywhere}
  details{margin-top:.35rem}
  summary{cursor:pointer;color:var(--redup);font-size:.76rem}
  summary:focus-visible{outline:2px solid var(--aksen);outline-offset:2px}

  .pra{background:var(--aksen-lemah);border:1px solid var(--garis);
    border-left:3px solid var(--aksen);border-radius:4px;padding:.9rem 1.05rem;font-size:.87rem}
  .pra dl{margin:0}
  .pra dt{font:600 .68rem/1.3 "IBM Plex Sans Condensed","IBM Plex Sans",sans-serif;
    color:var(--aksen);text-transform:uppercase;letter-spacing:.1em;margin-top:.75rem}
  .pra dt:first-child{margin-top:0}
  .pra dd{margin:.2rem 0 0}
  footer{color:var(--redup);font-size:.78rem;margin-top:2.4rem;
    border-top:1px solid var(--garis);padding-top:.85rem;line-height:1.8}
</style>
<div class="bungkus">
  <h1>Papan Pantau MiganCore</h1>
  <p class="sub">Keadaan sistem, dibaca dari keluaran alat — bukan diketik tangan.</p>

  <div class="vonis-besar">
    <b>${siap ? 'SIAP LATIH' : 'BELUM SIAP — GPU jangan dinyalakan'}</b>
    <p>${siap
      ? `Semua tahap pipa hijau, dan kesimpulan sudah dikunci sebelum diukur. Data: ${pipa?.sidikData?.baris ?? '?'} baris · sidik <code>${pipa?.sidikData?.sidik ?? '?'}</code>`
      : `Yang menahan: ${(pipa?.hasil || []).filter((h) => h.vonis === 'GAGAL').map((h) => h.langkah).join(', ') || (pipa?.praMasalah || []).join('; ') || 'belum dijalankan'}`}</p>
  </div>

  <div class="angka">
    ${kartu(pipa?.sidikData?.baris ?? '—', 'baris latih')}
    ${kartu(audit ? audit.hasil.length : '—', 'kelas diperiksa')}
    ${kartu(gagalAudit.length, 'cacat terbuka', gagalAudit.length ? 'merah' : 'hijau')}
    ${kartu(belumAudit.length, 'belum bisa diukur', 'kuning')}
    ${kartu(regDef ? regDef.cacat.length : '—', 'cacat tercatat')}
    ${kartu(berulang.length, 'pernah berulang', berulang.length ? 'merah' : '')}
  </div>

  <h2>1. Pipa — sanitasi → filter → validasi → izin latih</h2>
  <div class="gulung"><table><thead><tr><th>Tahap</th><th>Langkah</th><th>Vonis</th><th>Catatan</th></tr></thead>
  <tbody>${barisPipa || '<tr><td colspan="4" class="ket">belum dijalankan</td></tr>'}</tbody></table></div>

  <h2>2. Pra-daftar — kesimpulan dikunci sebelum diukur</h2>
  ${pra ? `<div class="pra"><dl>
    <dt>Perubahan tunggal</dt><dd>${esc(pra.perubahanTunggal)}</dd>
    <dt>Kenapa</dt><dd>${esc(pra.kenapa)}</dd>
    <dt>Ukuran pemutus</dt><dd>${esc(pra.ukuranPemutus)}</dd>
    <dt>Ambang</dt><dd>${esc(pra.ambang)}</dd>
    <dt>Kalau gagal</dt><dd>${esc(pra.kalauGagal)}</dd>
    <dt>Yang TIDAK dilakukan</dt><dd>${(pra.yangTidakDilakukan || []).map(esc).join(' · ')}</dd>
    <dt>Terkunci ke data</dt><dd><code>${esc(pra.sidikData)}</code> · ${pra.barisData} baris</dd>
  </dl></div>` : '<p class="ket">belum ditulis</p>'}

  <h2>3. Audit menyeluruh — ${audit ? audit.hasil.length : 0} kelas kegagalan, sekali jalan</h2>
  <div class="gulung"><table><thead><tr><th>Kode</th><th>Kel</th><th>Pemeriksaan</th><th>Vonis</th><th>Hasil</th></tr></thead>
  <tbody>${barisAudit || '<tr><td colspan="5" class="ket">belum dijalankan</td></tr>'}</tbody></table></div>
  ${putusAudit.length ? `<p class="ket" style="margin-top:.6rem">⚠ ${putusAudit.length} butir menunggu keputusan Fahmi: ${putusAudit.map((x) => esc(x.nama)).join(', ')}</p>` : ''}

  <h2>4. Register cacat — tiap cacat wajib punya penjaga</h2>
  <div class="gulung"><table><thead><tr><th>Kode</th><th>Cacat</th><th>Penjaga</th><th>Vonis</th></tr></thead>
  <tbody>${barisCacat}</tbody></table></div>

  <h2>5. Skor gerbang per model</h2>
  <div class="gulung"><table><thead><tr><th>Gerbang</th><th>Model</th><th>Lulus</th><th>%</th><th>Vonis</th></tr></thead>
  <tbody>${barisSkor || '<tr><td colspan="5" class="ket">belum ada hasil</td></tr>'}</tbody></table></div>

  <h2>6. Kesiapan data</h2>
  ${latih ? `<div class="gulung"><table><thead><tr><th>Pemeriksaan</th><th>Hasil</th><th>Vonis</th></tr></thead><tbody>
  ${latih.cek.map((k) => `<tr class="${k.lulus ? 'lulus' : 'gagal'}"><td>${esc(k.nama)}</td><td class="ket">${esc(k.teks)}</td><td class="v">${k.lulus ? 'lulus' : 'GAGAL'}</td></tr>`).join('')}
  </tbody></table></div>` : '<p class="ket">belum dijalankan</p>'}

  <footer>
    Disusun ulang dengan <code>node papan-pantau.mjs</code> · membaca keluaran alat, tidak menjalankan ulang apa pun.<br>
    Perintah utama: <code>node flywheel/siap-latih.mjs</code> · <code>node flywheel/audit-menyeluruh.mjs</code> · <code>node eval/register-cacat.mjs</code>
  </footer>
</div>`;

fs.writeFileSync(path.join(DIR, 'papan-pantau.html'), html, 'utf8');
console.log('# Papan pantau tersusun\n');
console.log(`  vonis        : ${siap ? 'SIAP LATIH' : 'BELUM SIAP'}`);
console.log(`  baris latih  : ${pipa?.sidikData?.baris ?? '—'} · sidik ${pipa?.sidikData?.sidik ?? '—'}`);
console.log(`  audit        : ${audit ? `${audit.hasil.filter((h) => h.vonis === 'LULUS').length} lulus · ${gagalAudit.length} gagal · ${belumAudit.length} belum bisa` : '—'}`);
console.log(`  cacat        : ${regDef ? regDef.cacat.length : '—'} tercatat · ${berulang.length} pernah berulang`);
console.log(`  skor gerbang : ${skor.length + arit.length} baris hasil\n`);
console.log('tertulis: papan-pantau.html');
