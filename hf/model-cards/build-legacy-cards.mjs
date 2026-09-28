// Generates honest model cards for the earlier public repos under the Tiranyx account (MiganCore 7B "soul"
// line, May 2026, and the two SIDIX adapters). Facts come from the provenance audit of 28 Sep 2026. Vendor
// names are not given, but the nature of the data is stated plainly, so downstream users can judge the terms
// that apply. Run: node hf/model-cards/build-legacy-cards.mjs   (writes hf/model-cards/legacy/*.md)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'legacy');
fs.mkdirSync(OUT, { recursive: true });

const COMMERCIAL = 'Because training data came from the outputs of third-party commercial LLM services, check the ' +
  'terms of those services before any use beyond research.';
const SOUL_LINKS = '- Lineage of all 41 MiganCore variants and why this line was archived: ' +
  '[github.com/fahmiwol/migancore](https://github.com/fahmiwol/migancore/blob/main/docs/lineage.md)\n' +
  '- Method and closing report: [github.com/fahmiwol/migancore-research-method](https://github.com/fahmiwol/migancore-research-method)';

const soul = (o) => `---
license: other
license_name: research-only-archive
base_model: Qwen/Qwen2.5-7B-Instruct
language:
- id
- en
tags:
- migancore
- archived
- research
${o.tags.map((t) => `- ${t}`).join('\n')}
---

# MiganCore 7B "soul" ${o.version} — archived early experiment (May 2026)

**Status: archived, superseded, not maintained. Published for research transparency only.** This is an early
iteration of MiganCore's Qwen2.5-7B line. The project later moved to a 4B base and closed on 28 September
2026.

## What it is
- **Base:** Qwen/Qwen2.5-7B-Instruct (Apache-2.0).
- **Method:** ${o.method}

## Training data
${o.data}

${COMMERCIAL}

## Evaluation
${o.eval}

## More
${SOUL_LINKS}

Author: Fahmi Ghani (fahmiwol@gmail.com).
`;

