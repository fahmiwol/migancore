#!/usr/bin/env node
/**
 * banding-run.mjs — sandingkan SEMUA run latih supaya bisa dibandingkan, dianalisa,
 * dipahami, dan diaudit.
 *
 * ============================== KENAPA ADA ==================================
 * Hasil 8 run latih cluster tool tersebar di tiga keluarga berkas yang tidak
 * saling menyebut:
 *
 *   flywheel/dataset/<versi>/MANIFEST-*.json   masukan: dial, sidik, pra-daftar
 *   models/<versi>/ringkasan-*.json            tier-1 di dalam run + tier kemas
 *   eval/ULANG-uji-alat-*.json                 tier-2: 120 uji, Wilson 95%
 *
 * Untuk menjawab "run mana yang paling bagus, dan KENAPA" orang harus membuka
 * belasan berkas dan mengingat pemetaannya sendiri. Itu bukan cuma merepotkan —
 * itu tidak bisa diaudit, dan optimasi yang tidak bisa diaudit gampang jadi
 * cerita yang enak dibaca tapi tidak benar.
 *
 * ==================== RANTAI SIDIK PUTUS DI MANA (28 Agu 2026) ==============
 * Diperiksa hari ini, dan hasilnya harus ditulis terang-terangan:
 *
 *   data (sidik ADA) -> latih (ringkasan mencatat sidik.data, ADA)
 *      -> adapter lora-<cluster>.tgz  ...... DITIMPA tiap run, tanpa sidik
 *      -> kemas (ringkasan cuma menulis `adapters: ["tool"]`, tanpa sidik asal)
 *      -> tag ollama ...................... DIPAKAI ULANG (4 run berbeda semua
 *                                           bernama `migancore:0.14-tool`)
 *      -> tier-2 .......................... dibedakan HANYA oleh `sufiks` yang
 *                                           diketik tangan saat mengukur
 *
 * Jadi sanad mekanis kita berhenti di ringkasan latih. Sesudah itu sambungannya
 * bersandar pada nama berkas dan ingatan orang. Buktinya langsung kena ke kami
 * sendiri: sufiks r1t..r4t ternyata memetakan ke run 2, 3, 6, 7 — bukan 1..4.
 * Menebak dari urutan nama akan salah, dan salahnya tidak akan kelihatan.
 *
 * Berkas ini TIDAK menambal itu dengan tebakan. Yang bisa disambung mekanis
 * (lewat sidik) disambung; sisanya diambil dari PETA-RUN.json yang setiap
 * sambungannya MENYEBUT kalimat dokumen sumbernya; yang tidak ada dasarnya
 * ditulis "belum tersambung" — supaya lubangnya kelihatan sebagai pekerjaan,
 * bukan tertutup sebagai kesimpulan.
 *
 * ==================== KETERBANDINGAN (hukum C29) ===========================
 * Dua run hanya boleh dibandingkan kalau ALAT UKURNYA tidak berubah di antara
 * keduanya. Manifest menyidik soal, pengukur, dan prompt gerbang; kalau salah
 * satu berbeda, selisih skor bisa datang dari alatnya, bukan dari modelnya.
 * `--banding A B` memeriksa itu DULU dan menolak memberi vonis kalau alatnya
 * bergeser. Ini hukum C29 di PETA-DIAL-LATIH.md.
 *
 * (Koreksi 28 Agu: versi pertama berkas ini mengklaim "menutup utang D6". Salah
 * label — D6 di peta dial adalah blob Ollama yatim, bukan baseline instrumen.
 * Kode A6/D6 itu dikarang saat menulis PRA-DAFTAR-V15 dan bertabrakan dengan
 * hukum yang sudah ada. Utangnya nyata dan sekarang sebagian lunas; kodenya yang
 * tidak pernah ada.)
 *
 * Pakai:
 *   node flywheel/banding-run.mjs                 tabel semua run
 *   node flywheel/banding-run.mjs --cluster tool  saring satu cluster
 *   node flywheel/banding-run.mjs --banding <A> <B>
 *   node flywheel/banding-run.mjs --md            keluaran markdown
 *   node flywheel/banding-run.mjs --json
 *   node flywheel/banding-run.mjs --uji           uji instrumen
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.dirname(DIR);
const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', B = '\x1b[36m', A = '\x1b[2m', R = '\x1b[0m';

const bacaJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const rel = (p) => path.relative(AKAR, p).replace(/\\/g, '/');

// ─────────────────────────────────────────────────── bentuk ringkasan ──
/**
 * Tiga generasi ringkasan hidup berdampingan di models/. Membedakannya dari
 * ISI, bukan dari nama berkas: nama bisa diubah orang, isi tidak bisa berpura-pura.
 *
 *   latih-kontrak : formatKontrak 2 — sidik lengkap, resep, petak tahan
 *   latih-lama    : v13 — ada cluster/loss/baris, TANPA sidik apa pun
 *   kemas         : tahap merge/GGUF — ada artefak/gguf/cium_ok, tanpa baris latih
 */
