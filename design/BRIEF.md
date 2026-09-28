# Design brief — MiganCore open release: infographics and data explorer

## What this is
MiganCore was a one-person research project from May to September 2026. It fine-tuned small open models
(mainly Qwen3-4B-Instruct-2507, Apache-2.0) for Indonesian and tried to give them one distinguishing ability:
**knowing where their own knowledge ends, and stopping there** (abstaining instead of fabricating). Every
experiment was pre-registered, with thresholds locked in git before any data existed. The project was
formally closed on 28 Sep 2026. It is being released as open source as an honest lab notebook, not a product
brochure: what held, what was refuted, and how it was measured.

Tone: calm, precise, scientific. Never hype. Never imply the model "became honest". Failures are shown with
the same weight as successes.

## Inputs (the only files you may read)
- `data/migancore-public.id.json` — numbers, ids and verdicts. Free-text fields ending in `_id` are
  Indonesian.
- `data/migancore-public.en.json` — the same structure in English. Every key `xxx_id` becomes `xxx`; for
  example `title_id` becomes `title` and `highlights_id` becomes `highlights`. A parallel task is writing
  this file now. Code must accept either file: use `x.title ?? x.title_id` and so on.
- `data/lineage.en.json` — the 41 model variants, with English notes, a family and a status.
- `data/timeline.en.json` — 12 dated decision events, in English.
- This brief.

## Metric definitions (use exactly these words)
- **Fabrication rate**: the share of must-abstain questions on which the model asserted made-up content.
- **Over-refusal**: the share of answerable, factual questions the model declined to answer.
- **Fact accuracy**: the share of factual questions answered correctly.
- `fabricationLadder` values are means over the valid rounds of the petak-jujur2 battery (36 questions).
  `validRounds` is the number of rounds. Lower fabrication is only better if over-refusal stays low; always
  show the two together.
- `qwen3:4b · polos` is the **Qwen3-4B Thinking-2507 variant** (the tag was mislabeled; finding F-271). Label it
  "qwen3:4b (Thinking-2507)".
- "polos" = plain model; "+sistem gerbang" = with the gate system; "+sistem gerbang retrieval" = gate system plus
  retrieval.
- Rows with `validRounds` <= 3 are thin evidence: draw them lighter and print `n=`.

## Verdict states
`lulus` = pass, `gagal` = fail, `netral` = neutral / void / stopped, `belum` = never run or never judged.
Counts: 10 pass, 6 fail, 16 neutral, 7 not run (39 total).

## Palette (from MiganCore Studio)
Dark (default):

| token | value |
|---|---|
| background | `#050d0a` |
| panel | `#07100e` / `#0d1f1a` |
| text | `#edf7f2` |
| muted | `#a8bbb2` |
| faint | `#71877d` |
| green / pass | `#2fe39a` |
| light green | `#7ef0bd` |
| gold / neutral | `#d9bd59` |
| red / fail | `#ff8f85` |
| cyan | `#4fc3cf` |
| violet / not run | `#b58aff` |
| orange accent line | `#ff8a24` |
| hairline | `#47d69933` |

Light (explorer theme toggle): background `#f4f7f4`, panel `#ffffff`, text `#17221d`, muted `#44564d`,
green `#0b754c`, gold `#725d08`, red `#a12f27`, violet `#6d4fa3`.

Fonts: `Inter, "Segoe UI", system-ui, -apple-system, sans-serif`. For ids and numbers use
`"JetBrains Mono", ui-monospace, Consolas, monospace`.

## Deliverable 1 — SVG infographics in `docs/img/infographics/`
General rules for every SVG:
- 1200 px wide; height as needed.
- Self-contained: a solid background rect, so it reads on both GitHub themes.
- No external fonts, images or scripts.
- Real `<text>` elements; `<title>` and `<desc>` for accessibility.
- Under 250 KB each.
- Every number comes from the input files. **Never invent, round differently, or estimate a number.**
- A small footer on every image: `MiganCore open release · source: <file> → <field>`.

The infographics:

1. **`01-at-a-glance.svg`** — hero infographic, "MiganCore at a glance (May–Sep 2026)". Tiles:
   - 41 model variants;
   - 39 pre-registered experiments (10 pass · 6 fail · 16 neutral · 7 never run);
   - 316 findings; 35 laws;
   - 20 defect classes found in our own instruments, 19 of them now guarded by automated checks;
   - served model `migancore:0.14` since 2026-08-24;
   - project closed 2026-09-28, nothing deleted;
   - MAKSARA (the successor that would be "born" if the final experiment won): **not born**.

   Add a band titled "Two layers that worked without any training":
   - boundary paragraph: 28.9 % → 8.9 % out-of-scope fabrication;
   - abstention gate: 52.2 % → 33.9 % fabrication, fact accuracy not reduced.
2. **`02-fabrication-ladder.svg`** — "How often does each model make things up?".
   - Show all 15 rows, sorted by fabrication rate.
   - Each row has a horizontal bar for fabrication %, a diamond marker for over-refusal %, and right-aligned
     text: `fact acc 0.54 · n=42`.
   - Highlight the `migancore:*` rows. Mark thin-evidence rows.
   - Subtitle: the three metric definitions above.
3. **`03-verdict-mosaic.svg`** — "39 pre-registered experiments and their verdicts".
   - Tiles in date order, colored by state. Each tile shows the id and a short verdict word (the first
     uppercase code of the verdict text, e.g. PASANG_ON, LULUS, GAGAL, TIDAK MENANG, DIHENTIKAN).
   - Legend with counts. A note: "Neutral includes void instruments and experiments stopped before they
     were run."
4. **`04-timeline.svg`** — "One month, 12 decisions (29 Aug – 28 Sep 2026)", built from `timeline.en.json`.
   - A vertical timeline: date, title, and a one-line summary (wrap the text).
   - Emphasize the final node: "Stopped before lock → project closed".
5. **`05-architecture.svg`** — "How MiganCore was built": a layered diagram, top to bottom:
   - **Lens:** MiganCore Studio — 2D and 3D worlds over one data snapshot, generated from a registry of
     canonical sources; facts older than 7 days are marked stale.
   - **Pre-registration loop:**
     - hypothesis with two ways to be wrong → thresholds (checked for win-ability) → probabilistic forecasts;
     - → git lock → adversarial review (amendments may only tighten);
     - → run on the measurement machine → verdict tool reads the thresholds from the file → verdict written
       back into the same file.
   - **Measurement:**
     - batteries: petak-jujur2 (36 questions), petak-40, the A3 anchor;
     - at least 5 rounds, 95 % CIs, and paired metrics (fabrication, over-refusal, fact accuracy);
     - models pinned by fingerprint, not by tag name;
     - mutation-tested verdict tools and automated guards.
   - **Path layer (what worked without training):** abstention gate (probe / NLI entailment), boundary
     paragraph in the persona, retrieval per intent, routing. Planned but stopped: Gerbang-S1, a small
     decision encoder in front of any LLM.
   - **Serving:** Ollama on CPU and an MCP server (ask / compare / status). Rule: sovereign serving, with no
     routing to external models while serving.
   - **Training:** LoRA SFT / DPO and TIES merges on rented GPUs → GGUF (Q4) → Ollama tags. From 18 Sep every
     training row carries its teacher of origin.
   - **Base weights:** Qwen3-4B-Instruct-2507 (Apache-2.0); earlier a Qwen2.5-7B line and Qwen3-8B
     experiments.
   - **Side rails** (vertical boxes on both sides):
     - "Policy": the teacher policy (DeepSeek explicitly allows distillation; Claude, GPT and Kimi outputs are
       never training data from 18 Sep); data never leaves; teachers offline only.
     - "Machines": laptop (work, canonical repo), measurement machine (CPU Ollama, model store), VPS (live
       serving).
6. **`06-lineage.svg`** — "41 variants, one served model", from `lineage.en.json`.
   - Swimlanes by family, left to right in time order.
   - Dots colored by status, with a legend of all 9 statuses.
   - `migancore:0.14` emphasized as "served".
   - Never-born entries as hollow rings; components clustered near 0.14.
   - Label every dot with its name (small monospace; leader lines if needed).