const CARDS = {
  'migancore-7b-soul-v0.1': soul({
    version: 'v0.1', tags: ['dpo', 'lora'],
    method: 'DPO with a LoRA adapter (r = 16); this repository also holds the merged full-precision model and training checkpoints.',
    data: '596 preference pairs:\n- 570 pairs built from prompts of a public synthetic-prompt dataset, with responses and ' +
      'revisions from the base model itself, and critiques from commercial LLM judges;\n- 16 pairs from real ' +
      'conversations with early users;\n- 10 pairs whose preferred answer was written by a commercial LLM.',
    eval: 'No pre-registered evaluation exists for this version.',
  }),
  'migancore-7b-soul-v0.1-gguf': soul({
    version: 'v0.1 (GGUF)', tags: ['gguf'],
    method: 'GGUF Q4_K_M quantization of `Tiranyx/migancore-7b-soul-v0.1`.',
    data: 'Same as `Tiranyx/migancore-7b-soul-v0.1`: 596 preference pairs, mostly synthetic, with critiques from ' +
      'commercial LLM judges and a small share of answers written by a commercial LLM.',
    eval: 'No pre-registered evaluation exists for this version.',
  }),
  'migancore-7b-soul-v0.2': soul({
    version: 'v0.2', tags: ['orpo', 'lora'],
    method: 'ORPO / APO-zero with a LoRA adapter (r = 16, learning rate 5e-7, 1 epoch).',
    data: '613 preference pairs. About 97 % of the preferred answers were written by a commercial LLM ' +
      '(identity, tool-use and code-correctness pairs, with hard-coded rejected answers); the rest carry over from v0.1.',
    eval: 'No pre-registered evaluation exists for this version.',
  }),
  'migancore-7b-soul-v0.5': `---
license: other
license_name: research-only-archive
tags:
- migancore
- archived
---

# MiganCore 7B "soul" v0.5 — empty placeholder

This repository holds no weights. It was created in May 2026 for the v0.5 cycle of MiganCore's Qwen2.5-7B line,
and nothing was ever uploaded. It is kept so that existing links do not break.

- Lineage of all MiganCore variants: [github.com/fahmiwol/migancore](https://github.com/fahmiwol/migancore/blob/main/docs/lineage.md)
- Served model of the project: [Tiranyx/migancore-0.14](https://huggingface.co/Tiranyx/migancore-0.14)
`,
  'migancore-7b-soul-v0.7': soul({
    version: 'v0.7', tags: ['orpo', 'lora'],
    method: 'ORPO with a LoRA adapter, 508 pairs, 2 epochs.',
    data: '508 preference pairs covering identity, voice, style, tool use, creativity and honesty. About 96–97 % of ' +
      'the preferred answers were written by a commercial LLM.',
    eval: 'No pre-registered evaluation exists for this version.',
  }),
  'migancore-7b-soul-v0.7b': soul({
    version: 'v0.7b', tags: ['orpo', 'lora'],
    method: 'ORPO with a LoRA adapter, the same 508 pairs as v0.7, 3 epochs.',
    data: 'Same as v0.7: about 96–97 % of the preferred answers were written by a commercial LLM.',
    eval: 'No pre-registered evaluation exists for this version.',
  }),
  'migancore-7b-soul-v0.7c': soul({
    version: 'v0.7c', tags: ['orpo', 'lora'],
    method: 'ORPO with a LoRA adapter, 548 pairs.',
    data: 'The 508 pairs of v0.7 plus 40 template greeting pairs; about 90 % of the preferred answers were written by ' +
      'a commercial LLM. This version was briefly the project default in May 2026.',
    eval: 'No pre-registered evaluation exists for this version.',
  }),
  'migancore-7b-soul-v0.7e': soul({
    version: 'v0.7e', tags: ['sft', 'lora'],
    method: 'Supervised fine-tuning with a LoRA adapter (r = 8, 5 epochs), 200 pairs.',
    data: '200 instruction–response pairs teaching an "innovation loop" style. **All 200 target responses were written ' +
      'by a commercial AI assistant.**',
    eval: 'No pre-registered evaluation exists for this version.',
  }),
  'sidix-lora': `---
license: mit
base_model: Qwen/Qwen2.5-7B-Instruct
language:
- id
- en
- ar
tags:
- sidix
- qlora
- archived
- research
---

# SIDIX LoRA — archived research build (April–August 2026)

**Status: archived, not maintained.** SIDIX was a self-hosted AI agent project. Its research build ended in
August 2026, and the hosted app was retired on purpose. Its research continued as MiganCore.

## What it is
- **Base:** Qwen/Qwen2.5-7B-Instruct (Apache-2.0).
- **Method:** QLoRA, r = 16, α = 32, on all seven projection modules. Trained on one Kaggle T4.
  *(An earlier version of this card listed r = 64 on four modules; that was wrong.)*

## Training data (713 rows, 641 used for training)
- **673 auto-generated question–answer pairs.** Template questions are answered with verbatim excerpts from the
  project's corpus:
  - research notes, drafted with the help of AI assistants;
  - principles, sources and bibliography;
  - **99 excerpts clipped from third-party web pages**, which may carry their own licence obligations, such as
    CC BY-SA.
- **40 hand-written pairs.**

${COMMERCIAL}

## Evaluation
No pre-registered evaluation was published for this adapter.

## Code
- The full source is at commit [\`c1185b7\`](https://github.com/fahmiwol/sidix/tree/c1185b7) and tag
  [\`v0.7.0\`](https://github.com/fahmiwol/sidix/tree/v0.7.0) of
  [fahmiwol/sidix](https://github.com/fahmiwol/sidix). The \`main\` branch now holds the archive README and the
  Quran Lab provider.
- Successor research: [fahmiwol/migancore](https://github.com/fahmiwol/migancore).

License: MIT for the adapter; the base model is Apache-2.0. Author: Fahmi Ghani (fahmiwol@gmail.com).
`,
  'sidix-dora-persona-v1': `---
license: mit
base_model: Qwen/Qwen2.5-7B-Instruct
language:
- id
- en
tags:
- sidix
- lora
- persona
- archived
- research
---

# SIDIX persona v1 — archived experiment (April 2026)

**Status: experimental, never used in production, archived.** Despite the repository name, this is a **plain
LoRA adapter, not DoRA**: DoRA was dropped before training.

## What it is
- **Base:** Qwen/Qwen2.5-7B-Instruct (Apache-2.0).
- **Method:** LoRA, 3 epochs, one rented A4000 GPU (86 minutes).

## Training data
7,500 persona question–answer pairs (6,750 train / 750 validation), assembled from templates (opener × body ×
closer) by a program generator. The generator, including its templates, was written with the help of an AI
coding assistant. No model generated the rows at training time.

## Evaluation
No pre-registered evaluation was published for this adapter.

## More
- SIDIX archive: [fahmiwol/sidix](https://github.com/fahmiwol/sidix), full source at tag \`v0.7.0\`.
- Successor research: [fahmiwol/migancore](https://github.com/fahmiwol/migancore).

License: MIT for the adapter; the base model is Apache-2.0. Author: Fahmi Ghani (fahmiwol@gmail.com).
`,
};

for (const [repo, md] of Object.entries(CARDS)) fs.writeFileSync(path.join(OUT, repo + '.md'), md);
console.log(`wrote ${Object.keys(CARDS).length} cards to ${OUT}`);