export function bentukRingkasan(j) {
  if (!j || typeof j !== 'object') return 'tak-dikenal';
  if (j.artefak !== undefined || j.gguf !== undefined || j.cium_ok !== undefined) return 'kemas';
  if (j.formatKontrak === 2) return 'latih-kontrak';
  if (j.loss !== undefined && j.baris !== undefined) return 'latih-lama';
  return 'tak-dikenal';
}

// ────────────────────────────────────────────── keterbandingan (C29) ──
/**
 * Alat ukur yang bergeser membuat dua angka berhenti sebanding. Yang diperiksa
 * cuma sidik ALAT (soal, pengukur, prompt gerbang) — sidik DATA memang harus
 * berbeda, karena itulah yang sedang diperbandingkan.
 *
 * Ketiadaan sidik BUKAN kelulusan: run format lama tidak menyimpan sidik sama
 * sekali, dan itu justru alasan terkuat untuk menolak membandingkannya.
 */
export const ALAT = ['soal', 'ukur', 'promptGerbang', 'kenari'];
export function terbandingkan(a, b) {
  const sebab = [];
  if (!a?.sidik || !b?.sidik) {
    sebab.push(`sidik alat tidak tercatat (${!a?.sidik ? 'kiri' : 'kanan'} format lama) — tidak ada dasar untuk menyatakan alatnya sama`);
    return { bisa: false, sebab };
  }
  for (const k of ALAT) {
    const x = a.sidik[k], y = b.sidik[k];
    if (x === undefined && y === undefined) continue;      // alat itu memang tak dipakai keduanya
    if (x !== y) sebab.push(`${k}: ${x || '(tak ada)'} != ${y || '(tak ada)'}`);
  }
  return { bisa: sebab.length === 0, sebab };
}

// ───────────────────────────────────────────────────── angka tier-1 ──
const pecah = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object') return v.total ? `${v.benar}/${v.total}` : null;
  return String(v);                                        // format lama: "8/10" atau "0/12"
};
export function tier1(j) {
  if (!j) return {};
  return {
    dengan: pecah(j['arit-dengan']),
    tanpa: pecah(j['arit-tanpa']),
    latih: pecah(j['arit-latih']),
    kenari: pecah(j.kenari),
    loss: typeof j.loss === 'number' ? Number(j.loss.toFixed(4)) : null,
    tahan: j.petakTahan?.delta ?? null,
  };
}

