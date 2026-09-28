/**
 * paritas-klien.mjs — jalur tunggal tidak bisa membantah dirinya sendiri.
 *
 * Permintaan Fahmi 10 Sep (disarikan): uji dengan berbagai metode, bukan hanya lewat skrip —
 * beberapa sistem operasi, framework, retrieval, dan orkestrator.
 *
 * Kenapa permintaan itu tepat, dan buktinya dari hari yang sama: cacat C56
 * (langit-langit 300 detik) menyandera episode A3 selama tiga minggu, dan ia
 * TIDAK ADA di modelnya — ia ada di `fetch` bawaan Node. Setiap pengukuran kami
 * lewat jalur yang sama persis: Node → fetch → Ollama → Bmax. Jalur tunggal
 * mengukur JALURNYA sebanyak ia mengukur modelnya, dan tidak punya cara
 * memberi tahu kita yang mana.
 *
 * Satu panggilan `curl` ke soal yang sama akan menjawabnya dalam sehari.
 *
 * PRINSIP: perbedaan antar-jalur ADALAH pengukurannya. Kalau dua klien memberi
 * jawaban berbeda dengan seed yang sama, salah satunya berbohong — dan kita
 * tidak tahu yang mana sampai jalur KETIGA memecah seri. Itu prinsip majelis,
 * diterapkan ke infrastruktur, bukan ke model.
 *
 * DUA moda, dua pertanyaan berbeda:
 *
 *   --batas   Berapa lama tiap klien MAU MENUNGGU, dengan setelan BAWAANNYA?
 *             Dijalankan melawan peladen tiruan yang menerima koneksi lalu
 *             diam. Tidak butuh Ollama, tidak butuh GPU, tidak butuh jaringan.
 *             Inilah uji yang akan menangkap C56 di hari pertama.
 *
 *   --jawab   Apakah klien yang berbeda menghasilkan jawaban yang SAMA?
 *             Melawan Ollama sungguhan, seed dikunci. Butuh host hidup.
 *
 * RAMALAN, dikunci sebelum moda --batas pernah dijalankan (10 Sep 11:58Z):
 *   P1  Node `fetch` menyerah di ~300 dtk (headersTimeout undici).
 *   P2  curl TIDAK menyerah — bawaannya tanpa batas total.
 *   P3  python requests TIDAK menyerah — bawaannya timeout=None.
 *   P4  python urllib TIDAK menyerah — bawaannya socket timeout None.
 *   Kalau P2-P4 benar, maka Node adalah SATU-SATUNYA jalur yang memasang
 *   langit-langit, dan seluruh sejarah "base tidak bisa diukur" adalah artefak
 *   pilihan bahasa. Kalau salah satu dari P2-P4 salah, cacatnya lebih luas
 *   daripada yang kami kira dan itu temuan yang lebih besar lagi.
 *
 *   node eval/paritas-klien.mjs --batas          # 305 dtk, tanpa Ollama
 *   node eval/paritas-klien.mjs --batas --detik 8   # bentuk sama, cepat
 *   node eval/paritas-klien.mjs --jawab          # butuh OLLAMA_HOST hidup
 *   node eval/paritas-klien.mjs --uji            # uji instrumen
 */
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DIAM_BAWAAN = 305;

/** Klien yang diuji. `jalan(url)` mengembalikan {ok, sebab}. */
export const KLIEN = {
  'node-fetch': {
    bahasa: 'javascript',
    catatan: 'fetch bawaan Node (undici) — headersTimeout 300.000 ms',
    async jalan(url) {
      try { const r = await fetch(url); await r.text(); return { ok: true }; }
      catch (e) { return { ok: false, sebab: ringkasGalat(e) }; }
    },
  },
  curl: {
    bahasa: 'c',
    catatan: 'curl tanpa --max-time — bawaannya tidak membatasi lama transfer',
    jalan: (url) => luar('curl', ['-sS', '-o', devNull(), '-w', '%{http_code}', url]),
  },
  'py-requests': {
    bahasa: 'python',
    catatan: 'requests.get tanpa timeout= — bawaannya None',
    jalan: (url) => luar('python', ['-c',
      'import sys,requests;r=requests.get(sys.argv[1]);print(r.status_code)', url]),
  },
  'py-urllib': {
    bahasa: 'python',
    catatan: 'urllib.request.urlopen tanpa timeout= — bawaannya socket default (None)',
    jalan: (url) => luar('python', ['-c',
      'import sys,urllib.request;print(urllib.request.urlopen(sys.argv[1]).status)', url]),
  },
};

