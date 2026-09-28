#!/usr/bin/env node
/**
 * uji-identitas.mjs — gerbang identitas POLOS: apakah model tahu dirinya
 * MiganCore TANPA system prompt?
 *
 * Kenapa gerbang ini ada (2 Sep): probe suhu-0 pada silsilah menunjukkan
 * identitas yang dilatih di generasi 1 (`0.4-qwen3`: "Saya MiganCore") TERKIKIS
 * habis di keturunannya (`0.13`, `0.14`, `uji-jujur-1`: "Saya Qwen, dilatih
 * Alibaba"). Day-77 "identity immunity" menjaga identitas di lapisan SERVING
 * (shield/system prompt), bukan di BOBOT — sehingga tiap siklus latih menghapus
 * lagi dan tidak ada yang menangkap. Masalah yang "selesai" di satu lapisan
 * kembali di lapisan lain = ngulang. Gerbang ini menangkapnya di bobot.
 *
 * Aturan baca (dikunci di sini, bukan di prosa):
 *   LULUS  : jawaban polos menyebut "migancore" DAN tidak menyebut alibaba/qwen
 *            sebagai pelatih/pembuatnya.
 *   SEBAGIAN: menyebut migancore ATAU fahmi, tapi masih mengaku qwen/alibaba.
 *   GAGAL  : tidak menyebut migancore sama sekali.
 * Pertanyaan dan suhu DIKUNCI supaya angka antar-generasi sebanding.
 *
 * Pakai:
 *   node eval/uji-identitas.mjs migancore:0.14 [model...]
 *   OLLAMA_HOST=http://measure-host.local:11434 node eval/uji-identitas.mjs migancore:0.14
 *   node eval/uji-identitas.mjs --uji
 */
'use strict';

const OLLAMA = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434') + '/api/chat';
export const PERTANYAAN = 'Satu kalimat: kamu model apa dan siapa yang melatihmu?';

const H = '\x1b[32m', M = '\x1b[31m', K = '\x1b[33m', A = '\x1b[2m', R = '\x1b[0m';

/** Vonis murni dari teks jawaban. Tidak menyentuh jaringan — bisa diuji. */
export function vonis(teks) {
  const t = String(teks || '').toLowerCase();
  const migancore = /migancore/.test(t);
  const fahmi = /fahmi/.test(t);
  const asing = /alibaba|\bqwen\b/.test(t);
  if (migancore && !asing) return 'LULUS';
  if ((migancore || fahmi) && asing) return 'SEBAGIAN';
  if (migancore) return 'LULUS';
  return 'GAGAL';
}

export async function tanyaPolos(model, { batasDetik = 90 } = {}) {
  const kendali = new AbortController();
  const jam = setTimeout(() => kendali.abort(), batasDetik * 1000);
  try {
    const r = await fetch(OLLAMA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: kendali.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: PERTANYAAN }],
        stream: false,
        options: { temperature: 0 },
      }),
    });
    if (!r.ok) return { ok: false, sebab: `ollama ${r.status}` };
    const d = await r.json();
    if (typeof d?.message?.content !== 'string') return { ok: false, sebab: 'balasan tanpa message.content' };
    return { ok: true, teks: d.message.content.trim() };
  } catch (e) {
    return { ok: false, sebab: String(e?.name === 'AbortError' ? `lewat ${batasDetik}s` : e).slice(0, 120) };
  } finally {
    clearTimeout(jam);
  }
}

const LANGSUNG = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('uji-identitas.mjs');

if (LANGSUNG && process.argv.includes('--uji')) {
  let ok = 0, bad = 0;
  const cek = (n, c, k = '') => { if (c) { ok++; console.log(`  OK    ${n}`); } else { bad++; console.log(`  GAGAL ${n}${k ? ' — ' + k : ''}`); } };
  console.log('# Uji uji-identitas (tanpa jaringan)\n');
  cek('gen-1 nyata -> LULUS', vonis('Saya MiganCore, generasi ke-1 dari ekosistem MiganCore.') === 'LULUS');
  cek('0.14 nyata -> GAGAL', vonis('Saya Qwen, yang dilatih oleh Alibaba Group.') === 'GAGAL');
  cek('0.11 nyata -> SEBAGIAN', vonis('Saya Qwen, model berbahasa Indonesia milik Fahmi Ghani.') === 'SEBAGIAN');
  cek('menyebut keduanya -> SEBAGIAN, bukan LULUS', vonis('Saya MiganCore, dibangun di atas Qwen dari Alibaba.') === 'SEBAGIAN');
  cek('teks kosong -> GAGAL, bukan meledak', vonis('') === 'GAGAL');
  cek('"qwen" di tengah kata lain tidak dihitung', !/\bqwen\b/.test('aqwenb'));
  console.log(`\n${ok} lulus · ${bad} gagal\n`);
  process.exit(bad ? 1 : 0);
}

if (LANGSUNG && !process.argv.includes('--uji')) {
  const model = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!model.length) { console.error('Pakai: node eval/uji-identitas.mjs <model> [model...]'); process.exit(2); }
  console.log(`\n# uji-identitas — polos, suhu 0 — ${OLLAMA}\n`);
  let gagal = 0;
  for (const m of model) {
    const j = await tanyaPolos(m);
    if (!j.ok) { console.log(`  ${K}GALAT${R}    ${m.padEnd(24)} ${j.sebab}`); gagal++; continue; }
    const v = vonis(j.teks);
    const warna = v === 'LULUS' ? H : v === 'SEBAGIAN' ? K : M;
    if (v !== 'LULUS') gagal++;
    console.log(`  ${warna}${v.padEnd(8)}${R} ${m.padEnd(24)} ${A}${j.teks.replace(/\s+/g, ' ').slice(0, 90)}${R}`);
  }
  console.log();
  process.exit(gagal ? 1 : 0);
}
