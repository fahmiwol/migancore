---
license: apache-2.0
base_model: Qwen/Qwen3-4B-Instruct-2507
language:
- id
- en
pipeline_tag: text-generation
tags:
- qwen3
- lora
- ties-merge
- gguf
- ollama
- indonesian
- bahasa-indonesia
- llm
- hallucination
- open-source
- research
- archived
---

# MiganCore 0.14 — open-source Indonesian LLM (archived research model, GGUF for Ollama)

`migancore:0.14` was the served model of **MiganCore**, a one-person research project (May–September 2026).
The project tried to give a small Indonesian model one ability: knowing where its own knowledge ends, and
stopping there. The project closed on **28 September 2026**. These weights are published as part of its open
research record.

> **Research use only.** This model fabricates on roughly half of the questions it should decline (see
> *Measured behaviour*). Do not use it to answer factual questions.

## What it is

- **Base:** [Qwen/Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) (Apache-2.0).
- **Method:** two LoRA adapters (r = 16, α = 32, 2 epochs), combined with a TIES merge (density 0.5, weights
  1.0 / 1.0), then quantized to GGUF Q4_K_M.
  - an **arithmetic discipline** adapter (285 rows);
  - a **style discipline** adapter (200 rows).
- **Served:** 24 August – 28 September 2026, on CPU through Ollama.

## Training data (485 rows)

All rows were produced by **deterministic program generators**. **No model wrote, rewrote, or judged any
training row.** Numbers are computed by code and re-verified mechanically. The generator code, including its
answer templates, was written with the help of an AI coding assistant.

| Adapter | Rows | Composition |
|---|---|---|
| Arithmetic | 285 | 201 basic arithmetic · 76 unit calculations · 6 canary rows · 2 rows corrected by hand |
| Style | 200 | 160 refusal patterns · 30 agent-format rows · 9 seed refusals · 1 canary row |

Dataset fingerprints (sha256, first 16 hex): arithmetic `8009c9553fbb1261`, style `b2cdfc0336aa03a4`.

## Measured behaviour

All numbers are pre-registered verdicts, measured on the Indonesian-first `petak-jujur2` battery (36
questions) on CPU.

| Condition | Fabrication | Over-refusal | Fact accuracy | Valid rounds |
|---|---|---|---|---|
| Plain | 49.9 % | 3.1 % | 0.43 | 40 |
| With the abstention gate | 35.8 % | 1.3 % | 0.43 | 28 |

- **Fabrication** is the share of must-abstain questions on which the model asserted made-up content.
- **Over-refusal** is the share of answerable, factual questions it declined.
- **Against its own base.** On 25 Sep 2026, with identical requests, this model fabricated on 53.7 % of
  must-abstain questions, against 14.7 % for its base. The pre-registered anti-evasion guard failed, so **no
  honesty claim is made either way**.
- **Identity.** The model may answer as its base model when asked who it is.

## Files

| File | What |
|---|---|
| `migancore-0.14-q4_k_m.gguf` | Merged model, GGUF Q4_K_M (2,497,278,784 bytes) |
| `adapters/lora-hitung-promptragam.tgz` | Arithmetic adapter |
| `adapters/lora-gaya.tgz` | Style adapter |
| `kemas_merge14.py` | The TIES merge recipe that produced the merged weights |
| `Modelfile` | Ollama definition used when it was served (`num_ctx 4096`, `temperature 0.3`) |

Use it with Ollama:

```bash
ollama create migancore-0.14 -f Modelfile
```

## More

- Code, instruments, experiments and lineage: [github.com/fahmiwol/migancore](https://github.com/fahmiwol/migancore)
- Method and closing report: [github.com/fahmiwol/migancore-research-method](https://github.com/fahmiwol/migancore-research-method)
- Research record dataset: [Tiranyx/migancore-research-record](https://huggingface.co/datasets/Tiranyx/migancore-research-record)

License: Apache-2.0, following the base model. Author: Fahmi Ghani (fahmiwol@gmail.com).
