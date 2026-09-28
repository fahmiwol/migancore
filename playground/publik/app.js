/* Dipisah dari index.html: CSP halaman ini tidak mengizinkan skrip sebaris. */
'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
let kunciAktif = null, harapAktif = null;

function galat(pesan) {
  $('galat').innerHTML = pesan ? `<div class="galat">${esc(pesan)}</div>` : '';
}

async function muatModel() {
  try {
    const d = await (await fetch('/api/model')).json();
    if (d.galat) return galat(d.galat);
    const opsi = d.model.map((m) => `<option value="${esc(m.nama)}">${esc(m.nama)}</option>`).join('');
    $('m1').innerHTML = opsi;
    $('m2').innerHTML = opsi;
    // Pilihan awal yang paling sering dibutuhkan: dua generasi berurutan, supaya
    // yang terlihat pertama kali adalah perbandingan yang sedang jadi pertanyaan.
    const urut = d.model.map((m) => m.nama);
    const mc = urut.filter((n) => n.startsWith('migancore:'));
    if (mc.length >= 2) { $('m1').value = mc[mc.length - 2]; $('m2').value = mc[mc.length - 1]; }
  } catch (e) { galat(`tidak bisa membaca daftar model: ${e.message}`); }
}

async function muatSoal() {
  try {
    const d = await (await fetch('/api/soal')).json();
    $('bank').innerHTML = d.kelompok.map((k) => `<div class="bank">
      <h2>${esc(k.nama)}</h2><p>${esc(k.catatan)}</p>
      <div class="cip">${k.soal.map((s, i) =>
        `<button data-teks="${esc(s.teks)}" data-kunci="${s.kunci ?? ''}" data-harap="${esc(s.harap || '')}">
           ${esc(s.teks.length > 62 ? s.teks.slice(0, 62) + '…' : s.teks)}</button>`).join('')}</div></div>`).join('');
    for (const b of document.querySelectorAll('.cip button')) {
      b.onclick = () => {
        $('tanya').value = b.dataset.teks;
        kunciAktif = b.dataset.kunci ? Number(b.dataset.kunci) : null;
        harapAktif = b.dataset.harap || null;
      };
    }
  } catch (e) { galat(`tidak bisa membaca bank soal: ${e.message}`); }
}

async function adu() {
  const tanya = $('tanya').value.trim();
  if (!tanya) return galat('pertanyaannya masih kosong');
  galat('');
  const model = [$('m1').value, $('m2').value];
  $('kirim').disabled = true;
  $('hasil').innerHTML = `<div class="kosong">menanyakan ke ${model.length} model…</div>`;
  try {
    const r = await fetch('/api/adu', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, tanya, sistem: $('sistem').value, suhu: $('suhu').value, kunci: kunciAktif }),
    });
    const d = await r.json();
    if (d.galat) { $('hasil').innerHTML = ''; return galat(d.galat); }
    $('hasil').innerHTML = d.jawab.map((j) => {
      // Vonis hanya muncul kalau soalnya punya kunci. Untuk soal tanpa kunci,
      // menampilkan tanda benar/salah berarti menebak — dan menebak yang
      // berpakaian penilaian justru yang paling menyesatkan.
      const vonis = j.benar === null ? ''
        : `<span class="vonis ${j.benar ? 'ya' : 'tidak'}">${j.benar ? 'angka benar' : 'angka SALAH'}</span>`;
      return `<div class="kolom">
        <div class="kepala"><b>${esc(j.model)}</b>${vonis}<span class="waktu">${j.detik}s</span></div>
        <div class="isi${j.gagal ? ' gagal' : ''}">${esc(j.isi)}</div>
        ${harapAktif ? `<div class="harap"><b>Yang benar:</b> ${esc(harapAktif)}</div>` :
          (d.kunci != null ? `<div class="harap"><b>Kunci:</b> ${Number(d.kunci).toLocaleString('id-ID')}</div>` : '')}
      </div>`;
    }).join('');
  } catch (e) {
    $('hasil').innerHTML = '';
    galat(`gagal mengadu: ${e.message}`);
  } finally {
    $('kirim').disabled = false;
  }
}

$('kirim').onclick = adu;
$('tanya').addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') adu();
});
// Pertanyaan yang diketik sendiri tidak punya kunci — jangan memakai kunci
// dari soal sebelumnya, itu akan memberi vonis pada sesuatu yang tidak diuji.
$('tanya').addEventListener('input', () => { kunciAktif = null; harapAktif = null; });

muatModel();
muatSoal();