7. **`07-held-vs-refuted.svg`** — two columns.
   - "What held (measured)":
     - the boundary paragraph (28.9 → 8.9 %, p95 latency 1.04 s);
     - the abstention gate (52.2 → 33.9 %, over-refusal 1.6 %);
     - law C61: the gate helps in proportion to base fabrication (r = +0.942);
     - pre-registration discipline (39 experiments locked before data);
     - 20 instrument defect classes found, 19 of them guarded.
   - "What did not hold (measured)":
     - training to be more honest: V16-JUJUR, 60.0 % vs a ≤ 50 % threshold;
     - hesitation as a knowledge signal: H-RAGU inconclusive;
     - latency for game characters: E1 fail, p95 6.73 s;
     - fine-tune vs base: on A3I-ULANG `0.14` fabricated 53.7 % vs 14.7 % for the base, but the anti-evasion
       guard failed, so **no honesty claim is made**. Word this exactly;
     - the final bet: Gerbang-S1 stopped before lock, because P(win) was about 0.20–0.35, below the owner's
       0.80 rule.
8. **`08-preregistration-loop.svg`** — a circular loop diagram of the method.
   - Steps: hypothesis (two ways to be wrong) → thresholds + win-ability check → forecasts → git lock →
     adversarial review (stricter only) → run (≥ 5 rounds, paired metrics) → verdict tool → verdict written
     back → Studio regenerates → finding / law / skill.
   - A center label: "Ask what would change your decision, then lock it."
9. **`09-instruments-failed-first.svg`** — "Our own instruments failed before the models did", four cards:
   - a ratio printed 16/14 = 114 % inflated every historical rate (law C22);
   - a gate gave PASS and ROLLBACK to two statistically identical models (p = 1.0000; F-219);
   - eleven "model" diagnoses were really a 300-second HTTP client timeout (C56);
   - a health badge checked the wrong machine for months.

   Footer: "Rule: check the instrument before the model."

## Deliverable 2 — data explorer, `site/`
A single static page. Structure:
- source in `site/src/` (`index.html`, `style.css`, `app.js`);
- a zero-dependency `site/build.mjs` (Node 20+, no npm packages) that inlines the CSS, the JS and the JSON data
  into one file, `site/index.html`, so it works from `file://`, GitHub Pages or a static Hugging Face Space;
- the data inlined from `data/migancore-public.en.json` if it exists, otherwise from `.id.json`, plus
  `lineage.en.json` and `timeline.en.json`.

Tabs:
- **Overview**: the at-a-glance numbers, the two layers that worked, and a short "what this is".
- **Experiments**: all 39 pre-registrations. Filter by state; text search; sortable by date. Click to expand the
  full verdict text.
- **Fabrication**: an interactive version of the ladder. Hover shows all three metrics and n; a toggle hides
  thin-evidence rows.
- **Lineage**: the 41 entries as swimlanes (as in SVG 06), with filters by family and status. Click shows the
  note, plus the long fields when the English dataset has them.
- **Timeline**: the 12 events.
- **Lessons**: the 34 "do not repeat" lessons as cards (`lessons[]`), plus the latest laws and findings.

Requirements:
- Dark theme by default, with a light toggle. Responsive down to 360 px wide.
- Keyboard accessible. No external requests of any kind (no CDN, fonts or analytics).
- Charts drawn with inline SVG from JS.
- Header: "MiganCore — open lab notebook". A note: "Research project, closed 28 Sep 2026. Numbers are verdict
  fields of pre-registered experiments."

## Hard rules
- Read only the input files listed above. Do not read other folders on this computer. Do not use any MCP
  tools, memory or brain tools. Do not access the network.
- Do not add personal data, paths, IP addresses, e-mail addresses or company names.
- Do not invent numbers or claims. If something is missing, leave it out and list it in
  `design/CODEX-NOTES.md`.
- When done, write `design/CODEX-NOTES.md`: the files produced, anything uncertain, and how to rebuild.
