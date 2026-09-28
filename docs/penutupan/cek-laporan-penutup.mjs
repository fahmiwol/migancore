// Pemeriksa fakta laporan penutup (bab 09, EN + ID) terhadap berkas sumber di repo kerja.
// Tiap klaim: teks yang harus ada di bab EN (dan padanan ID), dan nilai yang dihitung ULANG dari sumber.
// Dipakai 28 Sep 2026 sebelum v1.3.0 terbit: 33 pemeriksaan lulus, dan terbukti menangkap 2 kesalahan tanam.
//   node docs/penutupan/cek-laporan-penutup.mjs        (RM=<klon repo publik> untuk menguji salinan lain)
import fs from 'node:fs';
const MC = './';
const RM = process.env.RM || '.-research-method/';
const baca = (p) => fs.readFileSync(p, 'utf8');
const rata = (t) => t.replace(/\s+/g, ' ');
const EN = rata(baca(RM + 'docs/en/09-closing-report.md'));
const ID = rata(baca(RM + 'docs/id/09-laporan-penutup.md'));
const READMEen = rata(baca(RM + 'README.md')), READMEid = rata(baca(RM + 'README.id.md'));
let gagal = 0;
const cek = (nama, ok, rinci = '') => { console.log(`${ok ? '✓' : '✗'} ${nama}${rinci ? ' — ' + rinci : ''}`); if (!ok) gagal++; };
const r1 = (x) => (Math.round(x * 10 + 1e-9 * Math.sign(x)) / 10).toFixed(1);
const idNum = (s) => s.replace(/\./g, ',');
const ada = (teksEn, teksId = idNum(teksEn)) => EN.includes(teksEn) && ID.includes(teksId);
const ciT = (x, t) => { const n = x.length, m = x.reduce((a, b) => a + b) / n, sd = Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return { m, lo: m - t * sd / Math.sqrt(n), hi: m + t * sd / Math.sqrt(n) }; };

// --- A3I-ULANG (dihitung ulang dari triplet) ---
const A = JSON.parse(baca(MC + 'eval/HASIL-A3I-2026-09-24T19-22-38.json'));
const sah = A.triplet.filter((t) => ['S', 'B', 'M'].every((l) => t.lengan[l]?.sah));
cek('A3I: 10 triplet sah', sah.length === 10 && EN.includes('Ten valid triplets') && ID.includes('Sepuluh triplet sah'), `${sah.length}`);
const B = ciT(sah.map((t) => t.lengan.B.MENGARANG), 2.262), M = ciT(sah.map((t) => t.lengan.M.MENGARANG), 2.262);
const D = ciT(sah.map((t) => t.lengan.B.MENGARANG - t.lengan.M.MENGARANG), 2.262);
cek('A3I base 14.7 (11.3–18.0)', ada(`**${r1(B.m)} %** | ${r1(B.lo)}–${r1(B.hi)}`), `${B.m.toFixed(3)} [${B.lo.toFixed(3)}, ${B.hi.toFixed(3)}]`);
cek('A3I 0.14 53.7 (48.7–58.7)', ada(`**${r1(M.m)} %** | ${r1(M.lo)}–${r1(M.hi)}`), `${M.m.toFixed(3)} [${M.lo.toFixed(3)}, ${M.hi.toFixed(3)}]`);
cek('A3I selisih −39.1 (−44.1 s.d. −34.1)', EN.includes(`−${r1(-D.m)} points (95 % CI −${r1(-D.lo)} to −${r1(-D.hi)})`) && ID.includes(`−${idNum(r1(-D.m))} poin (CI 95 % −${idNum(r1(-D.lo))} s.d. −${idNum(r1(-D.hi))})`), `${D.m.toFixed(3)} [${D.lo.toFixed(3)}, ${D.hi.toFixed(3)}]`);
const pd = JSON.parse(baca(MC + 'flywheel/PRA-DAFTAR-A3I-ULANG.json')).vonis.mekanis;
cek('A3I over-refusal fakta B 16.25 vs M 0', pd.pengawal.B.over === 16.25 && pd.pengawal.M.over === 0 && ada('16.25 %') , `${pd.pengawal.B.over} vs ${pd.pengawal.M.over}`);
cek('A3I pengawal +10 poin & 8 soal fakta = 12.5', /\+ ?10,0/.test(pd.syaratAntiMengelak)
  && /8 soal fakta, jadi satu soal = 12,5 pp/.test(JSON.parse(baca(MC + 'flywheel/PRA-DAFTAR-A3I-ULANG.json')).vonis.batasInstrumenDiakui)
  && ada('+10-point', '+10 poin') && ada('12.5 points', '12,5 poin'));
