---
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
- config_name: pre_registrations
  data_files: pre_registrations.jsonl
- config_name: fabrication_ladder
  data_files: fabrication_ladder.jsonl
- config_name: lineage
  data_files: lineage.jsonl
- config_name: timeline
  data_files: timeline.jsonl
- config_name: lessons
  data_files: lessons.jsonl
---

# MiganCore research record

The complete, sanitized record of **MiganCore**, a one-person research project (May–September 2026) that
tried to give a small Indonesian language model one ability: knowing where its own knowledge ends, and stopping
there. The project closed on 28 September 2026. This dataset holds its **evidence**, not its weights.

| Config | Rows | What it is |
|---|---|---|
| `pre_registrations` | 39 | Every pre-registered experiment: id, dates, state (pass 10, neutral 16, not run 7, fail 6), title, verdict text |
| `fabrication_ladder` | 15 | Fabrication %, over-refusal % and fact accuracy on the 36-question `petak-jujur2` battery, with valid rounds |
| `lineage` | 41 | All model variants with base, family, status, data/method, measurement and verdict |
| `timeline` | 12 | The month of decisions that ended in closure |
| `lessons` | 34 | "Do not repeat" lessons distilled from failures |

`migancore-public.json` holds everything in one file (English).

## Definitions
- **Fabrication**: the share of must-abstain questions on which the model asserted made-up content.
- **Over-refusal**: the share of answerable, factual questions the model declined.
- **Fact accuracy**: the share of factual questions answered correctly.

Always read fabrication together with over-refusal, and note the number of valid rounds.

## Source and caveats
- The numbers are verdict fields of pre-registered experiments, copied by script from the project's locked
  files. Free text was translated from Indonesian (machine-assisted, human-reviewed); the Indonesian source is
  in the GitHub repository.
- `qwen3:4b` in the ladder is the **Qwen3-4B Thinking-2507** variant (the tag was mislabeled; finding F-271).
- Chat transcripts, credentials, private infrastructure, the private test battery and anything derived from the
  owner's personal knowledge base are excluded.

## Links
- Code, instruments, Studio and docs: https://github.com/fahmiwol/migancore
- Research method and closing report: https://github.com/fahmiwol/migancore-research-method

License: MIT. Author and contact: Fahmi Ghani (fahmiwol@gmail.com).
