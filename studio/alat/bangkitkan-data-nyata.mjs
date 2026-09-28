#!/usr/bin/env node
/**
 * bangkitkan-data-nyata.mjs — cuplikan ANGKA NYATA dari sumber kebenaran untuk dunia Studio.
 *
 * Kenapa ada: rancangan Studio 22 Agu berprinsip "semua angka di papan ini angka nyata, bukan contoh".
 * Dunia kelahiran Migan memakai prinsip yang sama (PRD G2: Studio membaca, tidak menyimpan fakta).
 * Berkas keluaran DIBANGKITKAN — jangan disunting tangan; jalankan ulang.
 *
 * 23 Sep 2026: versi sebelumnya MENGETIK tiga sorotan dan blok sensus sebagai string. Dua di antaranya
 * lalu menjadi salah tanpa ada yang berbunyi — "syarat bibit MAKSARA belum terdefinisi" (A4-BARU
 * terpasang 23 Sep) dan "belum ditemukan: 29 adapter" (ditemukan 10–11 Sep). Sekarang setiap kalimat
 * dirakit dari sumbernya: status kelahiran dari eval/ambang-bibit.mjs statusKelahiran() (perhitungan
 * yang SAMA dengan `migan status`), sorotan dari vonis pra-daftar, salinan tunggal dari tabel doc 99 §2.
 *
 * Pakai: node studio/alat/bangkitkan-data-nyata.mjs <berkas-keluaran.json> [<berkas-keluaran-2.json> …]
 *        node studio/alat/bangkitkan-data-nyata.mjs --uji
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AKAR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8');
const git = (...a) => execFileSync('git', ['-C', AKAR, ...a], { encoding: 'utf8' }).trim();
const { statusKelahiran } = await import(pathToFileURL(path.join(AKAR, 'eval', 'ambang-bibit.mjs')).href);
// 28 Sep 2026 (keputusan Fahmi): MAKSARA lahir = Gerbang-S1 MENANG. Kriteria A4-BARU di atas tetap dibaca sebagai SEJARAH.
const { statusKelahiranS1 } = await import(pathToFileURL(path.join(AKAR, 'eval', 'gerbang-s1', 'kelahiran-s1.mjs')).href);
// Pengurai hukum KANONIK (3 Sep: "11 dari 31 hukum terlewat diam-diam" oleh pola salinan). Dipakai ulang,
// tidak disalin — salinan pola di berkas ini melewatkan C22/C30/C31 (em dash) sampai 23 Sep (F-269 audit OMIGA).
const { kumpulkanHukum, kumpulkanTemuan } = await import(pathToFileURL(path.join(AKAR, 'flywheel', 'bangun-silsilah.mjs')).href);

const f2 = (x) => x.toFixed(2).replace('.', ',');
const ringkas = (s, n = 220) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Baris tabel doc 99 §2 yang kolom "Salinan"-nya **1** — artefak salinan tunggal, dari sumbernya. */
export function salinanTunggalDari(md) {
  const awal = md.indexOf('| Artefak | Lokasi | Salinan | Risiko |');
  if (awal < 0) throw new Error('doc 99: tabel "Artefak | Lokasi | Salinan | Risiko" tidak ditemukan');
  const baris = md.slice(awal).split('\n').slice(2);
  const hasil = [];
  for (const b of baris) {
    if (!b.startsWith('|')) break;
    const sel = b.split('|').slice(1, -1).map((x) => x.trim());
    if (sel.length < 3 || sel[2].replace(/\*/g, '') !== '1') continue;
    const bersih = (x) => x.replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
    hasil.push(`${ringkas(bersih(sel[0]), 150)} — ${ringkas(bersih(sel[1]), 60)}`);
  }
  return hasil;
}

/**
 * Pelajaran "jangan diulang" dari ledger eksperimen §3 (kanonik: docs/jarvis/EXPERIMENT_LEDGER.md, registri
 * `buku_eksperimen`). Tiap butir `- **judul** isi` → { judul, isi }. Urutan: terbaru dulu (ledger menambah di ekor).
 */
