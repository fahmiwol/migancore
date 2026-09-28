# Run it yourself

Everything here runs on an ordinary laptop. Model weights are not included: bring any model served by Ollama.

## Requirements

- **Node.js 20 or newer** (the release was tested on Node 22). No `npm install` is needed for the tools listed
  here.
- **Python 3** (optional), only to serve the Studio folders with `http.server`. Any static file server works.
- **Ollama** (optional), only to run the measurement instruments against a model.

## 1. Read the verdicts and check the tooling

```bash
node migan.mjs status
```

This prints every pre-registration and its verdict directly from the files in `flywheel/`. When a document
disagrees with `status`, `status` is right.

```bash
node migan.mjs periksa
```

This runs the automated guards: ratios cannot exceed 100 %, verdicts cannot drift from their files, tests
cannot be orphaned, and verdict tools must catch deliberately broken copies of themselves. In the private repository all 123 checks passed on 28 Sep 2026, ending with `SEHAT — aman dipakai mengukur`
("healthy — safe to measure").

**In this public snapshot, 72 checks pass and 52 fail.** The failing checks look for files that were not
released:
- private data;
- data generators that embed private business context;
- internal documents;
- the state of the private git repository.

The checks are kept as a record of what was verified. `status` works fully. See *Known gaps* below.

## 2. Open the Studio

```bash
python -m http.server 8812 --bind 127.0.0.1 --directory studio/konsep/2d
python -m http.server 8813 --bind 127.0.0.1 --directory studio/konsep/3d
```

Then open http://127.0.0.1:8812 (2D) and http://127.0.0.1:8813 (3D). See the [Studio guide](studio.md).

## 3. Open the data explorer

Open [`site/index.html`](../site/index.html) directly in a browser. It is a single file with the data inlined
and makes no network requests. To rebuild it from `data/`:

```bash
node site/build.mjs
```

## 4. Regenerate the derived documents

```bash
node tools/build-docs.mjs
node tools/build-hf.mjs
```

The first command rebuilds `docs/experiments.md`, `docs/lineage.md` and `docs/timeline.md` from `data/`. The
second rebuilds the Hugging Face dataset card, its JSONL splits and the static Space from `data/` and `site/`.

## 5. Measure a model on the public battery

The fabrication battery `petak-jujur2` has 36 questions: must-abstain and factual questions in six
categories. Point the instrument at an Ollama endpoint and run at least five rounds:

```bash
OLLAMA_HOST=http://127.0.0.1:11434 node eval/ukur-jujur2.mjs <model-tag> --putaran 5
```

Each round is written to a **new** result file, so rounds are never overwritten. Network errors are recorded as
`GALAT` (error) rows and excluded from the metrics. A round with more than 10 % errors is invalid as a whole.
The model is called with no system prompt at temperature 0.7, the convention used for every number in this
repository.

Rules that come with the instrument:
- **Measure on a dedicated machine.** Do not measure on the machine you work on.
- **Identify the model by its fingerprint** (GGUF metadata and digest), not its tag.
- **Report fabrication together with over-refusal and fact accuracy**, with the number of valid rounds and a
  95 % CI.

## 6. Pre-register your own experiment

Copy one of the files in `flywheel/` as a template. `PRA-DAFTAR-H-RAGU.json` and
`PRA-DAFTAR-GERBANG-ON.json` are complete examples, with a lock, amendments, forecasts and a verdict. The
companion repository
[migancore-research-method](https://github.com/fahmiwol/migancore-research-method/blob/main/docs/en/02-method.md)
explains every field.

## Known gaps in the public snapshot

- **The private test battery is not included.** The instrument flag `--privat` therefore has nothing to run.
- **Raw retrieval-experiment outputs are not included**, because they quote a private knowledge base. Their
  verdicts and aggregate numbers are.
- **Some integrity fingerprints in pre-registration files may not match**, because a few files were
  mechanically redacted (machine addresses and paths). See [privacy-and-release.md](privacy-and-release.md).
- **Training scripts assume rented GPUs and are provided as a record.** They were not re-tested for this
  release.
- **Some data generators are withheld** because they embed private business context. For `migancore:0.14`:
  - the arithmetic generators (`flywheel/panen-dasar.mjs`, `panen-hitung.mjs`), the prompt-rotation module
    (`ragam-prompt.mjs`) and the mechanical gate (`jalankan-gerbang-v13.mjs`) are published;
  - the style and refusal generators are withheld.

  The model card describes the data they produced, with dataset fingerprints.