// ───────────────────────────────────────────────────────── kumpulkan ──
function kumpulkan() {
  const peta = bacaJSON(path.join(DIR, 'PETA-RUN.json')) || { run: [] };

  // 1. semua ringkasan di models/*/
  const dirModel = path.join(AKAR, 'models');
  const ringkasan = [];
  for (const v of (fs.existsSync(dirModel) ? fs.readdirSync(dirModel) : [])) {
    const d = path.join(dirModel, v);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter((x) => /^ringkasan-.*\.json$/.test(x))) {
      const p = path.join(d, f);
      const j = bacaJSON(p);
      ringkasan.push({ berkas: rel(p), versi: v, bentuk: bentukRingkasan(j), j,
        diubah: fs.statSync(p).mtime.toISOString().slice(0, 16).replace('T', ' ') });
    }
  }

  // 2. manifest. Disambungkan lewat NAMA BERKAS lebih dulu, baru sidik.
  //    Menyambung lewat sidik saja pernah salah dan salahnya masuk akal di layar:
  //    MANIFEST-tool-8b.json dan run-7 berbagi sidik data a19db1a8 (memang
  //    disengaja — data sama, base beda), jadi run-7 mewarisi dial 8B dan tabel
  //    melaporkan run 4B sebagai 8B. Sidik data BUKAN kunci unik untuk manifest.
  const manifestPerSidik = new Map();
  const manifestPerNama = new Map();
  const dirData = path.join(DIR, 'dataset');
  for (const v of (fs.existsSync(dirData) ? fs.readdirSync(dirData) : [])) {
    const d = path.join(dirData, v);
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter((x) => /^MANIFEST-.*\.json$/.test(x))) {
      const j = bacaJSON(path.join(d, f));
      if (!j?.sidik?.data) continue;
      const rec = { ...j, berkas: rel(path.join(d, f)) };
      manifestPerNama.set(`${v}/${path.basename(f, '.json').replace(/^MANIFEST-/, '')}`, rec);
      if (!manifestPerSidik.has(j.sidik.data)) manifestPerSidik.set(j.sidik.data, rec);
      else manifestPerSidik.set(j.sidik.data, 'AMBIGU');   // >1 manifest, jangan tebak
    }
  }

  // 3. tier-2
  const tier2 = new Map();
  const dirEval = path.join(AKAR, 'eval');
  for (const f of (fs.existsSync(dirEval) ? fs.readdirSync(dirEval) : []).filter((x) => /^ULANG-uji-alat-.*\.json$/.test(x))) {
    const j = bacaJSON(path.join(dirEval, f));
    if (j?.keseluruhan) tier2.set(rel(path.join(dirEval, f)), { ...j, berkas: rel(path.join(dirEval, f)) });
  }

  // 4. satu BARIS = satu run LATIH. Kemas & tier-2 menempel padanya, bukan
  //    sebaliknya: yang menentukan identitas percobaan adalah data + bobot,
  //    dan cuma tahap latih yang menyimpan sidik datanya.
  const baris = [];
  // Manifest yang sudah diklaim lewat NAMA oleh sebuah ringkasan tidak boleh
  // dipinjam run lain lewat sidik. Manifest run yang lebih tua memang sudah
  // DITIMPA — itu faktanya, dan "tidak punya manifest" harus terlihat sebagai
  // tidak punya, bukan diam-diam diisi milik tetangga yang kebetulan sedatanya.
  const diklaim = new Set();
  for (const r of ringkasan.filter((x) => x.bentuk.startsWith('latih'))) {
    const n = path.basename(r.berkas, '.json').replace(/^ringkasan-/, '');
    const m = manifestPerNama.get(`${r.versi}/${n}`);
    if (m) diklaim.add(m.berkas);
  }

  for (const r of ringkasan.filter((x) => x.bentuk.startsWith('latih'))) {
    const sd = r.j?.sidik?.data ?? null;
    const namaRingkasan = path.basename(r.berkas, '.json').replace(/^ringkasan-/, '');
    const lewatSidik = sd ? manifestPerSidik.get(sd) : null;
    const man = manifestPerNama.get(`${r.versi}/${namaRingkasan}`)
      || (lewatSidik && lewatSidik !== 'AMBIGU' && !diklaim.has(lewatSidik.berkas) ? lewatSidik : null);
    // Berkas ringkasan MENANG atas sidik. Dua run boleh berbagi sidik data
    // (4B vs 8B atas data sama), jadi mencari lewat sidik lebih dulu akan
    // memberi run 8B angka tier-2 milik run 4B — diam-diam, dan angkanya
    // terlihat masuk akal. Sidik cuma dipakai untuk catatan yang memang tidak
    // menyebut berkas.
    const catatanPeta = peta.run.find((x) => x.ringkasan === r.berkas)
      || peta.run.find((x) => sd && x.sidikData === sd && !x.ringkasan) || null;
    const t2 = catatanPeta?.tier2 ? tier2.get(catatanPeta.tier2) : null;
    baris.push({
      // Label dari PETA-RUN dipakai kalau ada: "run-7" jauh lebih bisa diajak
      // bicara daripada "a19db1a8", dan labelnya sudah dikurasi berikut sumbernya.
      id: (catatanPeta?.label || '').split(' ')[0]
        || (sd ? sd.slice(0, 8) : path.basename(r.berkas, '.json').replace(/^ringkasan-/, '').slice(0, 13)),
      sidikData: sd, versi: r.versi, cluster: r.j?.cluster ?? catatanPeta?.cluster ?? '?',
      baris: r.j?.baris ?? null, ringkasan: r.berkas, diubah: r.diubah, bentuk: r.bentuk,
      manifest: man?.berkas ?? null,
      praDaftar: man?.praBerkas ?? catatanPeta?.praDaftar ?? null,
      praNama: man?.praNama ?? null,
      resep: man?.resep ?? r.j?.resep ?? null,
      // Base = dial, bukan keterangan. Run-7 (4B) dan run-8b memakai DATA YANG
      // SAMA (a19db1a8, 201 baris) dan hanya berbeda base — itu perbandingan
      // satu-dial paling bersih yang pernah kami punya, dan akan tak terlihat
      // kalau base cuma terkubur di dalam resep.
      // Ringkasan run MENANG atas manifest: manifest mencatat apa yang
      // DIMAKSUDKAN, ringkasan mencatat apa yang BENAR-BENAR jalan. Kalau
      // keduanya beda, yang jalan itulah faktanya.
      base: (r.j?.resep?.base ?? man?.resep?.base ?? '').replace(/^.*\//, '') || null,
      git: man?.git?.commit ?? null,
      sidik: r.j?.sidik ?? null,
      tier1: tier1(r.j),
      tier2: t2 ? { total: t2.keseluruhan.lulus, dari: t2.keseluruhan.coba, vonis: t2.keseluruhan.vonis,
        perKategori: t2.perKategori, berkas: t2.berkas } : null,
      sambungan: catatanPeta ? { cara: catatanPeta.sambungan, sumber: catatanPeta.sumberSambungan,
        keyakinan: catatanPeta.keyakinan, label: catatanPeta.label } : null,
    });
  }
  // Sidik data yang kembar itu SAH dan disengaja (dua base atas data sama).
  // Tapi id yang kembar membuat --banding menunjuk run yang salah tanpa mengeluh,
  // jadi yang kembar diberi pembeda dari nama berkasnya — bukan dari nomor urut,
  // supaya id tetap stabil kalau ada run baru menyisip.
  const hitungId = new Map();
  for (const r of baris) hitungId.set(r.id, (hitungId.get(r.id) || 0) + 1);
  for (const r of baris) {
    if (hitungId.get(r.id) < 2) continue;
    const pembeda = path.basename(r.ringkasan, '.json')
      .replace(/^ringkasan-/, '').replace(/-sebelum-\d+-\d+$/, '').replace(/^tool-?/, '') || r.base || 'x';
    r.id = `${r.id}-${pembeda}`;
  }
  baris.sort((a, b) => (a.cluster + a.diubah).localeCompare(b.cluster + b.diubah));

  const t2Terpakai = new Set(baris.filter((x) => x.tier2).map((x) => x.tier2.berkas));
  return { baris, yatim: { tier2: [...tier2.values()].filter((x) => !t2Terpakai.has(x.berkas)),
    kemas: ringkasan.filter((x) => x.bentuk === 'kemas') } };
}

