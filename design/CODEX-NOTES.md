# Visual release handoff

Produced:

- `docs/img/infographics/01-at-a-glance.svg`
- `docs/img/infographics/02-fabrication-ladder.svg`
- `docs/img/infographics/03-verdict-mosaic.svg`
- `docs/img/infographics/04-timeline.svg`
- `docs/img/infographics/05-architecture.svg`
- `docs/img/infographics/06-lineage.svg`
- `docs/img/infographics/07-held-vs-refuted.svg`
- `docs/img/infographics/08-preregistration-loop.svg`
- `docs/img/infographics/09-instruments-failed-first.svg`
- `site/src/index.html`, `site/src/style.css`, `site/src/app.js`, `site/src/charts.mjs`
- `site/build.mjs` and the built, self-contained `site/index.html`
- `design/generate-visuals.mjs`, `design/public-data.mjs`, `design/check-visuals.mjs`, this note and `design/.gitignore`

Design decisions:

- Consistent dark research-notebook palette, generous margins, quiet panels and restrained typography.
- Local system fonts only; model names, dates and measurements use the specified monospace stack.
- Pass, fail, neutral and not-run colors follow the brief; invalid and stopped outcomes remain neutral.
- Fabrication bars always accompany over-refusal diamonds, fact accuracy and valid-round counts.
- Thin evidence is lighter and explicitly labeled; MiganCore rows have a highlighted panel.
- Lineage uses period columns with source date ordering, not estimated positions on a continuous time scale.
- Components occupy the served model's August period; never-born entries use hollow rings.
- The explorer includes accessible tabs, native disclosures, labeled controls, keyboard model selection, a modal record, a metric table and light/dark themes.
- Narrow screens retain readable chart labels through local horizontal scrolling; the rest of the page reflows.
- Static and interactive charts share the same rendering functions.
- Both builders prefer English and fall back to Indonesian; no input files are changed.
- Public text redacts personal identifiers, provider company references and private source paths; model names requested by the brief remain where needed to identify research records.

Uncertainty and omissions:

- Some supplied verdicts, lessons, laws and findings end mid-sentence. The entire available field is shown, without reconstructing missing text.
- Several records have no date or no lock timestamp. The mosaic uses the lock date only when the verdict date is absent, labels that substitution, and puts wholly undated records last.
- The brief's phrase about all 39 experiments being locked before data conflicts with records explicitly described as unlocked or stopped before lock. The requested register total is retained and the held/refuted figure discloses that limitation.
- Historical lessons sometimes discuss plans as ongoing. A visible notice states that these are historical excerpts and the project is closed.
- The lineage source includes both the served model and a served alias with the same weights; the explorer explains this.
- Source date precision is preserved in model details. No exact date is invented for approximate or missing dates.
- Provider prefixes are omitted from the affected model label while retaining the model identifier.
- Timeline summaries are concise paraphrases of the supplied event details; full event details appear in the explorer.
- No additional measurements or external sources were introduced.

Verification:

- The Node checker validates every SVG using both a tag-balance check and a strict, DOM-free XML parser, checks the size limit, width, title, description, solid background and source footer, and rejects external URLs throughout SVGs and site files.
- It builds the page, parses the inlined data, checks register and chart counts, and verifies an Indonesian fallback build in memory without touching the source data.
- It exercises both language builds in a minimal DOM fixture: search, state filter, date sorting, thin-evidence toggle, lineage filters, empty states, keyboard record opening, long fields, tab navigation, dialog closing and theme switching with unavailable storage.
- Independent native XML parsing and native font measurement found no text overlaps or out-of-canvas text in the nine SVGs.
- A real browser preview could not start in this environment. Browser rendering and visual behavior at narrow widths therefore remain unverified; the DOM fixture is not a browser layout test.
- The failed browser start left disposable files in `design/.visual-review/`. Automatic approval review rejected both recursive cleanup and a narrower enumerated cleanup. That directory is excluded by `design/.gitignore` and must not be included in the release. Its contents were not used as input.

Rebuild from the repository root with Node 20 or newer, with no packages or network:

```sh
node design/generate-visuals.mjs
node site/build.mjs
node design/check-visuals.mjs
```

Open `site/index.html` directly, or serve that single file as a static page. Run the same commands after a supplied dataset changes. The checker leaves the normal preferred-language build on disk; its forced fallback test does not overwrite it.
