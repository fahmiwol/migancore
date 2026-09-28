#!/usr/bin/env node
/**
 * migan.mjs — pintu masuk tunggal MiganCore (lapisan 4, lihat ARSITEKTUR.md).
 *
 * Berkas ini TIDAK BOLEH berisi logika pengukuran. Tugasnya cuma tiga:
 *   1. memanggil alat yang sudah teruji di eval/ dan flywheel/,
 *   2. memeriksa SYARAT sebelum menjalankan (menolak lebih baik daripada
 *      menjalankan langkah di atas fondasi yang belum lulus),
 *   3. memberi tahu langkah BERIKUTNYA — supaya alur yang mengingatkan orang,
 *      bukan orang yang harus mengingat alur.
 *
 * Pakai: node migan.mjs <perintah> [argumen]
 *        node migan.mjs                 (daftar perintah)
 *        node migan.mjs --uji-instrumen
 */
'use strict';

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AKAR = path.dirname(fileURLToPath(import.meta.url));
const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', B = '\x1b[36m', A = '\x1b[2m', R = '\x1b[0m';

const ada = (p) => fs.existsSync(path.join(AKAR, p));
const bacaJSON = (p) => { try { return JSON.parse(fs.readFileSync(path.join(AKAR, p), 'utf8')); } catch { return null; } };
const sidik = (p) => { try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(AKAR, p))).digest('hex').slice(0, 16); } catch { return null; } };