export function janganDiulangDari(md) {
  const awal = md.search(/^## 3\. /m);
  if (awal < 0) throw new Error('EXPERIMENT_LEDGER: bagian "## 3." (jangan diulang) tidak ditemukan');
  const sisa = md.slice(awal + 4);
  const akhir = sisa.search(/^## \d+\. /m);
  const bagian = akhir < 0 ? sisa : sisa.slice(0, akhir);
  const hasil = [];
  for (const m of bagian.matchAll(/^- \*\*(.+?)\*\*(.*)$/gm)) {
    hasil.push({ judul: ringkas(m[1].replace(/`/g, ''), 160), isi: ringkas(m[2].replace(/\*\*/g, '').replace(/`/g, '').replace(/^[\s.:—–-]+/, ''), 260) });
  }
  return hasil.reverse();
}

/**
 * Radar riset, terbaru dulu. Dua jenis:
 * - `radar`: berkas harian `riset/radar/YYYY-MM-DD.md` dari tugas terjadwal radar-riset-migancore (mulai 28 Sep).
 * - `riset`: folder `riset/YYYY-MM-DD-*`, judul dari baris `# ` pertama README/LIVING_LOG/LAPORAN.
 */
export function radarRisetDari(akar, batas = 8) {
  const dir = path.join(akar, 'riset');
  if (!fs.existsSync(dir)) return [];
  const judulDari = (p) => (fs.readFileSync(p, 'utf8').match(/^# (.+)$/m) || [])[1];
  const folder = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}-/.test(f) && fs.statSync(path.join(dir, f)).isDirectory()).map((f) => {
    const berkas = ['README.md', 'LIVING_LOG.md', 'LAPORAN.md'].map((x) => path.join(dir, f, x)).find((x) => fs.existsSync(x));
    return { jenis: 'riset', tanggal: f.slice(0, 10), folder: `riset/${f}`, judul: ringkas((berkas && judulDari(berkas)) || f.slice(11).replace(/-/g, ' '), 140) };
  });
  const dirRadar = path.join(dir, 'radar');
  const harian = fs.existsSync(dirRadar) ? fs.readdirSync(dirRadar).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).map((f) => (
    { jenis: 'radar', tanggal: f.slice(0, 10), folder: `riset/radar/${f}`, judul: ringkas(judulDari(path.join(dirRadar, f)) || `Radar ${f.slice(0, 10)}`, 140) })) : [];
  return [...harian, ...folder].sort((a, b) => b.tanggal.localeCompare(a.tanggal) || (a.jenis === 'radar' ? -1 : 1)).slice(0, batas);
}

/** Kalimat status kelahiran MAKSARA, DIRAKIT dari statusKelahiran() — bukan diketik. */
export function kalimatKelahiran(k) {
  if (!k) return 'Aturan A4-BARU tidak terbaca dari pra-daftarnya — status kelahiran tidak dapat ditampilkan.';
  const b = k.bobot.filter((x) => x.ada).map((x) => `${x.model} ${x.tingkat} (${f2(x.rata)} %, CI95 atas ${f2(x.ci95atas)}, n ${x.n})`);
  const s = k.sistem ? `sistem ${k.sistem.konfigurasi} ${k.sistem.tingkat} (${f2(k.sistem.rata)} %, CI95 atas ${f2(k.sistem.ci95atas)}, n ${k.sistem.n})` : 'sistem: belum ada hasil GERBANG-ON';
  return `A4-BARU terpasang. Bobot: ${b.join(' · ')}. ${s}. Dua pertanyaan, tidak disatukan.`;
}

export function bangkitkan() {
  // Pra-daftar & vonis
  const praDaftar = fs.readdirSync(path.join(AKAR, 'flywheel')).filter((f) => /^PRA-DAFTAR-.*\.json$/.test(f)).map((f) => {
    const j = JSON.parse(baca(`flywheel/${f}`));
    const v = j.vonis || {};
    const hasil = typeof v.hasil === 'string' ? v.hasil : JSON.stringify(v.hasil ?? '');
    return { id: f.replace(/^PRA-DAFTAR-|\.json$/g, ''), judul: j.judul || j.nama || j.episode || null, keadaan: v.keadaan || null, tanggal: v.tanggal || null, dikunci: j.dikunci || null, hasil: ringkas(hasil) };
  });
  const vonis = (id) => praDaftar.find((p) => p.id === id);

  // Model berlaku
  const berlaku = JSON.parse(baca('models/BERLAKU.json'));

  // Tangga MENGARANG per model x kondisi (petak-jujur2, putaran sah, angka rangkuman tersimpan)
  const tangga = {};
  for (const f of fs.readdirSync(path.join(AKAR, 'eval')).filter((x) => x.startsWith('hasil-jujur2-') && x.endsWith('.json'))) {
    let j; try { j = JSON.parse(baca(`eval/${f}`)); } catch { continue; }
    if (!Array.isArray(j.baris) || j.petak !== 36 || (j.bank && j.bank !== 'petak-jujur2') || j.rangkuman?.sah !== true) continue;
    const kondisi = !j.gerbang && !j.retrieval ? 'polos' : `+sistem${j.gerbang ? ' gerbang' : ''}${j.retrieval ? ' retrieval' : ''}`;
    const k = `${j.model} · ${kondisi}`;
    (tangga[k] ??= []).push({ mengarang: j.rangkuman.metrik.MENGARANG_pct, overRefusal: j.rangkuman.metrik.over_refusal_pct, fakta: j.rangkuman.metrik.fakta_akurasi });
  }
  const rata = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const tanggaRingkas = Object.entries(tangga).map(([k, v]) => ({ model: k, putaranSah: v.length, mengarangRata: +rata(v.map((x) => x.mengarang)).toFixed(1), overRefusalRata: +rata(v.map((x) => x.overRefusal ?? 0)).toFixed(1), faktaRata: +rata(v.map((x) => x.fakta ?? 0)).toFixed(2) })).sort((a, b) => a.mengarangRata - b.mengarangRata);

  // Temuan & hukum (judul saja)
  // 23 Sep: pola salinan `^- \*\*(F-\d+) — ` memungut 251 dari 287 entri (F-049b, F-056/057/058 terlewat).
  // Jumlah = id unik dari pengurai kanonik kumpulkanTemuan(), bukan jumlah baris yang kebetulan cocok.
  const entriTemuan = kumpulkanTemuan(baca('docs/jarvis/FINDINGS_LOG.md'));
  const temuan = entriTemuan.map((e) => ({ id: e.kode, judul: ringkas(e.judul, 140) }));
  const jumlahTemuan = new Set(entriTemuan.flatMap((e) => e.ids)).size;
  // 23 Sep: pola lama `(.{0,120})$` diam-diam MELEWATKAN hukum berjudul > 120 karakter (C62), dan pola
  // `^## (C\d+) - ` melewatkan hukum ber-em-dash (C22, C30, C31) — dunia menulis 31, sumbernya 35.
  // Sekarang: pengurai kanonik, keluarga C saja (keluarga A = dial latih, bukan hukum).
  const hukum = kumpulkanHukum(baca('PETA-DIAL-LATIH.md')).filter((h) => /^C/.test(h.kode)).map((h) => ({ id: h.kode, judul: ringkas(h.judul, 120) }));
  // Bentuknya { versi, tujuan, aturan[], cacat[] } — yang dihitung adalah `cacat`.
  // 18 Sep: versi pertama menghitung Object.keys() dan mencetak "4 kelas cacat".
  const cacat = JSON.parse(baca('eval/REGISTER-CACAT.json'));
  const daftarCacat = Array.isArray(cacat) ? cacat : Array.isArray(cacat.cacat) ? cacat.cacat : Array.isArray(cacat.kelas) ? cacat.kelas : [];
  if (!daftarCacat.length) throw new Error('REGISTER-CACAT.json: daftar cacat tidak ditemukan — periksa bentuk berkasnya');
  const cacatDijaga = daftarCacat.filter((c) => c && (c.penjaga || c.dijaga || c.guard)).length;

  // Backlog: baris tabel berkode di doc 96
  const backlog = [...baca('docs/jarvis/96_BACKLOG_MENUJU_MAKSARA.md').matchAll(/^\| \*\*([A-Z]+\d*[a-z-]*[A-Z0-9-]*'?)\*\* \| ([^|]{0,120})\|([^|]{0,120})\|([^|]{0,160})\|/gm)].map((m) => ({ kode: m[1], apa: m[2].trim(), tujuan: m[3].trim(), status: m[4].trim() }));

  // Status kelahiran MAKSARA — perhitungan yang SAMA dengan `migan status` / eval/ambang-bibit.mjs
  const k = statusKelahiran(AKAR);
  const kelahiran = k ? {
    sumber: k.sumber,
    vonisA4: vonis('A4-BARU')?.hasil ?? null,
    aturan: { lantaiBibit: k.aturan.lantai, sasaranLahir: k.aturan.sasaran },
    bobot: k.bobot.filter((b) => b.ada).map((b) => ({ model: b.model, rata: +b.rata.toFixed(2), ci95atas: +b.ci95atas.toFixed(2), n: b.n, tingkat: b.tingkat })),
    sistem: k.sistem ? {
      konfigurasi: k.sistem.konfigurasi, berkas: k.sistem.berkas, rata: +k.sistem.rata.toFixed(2), ci95atas: +k.sistem.ci95atas.toFixed(2), n: k.sistem.n,
      tingkat: k.sistem.tingkat, polosPembanding: +k.sistem.polosPembanding.toFixed(2), jarakKeLahirPp: +(k.sistem.rata - k.aturan.sasaran.rataMaks).toFixed(2),
    } : null,
    aturanTampil: 'Bobot dan sistem yang dilayankan adalah dua pertanyaan — tidak pernah disatukan. Tidak ada persen kelahiran.',
  } : null;

  // Kriteria kelahiran BERLAKU sejak 28 Sep: Gerbang-S1. A4-BARU (bobot generatif) ditampilkan sebagai sejarah.
  const kS1 = statusKelahiranS1(AKAR);
  const kelahiranUtama = { kriteria: 'gerbang-s1', s1: kS1, ...(kelahiran || {}) };
  const sorotan = { A4: kalimatKelahiran(k), KELAHIRAN: kS1 ? `MAKSARA ${kS1.tingkat} — lahir bila Gerbang-S1 MENANG (vonis ${kS1.vonis.keadaan}; tenggat ${kS1.tenggat}, ${kS1.hariTersisa} hari). Kriteria lama A4-BARU: sejarah.` : 'Pra-daftar Gerbang-S1 tidak terbaca — status kelahiran tidak dapat ditampilkan.' };
  for (const [kunci, id] of [['E2', 'E2-KEJUJURAN-NPC'], ['A3', 'A3-JANGKAR'], ['HRAGU', 'H-RAGU']]) {
    const v = vonis(id);
    sorotan[kunci] = v ? `${v.hasil}` : `pra-daftar ${id} tidak ditemukan`;
  }
  const sumberSorotan = { KELAHIRAN: kS1?.sumber ?? null, A4: k?.sumber ?? null, E2: 'flywheel/PRA-DAFTAR-E2-KEJUJURAN-NPC.json', A3: 'flywheel/PRA-DAFTAR-A3-JANGKAR.json', HRAGU: 'flywheel/PRA-DAFTAR-H-RAGU.json' };

  // Arah (27 Sep, permintaan Fahmi agar arah sesi terlihat jelas). Kompas, eksperimen aktif,
  // jangan-diulang, dan radar — semuanya dirakit dari sumbernya (doc 111, pra-daftar aktif, ledger §3, riset/).
  const doc111 = baca('docs/jarvis/111_TUTUP_ATAU_BELOK.md');
  const s1 = JSON.parse(baca('flywheel/PRA-DAFTAR-GERBANG-S1.json'));
  const arah = {
    sumber: ['docs/jarvis/111_TUTUP_ATAU_BELOK.md', 'docs/jarvis/103_ALIGNMENT_ARAH_ADO.md', 'flywheel/PRA-DAFTAR-GERBANG-S1.json', 'docs/jarvis/EXPERIMENT_LEDGER.md', 'riset/'],
    status: (doc111.match(/^> \*\*Status: (.+?)\*\*/m) || [])[1] || null,
    tenggat: (String(s1.syaratMati || '').match(/\d{4}-\d{2}-\d{2}/) || [])[0] || null,
    syaratMati: ringkas(s1.syaratMati, 300),
    eksperimenAktif: {
      id: s1.episode, judul: s1.judul, status: ringkas(s1.status, 200), dikunci: s1.dikunci === true,
      pertanyaan: ringkas(s1.pertanyaan?.Q_GANTI, 320),
      sisaSebelumKunci: (s1.belumDitetapkan_sebelumKunci || []).map((x) => ringkas(x, 220)),
      dariFahmi: (s1.yangDibutuhkanDariFahmi || []).map((x) => ringkas(x, 240)),
      ramalan: s1.ramalan_DINILAI_NANTI?.olehSaya || null,
      vonis: ringkas(s1.vonis?.hasil, 200),
    },
    janganDiulang: janganDiulangDari(baca('docs/jarvis/EXPERIMENT_LEDGER.md')),
    radar: radarRisetDari(AKAR),
  };

  return {
    _dibangkitkan: new Date().toISOString(),
    _commit: git('rev-parse', '--short', 'HEAD'),
    _sumber: 'studio/sumber-kebenaran.json',
    _catatan: 'Angka nyata, dirakit dari sumbernya saat dibangkitkan. Angka lintas instrumen tidak boleh dibandingkan tanpa label.',
    modelBerlaku: { tag: berlaku.model, sejak: berlaku.sejak, dilarangPromosi: Object.keys(berlaku.TIDAK_BOLEH_DIPROMOSIKAN || {}) },
    praDaftar,
    ringkasVonis: praDaftar.reduce((a, p) => ((a[p.keadaan || 'tanpa'] = (a[p.keadaan || 'tanpa'] || 0) + 1), a), {}),
    tanggaMengarang_petakJujur2: tanggaRingkas,
    kelahiran: kelahiranUtama,
    sorotan,
    sumberSorotan,
    arah,
    temuan: { jumlah: jumlahTemuan, entri: temuan.length, terbaru: temuan.slice(-12) },
    hukum: { jumlah: hukum.length, terbaru: hukum.slice(-12) },
    registerCacat: { jumlahKelas: daftarCacat.length, dijaga: cacatDijaga },
    backlog: backlog.slice(0, 30),
    sensus: {
      sumber: 'docs/jarvis/99_SENSUS_DATA_MIGANCORE.md',
      lokasi: ['laptop', 'GitHub', 'VPS-2', 'Bmax'],
      salinanTunggal: salinanTunggalDari(baca('docs/jarvis/99_SENSUS_DATA_MIGANCORE.md')),
    },
    mesin: [
      { nama: 'Laptop', peran: 'kerja Fahmi · repo kanonik · server Studio', catatan: 'bukan mesin ukur' },
      { nama: 'Bmax (MIGAN)', peran: 'mesin ukur Ollama CPU · gudang model/adapter/dataset' },
      { nama: 'VPS-2', peran: 'server hidup banyak proyek · Ollama cadangan' },
    ],
  };
}

function uji() {
  let gagal = 0;
  const cek = (nama, ok, info = '') => { console.log(`${ok ? '✓' : '✗'} ${nama}${ok ? '' : `  ← ${info}`}`); if (!ok) gagal++; };
  const d = bangkitkan();
  const k = statusKelahiran(AKAR);
  cek('status kelahiran terbaca dari A4-BARU', !!d.kelahiran && d.kelahiran.sumber === 'flywheel/PRA-DAFTAR-A4-BARU.json');
  const kS1 = statusKelahiranS1(AKAR);
  cek('kriteria kelahiran BERLAKU = Gerbang-S1, tingkat = statusKelahiranS1() (satu perhitungan)', d.kelahiran?.kriteria === 'gerbang-s1' && kS1 && d.kelahiran.s1.tingkat === kS1.tingkat && /^MAKSARA (EMBRIO|LAHIR|GUGUR)/.test(d.sorotan.KELAHIRAN));
  cek('tingkat bobot di dunia = tingkat dari statusKelahiran() (satu perhitungan)', k && d.kelahiran.bobot.every((b) => k.bobot.find((x) => x.model === b.model)?.tingkat === b.tingkat));
  cek('tingkat sistem di dunia = statusKelahiran()', !k?.sistem || d.kelahiran.sistem.tingkat === k.sistem.tingkat);
  cek('sorotan A4 tidak lagi mengklaim "belum terdefinisi" saat A4-BARU terpasang', !/belum terdefinisi/i.test(d.sorotan.A4));
  cek('tidak ada medan "belumDitemukan" yang diketik', !('belumDitemukan' in d.sensus) && !('modelMiganCoreDiBmax' in d.sensus));
  cek('salinan tunggal dibaca dari doc 99 (≥ 1 baris, semua berlokasi)', d.sensus.salinanTunggal.length > 0 && d.sensus.salinanTunggal.every((x) => x.includes(' — ')));
  cek('29 adapter (2 salinan menurut doc 99) TIDAK tercantum sebagai salinan tunggal', !d.sensus.salinanTunggal.some((x) => /29 adapter/i.test(x)));
  cek('sorotan E2/A3/HRAGU = vonis pra-daftarnya', ['E2-KEJUJURAN-NPC', 'A3-JANGKAR', 'H-RAGU'].every((id, i) => d.sorotan[['E2', 'A3', 'HRAGU'][i]] === d.praDaftar.find((p) => p.id === id)?.hasil));
  cek('hukum C62 ikut terbaca', d.hukum.terbaru.some((h) => h.id === 'C62'));
  const kanonik = kumpulkanHukum(baca('PETA-DIAL-LATIH.md')).filter((h) => /^C/.test(h.kode)).length;
  cek('jumlah hukum di dunia = pengurai kanonik kumpulkanHukum() (bukan pola salinan)', d.hukum.jumlah === kanonik, `${d.hukum.jumlah} vs ${kanonik}`);
  const barisF = (baca('docs/jarvis/FINDINGS_LOG.md').match(/^- \*\*F-\d+/gm) || []).length;
  cek('setiap entri F terbaca (F-049b, F-056/057/058 tidak terlewat)', d.temuan.entri === barisF, `${d.temuan.entri} vs ${barisF}`);
  const contoh = kumpulkanHukum('## C22 — Rasio satu himpunan\nisi\n## C30 — Kata kunci\nisi\n### C49 — ADENDUM\nisi\n## A20 - Zona emas\n');
  cek('hukum ber-em-dash (C22, C30) terbaca; adendum ### dan keluarga A tidak dihitung sebagai hukum C', contoh.filter((h) => /^C/.test(h.kode)).map((h) => h.kode).join(',') === 'C22,C30');
  const md = '| Artefak | Lokasi | Salinan | Risiko |\n|---|---|---:|---|\n| **A** `x` | Bmax | **1** | r |\n| B | laptop · Bmax | 2 | — |\n\nteks';
  cek('pengurai tabel: hanya baris bersalinan 1, markdown dibersihkan', JSON.stringify(salinanTunggalDari(md)) === JSON.stringify(['A x — Bmax']));
  cek('arah: status dibaca dari doc 111 (bukan diketik)', !!d.arah.status && baca('docs/jarvis/111_TUTUP_ATAU_BELOK.md').includes(d.arah.status));
  cek('arah: tenggat = tanggal di syaratMati pra-daftar aktif', !!d.arah.tenggat && JSON.parse(baca('flywheel/PRA-DAFTAR-GERBANG-S1.json')).syaratMati.includes(d.arah.tenggat));
  const ledger = baca('docs/jarvis/EXPERIMENT_LEDGER.md'), bag3 = ledger.slice(ledger.search(/^## 3\. /m), ledger.search(/^## 4\. /m));
  cek('arah: jumlah jangan-diulang = jumlah butir "- **" di ledger §3', d.arah.janganDiulang.length === (bag3.match(/^- \*\*/gm) || []).length, `${d.arah.janganDiulang.length}`);
  const cth = janganDiulangDari('# L\n## 3. Jangan\n- **A lama** satu\nteks\n- **B baru** dua\n## 4. Lain\n- **C** bukan\n');
  cek('pengurai jangan-diulang: hanya §3, terbaru dulu, judul tebal terpisah dari isi', JSON.stringify(cth.map((x) => x.judul)) === JSON.stringify(['B baru', 'A lama']) && cth[0].isi === 'dua');
  cek('arah: radar hanya folder riset bertanggal atau riset/radar/YYYY-MM-DD.md, terbaru dulu', d.arah.radar.every((r, i, a) => (/^riset\/\d{4}-\d{2}-\d{2}-/.test(r.folder) || /^riset\/radar\/\d{4}-\d{2}-\d{2}\.md$/.test(r.folder)) && (i === 0 || a[i - 1].tanggal >= r.tanggal)));
  console.log(gagal ? `\n${gagal} uji GAGAL` : '\nsemua uji lulus');
  return gagal ? 1 : 0;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (LANGSUNG) {
  const arg = process.argv.slice(2);
  if (arg.includes('--uji')) process.exit(uji());
  if (!arg.length) { console.error('pakai: node studio/alat/bangkitkan-data-nyata.mjs <keluaran.json> [<keluaran-2.json> …] | --uji'); process.exit(2); }
  const data = bangkitkan();
  for (const keluar of arg) fs.writeFileSync(keluar, JSON.stringify(data, null, 2) + '\n');
  console.log(`data nyata: ${data.praDaftar.length} pra-daftar · ${data.tanggaMengarang_petakJujur2.length} baris tangga · ${data.temuan.jumlah} temuan · ${data.hukum.jumlah} hukum · ${data.backlog.length} backlog · salinan tunggal ${data.sensus.salinanTunggal.length} → ${arg.join(', ')}`);
}
