#!/usr/bin/env node
// mutasi-vonis.mjs — GERBANG-S1: uji mutasi alat vonis & alat yang menentukan vonis (node eval/gerbang-s1/mutasi-vonis.mjs).
// Tiap mutan WAJIB memerahkan >= 1 uji `--uji` berkas itu. Mutan ditulis sebagai _mutan-<berkas> di folder ini (awalan '_' =
// berkas sementara: dikecualikan dari sidik kode, inti-s1 penutupanKode) lalu dihapus.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const V = 'vonis-s1.mjs';
const MUTAN = [
  ['M1 (1b) MIDr dimatikan', V, 'MIDr: { ci: mid, lolos: mid.atas < 0 }', 'MIDr: { ci: mid, lolos: mid.atas < 100 }'],
  ['M2 tahan penilai hanya baku', V, "const PENILAI = m.penilaiMengikat ?? ['baku', 'deepseek', 'gabungan'];", "const PENILAI = ['baku'];"],
  ['M3 batas per soal fakta dibuang', V, 'lolos: pp <= A.rugiFaktaPp && (!capMengikat || capGagal.length === 0)', 'lolos: pp <= A.rugiFaktaPp'],
  ['M4 lantai T2 tak pernah mengikat', V, '(!mengikat || (c && c.atas < 0))', 'true'],
  ['M5 label templat DeepSeek diabaikan', V, 'const k = r.diblokir ? `T#0#${r.soal.id}`', 'const k = false ? `T#0#${r.soal.id}`'],
  ['M6 tahan-soal selalu lolos', V, 'JK: { lolos: jk.every((x) => x.c1r && x.mid)', 'JK: { lolos: true'],
  ['M7 kontrol sepele selalu kalah', V, 'return [k, { ci, lolos: ci.atas < 0 }];', 'return [k, { ci, lolos: true }];'],
  ['M8 AUDIT-UJI diabaikan', V, 'if (m.audit && !m.audit.lolos) tidakSah.push(', 'if (false) tidakSah.push('],
  ['M9 batas latensi 500 ms dibuang', V, 'p95 <= A.latensiP95Ms && p95', 'p95'],
  ['M10 (2) C2r dimatikan', V, 'C2r: { ci: c2r, lolos: c2r.atas < 0 }', 'C2r: { ci: c2r, lolos: true }'],
  ['M11 rugi fakta: blokir SALAH ikut dihitung', V, "if (r.hasil === 'BENAR') { e.benarP++; if (S[i][j].diblokir)", "if (true) { e.benarP++; if (S[i][j].diblokir)"],
  ['M12 putaran wajib dilonggarkan', V, 'if (m.P.length < A.putaranWajib || m.G.length < A.putaranWajib)', 'if (false)'],
  ['M13 penilai gabungan = baku saja', V, "r.hasil === 'NGARANG' || ds[i]?.hasil === 'NGARANG' ? { ...r, hasil: 'NGARANG' } : r", "r.hasil === 'NGARANG' ? { ...r, hasil: 'NGARANG' } : r"],
  ['M14 SALAH DeepSeek di jebakan tidak dihitung', V, "HARUS_ABSTAIN.has(r.soal.jenis) && h === 'SALAH' ? 'NGARANG' : h", 'h'],
  ['M15 label DeepSeek hilang diabaikan', V, 'if (hilangDs) (dsMengikat ? tidakSah : catatan).push(', 'if (false) (dsMengikat ? tidakSah : catatan).push('],
  ['M16 label templat: yang TERINGAN dipakai', V, 'BERAT.indexOf(l.label) > BERAT.indexOf(a)', 'BERAT.indexOf(l.label) < BERAT.indexOf(a)'],
  ['M17 batas per soal T2 dijadikan mengikat lagi (C55)', V, 'rugiFakta(P2, S2, A, { capMengikat: false })', 'rugiFakta(P2, S2, A)'],
  ['M18 batas per soal T1 dilepas', V, '{ capMengikat = true } = {}', '{ capMengikat = false } = {}'],
  ['M19 skor: baris ganda dibiarkan', V, 'if (dilihat.has(k)) { masalah.push(`baris ganda ${k}`); continue; }', 'if (false) { continue; }'],
  ['M20 skor: sha jawaban tidak diperiksa', V, 'if (x.sha !== harap.get(k)) masalah.push(', 'if (false) masalah.push('],
  ['M21 skor: mode kepala tidak diperiksa', V, 'if (kepala.mode !== mode) masalah.push(', 'if (false) masalah.push('],
  // Tinjauan putaran 3 (28 Sep): batas per soal hanya BENAR ≥ 8, penilai per arbitrase, versi pustaka, T2 efektif.
  ['M22 ALT-B: soal sulit boleh ditekan seluruhnya (⌈BENAR/2⌉ dilepas)', V, 'Math.ceil(benar / 2)', 'benar'],
  ['M22b ALT-B: soal sulit kembali ke batas lama maks(1, ⌊0,25·BENAR⌋)', V, 'benar >= A.capMinBenar ? Math.max(1, Math.floor(A.capPerSoal * benar)) : Math.ceil(benar / 2)', 'Math.max(1, Math.floor(A.capPerSoal * benar))'],
  ['M29 kasus (b): label DeepSeek tidak ada tetap menggugurkan', V, "if (!penilaian.deepseek) (dsMengikat ? tidakSah : catatan).push(", "if (!penilaian.deepseek) tidakSah.push("],
  ['M23 arbitrase (b) diabaikan (tiga penilai tetap mengikat)', V, "const PENILAI = m.penilaiMengikat ?? ['baku', 'deepseek', 'gabungan'];", "const PENILAI = ['baku', 'deepseek', 'gabungan'];"],
  ['M24 skor: versi laya/torch tidak diperiksa', V, 'if (!versi || kepala.laya !== versi.laya || kepala.torch !== versi.torch)', 'if (false)'],
  ['M25 T2: jawaban ganda per kunci tidak dihitung', V, "rs.filter((r) => r.hasil !== 'GALAT').length > 1", 'false'],
  ['M26 T2: GALAT lama dipakai walau ada jawaban', V, "rs.find((r) => r.hasil !== 'GALAT') ?? rs[0]", 'rs[0]'],
  ['M27 T2: kunci hilang tidak dihitung GALAT', V, '(100 * (hilang.length + efektif.filter', '(100 * (0 + efektif.filter'],
  ['M28 CI klaster kembali ke t 1,96 untuk df > 30 (F-290)', V, 'const t = t95(G - 1);', 'const t = T95[G - 1] ?? 1.96;'],
  ['A1 audit: RAGU G tidak dihitung (asimetris lagi)', 'audit-uji.mjs', 'gKetat = n.G.dikarang + n.G.ragu', 'gKetat = n.G.dikarang'],
  ['A2 audit: α dilonggarkan ke 0,01', 'audit-uji.mjs', 'export const ALFA = 0.05;', 'export const ALFA = 0.01;'],
  ['A3 audit: kuota ganda arbitrase (a) hilang', 'audit-uji.mjs', "kuota: kasus === 'a' ? KUOTA_GANDA : KUOTA", 'kuota: KUOTA'],
  ['A4 audit: kolam (b) tetap disaring aman-DeepSeek (karangan hanya-DeepSeek lolos audit)', 'audit-uji.mjs', "kolamDsAman: kasus !== 'b'", 'kolamDsAman: true'],
  ['A5 audit: kolam U1 kosong kembali TIDAK_SAH (S terkuat gugur)', 'audit-uji.mjs', 'lolos: lengkap && (hampa || (p != null && p >= alfa))', 'lolos: lengkap && (p != null && p >= alfa)'],
  ['D1 data: jebakan kembali ke kesepakatan saja (B5)', 'bangun-data.mjs', "(aturanJebakan === 'gabungan' ? (b.n2 === 'BLOKIR' || b.ds === 'BLOKIR' ? 'BLOKIR' : 'AMAN') : sepakat ? b.n2 : null)", '(sepakat ? b.n2 : null)'],
  ['D2 data: fakta kembali ke kesepakatan saja (B3 putaran 4)', 'bangun-data.mjs', ": sepakat ? b.n2 : null) : b.n2;", ': sepakat ? b.n2 : null) : sepakat ? b.n2 : null;'],
  ['K1 beku: batas (b) kembali ke nilai2 saja di semua kasus (C55)', 'beku.mjs', "(kasus === 'b' ? b.benar : (b.benarSepakat ?? b.benar))", 'b.benar'],
  ['K2 beku: batas (b) mengabaikan kasus arbitrase (SF4 putaran 4)', 'beku.mjs', "(kasus === 'b' ? b.benar : (b.benarSepakat ?? b.benar))", '(b.benarSepakat ?? b.benar)'],
  ['V1 validasi: ambang arbitrase (a) dilonggarkan', 'validasi.mjs', "pDs >= 0.7 ? 'a'", "pDs >= 0.6 ? 'a'"],
  ['P1 patok: blok (kunciPascaBeku/kunciPraVonis) boleh ditulis dua kali', 'patok-s1.mjs', 'if (new RegExp(`"${nama}"`).test(teks)) throw', 'if (false) throw'],
  ['P2 patok: waktu kunci tanpa Z diterima', 'patok-s1.mjs', 'if (!INTI.isoUtc(iso)) throw', 'if (false) throw'],
  ['P3 patok: penghitung baris dihapus buta', 'patok-s1.mjs', 'if (k < b.length) j = k + 1; else hilang++;', 'if (k < b.length) j = k + 1;'],
  ['P4 patok: --kunci tanpa sidik kode diterima (B1 putaran 4)', 'patok-s1.mjs', "!/^[0-9a-f]{64}$/.test(String(blok.sha256Kode))", 'false'],
  // riwayat-s1 (putaran 4, SF1/SF10): pemeriksa riwayat git yang dipakai patok DAN pemuat
  ['R1 riwayat: JSONL boleh mengubah baris lama', 'riwayat-s1.mjs', 'if (la.length <= lb.length && la.every((x, k) => x === lb[k])) continue;', 'continue;'],
  ['R2 riwayat: label audit boleh diubah (undian ulang)', 'riwayat-s1.mjs', "Object.keys(pa).every((k) => k in pb && JSON.stringify(pa[k]) === JSON.stringify(pb[k]))", 'true'],
  ['R3 riwayat: berkas hasil boleh lahir sebelum patok pasca-beku', 'riwayat-s1.mjs', 'x.commit === cPb || !leluhur(git, cPb, x.commit)', 'false'],
  ['R4 riwayat: teks pra-daftar boleh kehilangan baris', 'riwayat-s1.mjs', 'const h = barisHilang(teks[teks.length - 1], teksKini); if (h)', 'const h = 0; if (h)'],
  ['R5 riwayat: blok patok boleh berubah sesudah commitnya', 'riwayat-s1.mjs', "!== JSON.stringify(pdAkhir[nama])) masalah.push(", '!== JSON.stringify(pdAkhir[nama]) && false) masalah.push('],
  ['R6 riwayat: blok diperkenalkan di dua cabang diterima', 'riwayat-s1.mjs', 'if (cs.length !== 1) {', 'if (cs.length === 0) {'],
  ['W1 pemuat: riwayat tiga patok tidak diperiksa', V, 'return RIW.commitPatok(gitR, { relPd, teksKini: teksPd, stempel });', 'return { masalah: [] };'],
  ['W2 pemuat: riwayat berkas hasil tidak diperiksa', V, 'if (!riw.cPv || !riw.cPb) return [];', 'return [];'],
  // pelari (putaran 4, B2): hanya run lengkap & sah yang menulis s1-selesai
  ['G1 pelari: run dengan < 16 pasangan sah menulis s1-selesai', 'pg-berpasangan.mjs', 'if (pasanganSah.length < target) return', 'if (false) return'],
  ['G2 pelari: dua pasangan tidak sah berturut-turut tidak menghentikan', 'pg-berpasangan.mjs', 'riwayatSah.slice(-2).every((x) => !x)', 'false'],
];
let buta = 0;
for (const [nama, berkas, a, b] of MUTAN) {
  const asli = fs.readFileSync(path.join(DI_SINI, berkas), 'utf8');
  if (!asli.includes(a)) { console.log(`?? ${nama}: jangkar tidak ada di ${berkas}`); buta++; continue; }
  const f = path.join(DI_SINI, `_mutan-${berkas}`);
  fs.writeFileSync(f, asli.split(a).join(b));
  let keluar = '';
  try { keluar = execFileSync(process.execPath, [f, '--uji'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { keluar = String(e.stdout || '') + String(e.stderr || ''); }
  finally { fs.rmSync(f, { force: true }); }
  const merah = (keluar.match(/^✗ .*/gm) || []).map((x) => x.slice(2, 70));
  console.log(`${merah.length ? 'TERTANGKAP' : 'LOLOS!!  '} ${nama}${merah.length ? ` ← ${merah[0]}` : ''}`);
  if (!merah.length) buta++;
}
console.log(buta ? `${buta} mutan tidak tertangkap` : `semua mutan tertangkap (${MUTAN.length})`);
process.exit(buta ? 1 : 0);
