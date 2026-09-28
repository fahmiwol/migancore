---
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

Because training data came from the outputs of third-party commercial LLM services, check the terms of those services before any use beyond research.

## Evaluation
No pre-registered evaluation was published for this adapter.

## Code
- The full source is at commit [`c1185b7`](https://github.com/fahmiwol/sidix/tree/c1185b7) and tag
  [`v0.7.0`](https://github.com/fahmiwol/sidix/tree/v0.7.0) of
  [fahmiwol/sidix](https://github.com/fahmiwol/sidix). The `main` branch now holds the archive README and the
  Quran Lab provider.
- Successor research: [fahmiwol/migancore](https://github.com/fahmiwol/migancore).

License: MIT for the adapter; the base model is Apache-2.0. Author: Fahmi Ghani (fahmiwol@gmail.com).
