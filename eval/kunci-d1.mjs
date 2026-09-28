#!/usr/bin/env node
/**
 * kunci-d1.mjs — alat KUNCI pra-daftar D1 (flywheel/PRA-DAFTAR-D1-NPC-SPESIALIS.json), dipakai sekali.
 *
 * sidikWajib = blob git (CRLF→LF) tiap berkas dari berkasTerpatokD1() (penutupan impor transitif penilai & pelari + beban +
 * instruksi + rubrik juri); lalu dikunci:true, dikunciPada (dari jam), buktiKunci, status; lalu sidikKeputusan = sha256 medan
 * keputusan (dihitung SESUDAH sidikWajib terisi). Suntingan TEKS tepat-sekali — format tangan pra-daftar dijaga (tulis ulang
 * penuh akan mengacak seluruh diff) — dan diperiksa: hasil parse = parse lama + hanya medan kunci yang berubah; sesudah
 * ditulis: sidik & sidikKeputusan cocok. Menolak bila sudah dikunci atau penutupan impor punya yang tak terselesaikan.
 *
 *   node eval/kunci-d1.mjs                 # kering: cetak saja
 *   node eval/kunci-d1.mjs --tulis         # tulis ke pra-daftar (lalu commit = bukti kunci)
 *   node eval/kunci-d1.mjs --akar <dir> …  # salinan lain (gladi bersih)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const arg = process.argv.slice(2);
const akar = arg.includes('--akar') ? path.resolve(arg[arg.indexOf('--akar') + 1]) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const impor = (f) => import(pathToFileURL(path.join(akar, f)).href);
const { hashBlobGit } = await impor('eval/ukur-jujur2-a3i.mjs');
const N = await impor('eval/nilai-d1.mjs');
const F = path.join(akar, N.PRA_DAFTAR_D1);
const teks = fs.readFileSync(F, 'utf8');
const lama = JSON.parse(teks);
if (lama.dikunci !== false) { console.error(`BERHENTI: dikunci = ${lama.dikunci}`); process.exit(1); }
if ('sidikKeputusan' in lama) { console.error('BERHENTI: sidikKeputusan sudah ada'); process.exit(1); }
const tr = N.telusurImporD1(akar);
if (tr.takTerselesaikan.length) { console.error(`BERHENTI: impor tak terselesaikan: ${tr.takTerselesaikan.join(' | ')}`); process.exit(1); }
const berkas = N.berkasTerpatokD1(akar);
const sidik = Object.fromEntries(berkas.map((f) => [f, hashBlobGit(fs.readFileSync(path.join(akar, f)))]));
// Tiap berkas terpatok wajib ada di folder yang dikirim ke mesin ukur (git archive <commit> eval flywheel sistem) DAN identik
// dengan blob-nya di HEAD git — kunci atas berkas kerja yang belum dikomit/di luar arsip tak akan pernah cocok di Bmax
// (tinjauan putaran 6). Salinan gladi wajib berupa repo git juga (git init + commit).
const ARSIP = ['eval', 'flywheel', 'sistem'];
const luarArsip = berkas.filter((f) => !ARSIP.some((d) => f.startsWith(`${d}/`)));
if (luarArsip.length) { console.error(`BERHENTI: berkas terpatok di luar folder arsip (${ARSIP.join(', ')}): ${luarArsip.join(', ')}`); process.exit(1); }
const bedaHead = berkas.filter((f) => {
  const r = spawnSync('git', ['-C', akar, 'rev-parse', '--verify', '--quiet', `HEAD:${f}`], { encoding: 'utf8' });
  return r.status !== 0 || r.stdout.trim() !== sidik[f];
});
if (bedaHead.length) { console.error(`BERHENTI: berkas terpatok tidak identik dengan HEAD git (belum dikomit / tak terlacak / bukan repo): ${bedaHead.join(', ')}`); process.exit(1); }
const putaran = Object.keys(lama).filter((k) => /^tinjauanAdversarial_/.test(k)).length;
const kini = new Date();
const wib = new Date(kini.getTime() + 7 * 3600e3);
const jam = `${String(wib.getUTCHours()).padStart(2, '0')}:${String(wib.getUTCMinutes()).padStart(2, '0')}`;
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const dikunciPada = `${wib.getUTCDate()} ${BULAN[wib.getUTCMonth()]} ${wib.getUTCFullYear()} ±${jam} WIB (${kini.toISOString().slice(0, 16)}Z) — commit yang menyalakan kunci (lihat buktiKunci), BERSAMA sidik final ${berkas.length} berkas (identik dengan HEAD git) dan sidikKeputusan; SESUDAH ${putaran} putaran tinjauan adversarial dan gladi bersih pipa pasca-run pada data sintetis, SEBELUM satu giliran D1 pun dijalankan (asap pun belum).`;
const buktiKunci = "`git log -p -S'\"dikunci\": true' -- flywheel/PRA-DAFTAR-D1-NPC-SPESIALIS.json` (commit yang menyalakan kunci)";
const status = `DIKUNCI — sesudah ${putaran} putaran tinjauan adversarial dan gladi bersih. Pelari berjalan hanya bila dikunci, sidikKeputusan cocok, dan sidik berkas cocok; vonis dihitung sekali oleh nilai-d1 --vonis dan ditulis ke medan vonis.`;

const ganti = (s, a, b, nama) => { const n = s.split(a).length - 1; if (n !== 1) { console.error(`BERHENTI: pola ${nama} muncul ${n}×`); process.exit(1); } return s.replace(a, () => b); };
let t = teks.replace(/\r\n/g, '\n');
t = ganti(t, '\n "dikunci": false,\n', `\n "dikunci": true,\n "dikunciPada": ${JSON.stringify(dikunciPada)},\n "buktiKunci": ${JSON.stringify(buktiKunci)},\n`, 'dikunci');
t = ganti(t, `\n "status": ${JSON.stringify(lama.status)},\n`, `\n "status": ${JSON.stringify(status)},\n`, 'status');
const blokSidik = `\n "sidikWajib": {\n${Object.entries(sidik).map(([f, h]) => `  ${JSON.stringify(f)}: ${JSON.stringify(h)}`).join(',\n')}\n },\n`;
t = ganti(t, '\n "sidikWajib": {},\n', blokSidik, 'sidikWajib');
const sk = N.sidikKeputusanD1(JSON.parse(t));
t = ganti(t, blokSidik, `${blokSidik.slice(0, -1)}\n "sidikKeputusan": ${JSON.stringify(sk)},\n`, 'sidikKeputusan');

const baru = JSON.parse(t);
const harap = { ...lama, dikunci: true, dikunciPada, buktiKunci, status, sidikWajib: sidik, sidikKeputusan: sk };
if (!isDeepStrictEqual(baru, harap)) { console.error('BERHENTI: hasil parse ≠ harapan (medan lain ikut berubah)'); process.exit(1); }
console.log(JSON.stringify({ akar, dikunciPada, berkas: berkas.length, sidikKeputusan: sk, sidik }, null, 1));
if (arg.includes('--tulis')) {
  fs.writeFileSync(F, t);
  const P = N.bacaPraDaftarD1(akar), s = N.periksaSidikD1(P.sidikWajib, akar);
  console.log(`→ ${F} ditulis · dikunci ${P.dikunci} · sidikKeputusanCocok ${P.sidikKeputusanCocok} · sidik ${JSON.stringify(s)}`);
  if (!P.dikunci || !P.sidikKeputusanCocok || !s.cocok) process.exit(1);
}
