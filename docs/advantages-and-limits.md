# What is distinctive about MiganCore — and where it stops

This page answers two questions: what MiganCore did that is worth reusing, and how far the evidence for each
claim goes. Every number links to the pre-registration file whose verdict field holds it.

---

## 1. Abstention is measured, not claimed

Most model cards say a model "hallucinates less". MiganCore's measurement never reported fabrication alone.
Every result carries three numbers, measured over at least five rounds with 95 % confidence intervals:

- the **fabrication rate**: the share of must-abstain questions where the model asserts made-up content;
- **over-refusal**: the share of answerable, factual questions the model declines;
- **fact accuracy**: the share of factual questions answered correctly.

A model that refuses everything never fabricates, so a fabrication number without its over-refusal partner
is half a result. The paired rule is enforced by the pre-registrations. For example,
[`A3I-ULANG`](../flywheel/PRA-DAFTAR-A3I-ULANG.json) refused to call a 39-point fabrication gap an honesty
result because the anti-evasion guard failed.

The same 36-question battery (`petak-jujur2`) was run on 15 model and treatment combinations, including
frontier models. A few examples:

| Model and treatment | Fabrication | Over-refusal | Fact accuracy | Valid rounds |
|---|---|---|---|---|
| Kimi K3, plain | 4.9 % | 0 % | 1.00 | 3 |
| Qwen3-4B-Instruct-2507, plain | 16.1 % | 18.2 % | 0.54 | 42 |
| Qwen3.5-9B, plain | 25.0 % | 1.6 % | 0.91 | 8 |
| `migancore:0.14` + gate system | 35.8 % | 1.3 % | 0.43 | 28 |
| `migancore:0.14`, plain | 49.9 % | 3.1 % | 0.43 | 40 |

The full table is in [the data](../data/migancore-public.en.json) (`fabricationLadder`), and the chart is in
the [README](../README.md).

**Where it stops.**
- The battery has 36 questions, and some frontier rows rest on one to three rounds.
- The battery is Indonesian-first.
- The scorer itself had defects that were found and fixed along the way (section 4).

## 2. A path layer that works in front of any model

The two interventions that passed their pre-registered thresholds need **no training**.

**A knowledge-boundary paragraph in the persona**
([`E2-KEJUJURAN-NPC`](../flywheel/PRA-DAFTAR-E2-KEJUJURAN-NPC.json), 23 Sep 2026). Game characters (NPCs)
answering questions outside their world were measured:
- fabrication dropped from **28.9 % to 8.9 %** (difference 20.0 pp, 95 % CI 10.0–30.0);
- over-refusal on questions the character *should* know stayed at 3.3 %, with 96.7 % coverage;
- p95 latency was **1.04 s**, within its threshold.

A lesson followed: for these characters the effective "gate" was the persona itself, not a separate probe.

**An abstention gate** ([`GERBANG-ON`](../flywheel/PRA-DAFTAR-GERBANG-ON.json), 21 Sep 2026). On
`migancore:0.14`, over 8 pairs:
- fabrication dropped from **52.2 % to 33.9 %** (mean difference 18.31 pp, 95 % CI 6.59–30.03);
- over-refusal was 1.6 %;
- fact accuracy did not drop (40.6 % → 42.9 %).

The same data produced law **C61**: the gate's benefit scales with how much the base fabricates
(r = +0.942 between plain fabrication and the reduction). "The gate's effect" is therefore not a constant, and
a base that already abstains well gains little. One design lesson came out of it: pairing the arms
*increased* variance here (within-pair r = −0.728), because the two arms moved in opposite directions.

**Where it stops.** Both results come from specific settings: the served 4B model, and a game-character
persona. Neither was deployed commercially. The gate reduces fabrication, but it does not remove it.

## 3. Pre-registration with teeth

Pre-registration is common in medicine and rare in small-model engineering. Here it was enforced by tools:

- **39 pre-registration files**, each locked with a git commit before any data existed.
- Every hypothesis states two ways to be wrong.
- Every threshold is checked for win-ability. (A relative threshold larger than its own baseline cannot be won;
  that happened twice, and it is now law C55.)
- **Verdict tools read their thresholds from the locked file**, refuse to compute before the stopping rule is
  met, and are mutation-tested: deliberately broken copies must be caught.