function jalan(skrip, args = [], opsi = {}) {
  const r = spawnSync(process.execPath, [path.join(AKAR, skrip), ...args],
    { stdio: opsi.diam ? 'pipe' : 'inherit', encoding: 'utf8', timeout: opsi.batas || 1800000 });
  // 28 Sep (F-293): uji yang dibunuh batas waktu dulu tampil sebagai kegagalan biasa, dan sisa berkasnya menyalakan penjaga
  // lain ("uji yatim"). Sebutkan habis-waktu secara tersurat supaya tersangka pertamanya instrumen, bukan kode (C56).
  const habis = r.error?.code === 'ETIMEDOUT' ? `\n✗ HABIS WAKTU: dihentikan sesudah ${Math.round((opsi.batas || 1800000) / 1000)} dtk (batas jalan), bukan hasil uji.` : '';
  return { kode: r.status ?? 1, keluaran: (r.stdout || '') + (r.stderr || '') + habis };
}
// Uji pelari SB1 sesudah vonis (26 Sep). Satu uji di eval/ukur-jujur2-seleksi.mjs membaca keadaan HIDUP pra-daftar SB1 dan
// mengharapkan "belum bervonis → boleh". Berkas itu dipatok kunci D1 (sidikWajib), jadi ujinya tidak boleh disunting.
// Sesudah vonis, perilaku yang benar justru MENOLAK (F-278). Penjaga ini menerima tepat SATU kegagalan itu, lengkap dengan
// pesan penolakan F-278, dan hanya bila pra-daftar SB1 sudah bervonis. Ke-39 uji lainnya tetap wajib lulus.
function ujiSeleksiSb1() {
  const r = jalan('eval/ukur-jujur2-seleksi.mjs', ['--uji'], { diam: true });
  if (r.kode === 0) return r;
  let bervonis = false;
  try { bervonis = JSON.parse(fs.readFileSync(path.join(AKAR, 'flywheel', 'PRA-DAFTAR-SB1-SELEKSI-BASE.json'), 'utf8')).vonis?.keadaan !== 'belum'; } catch { /* tak terbaca = belum */ }
  const bersih = r.keluaran.replace(/\x1b\[[0-9;]*m/g, '');
  const gagal = bersih.split('\n').filter((l) => l.startsWith('✗'));
  const hanyaPenolakanF278 = gagal.length === 1 && gagal[0].startsWith('✗ bolehDipakai: pra-daftar SB1 dikunci, belum bervonis')
    && gagal[0].includes('sudah bervonis — vonis final tidak dihitung ulang (F-278)') && /ukur-jujur2-seleksi: 1 gagal dari \d+/.test(bersih);
  return bervonis && hanyaPenolakanF278 ? { kode: 0, keluaran: r.keluaran } : r;
}
function jalanPy(skrip, args = [], opsi = {}) {
  const r = spawnSync('python', [path.join(AKAR, skrip), ...args],
    { stdio: opsi.diam ? 'pipe' : 'inherit', encoding: 'utf8', timeout: opsi.batas || 5400000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  return { kode: r.status ?? 1, keluaran: (r.stdout || '') + (r.stderr || '') };
}

// ── SYARAT: diperiksa SEBELUM langkah, bukan sesudah gagal ────────────────
export const SYARAT = {
  // 18 Sep 2026: dulu alamat ini TETAP 127.0.0.1 — jadi lencana "ollama: hidup" memeriksa LAPTOP,
  // padahal doktrin proyek melarang mengukur di laptop dan mesin ukurnya Bmax. Ollama laptop bahkan
  // menyala otomatis untuk jembatan GPU ke server, sehingga lencana selalu hijau di mesin yang salah
  // (kelas F-125: lencana benar, runtime salah). Sekarang alamatnya dari OLLAMA_HOST, bawaan Bmax,
  // dan mesin yang menjawab ikut dicetak supaya tidak bisa tertukar diam-diam.
  mesinUkur: () => {
    const h = (process.env.OLLAMA_HOST || 'http://measure-host.local:11434').trim().replace(/\/+$/, '');
    return /^https?:\/\//.test(h) ? h : `http://${h}`;
  },
  ollamaHidup: async () => {
    const url = SYARAT.mesinUkur();
    const lokal = /(^|\/\/)(127\.0\.0\.1|localhost|::1)(:|$)/.test(url);
    try {
      const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) return { ok: false, host: url, lokal, pesan: `Ollama di ${url} menjawab tapi tidak sehat.` };
      return { ok: true, host: url, lokal, pesan: lokal ? 'PERINGATAN: mesin ukur menunjuk LAPTOP, bukan Bmax.' : undefined };
    } catch {
      return { ok: false, host: url, lokal, pesan: `Ollama tidak menjawab di ${url} — nyalakan Bmax atau setel OLLAMA_HOST.` };
    }
  },
  modelAda: async (nama) => {
    try {
      const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      const daftar = (j.models || []).map((m) => m.name);
      return daftar.includes(nama)
        ? { ok: true }
        : { ok: false, pesan: `Model "${nama}" tidak ada. Yang ada: ${daftar.join(', ') || '(kosong)'}` };
    } catch {
      return { ok: false, pesan: 'Ollama tidak menjawab.' };
    }
  },
  // 28 Agu: ketiga pemeriksa di bawah dulunya MEMATOK v13 sementara peluncur
  // menerima --versi. Akibatnya pintu dan peluncur memeriksa DUA dataset yang
  // berbeda: kontrak v14 bilang SIAP, pintu menolak karena mencari cluster di
  // v13. Pintu yang memeriksa berkas lain daripada yang dijalankan bukan penjaga
  // — ia cuma penghalang yang kebetulan berbunyi. Versi kini mengalir dari SATU
  // tempat (argumen `migan latih`) ke pintu, kontrak, dan peluncur sekaligus.
  clusterAda: (c, versi = 'v13') => ada(`flywheel/dataset/${versi}/cluster-${c}.jsonl`)
    ? { ok: true }
    : { ok: false, pesan: `flywheel/dataset/${versi}/cluster-${c}.jsonl tidak ada. Jalankan: migan gerbang semua` },
  praDaftarCocok: (c, versi = 'v13', praBerkas = null) => {
    // Berkas pra-daftar boleh DITUNJUK: versi DATA dan versi HIPOTESIS adalah dua
    // sumbu berbeda (lihat catatan --pra di flywheel/kontrak-latih.mjs).
    const rel = praBerkas || `flywheel/PRA-DAFTAR-${versi.toUpperCase()}.json`;
    const pra = bacaJSON(rel);
    if (!pra) return { ok: false, pesan: `${rel} tidak ada.` };
    const s = sidik(`flywheel/dataset/${versi}/cluster-${c}.jsonl`);
    return pra.sidikCluster?.[c] === s
      ? { ok: true }
      : { ok: false, pesan: `Pra-daftar KEDALUWARSA untuk ${c} (${rel}${pra.nama ? `, ${pra.nama}` : ''}): dikunci ${pra.sidikCluster?.[c]}, sekarang ${s}. Data berubah sesudah ambang dikunci — hasil apa pun tidak bisa ditafsirkan.` };
  },
  kontrakSiap: (c, versi = 'v13', praBerkas = null, resepBerkas = null) => {
    // 23 Agu: kontrak masukan (sidik semua masukan, bentuk data, resep+pin,
    // kunci soal dihitung ulang, petak tahan tak bocor, paritas prompt
    // dideklarasikan). TAHAN = GPU tidak disewa.
    const r = jalan('flywheel/kontrak-latih.mjs', ['manifest', c, '--versi', versi,
      ...(praBerkas ? ['--pra', praBerkas] : []), ...(resepBerkas ? ['--resep', resepBerkas] : [])], { diam: true });
    return r.kode === 0 ? { ok: true }
      : { ok: false, pesan: `kontrak masukan TAHAN untuk ${c}:\n${r.keluaran.trim().split('\n').filter((x) => /WAJIB|TAHAN/.test(x)).join('\n')}` };
  },
  alatSehat: () => {
    const r = jalan('eval/periksa-alat.mjs', [], { diam: true });
    return r.kode === 0 ? { ok: true } : { ok: false, pesan: 'Ada alat yang tidak sehat. Jalankan: migan periksa' };
  },
};

async function pastikan(daftar) {
  for (const s of daftar) {
    const h = await s();
    if (!h.ok) {
      console.error(`\n${M}SYARAT TIDAK TERPENUHI${R} — ${h.pesan}\n`);
      process.exit(1);
    }
  }
}

// ── PERINTAH ─────────────────────────────────────────────────────────────
const PERINTAH = {
  status: {
    guna: 'di mana posisi kita sekarang',
    async jalankan() {
      console.log(`\n${B}# Status MiganCore${R}\n`);
      const reg = bacaJSON('eval/REGISTER-CACAT.json');
      const kelas = Array.isArray(reg) ? reg : reg?.cacat || [];
      console.log(`  register cacat : ${kelas.length} kelas · ${kelas.filter((c) => c.status === 'dijaga').length} dijaga`);

      for (const c of ['hitung', 'nalar', 'gaya']) {
        const f = `flywheel/dataset/v13/cluster-${c}.jsonl`;
        if (!ada(f)) { console.log(`  cluster ${c.padEnd(7)}: ${A}belum ada${R}`); continue; }
        const n = fs.readFileSync(path.join(AKAR, f), 'utf8').trim().split('\n').filter(Boolean).length;
        const pra = bacaJSON('flywheel/PRA-DAFTAR-V13.json');
        const cocok = pra?.sidikCluster?.[c] === sidik(f);
        console.log(`  cluster ${c.padEnd(7)}: ${String(n).padStart(4)} baris · pra-daftar ${cocok ? H + 'cocok' + R : K + 'KEDALUWARSA' + R}`);
      }

      const ajarDir = 'flywheel/dataset/ajar';
      if (ada(ajarDir)) {
        const total = fs.readdirSync(path.join(AKAR, ajarDir))
          .filter((f) => f.endsWith('.jsonl'))
          .map((f) => ({ c: f.replace('.jsonl', ''), n: fs.readFileSync(path.join(AKAR, ajarDir, f), 'utf8').trim().split('\n').filter(Boolean).length }))
          .filter((x) => x.n > 0);
        console.log(`  data ajar baru : ${total.length ? total.map((x) => `${x.c} ${x.n}`).join(' · ') : A + 'kosong' + R}`);
      }

      for (const s of fs.readdirSync(path.join(AKAR, 'models')).filter((f) => f.startsWith('SANAD-'))) {
        const j = bacaJSON(`models/${s}`);
        const dhaif = (j?.rantai || []).filter((r) => r.status === 'dhaif').length;
        console.log(`  ${s.replace('SANAD-', 'sanad ').replace('.json', '').padEnd(15)}: ${dhaif ? K + dhaif + ' mata dhaif' + R : H + 'bersambung' + R}`);
      }

      const o = await SYARAT.ollamaHidup();
      console.log(`  ollama         : ${o.ok ? H + 'hidup' + R : M + 'mati' + R} ${A}di ${o.host}${R}${o.lokal ? ' ' + M + '(LAPTOP — bukan mesin ukur)' + R : ''}`);

      // VONIS BERLAKU, dibaca dari pra-daftar -- bukan dari prosa. Ditambahkan 30 Agu
      // sesudah cacat nyata: PRA-DAFTAR-V15.json berbunyi 'LULUS' selama sehari penuh
      // padahal vonis yang berlaku GAGAL, dan agen mana pun yang membacanya akan
      // mempromosikan 0.15-tool ke produksi. Dokumen bisa basi; yang dibaca program
      // dari berkas sumbernya tidak.
      console.log(`\n  ${A}vonis berlaku${R}`);
      for (const f of fs.readdirSync(path.join(AKAR, 'flywheel')).filter((x) => /^PRA-DAFTAR-.*[.]json$/.test(x))) {
        const j = bacaJSON(`flywheel/${f}`);
        const v = j?.vonis?.hasil;
        // 31 Agu: dulu `if (!v) continue` melewatkan berkas apa pun tanpa suara.
        // V16-JUJUR ditulis dengan kunci "VONIS"/"keputusan" dan LENYAP dari daftar
        // ini — cacat V15 yang persis sama, terulang satu langkah sesudah hukumnya
        // ditulis. Lewat-diam membuat vonis yang ADA tak terbedakan dari vonis yang
        // BELUM ada. Sekarang: berkas yang punya bentuk vonis tapi salah bentuk akan
        // berteriak; yang memang belum divonis tetap lewat tanpa berisik.
        if (!v) {
          if (Object.keys(j || {}).some((k) => /^vonis$/i.test(k))) {
            const nm = f.replace('PRA-DAFTAR-', '').replace('.json', '');
            console.log(`  ${nm.padEnd(14)}: ${M}VONIS SALAH BENTUK — butuh vonis.hasil (string)${R}`);
          }
          continue;
        }
        // TIGA keadaan, bukan dua. 1 Sep: V17-RLVR ditulis "BELUM DIVONIS" dan
        // tampil HIJAU — warna yang berarti LULUS — karena regex gagal tidak
        // cocok dan hijau adalah nilai bawaannya. Run yang tidak selesai
        // ditampilkan seperti run yang berhasil. Kelas yang sama dengan C41:
        // dua keadaan dipakai untuk tiga kenyataan, dan yang ketiga jatuh ke
        // sisi yang salah tanpa ada yang memutuskannya.
        // 10 Sep: warnanya dulu DITEBAK dengan mencocokkan kata di kalimat vonis,
        // dan tebakan itu salah di lima berkas sekaligus. Yang paling berbahaya:
        // L2B-RETRIEVAL berbunyi "GUGUR" tapi tampil HIJAU, karena "GUGUR" tidak
        // ada di daftar kata gagal — agen yang membacanya akan mengira L2b lulus,
        // cacat V15 dalam bentuk warna. Yang lain: "TIDAK BISA DIVONIS" hijau,
        // "TIDAK PERNAH DIJALANKAN" merah, "DITERIMA" merah (karena kalimatnya
        // menyebut GAGAL soal metrik lain), "BELUM DIJALANKAN" hijau.
        //
        // Menambal daftar katanya cuma akan menunda kejadian berikutnya. Vonis
        // sekarang MEMBAWA keadaannya sendiri (`vonis.keadaan`), empat nilai:
        // lulus · gagal · belum · netral (run selesai, vonis sah, tidak ada yang
        // diadopsi). Prosa untuk manusia, keadaan untuk program.
        //
        // Tebakan kata dipertahankan HANYA sebagai cadangan untuk berkas yang
        // belum punya `keadaan` — dan barisnya ditandai `?` supaya "ditebak"
        // tidak pernah tersamar jadi "dinyatakan". `eval/jaga-vonis.mjs`
        // memastikan cadangan itu tidak pernah benar-benar terpakai.
        const KEADAAN = { lulus: H, gagal: M, belum: K, netral: A };
        const dinyatakan = KEADAAN[j?.vonis?.keadaan] ? j.vonis.keadaan : null;
        const ditebak = /^\s*(BELUM|TIDAK SELESAI|MENUNGGU)/i.test(v) ? 'belum'
          : /GAGAL|GUGUR|TIDAK TERBUKTI|TIDAK BOLEH|DITOLAK/i.test(v) ? 'gagal'
            : /TIDAK MENANG|TIDAK BISA DI|DALAM DERAU|SEBAGIAN/i.test(v) ? 'netral' : 'lulus';
        const keadaan = dinyatakan || ditebak;
        const nama = f.replace('PRA-DAFTAR-', '').replace('.json', '');
        const cap = keadaan === 'netral' ? '· selesai, tidak ada yang diadopsi' : '';
        console.log(`  ${nama.padEnd(14)}:${dinyatakan ? ' ' : `${M}?${R}`}${KEADAAN[keadaan] + String(v).slice(0, 72) + R}${cap ? ` ${A}${cap}${R}` : ''}`);
      }
      // A4-BARU dipasang 23 Sep. Pra-daftarnya menuntut kedua ambang dicetak
      // BERDAMPINGAN — "supaya tidak ada yang mengutip setengahnya" — dan kedua
      // pertanyaannya dipisah, karena BOBOT dan SISTEM YANG DILAYANKAN bukan hal
      // yang sama dan pernah tercampur dalam satu kalimat saya sendiri.
      try {
        const { bacaA4 } = await import(pathToFileURL(path.join(AKAR, 'eval', 'ambang-bibit.mjs')).href);
        const a4 = bacaA4();
        if (a4) {
          console.log(`\n  ${A}ambang bibit (A4-BARU, dipilih Fahmi 21 Sep — bertingkat)${R}`);
          console.log(`  ${A}LANTAI_BIBIT  : MENGARANG <= ${a4.lantai.rataMaks} % · CI95 atas < ${a4.lantai.ci95atasMaks} %${R}`);
          console.log(`  ${A}SASARAN_LAHIR : MENGARANG <= ${a4.sasaran.rataMaks} % · CI95 atas < ${a4.sasaran.ci95atasMaks} %${R}`);
          console.log(`  ${A}keduanya: over-refusal <= ${a4.lantai.overMaks} % · fakta tidak turun > ${a4.faktaTurunMaksPp} pp · >= ${a4.putaranMin} putaran${R}`);
          console.log(`  ${A}rincian & vonis per konfigurasi: node eval/ambang-bibit.mjs${R}`);
        }
      } catch { /* ambang tidak boleh menjatuhkan status */ }
      console.log(`\n  ${A}berikutnya: migan periksa · migan ukur <model> · migan ajar${R}\n`);
      return 0;
    },
  },

  periksa: {
    guna: 'semua alat & repo sehat?',
    async jalankan() {
      console.log(`\n${B}# Periksa kesehatan${R}\n`);
      let gagal = 0;
      const daftar = [
        ['alat ukur (eval/*)', () => jalan('eval/periksa-alat.mjs', [], { diam: true })],
        ['pin pustaka', () => jalan('eval/periksa-pin.mjs', [], { diam: true })],
        ['repo', () => jalan('eval/jaga-repo.mjs', [], { diam: true })],
        // 28 Agu: dipasang di sini supaya utang C27 tidak bisa membusuk tanpa
        // terlihat. Pemeriksaan yang cuma dijalankan waktu seseorang ingat
        // menjalankannya bukan penjaga — ia catatan.
        ['modul bisa diimpor tanpa efek samping (C27)', () => jalan('eval/jaga-modul.mjs', [], { diam: true })],
        ['pencuriga pertentangan gold (Gate 3)', () => jalan('eval/jaga-pertentangan.mjs', ['--uji'], { diam: true })],
        ['kontrak latih (manifest/keluaran)', () => jalan('flywheel/kontrak-latih.mjs', ['--uji-instrumen'], { diam: true })],
        // Dua penjaga yang lahir 1 Sep dari kegagalan yang sudah dibayar:
        // sewa.py mengunci mesin sewa/awasi/matikan + pagar anggaran (saldo
        // habis dari $1,96 ke $0,00 tanpa satu pun peringatan), dan
        // jaga-pencemaran-kolam menahan kolam latih yang memuat soal ujian
        // (kolam RLVR ternyata 100% soal petak-40 — C42).
        ['mesin sewa GPU + pagar anggaran', () => jalanPy('flywheel/vast/uji_sewa.py', [], { diam: true, batas: 120000 })],
        ['pencemaran kolam latih (C42)', () => jalan('eval/jaga-pencemaran-kolam.mjs', ['--uji'], { diam: true })],
        // Majelis memegang kunci API. Ujinya memeriksa hal yang paling mahal
        // kalau salah: bahwa daftar penyedia tidak pernah membawa isi kunci, dan
        // bahwa gudang kunci ada DI LUAR repo.
        ['majelis (router model + kunci tak bocor)', () => jalan('majelis/majelis.mjs', ['--uji'], { diam: true })],
        // Tiga penjaga tolok ukur v2 (1 Sep). Petak ini akan DITERBITKAN —
        // cacat di petak terbit merugikan semua pemakainya, bukan cuma kami.
        ['bank soal petak-jujur2', () => jalan('eval/uji-petak-jujur2.mjs', [], { diam: true })],
        ['penilai instrumen-jujur2 (C43 lunas)', () => jalan('eval/uji-instrumen-jujur2.mjs', [], { diam: true })],
        ['pelari ukur-jujur2 (GALAT != NGARANG)', () => jalan('eval/ukur-jujur2.mjs', ['--uji'], { diam: true })],
        // 2 Sep: identitas terlatih gen-1 terkikis di 0.13/0.14/uji-jujur-1 karena
        // shield Day-77 menjaga di lapisan serving, bukan bobot. Gerbang di bobot.
        ['gerbang identitas polos (C44)', () => jalan('eval/uji-identitas.mjs', ['--uji'], { diam: true })],
        // 2 Sep: penilai model pendamping regex (C43) — parse ketat, GALAT != vonis,
        // kappa & sampel strata deterministik. Uji tanpa jaringan.
        ['verifikator model (C43, κ regex-vs-model)', () => jalan('eval/verifikator.mjs', ['--uji'], { diam: true })],
        // 2 Sep: pabrik soal — pola jebakan -> keluarga soal -> gerbang C42; ujinya
        // memastikan gerbang benar-benar melihat petak-jujur2 (bukan nol) dan
        // pola yang menjiplak soal ujian DITAHAN.
        ['pabrik soal (pola -> keluarga, lewat gerbang C42)', () => jalan('flywheel/pabrik-soal.mjs', ['--uji'], { diam: true })],
        // 2 Sep (doc 84): panel juri beda keluarga (seri = TERBELAH) + ujian masuk juri
        // (aturan dikunci sebelum dijalankan). Keduanya tanpa jaringan.
        ['panel juri (suara terbanyak, seri = TERBELAH)', () => jalan('eval/panel-juri.mjs', ['--uji'], { diam: true })],
        ['ujian masuk juri (doc 84 §3)', () => jalan('eval/ujian-masuk-juri.mjs', ['--uji'], { diam: true })],
        // 2 Sep: gerbang jebakan di serving (doc 85) — sumbu keterjawaban dari probe
        // terpisah, arahan dirutekan, fail-open saat probe galat. Uji tanpa jaringan.
        ['gerbang jebakan (doc 85, dua sumbu)', () => jalan('sistem/gerbang-jebakan.mjs', ['--uji'], { diam: true })],
        ['probe keterjawaban (A1, parser toleran)', () => jalan('eval/probe-keterjawaban.mjs', ['--uji'], { diam: true })],
        // 2 Sep: angka gerbang (A3/A3b/A3d/A3f, CI gabungan) dihitung ULANG dari berkas
        // mentah dan dibandingkan dengan klaim di pra-daftar/doc 85 — klaim ≠ berkas = GAGAL.
        ['audit klaim gerbang (angka = berkas mentah)', () => jalan('eval/audit-klaim-gerbang.mjs', [], { diam: true })],
        // 3 Sep: telemetri gerbang memisahkan pertanyaan UJI dari pertanyaan NYATA —
        // tanpa itu 7 baris harness terbaca "gerbang sempurna" padahal ia belum pernah
        // diuji pemakaian. `--periksa` menjaga gerbang tidak mati SENYAP (GALAT probe).
        ['audit telemetri gerbang (uji vs nyata, probe hidup)', () => jalan('eval/audit-telemetri-gerbang.mjs', ['--uji'], { diam: true })],
        // 3 Sep: pabrik soal internal (bahan latih A7) — entitas dibaca dari STRUKTUR
        // Buku Besar, bukan ditebak dari huruf tebal (tebakan memungut "Status"/"Tanggal").
        ['pabrik soal internal (entitas dari Buku Besar)', () => jalan('flywheel/pabrik-soal-internal.mjs', ['--uji'], { diam: true })],
        // 7 Sep: penyusun campuran latih — rasio rehearsal dikunci SEBELUM run, C42
        // dijalankan atas seluruh campuran, sidik SHA-256 melekat di manifes. Obat
        // langsung untuk Temuan A doc 86 (resep 0.14: 485 baris, nol rehearsal).
        ['campur latih (rasio dikunci, C42, sidik)', () => jalan('flywheel/campur-latih.mjs', ['--uji'], { diam: true })],
        ["pabrik abstain (jawaban spesifik, seimbang per jenis)", () => jalan("flywheel/pabrik-abstain.mjs", ["--uji"], { diam: true })],
        // 7 Sep: `identitas-polos.jsonl` dipakai berbulan-bulan tanpa satu pun
        // gerbang — namanya bukan `cluster-*` sehingga jalankan-gerbang-v13
        // tidak melihatnya. Isinya: 40 baris, 7 jawaban unik. Untuk sumbu yang
        // berstatus WAJIB LULUS. Sejak kini ia punya pabrik DAN penjaganya.
        ['pabrik identitas (vonis asli uji-identitas + keragaman)', () => jalan('flywheel/pabrik-identitas.mjs', ['--uji'], { diam: true })],
        ['gerbang regresi (5 sumbu, anggaran kerusakan)', () => jalan('eval/gerbang-regresi.mjs', ['--uji'], { diam: true })],
        // 7 Sep: tolok ukur frontier. Penjaganya bukan basa-basi — `gerbangPublik`
        // adalah satu-satunya yang berdiri antara petak PRIVAT dan penyedia pihak
        // ketiga, dan aturan itu sebelumnya cuma hidup di komentar (C47).
        ['ukur frontier (gerbang publik, kebutaan penilai 2 arah)', () => jalan('eval/ukur-jujur2-frontier.mjs', ['--uji'], { diam: true })],
        // Penutup rantai juri: gerbang menandai -> berkas ini menyiapkan bahan
        // -> panel memutuskan. Sebelumnya `perluJuri()` berkata "minta juri"
        // tanpa ada perintah yang menghasilkan bahannya.
        ['sengketa kebutaan (bahan untuk panel juri)', () => jalan('eval/sengketa-kebutaan.mjs', ['--uji'], { diam: true })],
        // doc 89 lahir 7 Sep dengan tujuh angka di tabelnya dan nol penjaga.
        // Pembaca acuan diperbaiki HARI ITU JUGA (0.14: 41,8 -> 50,0 %), jadi
        // celah antara dokumen dan berkas bukan bahaya teoretis.
        ['audit klaim frontier (doc 89 = berkas mentah)', () => jalan('eval/audit-klaim-frontier.mjs', ['--uji'], { diam: true })],
        // 7 Sep, sesudah Ollama dinyalakan: mengukur ulang model yang angkanya
        // dikunci pra-daftar aktif menggeser rata-rata DAN n, sehingga ambang
        // menang lepas dari acuan yang dipakai menghitungnya (C38).
        ['kunci acuan (tolak ukur ulang acuan terkunci)', () => jalan('eval/kunci-acuan.mjs', ['--uji'], { diam: true })],
        ['tanya majelis (satu soal sama ke semua kursi)', () => jalan('majelis/tanya-majelis.mjs', ['--uji'], { diam: true })],
        ['telusur kegagalan (kelaskan SEBAB, bukan hitung akibat)', () => jalan('eval/telusur-kegagalan.mjs', ['--uji'], { diam: true })],
        // 9 Sep (L2b): sebelum mengukur "model + retrieval", periksa dulu apakah
        // retrieval-nya menyentuh petak — dan ternyata 67 % potongan yang ditarik
        // adalah transkrip sesi kita sendiri, berisi kunci jawaban petak (C54).
        // Pengukur L2b memakai pembungkus & retrieval dari kanon.js yang SAMA
        // dengan server.js, jadi ia mengukur jalur produksi, bukan salinannya.
        ['liputan retrieval (jawaban ada di catatan? — sebelum bayar pengukuran)', () => jalan('eval/liputan-retrieval.mjs', ['--uji'], { diam: true })],
        ['ukur retrieval L2b (tiga lengan: bersih / plasebo / penuh)', () => jalan('eval/ukur-jujur2-retrieval.mjs', ['--uji'], { diam: true })],
        ['inventaris korpus (siapa memegang mikrofon, per tipe sumber)', () => jalan('eval/inventaris-korpus.mjs', ['--uji'], { diam: true })],
        // Ditulis SEBELUM angkanya ada, supaya ambangnya tidak bisa bergeser
        // sesudah hasilnya terlihat (C47). Ia juga menolak membandingkan lengan
        // yang membaca generasi korpus berbeda — indeks OMIGA dibangun ulang tiap
        // sesi berakhir, jadi itu bukan bahaya teoretis.
        ['vonis L2b (ambang pra-daftar dikodekan, bukan dibaca ulang)', () => jalan('eval/vonis-l2b.mjs', ['--uji'], { diam: true })],
        // 10 Sep, temuan sesi Galantara: korpus OMIGA memuat sebuah kunci Google
        // OAuth utuh di dokumen `type=session`. Berkas hasil menyimpan JAWABAN
        // MODEL dan ikut di-commit, jadi ada jalur nyata dari kunci di korpus ->
        // catatan yang disodorkan -> jawaban -> git. Ini menutup ujung terakhirnya.
        ['jaga rahasia (kredensial tidak ikut ter-commit)', () => jalan('eval/jaga-rahasia.mjs', ['--uji'], { diam: true })],
        // Persentase per kelas menyembunyikan perpindahan: sepuluh sembuh dan
        // sepuluh rusak terbaca sama dengan tidak terjadi apa-apa. L2b menuntut
        // jawaban "berapa dari SALAH-FAKTA acuan yang berubah, jadi apa" — dan
        // itu hanya terlihat kalau soalnya dilacak satu per satu.
        ['banding telusur (perpindahan kelas per soal, bukan persentase)', () => jalan('eval/banding-telusur.mjs', ['--uji'], { diam: true })],
        // H4 (10 Sep): kamus MENOLAK2 diperlebar. C38 mewajibkan JEMBATAN —
        // tanpa tabel konversi, angka lama dan baru berdampingan di dokumen yang
        // sama dan tidak ada yang tahu mana yang mana. Jembatan menilai ulang
        // jawaban TERSIMPAN, jadi ia nol GPU dan bisa diulang siapa saja.
        ['jembatan kamus H4 (angka lama <-> baru, jawaban sama)', () => jalan('eval/jembatan-kamus.mjs', ['--uji'], { diam: true })],
        // L3 ringkas (10 Sep): permukaan ukur untuk iterasi L2c, supaya petak 36
        // tidak dibaca lagi selama menyetel. Penjaganya menangkap dua cacat NYATA
        // saat dibangun: 6 tabrakan keluarga, dan kunci jawaban kata-umum
        // ('1000', 'kecil', 'batik') yang tidak bisa dibedakan dari derau korpus.
        ['petak bayangan (anti-tabrakan petak 36, bentuk sah)', () => jalan('eval/petak-bayangan.mjs', ['--uji'], { diam: true })],
        // Ditulis sebelum lengan pertama selesai (C47). Ujinya menangkap cacat
        // batas pembulatan: ambang 6,25 pp tidak selamat dari pembulatan 1
        // desimal (Math.round(-62.5) = -62), jadi selisih dibandingkan MENTAH
        // dan hanya dibulatkan untuk dicetak. Kelas yang sama dengan `beda()`.
        ['vonis L2c-P (pengaman karangan mengalahkan kemenangan)', () => jalan('eval/vonis-l2cp.mjs', ['--uji'], { diam: true })],
        // 10 Sep: gerbang kelahiran MAKSARA ternyata YATIM — ia dijangkarkan ke
        // petak-40, instrumen dengan 0 berkas hasil sejak 1 Sep, sementara 94
        // pengukuran sesudahnya semuanya di petak-jujur2. C47 + C38 sekaligus,
        // pada gerbang yang paling mahal salahnya.
        ['ambang bibit (gerbang MAKSARA di instrumen yang hidup)', () => jalan('eval/ambang-bibit.mjs', ['--uji'], { diam: true })],
        // 10 Sep, permintaan Fahmi untuk mencari di laptop, mesin ukur, server, atau git:
        // 29 adapter masih UTUH, enam di antaranya run MO-GRPO yang ringkasannya
        // belum pernah dibuka. Yang paling mahal dari sebuah eksperimen adalah
        // menjalankannya; kalau ringkasannya tidak dibaca, ongkos itu terbuang
        // untuk kedua kalinya. Penjaga ini membuat 'terkubur di tarball' tidak
        // bisa terjadi lagi tanpa ketahuan.
        ['panen adapter (29 adapter, 6 run GRPO, diagnostik ragam)', () => jalan('flywheel/panen-adapter.mjs', ['--uji'], { diam: true })],
        // Kekhawatiran Fahmi 10 Sep: 18 pra-daftar, 26 log run, 29 adapter,
        // tapi 4 SANAD. 'Khawatir kelewat, tumpang tindih, mengulang-ngulang.'
        // Lajur ini menyilangkan lima sumber bukti dan menandai LUBANG: hipotesis
        // menggantung, bobot yang latihannya dibayar tapi tak pernah diukur, dan
        // model terpakai tanpa rantai periwayatan.
        ['lajur latihan (silang 5 sumber, tandai yang terlewat)', () => jalan('flywheel/lajur-latihan.mjs', ['--uji'], { diam: true })],
        // 3 Sep, audit arsitektur: `mcp/` (lapisan serving) punya NOL uji mandiri —
        // 9 modul sistem punya 8, flywheel 24, eval 30, serving 0 — padahal ia diubah
        // tiga kali dalam sehari. Dua penjaga di bawah menutup lubang itu.
        // 10 Sep: base mentah qwen3:4b sudah 11 kali diukur dan 11 kali TIDAK
        // SAH. Pratinjau ini menguji tuas BATAS dengan 5 soal terkeras, bukan
        // 180. Aturannya harus RUANG SISA, bukan sekadar selesai — rancangan
        // pertamanya meramal laju galat dari data 120 dtk untuk putaran 300 dtk,
        // dan ujinya sendiri yang menolaknya. Uji itu yang dijaga di sini.
        ['pratinjau A3 (ruang sisa batas, bukan ramalan lintas-instrumen)', () => jalan('eval/pratinjau-a3.mjs', ['--uji'], { diam: true })],
        // 10 Sep: cacat V15 terulang KETIGA kalinya — enam pra-daftar sekaligus
        // menyimpan vonisnya di medan bertanggal (`vonis_9Sep`, `vonis_10Sep`,
        // `vonis_10Sep_adjudikasiTerlambat`) yang tidak dibaca `migan status`.
        // `status` sudah berteriak untuk medan bernama persis `vonis` yang salah
        // bentuk, tapi buta terhadap vonis yang bersembunyi di nama lain.
        // Dua penjaga: ujinya, dan pemindaian repo yang sebenarnya.
        ['jaga vonis (tidak ada vonis yang sunyi dari SSOT)', () => jalan('eval/jaga-vonis.mjs', ['--uji'], { diam: true })],
        ['pra-daftar: semua vonis terbaca migan status', () => jalan('eval/jaga-vonis.mjs', [], { diam: true })],
        // 15 Sep (F-233): vonis A3 berbunyi "1 dari 5" selama lima hari padahal
        // berkasnya 3/5 — jaga-vonis lulus terus karena ia memeriksa vonis
        // TERBACA, bukan MUTAKHIR. Putaran baru tanpa vonis baru = penjaga gagal.
        ['jaga vonis basi (klaim putaran vs berkas)', () => jalan('eval/jaga-vonis-basi.mjs', ['--uji'], { diam: true })],
        ['vonis A3 mutakhir terhadap berkas hasil', () => jalan('eval/jaga-vonis-basi.mjs', [], { diam: true })],
        // 18 Sep: lencana "ollama: hidup" ternyata memeriksa 127.0.0.1 — LAPTOP — selama ini,
        // dan Ollama laptop memang menyala untuk jembatan GPU ke server. Jadi syarat yang
        // menjaga pengukuran bisa hijau di mesin yang salah. Penjaga ini memeriksa KONFIGURASI
        // mesin ukur (bukan keterjangkauannya), supaya tidak gagal saat Bmax memang dimatikan.
        ['mesin ukur bukan laptop (OLLAMA_HOST)', () => {
          const url = SYARAT.mesinUkur();
          const lokal = /(^|\/\/)(127\.0\.0\.1|localhost|::1)(:|$)/.test(url);
          return {
            kode: lokal ? 1 : 0,
            keluaran: lokal
              ? `mesin ukur menunjuk ${url} — doktrin: ukur di Bmax, bukan laptop. Setel OLLAMA_HOST.`
              : `mesin ukur: ${url}`,
          };
        }],
        // 21 Sep, M18: alat yang menampilkan yang BELUM tercatat. Sengaja TIDAK menggagalkan
        // periksa karena menemukan sesuatu — menemukan memang tugasnya. Yang digagalkan hanya
        // kalau alatnya sendiri tidak bisa membaca sumbernya. Lima kerugian nyata 2026 semuanya
        // ketahuan karena KEBETULAN; ini yang mengubahnya jadi pemeriksaan.
        ['penjaga jejak bisa membaca sumbernya (M18)', () => jalan('flywheel/penjaga-jejak.mjs', ['--uji'], { diam: true })],
        // E1 (doc 105): harness latensi NPC. Ambangnya dibaca dari pra-daftar yang
        // terkunci; uji menuntut nilai PERSIS (jebakan "p50"/"p95", saudara "CI95").
        ['E1 latensi NPC: harness + ambang terkunci', () => jalan('eval/e1-latensi-npc.mjs', ['--uji'], { diam: true })],
        // E1b (F-265): pemilah giliran menurut apakah ARAHAN gerbang mengubah pesan sistem.
        // Membandingkan STRING arahan, bukan nama tindakan — klarifikasi dua label = satu string.
        ['E1b analisis awalan: kelas sistem-sama/berubah', () => jalan('eval/analisis-e1b-awalan.mjs', ['--uji'], { diam: true })],
        // E2' (doc 105 §11): instrumen tanpa penilai-model. Validasi buta pertama GAGAL
        // (recall 0,667, eval/validasi-entitas-karangan-e1b.json); tiga sebabnya kini dijaga.
        ['E2 entitas karangan: angka/nama/waktu di luar sumber', () => jalan('eval/entitas-karangan.mjs', ['--uji'], { diam: true })],
        ['E2 penilai: cakupan, menolak, ambang di batasnya', () => jalan('eval/nilai-e2-npc.mjs', ['--uji'], { diam: true })],
        ['E2 harness: satu dial (batas), soal sama, awalan stabil', () => jalan('eval/e2-kejujuran-npc.mjs', ['--uji'], { diam: true })],
        ['E2 pipa vonis: sampel buta → validasi → vonis (menolak tanpa validasi)', () => jalan('eval/vonis-e2-npc.mjs', ['--uji'], { diam: true })],
        // E2A (lengan A doc 107): satu dial = model. Uji menuntut pengganti mengubah HANYA medan `model`,
        // kategori Q_A2 saling lepas, dan vonis menolak tanpa validasi buta DUA pelabel (uji mutasi 23 Sep: 3/3 tertangkap).
        ['E2A lengan A: satu dial (model), vonis butuh dua pelabel', () => jalan('eval/e2a-bobot-atau-paragraf.mjs', ['--uji'], { diam: true })],
        ['E2A2: validasi berstrata per sel & per model, vonis hanya bila dikunci + dua pelabel lulus', () => jalan('eval/e2a2-validasi-berstrata.mjs', ['--uji'], { diam: true })],
        // Mesin A (doc 108): otak NPC Galantara melayani lengan 'batas' E2' — hanya sah selama permintaannya
        // IDENTIK dengan yang diukur. Menangkap 3/3 mutasi sumber; tanpa repo Galantara di mesin ini → LEWAT.
        ['otak NPC Galantara = lengan batas E2\' (persona, paragraf, badan)', () => jalan('eval/paritas-otak-npc-galantara.mjs', ['--uji'], { diam: true })],
        // A3I (F-271): jangkar ulang pada base Instruct-2507. Uji menuntut sisipan opsi HANYA di lengan B,
        // badan S/M byte-identik dengan sejarah polos, dan berkas a3i-* tidak mencemari kolam polos (kelas F-252).
        ['A3I jangkar Instruct: tiga lengan, sisipan hanya di B, kolam tak tercemar', () => jalan('eval/ukur-jujur2-a3i.mjs', ['--uji'], { diam: true })],
        // SB1 (25 Sep, dikunci sesudah riset metode): seleksi base Q3 vs Qwen3.5-4B/9B. Uji menuntut think:false + top_p 0,8
        // hanya di Q4/Q9, badan Q3 byte-identik, CI per soal terklaster keluarga, uji tahan penilai (skor pesimistis),
        // status quo menang seri, dan kolam polos tak tercemar. 27/27 mutasi.
        // Sesudah vonis TETAP_Q3 (26 Sep): lihat ujiSeleksiSb1 — satu uji keadaan-hidup kini menolak (F-278), dan itu yang benar.
        ['SB1 seleksi base: sisipan think:false, aturan pilih, kolam tak tercemar', ujiSeleksiSb1],
        // D1 (doc 110, 25 Sep; v4.3 sesudah ENAM putaran tinjauan adversarial + gladi bersih): NPC spesialis merujuk rekan. Soal luar dinilai
        // dua juri-model buta-lengan atas SELURUH jawaban (sensus; A claude-opus-5-5 = vonis, B claude-sonnet-5 = keandalan dua arah +
        // selisih laju per lengan ≤ 5 pp + kepekaan RAPUH_JURI) karena detektor leksikal gagal ke dua arah (0/11 probe);
        // antar/tahu = instrumen leksikal divalidasi terhadap juri A berbobot m/p. Uji menuntut gerbang = pra-daftar, sampel
        // dibangkitkan ulang identik, penggabungan batch juri diperiksa, router terkunci, impor + instruksi + rubrik terpatok.
        // Pelari: badan M = E1 persis, B = + model + top_k/top_p/num_ctx saja. 135/135 mutasi; kanal juri tunggal cli (biner resmi); gladi bersih pipa pasca-run.
        ['D1 penilai: kelas RUJUK, SJ-NPC, router terkunci, validasi berstrata', () => jalan('eval/nilai-d1.mjs', ['--uji'], { diam: true })],
        ['D1 pelari: rotasi beban, persona + batas E2\', badan M↔B satu dial', () => jalan('eval/d1-npc-spesialis.mjs', ['--uji'], { diam: true })],
        // E5-pasang (Mesin A): uji penerimaan otak NPC di jalur hidup. Ambang latensi DIBACA dari pra-daftar E1;
        // uji menuntut persentil berinterpolasi (3 dari 48 giliran lambat belum menggagalkan p95).
        ['E5-pasang: setara · latensi (ambang E1) · beban · gagal-terbuka', () => jalan('eval/e5-pasang.mjs', ['--uji'], { diam: true })],
        // Aturan #20 (stempel dari jam) terulang 2× pada 23 Sep sebagai prosa → kini kode. Pindaian pertama
        // menemukan kelas kedua: tanggal WIB + jam UTC (A6B, K1 "dikunci" 24 jam sesudah commit kuncinya).
        ['stempel waktu: pengurai, blame, dan masa-depan-yang-sah', () => jalan('eval/jaga-stempel-waktu.mjs', ['--uji'], { diam: true })],
        ['stempel waktu tidak mendahului commit-nya (pra-daftar + dok 7 hari)', () => jalan('eval/jaga-stempel-waktu.mjs', [], { diam: true })],
        // C62 (PETA-DIAL-LATIH): awalan yang dikirim ulang stabil byte-demi-byte. Ujinya menuntut
        // penjaga MENANGKAP F-262 (riwayat tanpa /no_think) dan F-265 (arahan berganti di sistem).
        ['C62 awalan stabil: tangkap F-262 & F-265, loloskan jalur E2\'', () => jalan('eval/jaga-c62-awalan.mjs', ['--uji'], { diam: true })],
        // Dunia Studio (23 Sep): pembangkit dulu MENGETIK tiga sorotan dan sensus — dua jadi salah
        // tanpa berbunyi ("syarat bibit belum terdefinisi", "29 adapter belum ditemukan"), dan pola
        // judul hukum diam-diam melewatkan C62. Kini dirakit dari sumber, dan ujinya menjaga itu.
        ['dunia Studio: data dirakit dari sumber, bukan diketik', () => jalan('studio/alat/bangkitkan-data-nyata.mjs', ['--uji'], { diam: true })],
        // 23 Sep sore: pemeriksa potret dunia 3D RUSAK diam-diam sejak pagi — ia menuntut sorotan A4
        // "belum terdefinisi" selamanya, dan tak terdaftar di sini sehingga tak ada yang berbunyi. Juga
        // menyalin pola hukum/temuan (31 vs 35 hukum, 251 vs 292 temuan). Kini memakai pengurai kanonik.
        ['dunia Studio: potret 3D jujur terhadap sumber (A4, bentuk, cahaya)', () => jalan('studio/konsep/3d/tools/periksa-data.mjs', ['--penjaga'], { diam: true })],
        // E3 (doc 105): pencatat H-ALUR. Uji mutasi 23 Sep menemukan ambang 10 % yang
        // TIDAK dijaga satu uji pun — sekarang dijaga di batasnya persis.
        ['E3 pencatat H-ALUR: definisi sah terkunci + layak-latih', () => jalan('flywheel/pencatat-h-alur.mjs', ['--uji'], { diam: true })],
        // Privasi H-ALUR: isinya harga, margin, nama pembeli (non-negotiable #3). Penjaga
        // ini memeriksa GIT-nya sendiri, bukan pola .gitignore — pola bisa benar sementara
        // sebuah berkas tetap terlacak karena di-`git add -f` atau ditambahkan sebelum
        // polanya ada. Tempat kegagalan harus diperiksa di tempat ia hidup (F-259).
        ['data privat H-ALUR tidak terlacak git', () => {
          const r = spawnSync('git', ['-C', AKAR, 'ls-files', '.private'], { encoding: 'utf8' });
          const terlacak = String(r.stdout || '').split('\n').filter(Boolean);
          const cek = spawnSync('git', ['-C', AKAR, 'check-ignore', '-q', '.private/h-alur/pasangan.jsonl']);
          return {
            kode: terlacak.length || cek.status !== 0 ? 1 : 0,
            keluaran: terlacak.length
              ? `${terlacak.length} berkas di bawah .private/ TERLACAK git: ${terlacak.slice(0, 3).join(' · ')} — keluarkan dengan git rm --cached, JANGAN commit`
              : cek.status !== 0 ? '.private/h-alur/ TIDAK diabaikan git — pola .gitignore hilang atau rusak'
                : '.private/ diabaikan git dan nol berkas terlacak',
          };
        }],
        // 18 Sep: alamat Bmax lama laptop.local sudah MATI (mesin `MIGAN` pindah ke .17 lewat
        // DHCP, F-237), tapi 13 berkas kode/skrip masih memakainya sebagai BAWAAN — jadi tiap
        // pemanggilan tanpa env eksplisit habis-waktu tanpa sebab yang jelas. Alamat basi di
        // bawaan adalah kegagalan senyap; penjaga ini membuatnya berisik. Berkas riwayat (log,
        // pra-daftar, dokumen) sengaja TIDAK diperiksa — di sana .78 memang catatan sejarah.
        ['tidak ada alamat Bmax basi (.78) di kode', () => {
          const pola = /192\.168\.1\.78/;
          const akar = ['eval', 'flywheel', 'mcp', 'majelis', 'layanan', 'tools', 'scripts'];
          const sah = /\.(mjs|js|sh|ps1|py)$/;
          const temuan = [];
          const telusur = (dir) => {
            let isi = [];
            try { isi = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const d of isi) {
              const p = path.join(dir, d.name);
              if (d.isDirectory()) { if (!/^(node_modules|\.git|arsip.*)$/.test(d.name)) telusur(p); continue; }
              if (!sah.test(d.name)) continue;
              let teks = '';
              try { teks = fs.readFileSync(p, 'utf8'); } catch { continue; }
              teks.split('\n').forEach((baris, i) => {
                if (pola.test(baris) && !/192\.168\.1\.17/.test(baris)) temuan.push(`${p}:${i + 1}`);
              });
            }
          };
          for (const a of akar) telusur(path.join(AKAR, a));
          return {
            kode: temuan.length ? 1 : 0,
            keluaran: temuan.length
              ? `alamat Bmax basi .78 masih dipakai di ${temuan.length} tempat: ${temuan.slice(0, 5).join(' · ')}${temuan.length > 5 ? ' …' : ''} — Bmax ada di measure-host.local (sidik mesin MIGAN)`
              : 'tidak ada .78 di berkas kode',
          };
        }],
        // 23 Sep: penjaga di ATAS dipasang 18 Sep khusus untuk .78 — dan .78 tetap
        // hidup lima hari lagi di tempat yang paling menentukan, yaitu env MCP
        // (GERBANG_PROBE_HOST), karena penjaga itu hanya memindai BERKAS KODE di repo.
        // Cacatnya bukan penjaganya salah; CAKUPANNYA tidak sepadan dengan tempat
        // kegagalannya. Gerbang serving bersifat fail-open, jadi akibatnya bukan
        // jawaban rusak melainkan gerbang yang DIAM-DIAM tidak berfungsi — kegagalan
        // yang tidak menimbulkan gejala apa pun. (F-259)
        //
        // Penjaga ini membaca env MCP milik mesin ini, yang MEMUAT KREDENSIAL:
        // ia hanya memeriksa satu kunci dan melaporkan boolean — tidak pernah
        // mencetak nilai apa pun. Kalau berkasnya tidak ada (mesin/pengguna lain),
        // ia LULUS dengan catatan, bukan gagal.
        ['tidak ada alamat Bmax basi (.78) di konfigurasi MCP', () => {
          const p = path.join(os.homedir(), '.claude.json');
          if (!fs.existsSync(p)) return { kode: 0, keluaran: 'tidak ada ~/.claude.json di mesin ini — dilewati' };
          let env;
          try { env = JSON.parse(fs.readFileSync(p, 'utf8'))?.mcpServers?.migancore?.env; }
          catch { return { kode: 0, keluaran: 'env MCP tidak terbaca — dilewati (bukan kegagalan repo)' }; }
          if (!env) return { kode: 0, keluaran: 'server MCP migancore tidak terpasang di mesin ini — dilewati' };
          const basi = Object.entries(env)
            .filter(([, v]) => /192\.168\.1\.78/.test(String(v)))
            .map(([k]) => k);
          return {
            kode: basi.length ? 1 : 0,
            keluaran: basi.length
              ? `alamat Bmax basi .78 masih terpasang di env MCP: ${basi.join(' · ')} — ganti ke measure-host.local. Gerbang FAIL-OPEN, jadi ia tidak akan berbunyi galat; ia hanya berhenti bekerja.`
              : `env MCP migancore bersih dari .78 (${Object.keys(env).length} kunci diperiksa, nilainya tidak dicetak)`,
          };
        }],
        // 10 Sep, temuan terbesar sesi ini: BATAS bukan langit-langit yang
        // mengikat. `fetch` bawaan Node memberi headersTimeout 300 dtk, dan
        // dengan stream:false Ollama diam sampai jawabannya selesai — jadi tiap
        // jawaban >300 dtk memutus koneksinya sendiri, berapa pun BATAS-nya.
        // 170 dari 396 baris qwen3:4b hilang karena ini. Penjaga di bawah
        // mengunci pengenal sebabnya (dibaca dari rantai `cause`, bukan dari
        // teks "fetch failed" yang sama untuk semua sebab) dan penggabung
        // aliran yang menggantikannya.
        ['batas fetch 300 dtk (sebab dibaca dari cause, bukan dari pesan)', () => jalan('eval/uji-batas-fetch.mjs', ['--uji'], { diam: true })],
        // Epik M (doc 95), arahan Fahmi 10 Sep: uji lewat banyak jalur, bukan
        // satu. C56 lolos tiga minggu karena tiap pengukuran lewat jalur yang
        // sama persis — Node → fetch → Ollama → Bmax — dan jalur tunggal
        // mengukur JALURNYA sebanyak ia mengukur modelnya. Yang dicari bukan
        // "semua berhasil" tapi "semua SEPAKAT": klien yang menyerah lebih awal
        // sedang memasang langit-langitnya sendiri.
        ['paritas klien (yang dicari SEPAKAT, bukan BERHASIL)', () => jalan('eval/paritas-klien.mjs', ['--uji'], { diam: true })],
        // Diagnostik: apakah sinyal penilai berubah lajunya mengikuti PANJANG
        // jawaban? TANYA naik 11 % -> 95 %, mengikuti "ada tanda tanya" persis.
        ['kebutaan-panjang (sinyal penilai vs panjang jawaban)', () => jalan('eval/kebutaan-panjang.mjs', ['--uji'], { diam: true })],
        // Bahan anti-uji A6, dikunci sebagai penjaga supaya bukti yang dipakai
        // memutuskan tidak bisa berubah diam-diam. Yang dijaga di dalamnya:
        // (a) penggantian polanya benar-benar terjadi — kalau tidak, seluruh
        // alat itu bohong tanpa berbunyi; (b) penyempitan TIDAK PERNAH menambah
        // kecocokan di data nyata; (c) klarifikasi nyata tetap tertangkap.
        ['bukti TANYA (anti-uji A6 dari baris nyata)', () => jalan('eval/bukti-tanya.mjs', ['--uji'], { diam: true })],
        // A6b: MENOLAK jauh lebih berpengaruh daripada TANYA — ia satu-satunya
        // jalur menuju over-refusal DAN penerima utama enam jenis abstain.
        // Cacatnya mekanis: kata `salah` tanpa batas kata mencocokkan "salah
        // satu", "kesalahan", dan "masalah". 274 baris (19,8 %) bergantung
        // padanya; 113 di antaranya positif-palsu yang tidak ambigu.
        ['bukti MENOLAK (kata-isi telanjang, 274 baris)', () => jalan('eval/bukti-menolak.mjs', ['--uji'], { diam: true })],
        // Audit LENGKAP keempat sinyal, kebenaran-dasar dari RANCANGAN petak
        // (di soal `fakta`, abstain = perilaku salah) bukan dari penilaian —
        // yang sirkular. Jurang terburuk:terbaik 143x. Prinsip yang lahir
        // darinya: sinyal yang mencari TINDAKAN bertahan, yang mencari TOPIK
        // runtuh. KOREKSI bersih (0,1 %) karena ia frasa membantah; MENOLAK
        // kotor (14,3 %) karena ia memuat kata-isi telanjang.
        ['audit sinyal (KOREKSI tetap terbersih, MENOLAK terkotor)', () => jalan('eval/audit-sinyal.mjs', ['--uji'], { diam: true })],
        // K1: penilai abstensi dari frasa TINDAKAN saja — uji jatuh terhadap
        // klaim PAPER.md §5. Vonis TIDAK MENANG (ambangnya sendiri ternyata di
        // bawah lantai penolakan tulen — C55 lagi), tapi presisinya 2,4x penilai
        // kata-kunci. Ia KANDIDAT yang diukur, bukan penilai yang berlaku;
        // penjaga ini mengunci anti-ujinya supaya frasanya tidak bisa disetel
        // diam-diam sesudah vonisnya ditulis.
        ['penilai TINDAKAN (kandidat K1, anti-uji terkunci)', () => jalan('eval/penilai-tindakan.mjs', ['--uji'], { diam: true })],
        // 15 Sep, H-RAGU: 0 dari 3.789 baris hasil pernah menyimpan nalar model.
        // Kamus keraguan dikunci di pra-daftar SEBELUM data ada, dan alat ini
        // membacanya dari sana — penjaga ini memastikan anti-uji dua arahnya dan
        // uji perilaku pola (tidak ada yang menyala pada kata tunggal) tetap lulus.
        ['ragu di jejak nalar (H-RAGU, kamus dibaca dari pra-daftar)', () => jalan('eval/ragu-jejak.mjs', ['--uji'], { diam: true })],
        ['jaga serving (nama model & kanon hidup)', () => jalan('eval/jaga-serving.mjs', ['--uji'], { diam: true })],
        ['serving selaras BERLAKU.json', () => jalan('eval/jaga-serving.mjs', [], { diam: true })],
        ['sumbu kebenaran / NLI (B1)', () => jalan('sistem/nli-id.mjs', ['--uji'], { diam: true })],
        ['telemetri gerbang sehat (GALAT probe <=10%)', () => jalan('eval/audit-telemetri-gerbang.mjs', ['--periksa'], { diam: true })],
        // ── 10 Sep: dua belas uji yang tidak pernah dijalankan ───────────────
        // C52 dalam bentuknya yang paling halus. `eval/periksa-alat.mjs` menyapu
        // SELURUH eval/*.mjs, tapi hanya MENJALANKAN yang mengeja benderanya
        // `--uji-instrumen` (17 berkas). 28 berkas eval lain mengeja `--uji` dan
        // bergantung pada daftar TANGAN inilah — dua di antaranya tak pernah
        // masuk. Di flywheel/ tidak ada pemindai sama sekali: sebelas berkas
        // bermode uji, nol digerbang. Jadi polanya bukan "berkas di luar FOLDER
        // yang dipindai", melainkan "berkas di luar POLA NAMA yang dipindai".
        // Ketiga belasnya lulus saat didaftarkan, jadi yang dikunci di sini
        // bukan sebuah perbaikan — melainkan hak untuk tahu KAPAN salah satunya
        // berhenti lulus. (`flywheel/pindah-model.mjs` sengaja TIDAK ikut:
        // ujinya membaca gudang blob Ollama di ~/.ollama — di luar repo — jadi
        // ia menguji mesinnya, bukan kodenya. Lihat CHANGELOG 10 Sep.)
        //
        // "Dua model kami sepakat" dipakai menimbang bukti A/B antar-varian kami
        // sendiri. Kalau kappa-nya salah hitung, bukti itu tetap terlihat seperti bukti.
        ['korelasi galat (kappa: saksi terpisah atau satu saksi berulang)', () => jalan('eval/korelasi-galat.mjs', ['--uji'], { diam: true })],
        // Petak tahan mati kalau pencemarannya lolos — dan matinya SENYAP: angkanya
        // tetap keluar, cuma tidak berarti apa-apa lagi. Aturan "tak pernah dipakai
        // merancang" hidup di komentar; yang mekanis hanya pemeriksa jarak ke seluruh
        // data latih + 24 soal gerbang lama, dan itulah yang diuji di sini.
        ['petak alat tahan (24 skenario tak tercemar data latih)', () => jalan('eval/soal-alat-tahan.mjs', ['--uji'], { diam: true })],
        // Fahmi menulis pola jebakan dalam teks biasa karena ia Guru, bukan penulis
        // JSON. Parser yang menelan satu pola tanpa bunyi berarti pelajaran yang
        // sudah ditulis hilang tanpa ada yang tahu ia pernah ada.
        ['baca pola jebakan (tulisan Fahmi -> kontrak, galat menunjuk baris)', () => jalan('flywheel/baca-pola.mjs', ['--uji'], { diam: true })],
        // Sanad mekanis putus sesudah ringkasan latih; sesudah itu sambungannya
        // bersandar pada nama berkas. Sudah kena sekali: sufiks r1t..r4t ternyata
        // memetakan ke run 2, 3, 6, 7 — bukan 1..4. Alat yang salah memetakan
        // menghasilkan cerita yang enak dibaca dan tidak benar.
        ['banding run (petakan 3 keluarga berkas, bukan tebak dari nama)', () => jalan('flywheel/banding-run.mjs', ['--uji'], { diam: true })],
        // Identitas berstatus WAJIB LULUS. Berkas ini memvonis tiap barisnya dengan
        // gerbang yang SAMA sebelum menulis; kalau vonis itu melonggar, baris yang
        // GAGAL masuk ke satu-satunya sumbu yang tidak boleh gagal.
        ['benih identitas (tiap baris lulus gerbang C44 sebelum ditulis)', () => jalan('flywheel/benih-identitas.mjs', ['--uji'], { diam: true })],
        // RL rajin mencari celah ganjaran. Diukur 28 Agu: jawaban "?" — satu karakter
        // — LULUS di 55 dari 120 uji tanpa mengatakan apa pun. Objektif `isi` ada
        // khusus untuk menutupnya, dan serangan itu sendiri dipakai sebagai kasus uji.
        ['ganjaran MO-GRPO (vektor, dan celah "?" tetap tertutup)', () => jalan('flywheel/ganjaran.mjs', ['--uji'], { diam: true })],
        // Penyaring rahasia punya dua arah gagal dan keduanya sudah terjadi: longgar
        // = .env asli terlewat di folder yang hendak dijual; ketat = 234 temuan palsu
        // (3 Sep) yang membuat orang berhenti membacanya sama sekali.
        ['inventaris aset (.env asli ketahuan, template TIDAK)', () => jalan('flywheel/inventaris-aset.mjs', ['--uji'], { diam: true })],
        // Kolam yang memuat soal ujian menaikkan skor tanpa memberi tahu apa pun
        // (C42/C07) — kegagalan senyap yang paling mahal, karena hasilnya terlihat
        // persis seperti keberhasilan. Pemulihan kategori dari tiga asal ikut dijaga:
        // label kategori yang salah berarti ganjaran yang salah.
        ['kolam GRPO (kategori pulih benar, soal ujian tidak ikut)', () => jalan('flywheel/kolam-grpo.mjs', ['--uji'], { diam: true })],
        // Berkas ini MENGUBAH SIDIK cluster induk. Kalau ia menyentuh apa pun di luar
        // giliran `system` — soal, jawaban, angka, id — maka setiap pra-daftar yang
        // mengunci sidik lama berubah dari "kedaluwarsa" menjadi "diam-diam salah".
        ['netralkan prompt induk (isi utuh, hanya giliran system diubah)', () => jalan('flywheel/netralkan-prompt-induk.mjs', ['--uji'], { diam: true })],
        // Satu-satunya yang bisa bilang berkas mana YATIM/BUNTU/BASI di
        // flywheel/dataset. Pembaca pola yang buta melaporkan "tak ada yang memakai"
        // untuk berkas yang dipakai — dan yang diarsipkan atas dasar laporan itu tidak
        // bisa dikembalikan oleh orang yang tidak tahu ia pernah ada.
        ['peta dataset (produsen/konsumen dibaca dari kode, bukan dokumen)', () => jalan('flywheel/peta-dataset.mjs', ['--uji'], { diam: true })],
        // Pengecualian `nalar` dan `keluar-rag` adalah keputusan yang sudah dibayar
        // dengan pengukuran (adapter nalar MEMPERBURUK nalar, p=0,012). Penyaring
        // C07-nya membaca daftar soal gerbang HIDUP dari berkas hasil eval, jadi ia
        // bisa rusak diam-diam saat bentuk berkas itu berpindah.
        ['siapkan benih (pengecualian berbayar + penyaring C07 hidup)', () => jalan('flywheel/siapkan-benih.mjs', ['--uji'], { diam: true })],
        // Baris suling membawa id MILIK BENIHNYA. Kalau id tidak diganti, satu cluster
        // berisi dua baris ber-id sama dan jejaknya putus persis di tempat yang paling
        // perlu ditelusuri. Awalan `suling-` yang membedakan baris mesin dari gold
        // MANUSIA — tanpa itu dial A11 berhenti bisa diukur.
        ['siapkan suling (id baru, jejak _benih/_guru, gold manusia tetap kelihatan)', () => jalan('flywheel/siapkan-suling.mjs', ['--uji'], { diam: true })],
        ['pengukur latih (python, tanpa torch)', () => jalanPy('flywheel/vast/ukur_latih.py', ['--uji-instrumen'], { diam: true, batas: 120000 })],
        ['kontrak masukan skrip latih (dua arah)', () => jalanPy('flywheel/vast/uji_kontrak_latih.py', [], { diam: true, batas: 300000 })],
        // 10 Sep malam, lanjutan sesi latar "13 uji yatim". Sesi itu menyapu
        // eval/ flywheel/ sistem/ majelis/ mcp/ dan menutup 12 lubang — lalu
        // pemindaian menyeluruh menemukan TIGA lagi di dua folder yang tidak
        // ikut tersapu (`ajar/`, `layanan/`). Itu membuktikan poin sesi itu
        // sendiri: selama daftar foldernya ditulis tangan, folder berikutnya
        // akan yatim dengan cara yang persis sama.
        ['ajar kontras (tetangga kontras 6 dimensi)', () => jalan('ajar/kontras.mjs', ['--uji'], { diam: true })],
        ['ajar pengusul (cakupan diakui kecil, bukan disembunyikan)', () => jalan('ajar/pengusul.mjs', ['--uji'], { diam: true })],
        ['layanan NLI mdeberta (agregasi entailment)', () => jalan('layanan/nli-mdeberta/server.mjs', ['--uji'], { diam: true })],
        // 28 Sep: alat Gerbang-S1 (dan bangun-silsilah) memeriksa bendera uji lewat larik argumen hasil slice
        // atau perbandingan elemen pertama, bukan lewat process.argv langsung. jaga-uji-yatim hanya mengenali
        // ejaan process.argv, jadi 13 berkas uji tak pernah dijalankan di sini — C52 kambuh dalam bentuk yang
        // diperingatkan penjaga itu sendiri (pemindai buta ejaan). Pola penjaga dilebarkan dan alatnya didaftarkan.
        ['Gerbang-S1 alat vonis (hitungVonis, penilai gabungan, T2, audit)', () => jalan('eval/gerbang-s1/vonis-s1.mjs', ['--uji'], { diam: true })],
        // Batas 300 dtk → 1.500 dtk (28 Sep, F-293): 54 mutan terukur 11 mnt 18 dtk saat mesin sibuk; batas lama membunuh uji di
        // tengah jalan, dan berkas _mutan-* yang tertinggal terbaca sebagai "uji yatim" oleh penjaga di bawahnya.
        ['Gerbang-S1 mutasi alat vonis (semua mutan wajib tertangkap)', () => jalan('eval/gerbang-s1/mutasi-vonis.mjs', [], { diam: true, batas: 1500000 })],
        ['Gerbang-S1 AUDIT-UJI (arbitrase → ukuran audit)', () => jalan('eval/gerbang-s1/audit-uji.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 validasi buta + arbitrase F-286', () => jalan('eval/gerbang-s1/validasi.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 beku (ambang dua-batas, sengketa)', () => jalan('eval/gerbang-s1/beku.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 bangun data (klaster, sengketa untukLatih)', () => jalan('eval/gerbang-s1/bangun-data.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 pelari P/G berpasangan', () => jalan('eval/gerbang-s1/pg-berpasangan.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 siapkan label uji', () => jalan('eval/gerbang-s1/siapkan-label-uji.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 siapkan masukan skor (T1 putaran 1..16, T2 tanpa id buang)', () => jalan('eval/gerbang-s1/siapkan-skor.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 penjawab (--kecuali)', () => jalan('eval/gerbang-s1/jawab.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 pelabel DeepSeek', () => jalan('eval/gerbang-s1/label-deepseek.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 latensi probe (target rasio)', () => jalan('eval/gerbang-s1/latensi-probe.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 audit kebocoran', () => jalan('eval/gerbang-s1/audit-bocor.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 pembuat soal', () => jalan('eval/gerbang-s1/buat-soal.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 status kelahiran', () => jalan('eval/gerbang-s1/kelahiran-s1.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 alat kunci pra-daftar (patok: sekali, bedah, ISO Z)', () => jalan('eval/gerbang-s1/patok-s1.mjs', ['--uji'], { diam: true })],
        ['Gerbang-S1 riwayat git patok & berkas hasil (hanya-tambah, leluhur)', () => jalan('eval/gerbang-s1/riwayat-s1.mjs', ['--uji'], { diam: true })],
        ['silsilah versi (bangun-silsilah)', () => jalan('flywheel/bangun-silsilah.mjs', ['--uji'], { diam: true })],
        // Penutup KELASNYA, bukan kejadiannya: tiap berkas bermode uji wajib
        // digerbang lewat salah satu jalur, atau berada di daftar KECUALI
        // dengan alasan tertulis yang ikut dicetak. Berkas ke-15 yang lahir
        // dengan ejaan bendera apa pun, di folder mana pun, akan berbunyi.
        ['jaga uji yatim (uji tak terjalankan = uji yang membusuk)', () => jalan('eval/jaga-uji-yatim.mjs', ['--uji'], { diam: true })],
        ['tidak ada uji yang yatim di repo', () => jalan('eval/jaga-uji-yatim.mjs', [], { diam: true })],
      ];
      for (const [nama, f] of daftar) {
        const r = f();
        const ok = r.kode === 0;
        if (!ok) gagal++;
        console.log(`  ${ok ? H + 'OK   ' + R : M + 'GAGAL' + R} ${nama}`);
        if (!ok) console.log(`         ${r.keluaran.trim().split('\n').slice(-3).join('\n         ')}`);
      }
      console.log(gagal ? `\n${M}${gagal} pemeriksaan gagal — perbaiki sebelum mengukur apa pun.${R}\n`
        : `\n${H}SEHAT${R} — aman dipakai mengukur.\n`);
      return gagal ? 1 : 0;
    },
  },

  gerbang: {
    guna: 'gerbang data per cluster',
    async jalankan([target = 'semua']) {
      await pastikan([SYARAT.alatSehat]);
      if (target !== 'semua') {
        await pastikan([() => SYARAT.clusterAda(target)]);
      }
      const r = jalan('flywheel/jalankan-gerbang-v13.mjs');
      console.log(r.kode === 0
        ? `\n  ${A}berikutnya: migan latih <cluster>${R}\n`
        : `\n  ${A}perbaiki datanya dulu — sebar bentuk, jangan tambah jumlah.${R}\n`);
      return r.kode;
    },
  },

  ajar: {
    guna: 'buka Pencatat Ajar (kumpulkan data dari kegagalan nyata)',
    async jalankan() {
      await pastikan([SYARAT.ollamaHidup]);
      console.log(`\n${B}Pencatat Ajar${R} → http://127.0.0.1:8790  ${A}(Ctrl-C untuk berhenti)${R}\n`);
      return jalan('ajar/server.mjs').kode;
    },
  },

  ukur: {
    guna: 'gerbang model penuh (aritmetika + tolak + kenari + kias)',
    async jalankan([model, ...sisa]) {
      if (!model) { console.error(`${M}pakai: migan ukur <model>${R}`); return 2; }
      await pastikan([SYARAT.ollamaHidup, () => SYARAT.modelAda(model), SYARAT.alatSehat]);
      const cepat = sisa.includes('--cepat');
      console.log(`\n${B}# Ukur ${model}${R}${cepat ? A + ' (cepat: 1 ulangan)' + R : ''}\n`);
      const langkah = [
        ['aritmetika (dengan sistem)', 'eval/uji-aritmetika.mjs', [model, cepat ? '1' : '3']],
        ['batas peran', 'eval/uji-tolak.mjs', [model]],
        ['kenari (hafalan)', 'eval/baca-kenari.mjs', [model]],
        ['kias/penalaran', 'eval/uji-kias.mjs', [model]],
      ];
      const hasil = [];
      for (const [nama, skrip, args] of langkah) {
        console.log(`${A}— ${nama}${R}`);
        const r = jalan(skrip, args, { diam: true });
        const angka = (r.keluaran.match(/##\s*([^\n]+)/g) || []).slice(-1)[0] || `(kode ${r.kode})`;
        hasil.push({ nama, kode: r.kode, angka: angka.replace(/^##\s*/, '').trim() });
        console.log(`  ${r.kode === 0 ? H + 'OK   ' + R : K + 'catat' + R} ${angka.replace(/^##\s*/, '').trim().slice(0, 80)}`);
      }
      console.log(`\n${B}Ringkas ${model}:${R}`);
      for (const h of hasil) console.log(`  ${h.nama.padEnd(28)} ${h.angka.slice(0, 60)}`);
      console.log(`\n  ${A}berikutnya: migan banding <model-lain> ${model}${R}\n`);
      return 0;
    },
  },

  banding: {
    guna: 'bandingkan dua model dengan uji beda yang benar',
    async jalankan([a, b]) {
      if (!a || !b) { console.error(`${M}pakai: migan banding <A> <B>${R}`); return 2; }
      await pastikan([() => SYARAT.modelAda(a), () => SYARAT.modelAda(b)]);
      return jalan('eval/banding-jenis.mjs', [a, b]).kode;
    },
  },

  latih: {
    guna: 'latih satu adapter cluster di vast',
    async jalankan([cluster, ...sisa]) {
      if (!cluster) { console.error(`${M}pakai: migan latih <cluster> [--versi v14] [--pra berkas] [--resep berkas] [--nama label]${R}`); return 2; }
      const ambil = (b) => (sisa.includes(b) ? sisa[sisa.indexOf(b) + 1] : null);
      const versi = ambil('--versi') || 'v13';
      const pra = ambil('--pra'), resep = ambil('--resep');
      // Argumen yang sama diteruskan ke peluncur; kalau tidak, pintu memeriksa
      // satu berkas dan GPU melatih berkas lain — tanpa satu pun yang mengeluh.
      await pastikan([
        () => SYARAT.clusterAda(cluster, versi),
        () => SYARAT.praDaftarCocok(cluster, versi, pra),
        SYARAT.alatSehat,
        () => SYARAT.kontrakSiap(cluster, versi, pra, resep),
      ]);
      console.log(`
${K}GPU berbayar akan disewa.${R} Syarat lolos pada ${B}${versi}${R}: data ada, pra-daftar cocok (${pra || `PRA-DAFTAR-${versi.toUpperCase()}.json`}), alat sehat, kontrak masukan SIAP.
`);
      return jalanPy('flywheel/vast/luncurkan_cluster.py', [cluster, ...sisa]).kode;
    },
  },

  gabung: {
    guna: 'merge adapter + gerbang pada hasil gabungan',
    async jalankan() {
      const kurang = ['hitung', 'nalar', 'gaya'].filter((c) => !ada(`models/v13/lora-${c}.tgz`));
      if (kurang.length) {
        console.error(`\n${M}Adapter belum lengkap${R} — belum ada: ${kurang.join(', ')}.`);
        console.error(`  Jalankan dulu: ${kurang.map((c) => `migan latih ${c}`).join(' · ')}\n`);
        return 1;
      }
      return jalanPy('flywheel/vast/luncurkan_merge13.py').kode;
    },
  },

  'gabung-ajar': {
    guna: 'satukan data ajar ke cluster latih (gerbang jalan sesudahnya)',
    async jalankan(sisa) {
      // Lingkaran: gerbang menemukan kegagalan -> Ajar mengajar -> DI SINI
      // data masuk cluster -> migan latih. Tanpa langkah ini, mengajar cuma
      // mengarsip.
      const terapkan = sisa.includes('--terapkan');
      if (terapkan) await pastikan([SYARAT.alatSehat]);
      return jalan('sistem/gabung-ajar.mjs', terapkan ? ['--terapkan'] : []).kode;
    },
  },

  kontrak: {
    guna: 'kontrak masukan/keluaran satu run latih (manifest sebelum GPU, periksa-hasil sesudahnya)',
    async jalankan([sub = 'manifest', cluster, ...sisa]) {
      if (!cluster) { console.error(`${M}pakai: migan kontrak manifest <cluster> [--versi v13] · migan kontrak periksa-hasil <cluster>${R}`); return 2; }
      const versi = sisa.includes('--versi') ? sisa[sisa.indexOf('--versi') + 1] : 'v13';
      const r = jalan('flywheel/kontrak-latih.mjs', [sub, cluster, '--versi', versi]);
      if (sub === 'manifest') console.log(r.kode === 0 ? `  ${A}berikutnya: migan latih ${cluster}${R}\n` : `  ${A}perbaiki syarat wajib di atas; GPU tidak disewa.${R}\n`);
      return r.kode;
    },
  },

  cacat: {
    guna: 'register cacat + jalankan semua penjaga',
    async jalankan() { return jalan('eval/register-cacat.mjs').kode; },
  },
};

// ────────────────────────────────────────────────── uji instrumen ──
function ujiInstrumen() {
  const kasus = [
    ['semua perintah punya guna & jalankan',
      Object.values(PERINTAH).every((p) => typeof p.guna === 'string' && typeof p.jalankan === 'function')],
    ['syarat cluster menolak yang tidak ada',
      SYARAT.clusterAda('tidak-ada-cluster-ini').ok === false],
    ['syarat cluster menerima yang ada',
      !ada('flywheel/dataset/v13/cluster-hitung.jsonl') || SYARAT.clusterAda('hitung').ok === true],
    ['pra-daftar mendeteksi sidik cocok/tidak',
      typeof SYARAT.praDaftarCocok('hitung').ok === 'boolean'],
    // ── Mengunci bug 28 Agu 2026: pintu memeriksa v13 sementara peluncur
    // menjalankan v14, jadi kontrak bilang SIAP dan pintu tetap menolak.
    // Kalau kelak ada yang memasang balik jalur v13 yang dipatok, tiga uji ini
    // yang berteriak duluan — bukan tagihan GPU.
    ['syarat cluster SADAR VERSI (v14 ada, v13 tidak)',
      !ada('flywheel/dataset/v14/cluster-tool.jsonl')
      || (SYARAT.clusterAda('tool', 'v14').ok === true && SYARAT.clusterAda('tool', 'v13').ok === false)],
    ['pra-daftar boleh DITUNJUK berkasnya (bukan diturunkan dari versi)',
      !ada('flywheel/PRA-DAFTAR-V15.json')
      || SYARAT.praDaftarCocok('tool', 'v14', 'flywheel/PRA-DAFTAR-V15.json').ok === true],
    ['pra-daftar yang SALAH untuk versi itu DITOLAK',
      !ada('flywheel/PRA-DAFTAR-V13.json')
      || SYARAT.praDaftarCocok('tool', 'v14', 'flywheel/PRA-DAFTAR-V13.json').ok === false],
    ['bacaJSON tahan berkas hilang', bacaJSON('tidak/ada.json') === null],
    ['sidik tahan berkas hilang', sidik('tidak/ada.json') === null],
    ['perintah inti tersedia',
      ['status', 'periksa', 'gerbang', 'ajar', 'ukur', 'banding', 'latih', 'gabung', 'cacat']
        .every((k) => k in PERINTAH)],
    ['skrip yang dirujuk benar-benar ada',
      ['sistem/gabung-ajar.mjs', 'sistem/antre-ajar.mjs', 'sistem/kumpul.mjs',
       'eval/periksa-alat.mjs', 'eval/periksa-pin.mjs', 'eval/jaga-repo.mjs',
       'eval/uji-aritmetika.mjs', 'eval/uji-tolak.mjs', 'eval/baca-kenari.mjs',
       'eval/uji-kias.mjs', 'eval/banding-jenis.mjs', 'eval/register-cacat.mjs',
       'ajar/server.mjs', 'flywheel/jalankan-gerbang-v13.mjs',
       'flywheel/vast/luncurkan_cluster.py', 'flywheel/vast/luncurkan_merge13.py',
       'flywheel/kontrak-latih.mjs', 'flywheel/vast/ukur_latih.py', 'flywheel/vast/uji_kontrak_latih.py',
       'flywheel/RESEP-V13.json', 'flywheel/PARITAS-PROMPT.json', 'eval/prompt-gerbang.json',
       'eval/periksa-prompt-paritas.mjs'].every(ada)],
    ['syarat kontrak: cluster tidak ada -> TAHAN',
      SYARAT.kontrakSiap('tidak-ada-cluster-ini').ok === false],
    ['perintah kontrak tersedia', 'kontrak' in PERINTAH],
  ];
  let gagal = 0;
  for (const [n, ok] of kasus) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${n}`); if (!ok) gagal++; }
  console.log(`\n${kasus.length - gagal}/${kasus.length} lulus`);
  process.exit(gagal ? 1 : 0);
}

// ── masuk ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--uji-instrumen')) ujiInstrumen();

const perintah = argv[0];
if (!perintah || !(perintah in PERINTAH)) {
  console.log(`\n${B}migan${R} — pintu masuk MiganCore\n`);
  for (const [nama, p] of Object.entries(PERINTAH)) {
    console.log(`  ${H}${nama.padEnd(9)}${R} ${p.guna}`);
  }
  console.log(`\n  ${A}contoh: node migan.mjs status · node migan.mjs ukur migancore:0.13${R}`);
  console.log(`  ${A}arsitektur: ARSITEKTUR.md${R}\n`);
  process.exit(perintah ? 1 : 0);
}
process.exit(await PERINTAH[perintah].jalankan(argv.slice(1)) ?? 0);
