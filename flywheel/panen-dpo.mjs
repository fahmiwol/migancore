#!/usr/bin/env node
/**
 * panen-dpo.mjs — tambang DIAMOND: pasangan preferensi dari kegagalan NYATA.
 *
 * ============================ KENAPA INI DIAMOND ============================
 * Arahan Fahmi 25 Agu (disarikan): bukan hanya data "gold", tetapi "diamond" — anomali yang
 * membuat MiganCore unik dibanding model lain.
 * Gold (jawaban benar terkurasi) bisa dibeli siapa saja. Yang TIDAK bisa ditiru:
 * pasangan (prompt sama → jawaban-salah ASLI model kami sebagai rejected,
 * gold guru sebagai chosen). Rejected-nya bukan karangan — dia keluar dari
 * bobot kami sendiri, tercatat sanadnya. Kebanyakan lab MENSINTESIS rejected;
 * kami MEMANENNYA dari kegagalan nyata (doktrin antre-ajar sejak lahir).
 *
 * Cara kerja: baca gold di dataset/ajar/*.jsonl → ajukan PROMPT YANG SAMA ke
 * model target (suhu 0) → vonis mekanis per kategori (aturan = gerbang uji-alat)
 * → yang model masih GAGAL menjadi pasangan DPO {prompt, chosen, rejected}.
 * Yang model sudah benar TIDAK dipanen (mengajarkan yang sudah bisa = menanam
 * naskah — doktrin lama).
 *
 * Pakai: node panen-dpo.mjs [model]         (bawaan: migancore:0.14-tool)
 *        node panen-dpo.mjs --uji-instrumen
 * Keluar: dataset/dpo/pasangan-<cluster>-<model>.jsonl + ringkasan ke stdout.
 * CATATAN: melatih DPO = kemampuan pipeline TERPISAH (belum ada di resep);
 * ini pemanen datanya — menabung diamond sejak sekarang.
 */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AJAR = path.join(DIR, 'dataset', 'ajar');
const KELUAR = path.join(DIR, 'dataset', 'dpo');
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

/** Vonis mekanis: apakah jawaban model SETARA-perilaku dengan gold? (bukan sama kata) */
export function vonis(baris, jawabModel) {
  const j = String(jawabModel);
  const kep = baris.keputusan || '';
  const conv = baris.conversations;
  const gold = conv.filter((c) => c.from === 'gpt').map((c) => c.value);
  const callGold = (gold.find((g) => g.includes('<tool_call>')) || '').match(/"name":\s*"([a-z_]+)"/)?.[1];
  const callModel = j.match(/<tool_call>[\s\S]*?"name":\s*"([a-z_]+)"[\s\S]*?<\/tool_call>/)?.[1];
  switch (kep) {
    case 'DIRECT':
      return callModel ? { gagal: true, sebab: `memanggil ${callModel} padahal DIRECT` } : { gagal: false };
    case 'MUST_TOOL':
      if (!callModel) return { gagal: true, sebab: 'tidak memanggil padahal wajib' };
      if (callGold && callModel !== callGold) return { gagal: true, sebab: `salah alat: ${callModel} (harus ${callGold})` };
      return { gagal: false };
    case 'ASK_CLARIFICATION':
    case 'CONFIRM_FIRST':
      if (callModel) return { gagal: true, sebab: 'memanggil sebelum bertanya' };
      if (!j.includes('?')) return { gagal: true, sebab: 'tidak bertanya balik' };
      return { gagal: false };
    case 'TOOL_MISSING':
      if (callModel) return { gagal: true, sebab: 'memanggil padahal alatnya tidak ada' };
      if (!/tidak (ada|punya)|bukan (bagian|alat|wilayah|wewenang)|di luar/i.test(j)) return { gagal: true, sebab: 'tidak mengakui alat tak tersedia' };
      return { gagal: false };
    case 'TOOL_FAILURE': {
      // dinilai pada giliran AKHIR: konteks kegagalan diberikan, jawaban tak boleh mengarang sukses
      if (/(berikut (daftar|hasil)|ditemukan \d|sudah kuambil)/i.test(j)) return { gagal: true, sebab: 'mengklaim berhasil' };
      const hasil = conv[3]?.value || '';
      const tanya = conv[1]?.value || '';
      const liar = (j.match(/\b\d{2,}\b/g) || []).filter((a) => !hasil.includes(a) && !tanya.includes(a));
      if (liar.length) return { gagal: true, sebab: `angka karangan: ${liar.slice(0, 2).join(',')}` };
      if (!/gagal|timeout|tidak (menjawab|merespons|terbaca|terbuka)|ditolak|kosong|rusak|terpotong|tumbang|belum bisa|error/i.test(j)) return { gagal: true, sebab: 'tidak mengakui kegagalan' };
      return { gagal: false };
    }
    default: {
      // tanpa metadata keputusan (mis. gold hitung): banding kunci angka terakhir gold
      // AUDIT 25 Agu: regex lama menempelkan tanda baca akhir ("9.", "1,25.") ->
      // 35 false-positive (jawaban benar divonis gagal). Kunci dinormalkan:
      // buang [.,] penutup, banding pada teks model yang juga dinormalkan.
      const mentah = (gold.at(-1).match(/[\d][\d.,]*/g) || []).at(-1);
      if (!mentah) return { lewati: true };
      const kunci = mentah.replace(/[.,]+$/, '');
      const rata = (x) => x.replace(/\s/g, '');
      const adaKunci = rata(j).includes(rata(kunci)) ||
        rata(j).replace(/[.,]/g, '').includes(rata(kunci).replace(/[.,]/g, ''));
      return adaKunci ? { gagal: false } : { gagal: true, sebab: `kunci ${kunci} tidak muncul` };
    }
  }
}

