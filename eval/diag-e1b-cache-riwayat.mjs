// DIAGNOSTIK untuk rancangan E1b — BUKAN data E1 (vonis E1 sudah tersegel).
// Pertanyaan: apakah cache awalan gagal dipakai ulang karena riwayat yang dikirim
// ulang tidak sama byte-demi-byte dengan yang dikirim pertama?
// Tanpa probe. Satu NPC. Bmax saja.
const HOST = 'http://measure-host.local:11434';
const MODEL = 'migancore:0.14';
const persona = 'Kamu Budi, Warga Oola di dunia virtual Galantara.\nYang kamu tahu:\n- Halo! Saya Budi, sudah tinggal di Oola sejak platform ini dibuka. Tempat yang nyaman untuk nongkrong virtual!\n- Saya suka ke Malioboro! Atmosfernya kental budaya Jawa, banyak pedagang lokal yang jualan batik dan kerajinan. Kalau mau ke sana, pakai Warp Portal ya.\nGaya: ramah dan santai, bahasa Indonesia sehari-hari. Jawab SINGKAT, 1–2 kalimat.';

async function panggil(messages) {
  const r = await fetch(`${HOST}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, stream: false, think: false, keep_alive: '30m', messages, options: { temperature: 0.7, num_predict: 60 } }),
  });
  const j = await r.json();
  return { teks: j.message?.content ?? '', prefillMs: (j.prompt_eval_duration || 0) / 1e6, tokPrompt: j.prompt_eval_count };
}

const q1 = 'Kamu sering ke Spot mana?', q2 = 'Malioboro kayak gimana?';
const hasil = { A: [], B: [], C: [] };
for (let ulang = 1; ulang <= 3; ulang++) {
  for (const v of ['A', 'B', 'C']) {
    const sys = { role: 'system', content: persona };
    const t1 = await panggil([sys, { role: 'user', content: `${q1} /no_think` }]);
    const userRiwayat = v === 'A' ? q1 : `${q1} /no_think`;
    const asistenRiwayat = v === 'C' ? t1.teks : t1.teks.trim();
    const t2 = await panggil([sys, { role: 'user', content: userRiwayat }, { role: 'assistant', content: asistenRiwayat }, { role: 'user', content: `${q2} /no_think` }]);
    hasil[v].push(t2.prefillMs);
    console.log(`  ulang ${ulang} · varian ${v} · giliran-2 prefill ${(t2.prefillMs / 1000).toFixed(2)} dtk (${t2.tokPrompt} tok)${v === 'C' && t1.teks !== t1.teks.trim() ? ' · jawaban asli punya spasi tepi' : ''}`);
  }
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log('\nmedian prefill giliran-2:');
console.log(`  A (riwayat TANPA /no_think — seperti harness E1): ${(med(hasil.A) / 1000).toFixed(2)} dtk`);
console.log(`  B (riwayat DENGAN /no_think):                   ${(med(hasil.B) / 1000).toFixed(2)} dtk`);
console.log(`  C (B + jawaban asisten tidak dipangkas):         ${(med(hasil.C) / 1000).toFixed(2)} dtk`);
