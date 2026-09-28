# What was released, what was not, and how it was checked

MiganCore was developed in a private repository. This public repository is a **curated snapshot** of it, taken
at the project's closure on 28 September 2026, plus new English documentation, data files and visuals written
for the release.

## Why a fresh repository instead of opening the private one

The private repository's history contains material that must not be published:
- credentials that once leaked into files (removed from the files, but still present in the history);
- private infrastructure details;
- working notes.

Rewriting that history would not make it safe to trust. The release therefore starts a new history from a
reviewed snapshot.

## What is not included

| Excluded | Why | What you get instead |
|---|---|---|
| Chat transcripts, session logs, handoff notes, journals, agent instructions and memory files | They are working conversations, not research outputs | Synthesized statements in these docs, and verdicts in the pre-registration files |
| Credentials, tokens and keys | Security | — |
| Server addresses, SSH hosts and ports, server paths, machine-specific paths | Security | Generic role names: laptop, measurement machine, VPS |
| The private test battery (questions about the owner's businesses) | Private business information | The public battery `petak-jujur2` and its results |
| Anything derived from the owner's personal knowledge base, including raw outputs of retrieval experiments that quote it | Personal information | Aggregated numbers and verdicts only |
| Business, lead and buyer data; funding-application drafts | Private | — |
| Model weights | Too large for git. `migancore:0.14` is on Hugging Face; every other variant is withheld because of its training-data provenance (see the README, *Models and weights*) | Lineage with data, method and verdict for every variant |

## Mechanical redaction

Files that were otherwise publishable but contained machine-specific details were redacted mechanically before
copying. For example, a local network address became `<measurement-machine>` and a user profile path became
`<home>`. As a result, a few integrity fingerprints stored inside pre-registration files may not match the
redacted copies. The verdicts themselves are unchanged.

**How the snapshot was built.**
- Every one of the 2,211 tracked files in the private repository was classified before release: 1,123 publish,
  395 scrub, 180 synthesize, 513 exclude. The classification was checked by a scanner that never prints
  matched values.
- **1,359 of those files are in this repository:**
  - files classed as publishable;
  - files that needed only mechanical redaction;
  - the 39 pre-registrations;
  - five files edited by hand: the public question bank and its test, the command-line tool, the Studio PRD,
    and the Studio data snapshot.
- **The other 852 files are not.** Some were replaced by the new English documents; others were excluded
  outright.
- **Mechanical redactions in copied files: 276.** Local network addresses became `measure-host.local` or
  `laptop.local`, user and machine paths became `~`, `./` or `<local-dir>`, server paths became
  `<server-root>`, and one non-author e-mail address became `<email>`.
- **Pre-registrations:**
  - 46 mechanical redactions;
  - 27 hand rewrites that turn quoted chat instructions into dated, synthesized statements and replace
    private business names with `[bisnis pemilik]`.
- **Code comments:** 27 quoted chat instructions rewritten the same way.
- **Question bank:** the three private questions (`J2-P1..P3`) were removed. The 36 public questions are
  unchanged.
- **Training-data provenance** is described by the nature of the source ("commercial AI services") rather than
  by vendor name. Judge and benchmark records keep the names of the systems measured.

**Git history.** The release starts from a fresh history, so no earlier revision of any file is published.

## Checks performed before publishing

1. **A value-shape secret scan over every file**, covering API-key prefixes, bearer tokens, private-key blocks,
   JWTs and literal password or token assignments. Result: **0 findings**.
2. **An infrastructure and personal-data scan** covering IP addresses, e-mail addresses (only the author's
   public contact address is allowed), user and server paths, and SSH hosts and ports. Result: **0 findings**,
   apart from test fixtures:
   - a dummy address `1.2.3.4` in a test;
   - a dummy Windows path for user `u` in a test;
   - the standard `/root/` home directory of rented GPU containers in a runbook.
3. **A name scan** for private business names and third parties. Result: **0 findings**. The only exception is
   the Hugging Face account name that hosts the models (`Tiranyx`).
4. **A quote scan** for chat instructions quoted word for word. Result: **0 findings** after the rewrites
   described above.
5. **Reading.** The new documents in `docs/` and both READMEs were written and read for this release. The
   pre-registration passages that quote or name private parties were read one by one. The data files were
   checked by script (numbers against their source) and sampled by reading. A clean scan is not a fitness
   review.
6. **Studio snapshot.** The Studio's `data-nyata.json` was regenerated and stripped of internal planning notes
   and file locations before release.

## Reporting a problem

If you find something that should not be public, contact **fahmiwol@gmail.com**. It will be removed and the
removal noted in the changelog.