function devNull() { return process.platform === 'win32' ? 'NUL' : '/dev/null'; }

/** Ringkas galat SAMPAI ke rantai `cause` — pesan tingkat atas membuang sebabnya. */
export function ringkasGalat(e) {
  const bagian = [];
  for (let x = e, n = 0; x && n < 4; x = x.cause, n++) {
    const t = x?.code || x?.name || (typeof x === 'string' ? x : x?.message);
    if (t && !bagian.includes(t)) bagian.push(String(t));
  }
  return bagian.join(' ← ') || String(e).slice(0, 80);
}

function luar(cmd, args) {
  return new Promise((selesai) => {
    execFile(cmd, args, { timeout: 0, windowsHide: true }, (e, keluar) => {
      if (e) return selesai({ ok: false, sebab: ringkasGalat(e) });
      selesai({ ok: true, sebab: String(keluar).trim().slice(0, 40) });
    });
  });
}

/** Peladen yang menerima koneksi lalu DIAM — meniru Ollama saat masih menalar. */
export function peladenDiam(diamMs) {
  const s = http.createServer((_req, res) => {
    setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); }, diamMs);
  });
  s.on('connection', (c) => c.setTimeout(0));
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r({ s, port: s.address().port })));
}

/**
 * Vonis paritas. Yang dicari BUKAN "semua berhasil" — melainkan apakah para
 * klien SEPAKAT. Klien yang menyerah lebih awal daripada yang lain sedang
 * memasang langit-langitnya sendiri, dan langit-langit itu akan terbaca sebagai
 * sifat model di setiap pengukuran yang lewat sana.
 */
export function vonisParitas(hasil, diamDetik) {
  const nama = Object.keys(hasil);
  const berhasil = nama.filter((k) => hasil[k].ok);
  const gagal = nama.filter((k) => !hasil[k].ok);
  return {
    sepakat: gagal.length === 0 || berhasil.length === 0,
    berhasil, gagal,
    menyerahLebihAwal: gagal.filter((k) => hasil[k].detik < diamDetik),
  };
}

async function modaBatas() {
  const i = process.argv.indexOf('--detik');
  const diam = i > 0 ? Number(process.argv[i + 1]) : DIAM_BAWAAN;
  console.log(`\n# Paritas klien — moda BATAS · peladen diam ${diam} dtk · tanpa Ollama\n`);
  console.log('  Pertanyaannya: berapa lama tiap klien MAU MENUNGGU dengan setelan BAWAANNYA?\n');

  const { s, port } = await peladenDiam(diam * 1000);
  const url = `http://127.0.0.1:${port}/`;
  const hasil = {};
  // Serentak: semuanya cuma menunggu soket, jadi ongkosnya satu kali diam.
  await Promise.all(Object.entries(KLIEN).map(async ([nama, k]) => {
    const t0 = Date.now();
    const r = await k.jalan(url);
    hasil[nama] = { ...r, detik: Math.round((Date.now() - t0) / 10) / 100 };
  }));
  s.close();

  console.log(`  ${'klien'.padEnd(13)}${'bahasa'.padEnd(12)}${'hasil'.padEnd(9)}${'detik'.padStart(8)}   sebab`);
  for (const [nama, r] of Object.entries(hasil)) {
    console.log(`  ${nama.padEnd(13)}${KLIEN[nama].bahasa.padEnd(12)}${(r.ok ? 'SELESAI' : 'MENYERAH').padEnd(9)}`
      + `${String(r.detik).padStart(8)}   ${r.sebab || ''}`);
  }

  const v = vonisParitas(hasil, diam);
  console.log(`\n  sepakat: ${v.sepakat ? 'YA' : 'TIDAK'}`);
  if (!v.sepakat) {
    console.log(`  ${v.menyerahLebihAwal.length} klien memasang langit-langitnya SENDIRI: ${v.menyerahLebihAwal.join(', ')}`);
    console.log(`  ${v.berhasil.length} klien menunggu sampai selesai: ${v.berhasil.join(', ')}`);
    console.log('\n  Artinya: pengukuran yang lewat klien pertama akan melaporkan');
    console.log('  "model gagal" pada kasus yang sebenarnya berhasil. Itu C56.');
  }
  console.log('');
  process.exit(0);
}

