// Uji pengulangan multi-giliran: keluhan "ngulang-ngulang setelah beberapa turn".
const OLLAMA = "http://127.0.0.1:11434/api/chat";
const GILIRAN = [
  "Halo, aku mau bikin konten untuk bisnis briket arang.",
  "Target pasarnya restoran BBQ di Jakarta.",
  "Buatkan satu ide judul konten TikTok.",
  "Kasih satu lagi yang beda.",
  "Satu lagi, jangan mirip yang tadi.",
  "Sekarang untuk Instagram, satu ide.",
  "Satu lagi untuk Instagram.",
  "Terakhir, satu ide untuk LinkedIn.",
];
function miripKah(a, b) {
  const kata = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>3));
  const A = kata(a), B = kata(b);
  if (!A.size || !B.size) return 0;
  let sama = 0; for (const w of A) if (B.has(w)) sama++;
  return sama / Math.min(A.size, B.size);
}
async function jalan(model, opsi, label) {
  const messages = [{ role: "system", content: "Kamu asisten kreatif berbahasa Indonesia. Jawab ringkas, maksimal 2 kalimat." }];
  const jawaban = [];
  for (const [i, g] of GILIRAN.entries()) {
    messages.push({ role: "user", content: g });
    const r = await fetch(OLLAMA, { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ model, messages, stream:false, options: opsi }) });
    const d = await r.json();
    const t = (d?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/\s+/g," ").trim();
    messages.push({ role: "assistant", content: t });
    jawaban.push(t);
    const ulang = jawaban.slice(0,-1).map(x => miripKah(x, t));
    const maks = ulang.length ? Math.max(...ulang) : 0;
    console.log(`  ${i+1}. [mirip ${Math.round(maks*100)}%] ${t.slice(0,88)}`);
  }
  const puncak = Math.max(...jawaban.map((t,i) => Math.max(0, ...jawaban.slice(0,i).map(x=>miripKah(x,t)))));
  console.log(`  => ${label}: kemiripan tertinggi antar-jawaban ${Math.round(puncak*100)}%\n`);
}
const model = process.argv[2] ?? "migancore:0.4-qwen3";
console.log(`\n### ${model} — TANPA repeat_penalty (suhu 0.7) ###`);
await jalan(model, { temperature: 0.7, num_predict: 120 }, "polos");
console.log(`### ${model} — DENGAN repeat_penalty 1.15 + no_repeat_ngram ###`);
await jalan(model, { temperature: 0.8, repeat_penalty: 1.15, top_p: 0.92, num_predict: 120 }, "diperbaiki");
