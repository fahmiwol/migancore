# MiganCore — an open lab notebook

**A one-person attempt to own a small Indonesian language model that knows where its knowledge ends,
with everything measured, pre-registered, and written down, including what failed.**

English · [Bahasa Indonesia](README.id.md) · MIT License · Status: **closed on 28 September 2026** (archived,
nothing deleted)

![MiganCore at a glance](docs/img/infographics/01-at-a-glance.svg)

---

## What this is

From May to September 2026, MiganCore was a research project with a narrow goal: take an open base model
(mainly **Qwen3-4B-Instruct-2507**, Apache-2.0), adapt it for Indonesian with small LoRA runs on rented
GPUs, serve it on ordinary CPU hardware, and give it one distinguishing ability. That ability was to
**know where its own knowledge ends, and stop there**: abstain instead of making things up.

The work was done by one founder, **Fahmi Ghani**, with AI agents (Anthropic's Claude and OpenAI's Codex)
acting as research staff. Consequential experiments were **pre-registered** before any data existed. Before an
experiment ran, its hypothesis, thresholds and forecasts were locked in git. Afterwards, its verdict was
written back into the same file by a tool, not by hand. The few experiments that were stopped or never
locked say so in their files.

The project was closed on **28 September 2026**, under its own pre-registered kill condition. This
repository is the sanitized research record. It contains:
- the code;
- the measuring instruments;
- 39 pre-registrations and their verdicts;
- the lineage of 41 model variants;
- the Studio that visualizes all of it;
- the synthesized findings.

It is published so that others can reuse what worked and avoid what did not.

