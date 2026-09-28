/* Dipisah dari index.html dengan sengaja.
   CSP halaman ini memakai default-src 'self' TANPA unsafe-inline untuk skrip.
   Skrip sebaris akan diblokir - dan itu memang yang kita mau: melonggarkan CSP
   supaya skrip sebaris jalan berarti membuka kembali seluruh kelas serangan
   penyuntikan, demi kenyamanan menaruh kode di satu berkas. Tidak sepadan. */

const T = '';
// Urutan ini urutan KETERGANTUNGAN, bukan selera. Tiap langkah memakai jawaban
// langkah sebelumnya; melompatinya menghasilkan keputusan yang tidak berdasar.
const LANGKAH = [
  { id:'base',      judul:'Pilih base model',
    kenapa:'Lisensi base menentukan apa yang boleh kamu lakukan dengan hasilnya. Ini keputusan hukum, bukan selera teknis — dan ia mengunci semua langkah sesudahnya.' },
  { id:'arah',      judul:'Arah',
    kenapa:'Untuk siapa model ini, dan — yang lebih menentukan — apa yang ia TIDAK boleh kerjakan. Tiap larangan nanti berubah jadi soal ujian penolakan.' },
  { id:'identitas', judul:'Identitas',
    kenapa:'Kalau ia memperkenalkan diri dalam satu kalimat, apa bunyinya? Batas peran ditulis di sini supaya bisa diuji, bukan diharapkan.' },
  { id:'perilaku',  judul:'Perilaku',
    kenapa:'Kapan menolak, kapan berinisiatif, kapan mengaku tidak tahu. Model yang tidak pernah mengaku tidak tahu akan menebak — dan menebak dengan percaya diri itu bentuk kegagalan yang paling mahal.' },
  { id:'nalar',     judul:'Cara berpikir',
    kenapa:'Metode yang wajib ia tunjukkan. Dan ragam bentuk: satu operasi yang selalu diceritakan dengan kalimat yang sama akan dihafal sebagai naskah, bukan dipelajari sebagai operasi.' },
  { id:'kurikulum', judul:'Kurikulum',
    kenapa:'Kemampuan, urut dari fondasi. Aturan pengikatnya satu: kemampuan tanpa cara mengukur akan ditolak. Menyatakan sesuatu memaksa menuliskan ujiannya sekarang, bukan nanti.' },
  { id:'hasil',     judul:'Gerbang & unduh',
    kenapa:'Gerbang diturunkan dari jawabanmu — tidak ada yang dikarang. Resepnya diunduh; tidak ada yang tersimpan di server ini.' },
];

const resep = JSON.parse(localStorage.getItem('bengkel-resep') || '{}');
let aktif = 0, katalog = null, masalah = [], gerbang = null;
const simpan = () => localStorage.setItem('bengkel-resep', JSON.stringify(resep));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const A = (n, d) => { resep[n] = resep[n] || d; return resep[n]; };

function tandaLangkah(i) {
  const p = LANGKAH[i].id;
  if (p === 'base') return resep.base ? '✓' : '';
  if (p === 'hasil') return gerbang ? '✓' : '';
  const petaBerkas = { arah:'01-ARAH.json', identitas:'02-IDENTITAS.json', perilaku:'03-PERILAKU.json', nalar:'04-NALAR.json', kurikulum:'05-KURIKULUM.json' };
  const f = petaBerkas[p];
  if (!resep[f]) return '';
  return masalah.some(m => m.berkas === f) ? '!' : '✓';
}

function railGambar() {
  document.getElementById('rail').innerHTML = LANGKAH.map((l, i) => {
    const t = tandaLangkah(i);
    const warna = t === '✓' ? 'var(--hijau)' : t === '!' ? 'var(--merah)' : 'var(--redup)';
    return `<li><button data-i="${i}" ${i===aktif?'aria-current="step"':''}>
      <span class="no">${String(i+1).padStart(2,'0')}</span><span>${l.judul}</span>
      <span class="tanda" style="color:${warna}">${t}</span></button></li>`;
  }).join('');
  document.querySelectorAll('#rail button').forEach(b =>
    b.onclick = () => { aktif = +b.dataset.i; gambar(); });
}

