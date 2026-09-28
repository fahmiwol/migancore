#!/usr/bin/env node
/**
 * peta-jalur.mjs — membangkitkan PETA JALUR RISET dari seluruh pra-daftar.
 *
 * Kerangka Fahmi, 18 Sep 2026 (disarikan): riset adalah membuat peta jalur — tiap cabang dicoba
 * satu per satu, yang salah ditandai, dan perjalanannya dicatat, supaya jalan buntu hari ini
 * bisa tersambung dengan jawaban dari percobaan lain kelak.
 *
 * Kenapa ini alat, bukan dokumen: jalan buntu SUDAH tercatat di tiap pra-daftar (`vonis`,
 * `kalauGagal`/`kalauSalah`), tetapi tersebar di 25 berkas sehingga tidak bisa DIBACA SEBAGAI
 * PETA. Yang hilang bukan datanya — melainkan pandangan dari atas. Berkas ini menyusunnya:
 * cabang mana sudah dicoba, mana yang buntu, apa yang ditutupnya, dan ke mana ia menunjuk.
 *
 * Dibangkitkan, JANGAN disunting tangan. Keluaran: docs/jarvis/PETA-JALUR-RISET.md
 * Pakai: node flywheel/peta-jalur.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const AKAR = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '..');
const FLY = path.join(AKAR, 'flywheel');
const KELUAR = path.join(AKAR, 'docs', 'jarvis', 'PETA-JALUR-RISET.md');

const rapikan = (v, n = 400) => {
  if (v == null) return null;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.replace(/\s+/g, ' ').trim().slice(0, n);
};

/**
 * Hipotesis ditulis dengan dua bentuk di repo ini: string lugas, atau objek bersarang
 * { H-xxx: { pertanyaan, klaim, ... } }. Peta yang menumpahkan JSON mentah tidak akan
 * dibaca orang yang sedang berdiri di jalan buntu — jadi bentuk objek diambil kalimat
 * pertanyaannya, bukan seluruh strukturnya.
 */
const ambilHipotesis = (h) => {
  if (!h) return null;
  if (typeof h === 'string') return rapikan(h, 300);
  const dalam = Object.values(h)[0];
  if (dalam && typeof dalam === 'object') {
    const t = dalam.pertanyaan || dalam.klaim || dalam.hipotesis;
    if (t) return rapikan(t, 300);
  }
  return rapikan(h, 300);
};

const berkas = fs.readdirSync(FLY).filter((f) => /^PRA-DAFTAR-.*\.json$/.test(f)).sort();
const jalur = [];
const medanTakBaku = [];

for (const f of berkas) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(FLY, f), 'utf8')); } catch { continue; }
  const id = f.replace(/^PRA-DAFTAR-|\.json$/g, '');
  const v = j.vonis || {};
  // Dua nama medan hidup berdampingan di repo ini — dibaca keduanya, dan ketidakbakuannya
  // dilaporkan, bukan didiamkan. Peta yang medannya tidak baku akan bocor diam-diam.
  const kalau = j.kalauGagal ?? j.kalauSalah ?? null;
  if (j.kalauSalah && !j.kalauGagal) medanTakBaku.push(`${id}: kalauSalah`);
  jalur.push({
    id,
    judul: rapikan(j.nama || j.judul || j.episode, 160),
    tanggal: j.tanggal || v.tanggal || null,
    keadaan: v.keadaan || 'tanpa',
    hasil: rapikan(v.hasil, 420),
    hipotesis: ambilHipotesis(j.hipotesis),
    kalau: rapikan(kalau, 420),
    diakui: Array.isArray(j.yangTIDAKdilakukanDanDIAKUI) ? j.yangTIDAKdilakukanDanDIAKUI.length : null,
    amendemen: Array.isArray(j.amendemen) ? j.amendemen.length : (Array.isArray(j.amendemen_) ? j.amendemen_.length : 0),
  });
}

const urut = { gagal: 0, netral: 1, lulus: 2, belum: 3, tanpa: 4 };
jalur.sort((a, b) => (urut[a.keadaan] ?? 9) - (urut[b.keadaan] ?? 9) || String(a.tanggal).localeCompare(String(b.tanggal)));
const hitung = jalur.reduce((a, x) => ((a[x.keadaan] = (a[x.keadaan] || 0) + 1), a), {});

const bagian = (kunci, judul, pengantar) => {
  const isi = jalur.filter((x) => x.keadaan === kunci);
  if (!isi.length) return '';
  let t = `\n## ${judul} — ${isi.length}\n\n> ${pengantar}\n`;
  for (const x of isi) {
    t += `\n### \`${x.id}\`${x.tanggal ? ` · ${x.tanggal}` : ''}\n`;
    if (x.judul) t += `**${x.judul}**\n\n`;
    if (x.hipotesis) t += `- **Yang ditanya:** ${x.hipotesis}\n`;
    if (x.hasil) t += `- **Vonis:** ${x.hasil}\n`;
    if (x.kalau) t += `- **Ke mana ia menunjuk:** ${x.kalau}\n`;
    if (x.amendemen) t += `- _${x.amendemen} amandemen bertanggal_\n`;
    if (x.diakui) t += `- _${x.diakui} batas yang diakui sendiri_\n`;
  }
  return t;
};