> **Companion repository:** the research *method* (pre-registration, measurement integrity, 35 laws, case
> studies and the closing report) is in
> [fahmiwol/migancore-research-method](https://github.com/fahmiwol/migancore-research-method). This
> repository is the *system and the evidence*.

## Results in one screen

![What held and what did not](docs/img/infographics/07-held-vs-refuted.svg)

**What held (measured, pre-registered):**

| Layer | Result | Verdict file |
|---|---|---|
| A one-paragraph **knowledge boundary** in the persona | Out-of-scope fabrication 28.9 % → 8.9 % (difference 20.0 pp, 95 % CI 10.0–30.0); p95 latency 1.04 s | [`E2-KEJUJURAN-NPC`](flywheel/PRA-DAFTAR-E2-KEJUJURAN-NPC.json) |
| An **abstention gate** in front of the model | Fabrication 52.2 % → 33.9 % (mean difference 18.31 pp, 95 % CI 6.59–30.03); over-refusal 1.6 %; fact accuracy not reduced (40.6 % → 42.9 %) | [`GERBANG-ON`](flywheel/PRA-DAFTAR-GERBANG-ON.json) |
| Law **C61** | The gate helps in proportion to how much the base fabricates (r = +0.942 across 8 pairs) | [laws](https://github.com/fahmiwol/migancore-research-method/blob/main/docs/en/04-laws.md) |

**What did not hold:**
- **Training the model to be more honest.** V16-JUJUR fabricated 60.0 % against a ≤ 50 % win threshold, not
  distinguishable from the served model.
- **Hesitation as a knowledge signal.** H-RAGU was inconclusive: the model writes down its doubt, but the doubt
  also appears on correct answers.
- **Fine-tune versus base.** On 25 September, with identical requests, the served fine-tune `migancore:0.14`
  fabricated on 53.7 % of must-abstain questions against 14.7 % for its own base. The pre-registered
  anti-evasion guard failed (the base refused 16.25 % of factual questions), so **no honesty claim is made
  either way**. See the
  [closing report](https://github.com/fahmiwol/migancore-research-method/blob/main/docs/en/09-closing-report.md).
- **The final bet.** Gerbang-S1 was a small decision encoder placed in front of any LLM. It was stopped before
  its lock: the audited probability of a win was about 0.20–0.35 (best case ≈ 0.78), below the owner's rule
  of continuing only above 0.80.

In one sentence: **the layers around the model held; training the weights toward honesty did not.**

## How often each model makes things up

![Fabrication ladder](docs/img/infographics/02-fabrication-ladder.svg)

The same 36-question battery (`petak-jujur2`) was used for every model, with means over the valid rounds
(`n`). Fabrication is always shown next to over-refusal: a model that refuses everything never fabricates.

## What was built

### 1. MiganCore Studio — a 2D and 3D world over the evidence

A single-door lens over the canonical sources. Every number in it is assembled from the pre-registration
files and registers when the snapshot is generated, and anything older than seven days is marked stale.
Details are in the [Studio guide](docs/studio.md).

| 3D world | 3D research panel |
|---|---|
| ![Studio 3D world](docs/img/studio/studio-3d-world.png) | ![Studio 3D research panel](docs/img/studio/studio-3d-research-panel.png) |
| **2D world map** | **Lineage tree** |
| ![Studio 2D world map](docs/img/studio/studio-2d-world-map.png) | ![Studio 2D lineage](docs/img/studio/studio-2d-lineage.png) |

### 2. The pre-registration system

![Pre-registration loop](docs/img/infographics/08-preregistration-loop.svg)

There are 39 pre-registration files in [`flywheel/`](flywheel/). Each one holds:
- the hypothesis, with two ways to be wrong;
- the metric and a ground truth the scorer never touched;
- thresholds checked for win-ability;
- a stopping rule and probabilistic forecasts;
- the amendments, which may only make winning harder;
- the verdict, written back by the verdict tool.

`node migan.mjs status` prints every verdict straight from these files.

![39 verdicts](docs/img/infographics/03-verdict-mosaic.svg)

Every experiment is listed in the [experiment register](docs/experiments.md).

### 3. A measurement toolkit that audits itself

![Instruments failed first](docs/img/infographics/09-instruments-failed-first.svg)

The toolkit consists of:
- question batteries;
- ≥ 5-round protocols with 95 % confidence intervals;
- paired metrics (fabrication, over-refusal and fact accuracy);
- models pinned by fingerprint rather than tag name;
- mutation-tested verdict tools;
- automated guards (`node migan.mjs periksa`).

The project registered **20 classes of defects in its own tooling**, and 19 of them have an automated guard.
The most consequential errors of the project were in the harness, not the model.

### 4. The path layer — what worked without training

The layers are an abstention gate (probe and NLI entailment), a knowledge-boundary paragraph, retrieval per
intent, and routing. They sit in front of the model and work with any base. See the
[architecture](docs/architecture.md).

### 5. Forty-one model variants, one served model

![Lineage](docs/img/infographics/06-lineage.svg)

The variants run from a small pre-Qwen3 family and a Qwen2.5-7B line in May, through Qwen3-4B cycles 8–14 in
June, pilots in July, LoRA "discipline" components in August and the served `migancore:0.14`, to candidates
that were barred from promotion, never judged or never born. Each entry has its data, method, measurement and
verdict in the [lineage](docs/lineage.md).

## Architecture

![Architecture](docs/img/infographics/05-architecture.svg)

The layers are, from bottom to top: base weights → training (LoRA / DPO / merges → GGUF) → serving (Ollama
on CPU and an MCP server) → the path layer (gate, boundary, retrieval, routing) → measurement → the
pre-registration loop → the Studio lens. Three rules held throughout:
- **sovereign serving**: no routing to external models while serving;
- **teachers only offline**;
- **data never leaves**.

Full description: [docs/architecture.md](docs/architecture.md).

## One month of decisions

![Timeline](docs/img/infographics/04-timeline.svg)

## Explore the data

- **Interactive explorer:** [`site/index.html`](site/index.html). It is a single self-contained file: open it
  in a browser, or visit the hosted copy (see *Links*).
- **Machine-readable data:**
  - [`data/migancore-public.en.json`](data/migancore-public.en.json) (English) and
    [`data/migancore-public.id.json`](data/migancore-public.id.json) (Indonesian source), with
    pre-registrations, verdicts, the fabrication ladder, birth criteria, lessons and lineage;
  - [`data/lineage.en.json`](data/lineage.en.json);
  - [`data/timeline.en.json`](data/timeline.en.json).

## What is distinctive

See [docs/advantages-and-limits.md](docs/advantages-and-limits.md) for the full list with evidence. In
short:
1. **Abstention is measured, not claimed.** Fabrication and over-refusal are always reported together, with
   confidence intervals and a stated number of rounds.
2. **The path layer is model-agnostic.** The two interventions that worked need no training. The boundary
   paragraph was measured at p95 1.04 s, within its latency threshold.
3. **Pre-registration with teeth.** Verdicts are computed by tools that read their thresholds from locked
   files and refuse to run early.
4. **Failure is part of the record.** 16 neutral, 6 failed and 7 never-run experiments are published next to
   the 10 passes.
5. **Privacy by architecture.** The model is served on your own hardware, with no external routing.

## Models and weights

- **`migancore:0.14`**, the served model, is published as an archived research artifact on Hugging Face:
  [Tiranyx/migancore-0.14](https://huggingface.co/Tiranyx/migancore-0.14). The release has the GGUF Q4_K_M
  file, the two LoRA adapters, the TIES merge recipe and the Modelfile.
  - Its 485 training rows were produced by deterministic program generators. **No model wrote, rewrote or
    judged any training row.**
  - It is research-only: it fabricates on about half of the questions it should decline.
- **Earlier public repositories** under the same account have cards that state their training-data
  provenance: the May 2026 Qwen2.5-7B "soul" line and the SIDIX adapters.
- **Every other variant is withheld.** Its training data includes outputs of commercial AI services, documents
  written by agents, or private material. The [lineage](docs/lineage.md) still describes every one of them.
- The base model, Qwen3-4B-Instruct-2507 (Apache-2.0), is available from Qwen.

## Reproduce and run

See [docs/reproduce.md](docs/reproduce.md). You can run the Studio, the verdict tools and the guards without
any model. The instruments need an Ollama endpoint with a model of your choice.

## Repository map

| Path | What |
|---|---|
| `docs/` | English documentation: [architecture](docs/architecture.md), [experiments](docs/experiments.md), [lineage](docs/lineage.md), [timeline](docs/timeline.md), [Studio](docs/studio.md), [advantages and limits](docs/advantages-and-limits.md), [reproduce](docs/reproduce.md), [privacy and release](docs/privacy-and-release.md). Also the instrument ADRs (`docs/instrumen/`), the closure checker (`docs/penutupan/`) and two backbone diagrams (`docs/jarvis/cortex/`) |
| `data/` | Public datasets: English and Indonesian research records, the lineage, the timeline |
| `site/` | The interactive explorer: one self-contained HTML file |
| `migan.mjs` | Command line: `status` prints every verdict, `periksa` runs the guards |
| `eval/` | Measurement instruments, the public question bank `petak-jujur2`, verdict tools, blind-validation keys, raw model answers and judge outputs |
| `flywheel/` | The 39 pre-registrations (`PRA-DAFTAR-*.json`), data tooling and dataset manifests |
| `models/` | Modelfiles, SANAD lineage records, and merge and training summaries |
| `local-train/` | The local LoRA training pipeline: code, configs and probes, without the training data |
| `studio/` | MiganCore Studio (2D and 3D), its snapshot generator and the source-of-truth registry |
| `ajar/`, `bengkel/`, `sistem/`, `layanan/`, `playground/`, `majelis/` | Teaching recorder, model-recipe workshop, system modules, NLI service, model comparison, multi-model council |
| `balairung/`, `desain/`, `Migancore Design sistem/` | Dashboard and design-system prototypes |
| `design/`, `tools/`, `hf/` | Infographic generator and checks, document builders, and the Hugging Face cards and builds |

The Indonesian source text is kept as it was written. The English documents above are the entry points.

## What is not in this repository, and why

- **Chat transcripts and raw working notes.** Session logs, journals, handoffs and agent instructions stay
  private. Where they mattered, their content appears here as synthesized statements.
- **Credentials, tokens and private infrastructure details.**
- **The private test battery**, which covers the owner's business questions, and anything derived from the
  owner's personal knowledge base.

Full list and method: [docs/privacy-and-release.md](docs/privacy-and-release.md).

## Links

- Research method and closing report:
  [fahmiwol/migancore-research-method](https://github.com/fahmiwol/migancore-research-method)
- Research record on Hugging Face:
  [Tiranyx/migancore-research-record](https://huggingface.co/datasets/Tiranyx/migancore-research-record)
- Hosted explorer: [Tiranyx/migancore-explorer](https://huggingface.co/spaces/Tiranyx/migancore-explorer)
- Served model (archived): [Tiranyx/migancore-0.14](https://huggingface.co/Tiranyx/migancore-0.14)
- Predecessor project: [fahmiwol/sidix](https://github.com/fahmiwol/sidix)

## License and citation

MIT, see [LICENSE](LICENSE). Model names are trademarks of their owners. Third-party content is listed in
[NOTICE](NOTICE.md). If you use this work, cite it with [CITATION.cff](CITATION.cff).

Contact: **Fahmi Ghani** · fahmiwol@gmail.com