// ───────────────────────────────────────────────────────── tampilkan ──
// Windows menulis jalur dengan pemisah terbalik; tabel jadi tak rata dan jalurnya
// tak bisa disalin ke perintah. String.fromCharCode(92) dipakai supaya tidak ada
// backslash literal di sumber — karakter itu berkali-kali rusak lewat lapisan
// skrip/heredoc dalam sesi ini, dan rusaknya baru ketahuan saat sintaks pecah.
const jalurRapi = (p) => (p || '—').split(String.fromCharCode(92)).join('/').replace(/^flywheel\//, '');
const pad = (s, n) => String(s ?? '—').padEnd(n).slice(0, n);
const padL = (s, n) => String(s ?? '—').padStart(n).slice(0, n);

function tabel({ baris, yatim }, opsi) {
  const rows = opsi.cluster ? baris.filter((x) => x.cluster === opsi.cluster) : baris;
  console.log(`\n${B}# Banding run latih${R}  ${A}(${rows.length} run${opsi.cluster ? ` · cluster ${opsi.cluster}` : ''})${R}\n`);
  console.log(`  ${A}${pad('id', 13)} ${pad('cluster', 12)} ${pad('base', 5)} ${padL('baris', 5)} ${pad('tgl', 11)} ${pad('arit d/t/l', 12)} ${padL('kenari', 6)} ${padL('loss', 7)} ${padL('tahan', 7)} ${pad('tier-2', 14)} pra-daftar${R}`);
  console.log(`  ${A}${'─'.repeat(126)}${R}`);
  for (const r of rows) {
    const t = r.tier1;
    const arit = `${t.dengan || '—'}/${(t.tanpa || '—').split('/')[0]}/${(t.latih || '—').split('/')[0]}`;
    const t2 = r.tier2
      ? `${r.tier2.total}/${r.tier2.dari} ${r.tier2.vonis === 'LULUS' ? H + 'LULUS' : r.tier2.vonis === 'GAGAL' ? M + 'GAGAL' : K + 'T.PASTI'}${R}`
      : `${A}belum tersambung${R}`;
    console.log(`  ${pad(r.id, 13)} ${pad(r.cluster, 12)} ${pad((r.base || '—').replace(/Qwen3-|-Instruct.*$/g, ''), 5)} ${padL(r.baris, 5)} ${pad(r.diubah.slice(0, 10), 11)} ${pad(arit, 12)} ${padL(t.kenari, 6)} ${padL(t.loss, 7)} ${padL(t.tahan, 7)} ${pad(t2, 14 + (r.tier2 ? 9 : 4))} ${A}${jalurRapi(r.praDaftar)}${R}`);
  }

  const tanpaSidik = rows.filter((x) => !x.sidik).length;
  const tanpaT2 = rows.filter((x) => !x.tier2).length;
  console.log(`\n  ${A}kolom arit = dengan/tanpa/latih (benar dari 10) · tahan = delta loss petak tahan (makin negatif makin baik)${R}`);
  if (tanpaSidik) console.log(`  ${K}${tanpaSidik} run tanpa sidik alat${R} — tidak bisa dinyatakan sebanding dengan run mana pun (format lama).`);
  if (tanpaT2) console.log(`  ${K}${tanpaT2} run tanpa tier-2 tersambung${R} — sambungannya ada di PETA-RUN.json, atau memang belum pernah diukur.`);
  if (yatim.tier2.length) {
    console.log(`\n  ${K}tier-2 yatim${R} (hasil ukur tanpa run latih yang menyebutnya):`);
    for (const y of yatim.tier2) console.log(`    ${A}${y.berkas.replace('eval/', '')} — ${y.model} sufiks ${y.sufiks} · ${y.keseluruhan.lulus}/${y.keseluruhan.coba}${R}`);
  }
  console.log(`\n  ${A}berikutnya: banding-run.mjs --banding <id> <id>  ·  --md  ·  --json${R}\n`);
}

function banding({ baris }, idA, idB) {
  const cari = (id) => baris.find((x) => x.id === id || x.sidikData === id || x.sidikData?.startsWith(id));
  const a = cari(idA), b = cari(idB);
  if (!a || !b) { console.error(`${M}tidak ketemu:${R} ${!a ? idA : idB}. Jalankan tanpa argumen untuk daftar id.`); return 2; }

  console.log(`\n${B}# Banding ${a.id} vs ${b.id}${R}\n`);
  console.log(`  kiri : ${a.cluster} · ${a.base || 'base tak tercatat'} · ${a.baris} baris · ${a.ringkasan}`);
  console.log(`  kanan: ${b.cluster} · ${b.base || 'base tak tercatat'} · ${b.baris} baris · ${b.ringkasan}\n`);

  // GERBANG PERTAMA — alat ukur. Sebelum satu angka pun dibandingkan.
  const c = terbandingkan(a, b);
  if (!c.bisa) {
    console.log(`  ${M}TIDAK SEBANDING${R} — alat ukurnya tidak sama:`);
    for (const s of c.sebab) console.log(`    ${s}`);
    console.log(`\n  ${A}Selisih skor apa pun di bawah ini bisa datang dari alatnya, bukan dari modelnya.`);
    console.log(`  Ukur ulang kedua model dengan alat yang sama sebelum menarik kesimpulan (C29).${R}\n`);
  } else {
    console.log(`  ${H}SEBANDING${R} — sidik alat identik (${ALAT.join(', ')}).\n`);
  }

  const brs = [['baris', a.baris, b.baris], ['loss', a.tier1.loss, b.tier1.loss],
    ['arit dengan', a.tier1.dengan, b.tier1.dengan], ['arit tanpa', a.tier1.tanpa, b.tier1.tanpa],
    ['arit latih', a.tier1.latih, b.tier1.latih], ['kenari', a.tier1.kenari, b.tier1.kenari],
    ['petak tahan', a.tier1.tahan, b.tier1.tahan],
    ['tier-2', a.tier2 ? `${a.tier2.total}/${a.tier2.dari}` : null, b.tier2 ? `${b.tier2.total}/${b.tier2.dari}` : null]];
  console.log(`  ${A}${pad('ukuran', 14)} ${padL('kiri', 10)} ${padL('kanan', 10)}${R}`);
  for (const [n, x, y] of brs) console.log(`  ${pad(n, 14)} ${padL(x, 10)} ${padL(y, 10)}`);

  if (a.tier2 && b.tier2) {
    console.log(`\n  ${A}per kategori (tier-2):${R}`);
    for (const ka of a.tier2.perKategori) {
      const kb = b.tier2.perKategori.find((x) => x.kategori === ka.kategori);
      if (!kb) continue;
      const d = kb.lulus - ka.lulus;
      console.log(`  ${pad(ka.kategori, 14)} ${padL(`${ka.lulus}/${ka.total}`, 10)} ${padL(`${kb.lulus}/${kb.total}`, 10)}  ${d > 0 ? H + '+' + d : d < 0 ? M + d : A + '0'}${R}`);
    }
    console.log(`\n  ${A}Satuan = skenario; klaim "lebih baik" butuh ambang absolut yang dipra-daftar, bukan selisih sekali jalan (C5).${R}`);
  }

  // Dial yang berbeda — supaya "kenapa" bisa dijawab, bukan cuma "berapa".
  if (a.resep && b.resep) {
    const beda = [];
    const ratakan = (o, awalan = '') => Object.entries(o || {}).flatMap(([k, v]) =>
      (v && typeof v === 'object' && !Array.isArray(v)) ? ratakan(v, awalan + k + '.') : [[awalan + k, JSON.stringify(v)]]);
    const ma = new Map(ratakan(a.resep)), mb = new Map(ratakan(b.resep));
    for (const [k, v] of ma) if (mb.get(k) !== v) beda.push(`${k}: ${v} -> ${mb.get(k)}`);
    console.log(`\n  ${A}dial yang bergeser:${R} ${beda.length ? beda.join(' · ') : `${H}tidak ada — hanya DATA yang berbeda${R}`}`);
    if (beda.length > 1) console.log(`  ${K}${beda.length} dial bergeser sekaligus${R} — vonis tidak bisa dikreditkan ke salah satunya (aturan satu-dial).`);
  }
  console.log('');
  return c.bisa ? 0 : 1;
}

function markdown({ baris }) {
  console.log('# Banding run latih\n');
  console.log('| id | cluster | base | baris | tgl | arit d/t/l | kenari | loss | tahan | tier-2 | pra-daftar |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of baris) {
    const t = r.tier1;
    console.log(`| \`${r.id}\` | ${r.cluster} | ${r.base ?? '—'} | ${r.baris ?? '—'} | ${r.diubah.slice(0, 10)} | ${t.dengan || '—'}/${(t.tanpa || '—').split('/')[0]}/${(t.latih || '—').split('/')[0]} | ${t.kenari || '—'} | ${t.loss ?? '—'} | ${t.tahan ?? '—'} | ${r.tier2 ? `**${r.tier2.total}/${r.tier2.dari}** ${r.tier2.vonis}` : '_belum tersambung_'} | ${r.praDaftar ? `\`${r.praDaftar}\`` : '—'} |`);
  }
}

// ────────────────────────────────────────────────────── uji instrumen ──
if (process.argv.includes('--uji')) {
  let ok = 0, buruk = 0;
  const cek = (n, benar, ket = '') => (benar ? (ok++, console.log(`  OK    ${n}`))
    : (buruk++, console.log(`  GAGAL ${n}${ket ? ' — ' + ket : ''}`)));

  cek('bentuk: kontrak v2 = latih-kontrak', bentukRingkasan({ formatKontrak: 2, loss: 1, baris: 10 }) === 'latih-kontrak');
  cek('bentuk: v13 tanpa sidik = latih-lama', bentukRingkasan({ cluster: 'hitung', loss: 1, baris: 10 }) === 'latih-lama');
  cek('bentuk: kemas dikenali dari artefak/gguf', bentukRingkasan({ artefak: 'x', gguf: true, menit: 3 }) === 'kemas');
  cek('bentuk: kemas TIDAK tertukar jadi latih walau ada menit', bentukRingkasan({ cium_ok: true, menit: 5 }) === 'kemas');
  cek('bentuk: sampah = tak-dikenal', bentukRingkasan({ apa: 1 }) === 'tak-dikenal' && bentukRingkasan(null) === 'tak-dikenal');

  const alatSama = { sidik: { data: 'D1', soal: 'S', ukur: 'U', promptGerbang: 'P', kenari: 'K' } };
  const alatSamaDataBeda = { sidik: { data: 'D2', soal: 'S', ukur: 'U', promptGerbang: 'P', kenari: 'K' } };
  const soalBeda = { sidik: { data: 'D2', soal: 'LAIN', ukur: 'U', promptGerbang: 'P', kenari: 'K' } };
  cek('C29: alat sama + data beda = SEBANDING (itu memang yang dibandingkan)',
    terbandingkan(alatSama, alatSamaDataBeda).bisa === true);
  cek('C29: soal berubah = TIDAK sebanding', terbandingkan(alatSama, soalBeda).bisa === false);
  cek('C29: sebabnya disebut, bukan cuma vonis', terbandingkan(alatSama, soalBeda).sebab.some((x) => /soal/.test(x)));
  cek('C29: format lama (tanpa sidik) DITOLAK, bukan diluluskan',
    terbandingkan(alatSama, { loss: 1 }).bisa === false);
  cek('C29: ketiadaan sidik di KEDUA sisi tetap DITOLAK', terbandingkan({ loss: 1 }, { loss: 2 }).bisa === false);

  cek('tier1: bentuk objek dibaca', tier1({ 'arit-dengan': { benar: 9, total: 10 } }).dengan === '9/10');
  cek('tier1: bentuk lama (teks) dibaca', tier1({ 'arit-dengan': '8/10', kenari: '0/12' }).dengan === '8/10');
  cek('tier1: yang tidak ada = null, bukan 0', tier1({}).dengan === null && tier1({}).loss === null);
  cek('tier1: delta petak tahan terbawa', tier1({ petakTahan: { delta: -1.05 } }).tahan === -1.05);

  // uji terhadap data NYATA — fixture bisa benar sementara dunia nyata berbeda bentuk
  const nyata = kumpulkan();
  cek('NYATA: menemukan run latih di models/', nyata.baris.length >= 8, `ketemu ${nyata.baris.length}`);
  cek('NYATA: run 389 baris (v15 tool) ada dan bersidik 113db6e1',
    nyata.baris.some((r) => r.baris === 389 && r.sidikData === '113db6e11e16b4d5'));
  cek('NYATA: tiap run latih punya id unik', new Set(nyata.baris.map((r) => r.id)).size === nyata.baris.length);
  cek('NYATA: sidik data KEMBAR memang ada (4B & 8B atas data sama) dan tetap dua baris',
    nyata.baris.filter((r) => r.sidikData === 'a19db1a87bc87c55').length === 2);
  cek('NYATA: base tercatat untuk run berkontrak', nyata.baris.filter((r) => r.base).length >= 2);
  const kembar = nyata.baris.filter((r) => r.sidikData === 'a19db1a87bc87c55');
  const r7 = nyata.baris.find((r) => r.id === 'run-7'), r8 = nyata.baris.find((r) => r.id === 'run-8b');
  cek('NYATA: run-7 terbaca 4B (bukan mewarisi base 8B lewat sidik kembar)',
    !!r7 && /4B/.test(r7.base || ''), r7 ? `base=${r7.base}` : 'run-7 tak ketemu');
  cek('NYATA: run-8b terbaca 8B', !!r8 && /8B/.test(r8.base || ''), r8 ? `base=${r8.base}` : 'run-8b tak ketemu');
  cek('NYATA: manifest 8B tidak menempel ke run-7',
    !!r7 && (r7.manifest === null || !/8b/.test(r7.manifest)), r7 ? `manifest=${r7.manifest}` : '-');
  cek('NYATA: run bersidik kembar TIDAK berbagi tier-2 yang sama',
    kembar.length !== 2 || !kembar[0].tier2 || !kembar[1].tier2
    || kembar[0].tier2.berkas !== kembar[1].tier2.berkas,
    kembar.map((k) => k.id + '->' + (k.tier2?.total ?? '-')).join(' vs '));
  cek('NYATA: ringkasan kemas TIDAK ikut jadi baris run',
    !nyata.baris.some((r) => r.bentuk === 'kemas'));

  console.log('\n' + '='.repeat(52));
  console.log(`${ok} lulus · ${buruk} gagal`);
  process.exit(buruk ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────── jalan ──
// Penjaga entrypoint (C27, ditegakkan eval/jaga-modul.mjs). Tanpa ini, MENGIMPOR
// berkas ini untuk memakai terbandingkan()/tier1() akan mencetak seluruh tabel
// lalu process.exit — yang persis terjadi 28 Agu waktu saya mengimpornya untuk
// mendiagnosis 57 baris yang terbuang, dan keluarannya menyamar jadi hasil
// diagnosis.
const DIJALANKAN_LANGSUNG = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('banding-run.mjs');
if (DIJALANKAN_LANGSUNG) {
const argv = process.argv.slice(2);
const data = kumpulkan();
if (argv.includes('--json')) { console.log(JSON.stringify(data, null, 2)); process.exit(0); }
if (argv.includes('--md')) { markdown(data); process.exit(0); }
if (argv.includes('--banding')) {
  const i = argv.indexOf('--banding');
  process.exit(banding(data, argv[i + 1], argv[i + 2]));
}
const iC = argv.indexOf('--cluster');
tabel(data, { cluster: iC >= 0 ? argv[iC + 1] : null });
}