for (const [en, id] of [['14.7 %', '14,7 %'], ['53.7 %', '53,7 %'], ['−39.1 points', '−39,1 poin'], ['95 % CI −44.1 to −34.1', 'CI 95 % −44,1 s.d. −34,1']])
  cek(`README Status memuat ${en}`, READMEen.includes(en) && READMEid.includes(id));

// --- SB1 (dari berkas hasil mentah) ---
const S = JSON.parse(baca(MC + 'eval/HASIL-SB1-2026-09-25T11-44-18.json'));
const des = S.deskriptif, pg = S.pengawal;
cek('SB1 fabrication Q3/Q4/Q9 16.5/32.6/25.0', ada(`| ${r1(des.Q3.rata)} % | ${r1(pg.Q3.fakta)} % |`) && ada(`| ${r1(des.Q4.rata)} % | ${r1(pg.Q4.fakta)} % |`) && ada(`| ${r1(des.Q9.rata)} % | ${r1(pg.Q9.fakta)} % |`), `${des.Q3.rata}/${des.Q4.rata}/${des.Q9.rata} · fakta ${pg.Q3.fakta}/${pg.Q4.fakta}/${pg.Q9.fakta}`);
cek('SB1 over-refusal 1.6 vs 17.2', ada(`${r1(pg.Q9.over)} % vs ${r1(pg.Q3.over)} %`), `${pg.Q9.over} vs ${pg.Q3.over}`);
const sb1 = JSON.parse(baca(MC + 'flywheel/PRA-DAFTAR-SB1-SELEKSI-BASE.json')).vonis;
cek('SB1 baku D_Q4 +16.1 (8.4–23.7)', /D_Q4 = \+16,06 pp \(CI95 per-triplet 8,41–23,71\)/.test(sb1.skorBaku) && ada('+16.1 points, 95 % CI 8.4–23.7', '+16,1 poin, CI 95 % 8,4–23,7'));
cek('SB1 pesimistis D_Q4 +1.8 SETARA_5PP', /D_Q4 = \+1,79 pp .*SETARA_5PP/.test(sb1.skorPesimistis) && ada('(+1.8)', '(+1,8)'));
cek('SB1 Q9 TIDAK_MENENTUKAN di kedua skor, tak ada kandidat lebih jujur', /D_Q9 = \+8,49 pp.*TIDAK_MENENTUKAN/.test(sb1.skorBaku) && /D_Q9 = \+3,11 pp.*TIDAK_MENENTUKAN/.test(sb1.skorPesimistis) && sb1.hasil.startsWith('TETAP_Q3'));
cek('README Status SB1 32.6 / 25.0 / 16.5', ['32.6 %', '25.0 %', '16.5 %'].every((x) => READMEen.includes(x)) && ['32,6 %', '25,0 %', '16,5 %'].every((x) => READMEid.includes(x)));

// --- Angka yang sudah terbit (README Status lama) ---
for (const x of ['52.2 %', '33.9 %', '28.9 %', '8.9 %', '24.55 %', '49.99 %']) cek(`sudah terbit: ${x}`, READMEen.includes(x) && EN.includes(x));
cek('probe 10–17 detik (doc 111 §1)', /probe gerbang makan 10–17 dtk/.test(baca(MC + 'docs/jarvis/111_TUTUP_ATAU_BELOK.md')) && ada('10–17 seconds', '10–17 detik'));

