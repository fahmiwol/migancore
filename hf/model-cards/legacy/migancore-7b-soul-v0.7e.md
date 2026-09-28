---
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
- sft
- lora
---

# MiganCore 7B "soul" v0.7e — archived early experiment (May 2026)

**Status: archived, superseded, not maintained. Published for research transparency only.** This is an early
iteration of MiganCore's Qwen2.5-7B line. The project later moved to a 4B base and closed on 28 September
2026.

## What it is
- **Base:** Qwen/Qwen2.5-7B-Instruct (Apache-2.0).
- **Method:** Supervised fine-tuning with a LoRA adapter (r = 8, 5 epochs), 200 pairs.

## Training data
200 instruction–response pairs teaching an "innovation loop" style. **All 200 target responses were written by a commercial AI assistant.**

Because training data came from the outputs of third-party commercial LLM services, check the terms of those services before any use beyond research.

## Evaluation
No pre-registered evaluation exists for this version.

## More
- Lineage of all 41 MiganCore variants and why this line was archived: [github.com/fahmiwol/migancore](https://github.com/fahmiwol/migancore/blob/main/docs/lineage.md)
- Method and closing report: [github.com/fahmiwol/migancore-research-method](https://github.com/fahmiwol/migancore-research-method)

Author: Fahmi Ghani (fahmiwol@gmail.com).