let md = `# PETA JALUR RISET MiganCore — cabang yang sudah dicoba, dan ke mana tiap ujungnya menunjuk

> **DIBANGKITKAN** oleh \`flywheel/peta-jalur.mjs\` dari ${berkas.length} berkas pra-daftar.
> Jangan disunting tangan — jalankan ulang.
>
> **Kenapa peta ini ada.** Kerangka Fahmi, 18 Sep 2026: riset adalah membuat peta jalur — tiap
> cabang dicoba satu per satu, yang salah ditandai, dan perjalanannya dicatat, supaya jalan
> buntu hari ini bisa tersambung dengan jawaban dari percobaan lain kelak. Jalan buntu sudah lama tercatat di tiap pra-daftar; yang hilang
> adalah **pandangan dari atas**. Sebuah jalan buntu yang tercatat rapi bukan kerugian — ia
> **batas yang sudah dibayar**, dan batas yang diketahui letaknya bisa dipakai lagi.

**Dibangkitkan:** ${new Date().toISOString()} · **jalur tercatat:** ${jalur.length}
**Keadaan:** ${Object.entries(hitung).map(([k, n]) => `${k} ${n}`).join(' · ')}

**Cara membaca:** urutannya **bukan** dari yang berhasil, melainkan dari yang **paling banyak
mengajari** — buntu lebih dulu. Tiap entri menjawab tiga hal: apa yang ditanya, apa vonisnya,
dan **ke mana ia menunjuk** (medan \`kalauGagal\`/\`kalauSalah\`, ditulis SEBELUM data).
`;

md += bagian('gagal', '🔴 Jalan buntu — sudah ditandai, jangan diulang tanpa alasan baru',
  'Ini yang paling berharga di peta. Tiap entri memberi tahu di mana temboknya, dan berapa jauh kita sempat melangkah sebelum menabraknya.');
md += bagian('netral', '🟡 Buntu sebagian — tidak menentukan, tetapi batasnya terukur',
  'Bukan gagal dan bukan lulus. Biasanya artinya alat ukurnya tidak cukup, bukan idenya salah — dan itu keterangan arah yang berbeda.');
md += bagian('lulus', '🟢 Jalur yang terbuka',
  'Lulus terhadap pertanyaannya SENDIRI. Tidak otomatis berarti jalur ini yang harus ditempuh berikutnya.');
md += bagian('belum', '⚪ Cabang yang sudah dikunci ambangnya, belum dijalani',
  'Ambang sudah ditulis sebelum data. Ini utang yang paling murah dibayar — separuh disiplinnya sudah selesai.');

md += `\n---\n\n## Cara menyambungkan jalan buntu di kemudian hari\n
Peta ini berguna kalau, saat menemui buntu BARU, seseorang membaca kolom **"ke mana ia menunjuk"**
dari buntu LAMA. Contoh nyata yang sudah terjadi di proyek ini:

- **H-RAGU** buntu (keraguan bukan sinyal pengetahuan, C60) → medan \`kalauSalah\`-nya sudah
  menunjuk **retrieval** sebelum datanya ada. Arah riset pindah ke sana **tanpa perdebatan baru**.
- **V16-JUJUR** buntu (gold manusia tidak memindahkan kejujuran) → gold-nya **tidak hangus**,
  ia berpindah jadi kolam verifikator RLVR. Bahan dari jalur buntu dipakai di jalur lain.
- **A3/A4** buntu (aturan ambang bibit patah di atas jangkar barunya) → yang lahir bukan jalan
  keluar, melainkan **pengukuran yang lebih jujur**: syarat bibit dinyatakan TIDAK TERDEFINISI
  daripada dipasang dengan ambang yang meloloskan semua.
`;

if (medanTakBaku.length) {
  md += `\n> ⚠️ **Medan belum baku:** ${medanTakBaku.length} pra-daftar memakai \`kalauSalah\`
> sementara sisanya \`kalauGagal\`. Peta ini membaca keduanya, tetapi nama yang tidak baku adalah
> cara peta bocor diam-diam nanti (kelas C38). Bakukan pada pra-daftar berikutnya:
> ${medanTakBaku.join(' · ')}\n`;
}

fs.mkdirSync(path.dirname(KELUAR), { recursive: true });
fs.writeFileSync(KELUAR, md);
console.log(`peta jalur: ${jalur.length} jalur · ${Object.entries(hitung).map(([k, n]) => `${k} ${n}`).join(' · ')} → ${path.relative(AKAR, KELUAR)}`);
if (medanTakBaku.length) console.log(`catatan: ${medanTakBaku.length} pra-daftar memakai medan kalauSalah (belum baku)`);