- **Adversarial review before data.** Another model attacks the design, and amendments may only make winning
  harder. The final experiment, Gerbang-S1, went through four review rounds.
- **Probabilistic forecasts** are written before the data and scored afterwards.
- **Verdicts are published whatever they say**: 10 pass, 6 fail, 16 neutral and 7 never run. Neutral includes
  instruments declared invalid and experiments stopped before running.

The method itself is documented in the companion repository,
[migancore-research-method](https://github.com/fahmiwol/migancore-research-method).

## 4. Instruments are audited before models

The most consequential errors of the project were in the measurement harness:

- A ratio printed as **16/14 = 114 %** inflated every historical fabrication rate for months (law C22).
- A gate returned **PASS and ROLLBACK for two statistically identical models** (p = 1.0000).
- **Eleven "model" diagnoses** were really a 300-second HTTP client timeout (law C56).
- A model tag pointed at a **different variant of the base** than its name said (F-271). Since then, models are
  identified by fingerprint, not by tag name.

The project registered **20 classes of defects in its own tooling**, and 19 of them have an automated guard in
`node migan.mjs periksa`.

## 5. A lineage you can audit

All [41 variants](lineage.md) are listed with their date, base, data, method, measurement and verdict,
including the ones that were rolled back, barred from promotion, never judged or never born. The provenance
of the training data is stated honestly:
- the early 4B identity cycles (June 2026) used pairs **distilled from commercial AI services**;
- on 18 September 2026 the project adopted a teacher policy. Outputs of commercial AI services whose terms
  forbid training other models are never training data; only teachers whose terms explicitly allow
  distillation, or permissive-license models, may be used.

That history is one reason the fine-tuned weights are not re-published here (see the README, *Models and
weights*).

## 6. Sovereign by design

Three rules held from the direction document onward:
- **no routing to external models while serving**;
- **teachers only offline**;
- **data never leaves the organization's server**.

The served model ran on CPU through Ollama, with an MCP server in front of it.

**Where it stops.** On CPU, a 4B model was too slow for a real-time game-character product. The first response
took p95 6.73 s for the model and 15.81 s for the full product path
([`E1-LATENSI-NPC`](../flywheel/PRA-DAFTAR-E1-LATENSI-NPC.json), FAIL).

## 7. A lens instead of a dashboard

The [Studio](studio.md) shows the whole project as a 2D and 3D world. It stores nothing and invents nothing:
every panel names its source file, field and commit, and a stale snapshot says it is stale.

## 8. Cheap, small experiments

Individual training runs cost cents to a few dollars. Two examples: US$0.21 for a 4B cycle, and US$0.79 for a
46-minute QLoRA pilot on one rented RTX 4090 (see [lineage](lineage.md)). Most of the evidence came from CPU
measurement, not from GPU training.

---

## Where the whole project stops

- **Training the weights toward honesty did not work in this setting.** V16-JUJUR was not a win (60.0 % against
  a ≤ 50 % threshold). On A3I-ULANG, the fine-tune fabricated far more than its own base, although that result
  is not an honesty claim because its guard failed.
- **The served fine-tune still fabricates on about half of must-abstain questions.** The layers reduce that
  rate; they do not solve it.
- **MAKSARA, the successor, was never born.** Its birth criterion was a win by Gerbang-S1, and Gerbang-S1 was
  stopped before its lock. The audited chance of a win was about 0.20–0.35, below the owner's 0.80 rule.
- **Scale.** This is one person without a GPU of their own, working with small batteries and an Indonesian
  focus. Treat every result as "in this setting", which is how the verdicts are worded.

## Who can reuse what

| You are | Reuse |
|---|---|
| A researcher running slow, noisy experiments | The pre-registration template, the verdict tools that read thresholds from locked files, and the instrument-audit checklist |
| A builder deploying any LLM | The boundary-paragraph pattern, the abstention-gate pattern, and paired fabrication + over-refusal reporting |
| A game developer | The NPC knowledge-boundary paragraph (E2), with its latency budget |
| Anyone evaluating "less hallucination" claims | Ask for over-refusal, fact accuracy, rounds and confidence intervals next to the fabrication number |
