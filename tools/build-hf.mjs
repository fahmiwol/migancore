// Builds the Hugging Face artifacts from the data files, so the HF pages are derived, never hand-edited:
//   hf/dataset/*.jsonl  + hf/dataset/README.md   (dataset card; the viewer shows each config as a table)
//   hf/space/index.html + hf/space/README.md     (static Space: the data explorer)
// Run after `node site/build.mjs`:  node tools/build-hf.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const enPath = 'data/migancore-public.en.json';
const hasEn = fs.existsSync(path.join(ROOT, enPath));
const data = hasEn ? rd(enPath) : rd('data/migancore-public.id.json');
const lineage = rd('data/lineage.en.json');
const timeline = rd('data/timeline.en.json');
const t = (o, k) => o[k] ?? o[k + '_id'] ?? null;
const STATE = { lulus: 'pass', gagal: 'fail', netral: 'neutral', belum: 'not run' };

const out = (rel, text) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

// ---- dataset splits
const long = Object.fromEntries((data.lineage ?? []).map((l) => [l.no, l]));
const splits = {
  pre_registrations: data.preRegistrations.map((p) => ({
    id: p.id, date: p.date, locked: p.locked, state: STATE[p.state] ?? p.state,
    title: t(p, 'title'), verdict: t(p, 'verdict'), file: `flywheel/PRA-DAFTAR-${p.id}.json`,
  })),
  fabrication_ladder: data.fabricationLadder.map((r) => ({ ...r })),
  lineage: lineage.entries.map((e) => ({
    no: e.no, name: e.name, date: e.date, base: e.base, family: e.family, status: e.status, note: e.note,
    goal: long[e.no] ? t(long[e.no], 'goal') : null,
    data_method: long[e.no] ? t(long[e.no], 'dataMethod') : null,
    measured: long[e.no] ? t(long[e.no], 'measured') : null,
    verdict: long[e.no] ? t(long[e.no], 'verdict') : null,
  })),
  timeline: timeline.events.map((e) => ({ date: e.date, title: e.title, detail: e.detail, refs: e.refs })),
  lessons: data.lessons.map((l) => ({ title: t(l, 'title'), body: t(l, 'body') })),
};
for (const [name, rows] of Object.entries(splits)) out(`hf/dataset/${name}.jsonl`, jsonl(rows));
fs.copyFileSync(path.join(ROOT, hasEn ? enPath : 'data/migancore-public.id.json'), path.join(ROOT, 'hf/dataset/migancore-public.json'));

const counts = data.counts;
const card = `---
license: mit
language:
- en
- id
pretty_name: MiganCore research record
size_categories:
- n<1K
tags:
- pre-registration
- evaluation
- hallucination
- abstention
- indonesian
- open-science
configs:
${Object.keys(splits).map((n) => `- config_name: ${n}\n  data_files: ${n}.jsonl`).join('\n')}
---

# MiganCore research record

The complete, sanitized record of **MiganCore**, a one-person research project (May–September 2026) that
tried to give a small Indonesian language model one ability: knowing where its own knowledge ends, and stopping
there. The project closed on 28 September 2026. This dataset holds its **evidence**, not its weights.

| Config | Rows | What it is |
|---|---|---|
| \`pre_registrations\` | ${splits.pre_registrations.length} | Every pre-registered experiment: id, dates, state (${Object.entries(counts.verdictStates).map(([k, v]) => `${STATE[k] ?? k} ${v}`).join(', ')}), title, verdict text |
| \`fabrication_ladder\` | ${splits.fabrication_ladder.length} | Fabrication %, over-refusal % and fact accuracy on the 36-question \`petak-jujur2\` battery, with valid rounds |
| \`lineage\` | ${splits.lineage.length} | All model variants with base, family, status, data/method, measurement and verdict |
| \`timeline\` | ${splits.timeline.length} | The month of decisions that ended in closure |
| \`lessons\` | ${splits.lessons.length} | "Do not repeat" lessons distilled from failures |

\`migancore-public.json\` holds everything in one file (${hasEn ? 'English' : 'Indonesian'}).

## Definitions
- **Fabrication**: the share of must-abstain questions on which the model asserted made-up content.
- **Over-refusal**: the share of answerable, factual questions the model declined.
- **Fact accuracy**: the share of factual questions answered correctly.

Always read fabrication together with over-refusal, and note the number of valid rounds.

## Source and caveats
- The numbers are verdict fields of pre-registered experiments, copied by script from the project's locked
  files. Free text was translated from Indonesian (machine-assisted, human-reviewed); the Indonesian source is
  in the GitHub repository.
- \`qwen3:4b\` in the ladder is the **Qwen3-4B Thinking-2507** variant (the tag was mislabeled; finding F-271).
- Chat transcripts, credentials, private infrastructure, the private test battery and anything derived from the
  owner's personal knowledge base are excluded.

## Links
- Code, instruments, Studio and docs: https://github.com/fahmiwol/migancore
- Research method and closing report: https://github.com/fahmiwol/migancore-research-method

License: MIT. Author and contact: Fahmi Ghani (fahmiwol@gmail.com).
`;
out('hf/dataset/README.md', card);

// ---- static Space
const site = path.join(ROOT, 'site/index.html');
if (fs.existsSync(site)) {
  out('hf/space/index.html', fs.readFileSync(site, 'utf8'));
  out('hf/space/README.md', `---
title: MiganCore Open Lab Notebook
emoji: 🧭
colorFrom: green
colorTo: yellow
sdk: static
pinned: false
license: mit
short_description: 41 model variants, 39 pre-registered experiments, verdicts
---

Interactive explorer for the MiganCore research record: experiments and verdicts, the fabrication ladder,
the lineage of 41 variants, the timeline and the lessons. It is a single static file with no external
requests.

Code and documentation: https://github.com/fahmiwol/migancore · Data: the \`migancore-research-record\`
dataset.
`);
}
console.log(`hf artifacts built (${hasEn ? 'English' : 'Indonesian fallback'}): dataset splits ${Object.keys(splits).length}, space ${fs.existsSync(site) ? 'yes' : 'no (build site first)'}`);
