---
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
- SIDIX archive: [fahmiwol/sidix](https://github.com/fahmiwol/sidix), full source at tag `v0.7.0`.
- Successor research: [fahmiwol/migancore](https://github.com/fahmiwol/migancore).

License: MIT for the adapter; the base model is Apache-2.0. Author: Fahmi Ghani (fahmiwol@gmail.com).