// --- Gerbang-S1 (pra-daftar) ---
const G = JSON.parse(baca(MC + 'flywheel/PRA-DAFTAR-GERBANG-S1.json'));
cek('encoder mmBERT-base 322M', /mmBERT-base 322M/.test(baca(MC + 'eval/gerbang-s1/latih_s1.py')) && ada('322M parameters', '322 juta parameter'));
const rm = G.ramalan_DINILAI_NANTI, pS = rm.olehSaya_v1_2, pC = rm.olehCodex_27Sep;
const menangS = +(pS.MENANG_LEBIH_BAIK + pS.MENANG_SETARA).toFixed(2), menangC = +(pC.MENANG_LEBIH_BAIK + pC.MENANG_SETARA).toFixed(2);
cek('ramalan 0.23 (agen) / 0.30 (Codex)', menangS === 0.23 && menangC === 0.3 && ada('0.23 (ours) and 0.30', '0,23 (kami) dan 0,30'), `${menangS} / ${menangC}`);
const pf = G.dayaUji_v1_2.paketFinal;
cek('simulasi daya 0,69–0,98 merata / 0,23–0,63 heterogen', /s = g \+ 0,2 atau lebih → 0,69–0,98/.test(pf) && /s ≥ g \+ 0,2 → 0,23–0,63/.test(pf) && ada('0.69–0.98', '0,69–0,98') && ada('0.23–0.63', '0,23–0,63'));
cek('lima soal = 78 % karangan', /5 soal menyumbang 78 % karangan/.test(G.dayaUji_v1_2.temuan2_konsentrasi) && ada('78 %', '78 %'));
const sahMin = 1 - Math.max(rm.olehSaya_v1.TIDAK_SAH_INSTRUMEN, pS.TIDAK_SAH_INSTRUMEN, pC.TIDAK_SAH_INSTRUMEN), sahMaks = 1 - Math.min(rm.olehSaya_v1.TIDAK_SAH_INSTRUMEN, pS.TIDAK_SAH_INSTRUMEN, pC.TIDAK_SAH_INSTRUMEN);
cek('peluang run sah ±0,8 (0,77–0,80) → batas atas 0,98 × 0,80 ≈ 0,78', Math.abs(sahMin - 0.77) < 1e-9 && Math.abs(sahMaks - 0.8) < 1e-9 && Math.abs(0.98 * sahMaks - 0.784) < 1e-9 && ada('**≈ 0.78**', '**≈ 0,78**'), `sah ${sahMin.toFixed(2)}–${sahMaks.toFixed(2)}`);
cek('perkiraan realistis 0,20–0,35 sama dengan blok penghentian', /0,20–0,35/.test(G.penghentian_28Sep.auditPeluang.hasil) && ada('0.20–0.35', '0,20–0,35'));
cek('vonis pra-daftar = DIHENTIKAN, netral', G.vonis.hasil.startsWith('DIHENTIKAN') && G.vonis.keadaan === 'netral');
const mut = baca(MC + 'docs/penutupan/mutasi-vonis-28sep.txt'); // keluaran mutasi-vonis.mjs 28 Sep (54/54), diarsip di sini
cek('mutasi 54/54', /semua mutan tertangkap \(54\)/.test(mut) && ada('54 of 54', '54 dari 54'));
const t1 = G.tinjauanAdversarial_28Sep ? JSON.stringify(G.tinjauanAdversarial_28Sep) : '';
cek('putaran 1 juga menemukan pemblokir', /pemblokir|PEMBLOKIR|blocker/i.test(t1), t1 ? `${t1.length} karakter` : 'blok tidak ada');

// --- Paritas angka EN ↔ ID (bab 09) ---
const angka = (s) => (s.match(/[−+-]?\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.').replace('−', '-')).filter((x) => !/^20\d\d$/.test(x));
const hitung = (a) => a.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
const e = hitung(angka(EN)), i = hitung(angka(ID));
const beda = [...new Set([...Object.keys(e), ...Object.keys(i)])].filter((k) => (e[k] || 0) !== (i[k] || 0));
cek('paritas angka EN ↔ ID bab 09', beda.length === 0, beda.map((k) => `${k}: EN ${e[k] || 0} / ID ${i[k] || 0}`).join('; '));
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nsemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