function daftarInput(nama, arr, tempat) {
  return arr.map((v, i) => `<div class="baris">
    <input value="${esc(v)}" data-arr="${nama}" data-i="${i}" placeholder="${esc(tempat)}">
    <button class="kecil" data-hapus="${nama}" data-i="${i}">hapus</button></div>`).join('')
    + `<button class="kecil" data-tambah="${nama}">+ tambah</button>`;
}

function isiBase() {
  if (!katalog) return '<p class="kenapa">Memuat katalog…</p>';
  const u = katalog.umurHari;
  return `<div class="umur">
      <span>Katalog ditarik langsung dari Hugging Face <b>${u} hari</b> lalu.</span>
      <span style="color:var(--${katalog.segar?'hijau':'merah'})">${katalog.segar?'segar':'BASI — tarik ulang sebelum memutuskan'}</span>
    </div>
    <div class="gulung"><table><thead><tr>
      <th>Model</th><th>Peran</th><th>Lisensi</th><th>Unduhan/bln</th></tr></thead><tbody>
    ${katalog.model.map(m => `<tr class="pilih" data-model="${esc(m.id)}" ${resep.base===m.id?'aria-selected="true"':''}>
      <td><span class="mono">${esc(m.id)}</span>${m.berpagar?' <span class="pil bersyarat">berpagar</span>':''}
          <div class="bantu" style="margin:.1rem 0 0">${esc(m.catatan)}</div></td>
      <td>${esc(m.peran)}</td>
      <td><span class="pil ${m.kelas==='bebas'?'bebas':m.kelas==='terbatas'?'terbatas':'bersyarat'}">${esc(m.lisensi)}</span>
          <div class="bantu" style="margin:.15rem 0 0">${esc(m.catatan_lisensi||m.kelas==='bebas'?'boleh komersial & boleh diturunkan':m.kelas==='terbatas'?'tidak boleh untuk produk':'punya syarat sendiri — baca teksnya')}</div></td>
      <td class="mono">${(m.unduhanBulanIni||0).toLocaleString('id-ID')}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="catatan"><b>Kenapa lisensi lebih dulu daripada ukuran.</b> Model yang berlisensi
      bersyarat bisa memaksa kamu membongkar produk yang sudah jalan. Ukuran bisa diganti kapan
      saja; lisensi mengunci sejak hari pertama.</div>`;
}

function isiArah() {
  const a = A('01-ARAH.json', { nama:'', kalimatSatu:'', penggunaNyata:'', pekerjaanYangDibantu:[''], BUKANUntuk:['','',''], kenapaBukanModelUmum:'' });
  return `<label>Nama resep</label><input data-f="01-ARAH.json" data-k="nama" value="${esc(a.nama)}" placeholder="omiga-keuangan">
    <label>Satu kalimat: model ini untuk apa</label>
    <p class="bantu">Maksimal 120 huruf. Kalau belum bisa diringkas sependek itu, arahnya memang belum jelas.</p>
    <input data-f="01-ARAH.json" data-k="kalimatSatu" value="${esc(a.kalimatSatu)}" maxlength="160">
    <label>Pengguna nyata</label>
    <p class="bantu">Orang yang benar-benar akan memakainya, bukan "siapa saja".</p>
    <input data-f="01-ARAH.json" data-k="penggunaNyata" value="${esc(a.penggunaNyata)}">
    <label>Pekerjaan yang dibantu</label>
    ${daftarInput('01-ARAH.json.pekerjaanYangDibantu', a.pekerjaanYangDibantu, 'membaca arus kas bulanan')}
    <label>BUKAN untuk — minimal 3</label>
    <p class="bantu">Ini yang paling sering dilewati, dan yang paling menentukan. Tiap butir di sini akan diturunkan jadi satu gerbang penolakan.</p>
    ${daftarInput('01-ARAH.json.BUKANUntuk', a.BUKANUntuk, 'memberi nasihat investasi personal')}
    <label>Kenapa bukan model umum saja</label>
    <textarea data-f="01-ARAH.json" data-k="kenapaBukanModelUmum">${esc(a.kenapaBukanModelUmum)}</textarea>`;
}

function isiIdentitas() {
  const a = A('02-IDENTITAS.json', { panggilan:'', siapaDia:'', batasPeran:[''], bahasa:'Indonesia' });
  return `<label>Panggilan</label><input data-f="02-IDENTITAS.json" data-k="panggilan" value="${esc(a.panggilan)}">
    <label>Siapa dia, satu kalimat</label><textarea data-f="02-IDENTITAS.json" data-k="siapaDia">${esc(a.siapaDia)}</textarea>
    <label>Batas peran</label>
    <p class="bantu">Yang ia bukan. Ditulis di sini supaya bisa diuji, bukan sekadar diharapkan.</p>
    ${daftarInput('02-IDENTITAS.json.batasPeran', a.batasPeran, 'bukan akuntan berizin')}
    <label>Bahasa</label><input data-f="02-IDENTITAS.json" data-k="bahasa" value="${esc(a.bahasa)}">`;
}

function isiPerilaku() {
  const a = A('03-PERILAKU.json', { suara:'', menolakKalau:[''], berinisiatifKalau:[''], mengakuTidakTahuKalau:[''], panjangJawaban:'seperlunya' });
  return `<label>Suara</label><input data-f="03-PERILAKU.json" data-k="suara" value="${esc(a.suara)}" placeholder="ringkas, langsung, istilah selalu diterjemahkan sekali">
    <label>Menolak kalau…</label>${daftarInput('03-PERILAKU.json.menolakKalau', a.menolakKalau, 'diminta menjamin hasil')}
    <label>Berinisiatif kalau…</label>
    <p class="bantu">Kapan ia menyebut sesuatu yang tidak ditanyakan. Tanpa ini, model hanya menjawab dan tidak pernah memperingatkan.</p>
    ${daftarInput('03-PERILAKU.json.berinisiatifKalau', a.berinisiatifKalau, 'ada angka yang janggal')}
    <label>Mengaku tidak tahu kalau…</label>${daftarInput('03-PERILAKU.json.mengakuTidakTahuKalau', a.mengakuTidakTahuKalau, 'sumbernya lebih lama dari 12 bulan')}
    <label>Panjang jawaban</label><input data-f="03-PERILAKU.json" data-k="panjangJawaban" value="${esc(a.panjangJawaban)}">`;
}

function isiNalar() {
  const a = A('04-NALAR.json', { metode:[{nama:'periksa-balik',kapan:'setiap hitungan',bentuk:'hitung ulang lewat jalan lain sebelum menyebut hasil final'}], ragamBentukMinimal:12 });
  return `<label>Metode berpikir yang dipasang</label>
    ${a.metode.map((m,i)=>`<div style="border:1px solid var(--garis);border-radius:var(--r);padding:.6rem;margin-bottom:.5rem">
      <div class="baris"><input data-m="${i}" data-mk="nama" value="${esc(m.nama)}" placeholder="nama metode">
        <button class="kecil" data-hapusm="${i}">hapus</button></div>
      <input data-m="${i}" data-mk="kapan" value="${esc(m.kapan)}" placeholder="kapan dipakai" style="margin-bottom:.35rem">
      <input data-m="${i}" data-mk="bentuk" value="${esc(m.bentuk)}" placeholder="bentuk penerapannya"></div>`).join('')}
    <button class="kecil" data-tambahm="1">+ tambah metode</button>
    <label>Ragam bentuk minimal</label>
    <p class="bantu">Berapa cara berbeda satu operasi harus diceritakan di data latih. Di bawah 8, model menghafal naskahnya — kami mengukurnya sendiri: satu operasi dengan tiga templat menghasilkan model yang mengulang kalimatnya kata demi kata sambil salah menghitung.</p>
    <input type="number" min="8" data-f="04-NALAR.json" data-k="ragamBentukMinimal" value="${esc(a.ragamBentukMinimal)}">`;
}

function isiKurikulum() {
  const a = A('05-KURIKULUM.json', { modul:[{kode:'F1',lapis:'fondasi',kemampuan:'',kenapa:'',prasyarat:[],caraUkur:{jenis:'soal-kunci',jumlah:20,ambang:'>=16/20'}}] });
  return `<div class="catatan"><b>Aturan pengikat.</b> Modul tanpa <code>caraUkur</code> dan tanpa
      <b>ambang</b> akan ditolak. "Lebih baik" bukan ambang. Kemampuan yang tidak bisa diukur
      hanya daftar harapan — dan daftar harapan tidak pernah gagal, jadi tidak pernah memberi tahu
      apa pun.</div>
    ${a.modul.map((m,i)=>`<div style="border:1px solid var(--garis);border-radius:var(--r);padding:.7rem;margin-bottom:.6rem">
      <div class="baris">
        <input data-mo="${i}" data-mok="kode" value="${esc(m.kode)}" placeholder="F1" style="max-width:5.5rem">
        <input data-mo="${i}" data-mok="lapis" value="${esc(m.lapis)}" placeholder="fondasi" style="max-width:8rem">
        <input data-mo="${i}" data-mok="kemampuan" value="${esc(m.kemampuan)}" placeholder="kemampuan yang diajarkan">
        <button class="kecil" data-hapusmo="${i}">hapus</button></div>
      <input data-mo="${i}" data-mok="kenapa" value="${esc(m.kenapa)}" placeholder="kenapa ini perlu" style="margin-bottom:.35rem">
      <div class="baris">
        <input data-mo="${i}" data-mok="prasyarat" value="${esc((m.prasyarat||[]).join(', '))}" placeholder="prasyarat, mis. F1, F2">
        <input data-mo="${i}" data-mok="jenis" value="${esc(m.caraUkur?.jenis||'')}" placeholder="jenis ukur" style="max-width:9rem">
        <input data-mo="${i}" data-mok="ambang" value="${esc(m.caraUkur?.ambang||'')}" placeholder="ambang, mis. >=16/20" style="max-width:11rem"></div>
    </div>`).join('')}
    <button class="kecil" data-tambahmo="1">+ tambah modul</button>`;
}

function isiHasil() {
  if (!gerbang) return `<p class="kenapa">Tekan <b>Turunkan gerbang</b> di bawah. Resep harus lengkap dulu — kalau ada yang bolong, gerbangnya akan mengukur tujuan yang salah.</p>`;
  const per = {};
  for (const g of gerbang.gerbang) per[g.jenis] = (per[g.jenis]||0)+1;
  return `<div class="catatan"><b>${gerbang.gerbang.length} gerbang diturunkan</b> dari jawabanmu —
      tidak ada yang dikarang, dan tidak ada kemampuan yang lolos tanpa ujian.
      <ul class="rapat">${Object.entries(per).map(([j,n])=>`<li>${n} × ${esc(j)}</li>`).join('')}</ul></div>
    <div class="gulung"><table><thead><tr><th>Kode</th><th>Mengukur</th><th>Dari</th><th>Ambang</th></tr></thead><tbody>
    ${gerbang.gerbang.map(g=>`<tr><td class="mono">${esc(g.kode)}</td><td>${esc(g.mengukur)}</td>
      <td class="bantu" style="margin:0">${esc(g.dari)}</td><td class="mono">${esc(g.ambang)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="catatan" style="border-color:var(--hijau)"><b>Tidak ada yang tersimpan di server ini.</b>
      Resepmu ada di peramban kamu sendiri. Unduh berkasnya, lalu jalankan pipa datanya di mesinmu.</div>`;
}

function gambar() {
  const L = LANGKAH[aktif];
  const isi = { base:isiBase, arah:isiArah, identitas:isiIdentitas, perilaku:isiPerilaku,
                nalar:isiNalar, kurikulum:isiKurikulum, hasil:isiHasil }[L.id]();
  const daftarMasalah = masalah.length ? `<div class="masalah"><h3>${masalah.length} hal menahan</h3><ul>
    ${masalah.map(m=>`<li><code>${esc(m.berkas)}</code> — ${esc(m.pesan)}</li>`).join('')}</ul></div>` : '';
  document.getElementById('panel').innerHTML =
    `<h1>${esc(L.judul)}</h1><p class="kenapa">${esc(L.kenapa)}</p>${isi}${daftarMasalah}
     <div class="kaki">
       <button class="utama" id="lanjut">${aktif===LANGKAH.length-1?'Turunkan gerbang':'Lanjut'}</button>
       ${gerbang?'<button class="kecil" id="unduh">Unduh resep + gerbang</button>':''}
       <span class="keadaan">${masalah.length
          ? `<b class="no">${masalah.length} masalah</b> — boleh lanjut, tapi gerbang tidak bisa diturunkan`
          : '<b class="ok">bersih</b>'}</span>
     </div>`;
  pasangPeristiwa();
  railGambar();
}

function pasangPeristiwa() {
  const p = document.getElementById('panel');
  p.querySelectorAll('[data-f]').forEach(el => el.oninput = () => {
    const f = el.dataset.f, k = el.dataset.k;
    resep[f] = resep[f] || {};
    resep[f][k] = el.type === 'number' ? Number(el.value) : el.value;
    simpan();
  });
  p.querySelectorAll('[data-arr]').forEach(el => el.oninput = () => {
    const [f, k] = el.dataset.arr.split(/\.(?=[^.]+$)/);
    resep[f][k][+el.dataset.i] = el.value; simpan();
  });
  p.querySelectorAll('[data-tambah]').forEach(b => b.onclick = () => {
    const [f, k] = b.dataset.tambah.split(/\.(?=[^.]+$)/);
    resep[f][k].push(''); simpan(); gambar();
  });
  p.querySelectorAll('[data-hapus]').forEach(b => b.onclick = () => {
    const [f, k] = b.dataset.hapus.split(/\.(?=[^.]+$)/);
    resep[f][k].splice(+b.dataset.i, 1); simpan(); gambar();
  });
  p.querySelectorAll('[data-m]').forEach(el => el.oninput = () => {
    resep['04-NALAR.json'].metode[+el.dataset.m][el.dataset.mk] = el.value; simpan();
  });
  p.querySelectorAll('[data-tambahm]').forEach(b => b.onclick = () => {
    resep['04-NALAR.json'].metode.push({nama:'',kapan:'',bentuk:''}); simpan(); gambar();
  });
  p.querySelectorAll('[data-hapusm]').forEach(b => b.onclick = () => {
    resep['04-NALAR.json'].metode.splice(+b.dataset.hapusm,1); simpan(); gambar();
  });
  p.querySelectorAll('[data-mo]').forEach(el => el.oninput = () => {
    const m = resep['05-KURIKULUM.json'].modul[+el.dataset.mo], k = el.dataset.mok;
    if (k === 'prasyarat') m.prasyarat = el.value.split(',').map(s=>s.trim()).filter(Boolean);
    else if (k === 'jenis' || k === 'ambang') { m.caraUkur = m.caraUkur||{}; m.caraUkur[k] = el.value; }
    else m[k] = el.value;
    simpan();
  });
  p.querySelectorAll('[data-tambahmo]').forEach(b => b.onclick = () => {
    resep['05-KURIKULUM.json'].modul.push({kode:'',lapis:'',kemampuan:'',kenapa:'',prasyarat:[],caraUkur:{jenis:'soal-kunci',ambang:''}});
    simpan(); gambar();
  });
  p.querySelectorAll('[data-hapusmo]').forEach(b => b.onclick = () => {
    resep['05-KURIKULUM.json'].modul.splice(+b.dataset.hapusmo,1); simpan(); gambar();
  });
  p.querySelectorAll('[data-model]').forEach(tr => tr.onclick = () => {
    resep.base = tr.dataset.model; simpan(); gambar();
  });
  const lanjut = document.getElementById('lanjut');
  if (lanjut) lanjut.onclick = async () => {
    await periksa();
    if (aktif < LANGKAH.length - 1) { aktif++; gambar(); }
    else await rakit();
  };
  const unduh = document.getElementById('unduh');
  if (unduh) unduh.onclick = () => {
    const isi = JSON.stringify({ ...resep, '08-GERBANG.json': gerbang }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([isi], {type:'application/json'}));
    a.download = `resep-${resep['01-ARAH.json']?.nama || 'model'}.json`;
    a.click();
  };
}

async function periksa() {
  try {
    const r = await fetch('/api/periksa', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(resep) });
    masalah = (await r.json()).salah || [];
  } catch { masalah = [{ berkas:'(jaringan)', pesan:'server tidak menjawab' }]; }
}

async function rakit() {
  const r = await fetch('/api/rakit', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(resep) });
  const d = await r.json();
  if (r.ok) { gerbang = d; masalah = []; } else { gerbang = null; masalah = d.salah || [{berkas:'?',pesan:d.galat}]; }
  gambar();
}

(async () => {
  try { katalog = await (await fetch('/api/katalog')).json(); } catch {}
  await periksa();
  gambar();
})();