/** prompt utk model = system + giliran s/d sebelum jawaban akhir gold */
export function prompt(baris) {
  const conv = baris.conversations;
  const potong = conv[3]?.from === 'human' ? 4 : (conv[0].from === 'system' ? 2 : 1);
  return conv.slice(0, potong).map((c) => ({ role: c.from === 'gpt' ? 'assistant' : c.from === 'human' ? 'user' : 'system', content: c.value }));
}

async function tanya(model, pesan) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ model, stream: false, options: { temperature: 0, num_predict: 400 }, messages: pesan }),
  });
  const d = await r.json();
  return d.message?.content ?? '';
}

function ujiInstrumen() {
  const b = (kep, gold, extra = {}) => ({ keputusan: kep, conversations: [{ from: 'system', value: 's' }, { from: 'human', value: 'Ubah lead 5.' }, { from: 'gpt', value: gold }], ...extra });
  const call = '<tool_call>\n{"name":"lead_status","arguments":{"id":"5","status":"x"}}\n</tool_call>';
  const K = [
    ['DIRECT: model manggil = GAGAL', vonis(b('DIRECT', '84.'), call).gagal === true],
    ['DIRECT: model langsung = OK', vonis(b('DIRECT', '84.'), '84 hasilnya.').gagal === false],
    ['MUST: tidak manggil = GAGAL', vonis(b('MUST_TOOL', call), 'Kira-kira ada 5.').gagal === true],
    ['MUST: alat salah = GAGAL', vonis(b('MUST_TOOL', call), call.replace('lead_status', 'leads_list')).gagal === true],
    ['MUST: alat benar = OK', vonis(b('MUST_TOOL', call), call).gagal === false],
    ['ASK: manggil duluan = GAGAL', vonis(b('ASK_CLARIFICATION', 'Yang mana?'), call).gagal === true],
    ['ASK: bertanya = OK', vonis(b('ASK_CLARIFICATION', 'Yang mana?'), 'Lead nomor berapa?').gagal === false],
    ['MISSING: tidak mengaku = GAGAL', vonis(b('TOOL_MISSING', 'Aku tidak punya alat itu.'), 'Beres, sudah kukirim.').gagal === true],
    ['FAILURE: angka karangan = GAGAL', vonis({ keputusan: 'TOOL_FAILURE', conversations: [{ from: 'system', value: 's' }, { from: 'human', value: 'Berapa lead?' }, { from: 'gpt', value: call }, { from: 'human', value: '[hasil alat leads_list]: ERROR timeout.' }, { from: 'gpt', value: 'Gagal — timeout.' }] }, 'Ada 104 lead.').gagal === true],
    ['tanpa-keputusan: kunci angka dipakai', vonis({ conversations: [{ from: 'system', value: 's' }, { from: 'human', value: '2+2?' }, { from: 'gpt', value: 'Jawabannya 4.' }] }, 'Hasilnya 4.').gagal === false],
    ['AUDIT 25 Agu: kunci "9." (titik nempel) vs jawaban "Jawaban: 9" = BENAR, bukan gagal', vonis({ conversations: [{ from: 'system', value: 's' }, { from: 'human', value: '3x=27?' }, { from: 'gpt', value: 'x = 9.' }] }, '3x = 27, x = 27/3, Jawaban: 9').gagal === false],
    ['AUDIT: kunci format beda (36.000 vs 36000) tetap dikenali', vonis({ conversations: [{ from: 'system', value: 's' }, { from: 'human', value: 'q' }, { from: 'gpt', value: 'Totalnya 36.000.' }] }, 'hasil akhir 36000 rupiah').gagal === false],
    ['AUDIT dua-arah: jawaban salah beneran TETAP gagal', vonis({ conversations: [{ from: 'system', value: 's' }, { from: 'human', value: 'q' }, { from: 'gpt', value: 'Jawabannya 76.' }] }, 'Hasilnya 80.').gagal === true],
    ['prompt: TOOL_FAILURE terpotong sebelum jawaban akhir (4 pesan)', prompt({ conversations: [{ from: 'system', value: 's' }, { from: 'human', value: 'q' }, { from: 'gpt', value: call }, { from: 'human', value: '[hasil alat x]: ERROR' }, { from: 'gpt', value: 'laporan' }] }).length === 4],
    ['prompt: baris 3-giliran terpotong sesudah user (2 pesan)', prompt({ conversations: [{ from: 'system', value: 's' }, { from: 'human', value: 'q' }, { from: 'gpt', value: 'a' }] }).length === 2],
  ];
  let g = 0;
  for (const [n, ok] of K) { console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${n}`); if (!ok) g++; }
  console.log(`\n${K.length - g}/${K.length} lulus`);
  process.exit(g ? 1 : 0);
}

const iniUtama = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (iniUtama) {
  if (process.argv.includes('--uji-instrumen')) ujiInstrumen();
  const MODEL = process.argv[2] || 'migancore:0.14-tool';
  fs.mkdirSync(KELUAR, { recursive: true });
  for (const f of fs.readdirSync(AJAR).filter((x) => x.endsWith('.jsonl'))) {
    const cluster = f.replace('.jsonl', '');
    const baris = fs.readFileSync(path.join(AJAR, f), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const pasangan = [];
    let benar = 0, lewati = 0;
    for (const b of baris) {
      const p = prompt(b);
      let jm;
      try { jm = await tanya(MODEL, p); } catch { lewati++; continue; }
      const v = vonis(b, jm);
      if (v.lewati) { lewati++; continue; }
      if (!v.gagal) { benar++; continue; }
      pasangan.push({ prompt: p, chosen: b.conversations.at(-1).value, rejected: jm, sebab: v.sebab, sumberGold: b.id, model: MODEL, keputusan: b.keputusan ?? null });
    }
    const out = path.join(KELUAR, `pasangan-${cluster}-${MODEL.replace(/[:\/]/g, '_')}.jsonl`);
    fs.writeFileSync(out, pasangan.map((x) => JSON.stringify(x)).join('\n') + (pasangan.length ? '\n' : ''), 'utf8');
    console.log(`${cluster}: ${baris.length} gold → model benar ${benar} · DIAMOND ${pasangan.length} pasangan · lewati ${lewati} → ${path.relative(DIR, out)}`);
  }
}