async function modaJawab() {
  const host = process.env.OLLAMA_HOST;
  const model = process.argv[process.argv.indexOf('--jawab') + 1]?.replace(/^--.*/, '') || 'migancore:0.14';
  if (!host) { console.error('BERHENTI — OLLAMA_HOST tidak diset.'); process.exit(2); }
  console.log(`\n# Paritas klien — moda JAWAB · ${model} @ ${host} · seed dikunci\n`);
  console.error('  BELUM DIJALANKAN — Bmax mati saat berkas ini ditulis (port 22 & 11434 tertutup).');
  console.error('  Moda ini menunggu host hidup; moda --batas tidak, dan itu sengaja.\n');
  process.exit(3);
}

function uji() {
  let lulus = 0, gagal = 0;
  const cek = (n, k) => { k ? lulus++ : (gagal++, console.log(`  GAGAL: ${n}`)); };

  cek('empat klien terdaftar, tiga bahasa berbeda',
    Object.keys(KLIEN).length === 4 && new Set(Object.values(KLIEN).map((k) => k.bahasa)).size === 3);
  cek('tiap klien punya catatan setelan bawaannya',
    Object.values(KLIEN).every((k) => typeof k.catatan === 'string' && k.catatan.length > 10));

  cek('galat diringkas SAMPAI cause, bukan pesan tingkat atas',
    ringkasGalat({ name: 'TypeError', cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } })
      .includes('UND_ERR_HEADERS_TIMEOUT'));
  cek('rantai cause bertingkat terbaca',
    ringkasGalat({ cause: { cause: { code: 'ECONNRESET' } } }).includes('ECONNRESET'));
  cek('galat polos tidak melempar', typeof ringkasGalat(new Error('x')) === 'string');
  cek('null aman', typeof ringkasGalat(null) === 'string');

  // Inti vonisnya: yang dicari SEPAKAT, bukan BERHASIL.
  const semuaGagal = { a: { ok: false, detik: 1 }, b: { ok: false, detik: 1 } };
  cek('semua gagal → tetap SEPAKAT (peladennya yang mati, bukan kliennya)',
    vonisParitas(semuaGagal, 305).sepakat === true);
  cek('semua berhasil → sepakat',
    vonisParitas({ a: { ok: true, detik: 305 }, b: { ok: true, detik: 305 } }, 305).sepakat === true);
  cek('satu menyerah awal, lain selesai → TIDAK sepakat',
    vonisParitas({ a: { ok: false, detik: 300 }, b: { ok: true, detik: 305 } }, 305).sepakat === false);
  cek('yang menyerah lebih awal tercatat namanya',
    vonisParitas({ a: { ok: false, detik: 300 }, b: { ok: true, detik: 305 } }, 305)
      .menyerahLebihAwal.includes('a'));
  cek('gagal TEPAT di lama diam tidak dihitung "lebih awal"',
    vonisParitas({ a: { ok: false, detik: 305 }, b: { ok: true, detik: 305 } }, 305)
      .menyerahLebihAwal.length === 0);

  console.log(`\n  ${lulus} lulus · ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
}

const dipanggilLangsung = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (dipanggilLangsung) {
  if (process.argv.includes('--uji')) uji();
  else if (process.argv.includes('--jawab')) modaJawab();
  else if (process.argv.includes('--batas')) modaBatas().catch((e) => { console.error(e); process.exit(2); });
  else { console.error('pakai: --batas | --jawab | --uji'); process.exit(2); }
}
