#!/usr/bin/env node
/**
 * jaga-stempel-waktu.mjs — penjaga aturan #20 (feedback-cacat-proses-agen): stempel waktu ditulis dari
 * JAM, bukan dari perkiraan.
 *
 * Aturannya sudah prosa sejak 15 Sep, dan terulang dua kali pada 23 Sep ("15:55Z" padahal 15:39Z;
 * "~16:10Z" padahal 16:04Z). Arah salahnya selalu sama: stempel LEBIH LAMBAT dari kenyataan — di
 * pra-daftar itu membuat amandemen terbaca seperti ditulis SESUDAH data.
 *
 * Cara: untuk tiap baris berkas SEKARANG yang memuat stempel UTC (ISO `2026-09-23T16:04Z` atau
 * `23 Sep 16:04Z`), `git blame` memberi jam commit yang memasukkan baris itu. Stempel > jam commit
 * + toleransi = ditulis dari perkiraan. Baris ramalan/perkiraan yang sengaja menyebut masa depan
 * ditandai kata "perkiraan", "diperkirakan", "ETA", "ramalan", atau "selesai sekitar" — dilewati.
 *
 * Lingkup: flywheel/PRA-DAFTAR-*.json (selalu) + berkas .md/.json di docs/, flywheel/, riset/ yang
 * berubah dalam 7 hari terakhir. Isi SEKARANG yang dinilai, jadi stempel yang sudah dibetulkan tidak
 * menghantui selamanya.
 *
 *   node eval/jaga-stempel-waktu.mjs          # pindai
 *   node eval/jaga-stempel-waktu.mjs --uji    # uji luring
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AKAR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TOLERANSI_DTK = 120;
const BULAN = { jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, may: 4, jun: 5, jul: 6, agu: 7, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11 };
// Baris yang sengaja menyebut MASA DEPAN: ramalan/perkiraan, atau nilai data berjadwal (jatuh tempo
// pengingat F-049d: "due 2026-06-17T05:00Z (=12:00 WIB besok)" — positif palsu pertama pindaian 23 Sep).
const RAMALAN = /perkiraan|diperkirakan|\bETA\b|ramalan|selesai sekitar|besok|\bdue\b|tenggat|jatuh tempo|deadline/i;

/** Semua stempel UTC di satu baris → epoch detik. `tahunBawaan` untuk bentuk "23 Sep 16:04Z". */
export function stempelDiBaris(baris, tahunBawaan) {
  const out = [];
  for (const m of baris.matchAll(/\b(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z\b/g)) {
    out.push({ teks: m[0], epoch: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 1000 });
  }
  for (const m of baris.matchAll(/\b(\d{1,2}) (Jan|Feb|Mar|Apr|Mei|May|Jun|Jul|Agu|Aug|Sep|Okt|Oct|Nov|Des|Dec)[a-z]*\.?(?: (\d{4}))? (\d{1,2}):(\d{2})Z\b/gi)) {
    const bln = BULAN[m[2].toLowerCase().slice(0, 3)];
    if (bln === undefined) continue;
    out.push({ teks: m[0], epoch: Date.UTC(+(m[3] || tahunBawaan), bln, +m[1], +m[4], +m[5]) / 1000 });
  }
  return out;
}

/** Urai `git blame --line-porcelain` → [{ baris, isi, epochCommit, sha }]. */
export function uraiBlame(teks) {
  const hasil = [];
  let cur = null;
  for (const l of teks.split('\n')) {
    const kepala = l.match(/^([0-9a-f]{40}) \d+ (\d+)/);
    if (kepala) { cur = { sha: kepala[1], baris: +kepala[2] }; continue; }
    if (!cur) continue;
    if (l.startsWith('committer-time ')) cur.epochCommit = +l.slice(15);
    else if (l.startsWith('\t')) { hasil.push({ ...cur, isi: l.slice(1) }); cur = null; }
  }
  return hasil;
}

/** Pelanggaran: stempel > jam commit baris itu + toleransi, kecuali baris ramalan. */
export function pelanggaran(barisBlame, toleransi = TOLERANSI_DTK) {
  const out = [];
  for (const b of barisBlame) {
    if (!b.epochCommit || RAMALAN.test(b.isi)) continue;
    const tahun = new Date(b.epochCommit * 1000).getUTCFullYear();
    for (const s of stempelDiBaris(b.isi, tahun)) {
      if (s.epoch > b.epochCommit + toleransi) out.push({ baris: b.baris, stempel: s.teks, commit: b.sha.slice(0, 7), jamCommit: new Date(b.epochCommit * 1000).toISOString().slice(0, 16) + 'Z', lebihMenit: Math.round((s.epoch - b.epochCommit) / 60) });
    }
  }
  return out;
}

function git(args) { return execFileSync('git', ['-C', AKAR, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); }

export function berkasDalamLingkup() {
  const pra = git(['ls-files', 'flywheel/PRA-DAFTAR-*.json']).split('\n').filter(Boolean);
  const baru = git(['log', '--since=7 days ago', '--name-only', '--format=', '--', 'docs', 'flywheel', 'riset']).split('\n')
    .filter((f) => /\.(md|json)$/.test(f));
  const ada = new Set(git(['ls-files']).split('\n'));
  return [...new Set([...pra, ...baru])].filter((f) => ada.has(f));
}

function uji() {
  let n = 0, bad = 0;
  const cek = (nama, ok, info = '') => { n++; console.log(`${ok ? '✓' : '✗'} ${nama}${ok ? '' : `  ← ${info}`}`); if (!ok) bad++; };
  const e = (iso) => Date.parse(iso) / 1000;
  cek('ISO dengan dan tanpa detik terurai', JSON.stringify(stempelDiBaris('ditulis 2026-09-23T15:23Z, lalu 2026-09-23T15:13:41Z', 2026).map((s) => s.epoch)) === JSON.stringify([e('2026-09-23T15:23:00Z'), e('2026-09-23T15:13:41Z')]));
  cek('bentuk "23 Sep 15:39Z" dan "23 Sep 2026 16:04Z" terurai', JSON.stringify(stempelDiBaris('**23 Sep 15:39Z** dan 23 Sep 2026 16:04Z', 2026).map((s) => s.epoch)) === JSON.stringify([e('2026-09-23T15:39:00Z'), e('2026-09-23T16:04:00Z')]));
  cek('jam tanpa Z (WIB) TIDAK dihitung', stempelDiBaris('22:05 WIB, 23 Sep 22:05', 2026).length === 0);
  const blame = [
    '0123456789abcdef0123456789abcdef01234567 1 1 1', `committer-time ${e('2026-09-23T15:39:30Z')}`, '\t- ⚠️ **Koreksi 23 Sep 15:55Z (F-271).**',
    '89abcdef0123456789abcdef0123456789abcdef 2 2 1', `committer-time ${e('2026-09-23T16:04:15Z')}`, '\t> **Koreksi 23 Sep 16:04Z (F-274):**',
    'fedcba9876543210fedcba9876543210fedcba98 3 3 1', `committer-time ${e('2026-09-23T15:30:00Z')}`, '\tperkiraan selesai 16:55Z (E2A)',
  ].join('\n');
  const B = uraiBlame(blame);
  cek('blame porselen terurai: 3 baris dengan jam commit', B.length === 3 && B.every((b) => b.epochCommit > 0));
  const p = pelanggaran(B);
  cek('kasus nyata 23 Sep: "15:55Z" di commit 15:39 TERTANGKAP (+16 mnt)', p.length === 1 && p[0].stempel.includes('15:55Z') && p[0].lebihMenit === 16, JSON.stringify(p));
  cek('stempel dari jam (16:04Z di commit 16:04:15) lolos', !p.some((x) => x.stempel.includes('16:04Z')));
  cek('baris ramalan ("perkiraan selesai 16:55Z") dilewati', !p.some((x) => x.stempel.includes('16:55Z')));
  cek('nilai data berjadwal (jatuh tempo pengingat "due … besok") dilewati', pelanggaran([{ baris: 20, sha: 'b'.repeat(40), epochCommit: e('2026-06-16T04:59:46Z'), isi: 'DB row due `2026-06-17T05:00Z` (=12:00 WIB besok)' }]).length === 0);
  cek('kelas kedua: tanggal WIB + jam UTC ("2026-09-11T17:55Z" di commit 10 Sep 17:45Z) TERTANGKAP', pelanggaran([{ baris: 4, sha: 'c'.repeat(40), epochCommit: e('2026-09-10T17:45:22Z'), isi: '"dikunci": "2026-09-11T17:55Z",' }]).length === 1);
  cek('toleransi 120 dtk: 16:06Z di commit 16:04:15 masih lolos, 16:07Z tertangkap', pelanggaran([{ baris: 1, sha: 'a'.repeat(40), epochCommit: e('2026-09-23T16:04:15Z'), isi: 'catatan 2026-09-23T16:06Z' }]).length === 0 && pelanggaran([{ baris: 1, sha: 'a'.repeat(40), epochCommit: e('2026-09-23T16:04:15Z'), isi: 'catatan 2026-09-23T16:07Z' }]).length === 1);
  console.log(bad === 0 ? `jaga-stempel-waktu: ${n} uji lulus` : `jaga-stempel-waktu: ${bad} gagal dari ${n}`);
  return bad === 0 ? 0 : 1;
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) {
  if (process.argv.includes('--uji')) process.exit(uji());
  const semua = [];
  const berkas = berkasDalamLingkup();
  for (const f of berkas) {
    let b;
    try { b = uraiBlame(git(['blame', '--line-porcelain', '--', f])); } catch { continue; }
    for (const v of pelanggaran(b)) semua.push({ berkas: f, ...v });
  }
  for (const v of semua) console.log(`✗ ${v.berkas}:${v.baris} — "${v.stempel}" ${v.lebihMenit} mnt SESUDAH commit ${v.commit} (${v.jamCommit})`);
  console.log(semua.length ? `${semua.length} stempel ditulis dari perkiraan (lebih lambat dari commit-nya) di ${berkas.length} berkas.` : `LULUS — ${berkas.length} berkas, tidak ada stempel yang mendahului commit-nya.`);
  process.exit(semua.length ? 1 : 0);
}
