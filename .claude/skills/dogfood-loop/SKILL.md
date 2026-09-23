---
name: dogfood-loop
description: "The finding ladder for dogfooding Orbweaver: reproduce, locate, classify, file, fix inline or dispatch; retraction norms and the known-fine console list."
---

# The dogfood loop

Turn a drive signal into a classified finding, then fix it inline or dispatch it.

## Finding ladder

Every drive signal walks this ladder. Skipping a step ships noise.

1. **Signal** — a red exit, a console class, a wrong pixel, a taste judgment.
2. **Reproduce** — a second run or a minimal chain. A one-off that never recurs is a note, not a
   finding.
3. **Locate** — cite `path:line` for every claim. A symptom with no located cause files as
   `evidence`, not a confident `bug`.
4. **Classify:**
   - `bug` — reproducible contract violation (code, header law, or a ledger decision).
   - `decision` — a genuine owner fork. State a default case.
   - `work` — a buildable improvement that violates nothing.
   - **accept-as-designed** — a documented deliberate tradeoff (file-header law or a ledger
     decision). Cite the source and file nothing. Filing a ruled tradeoff as a bug is itself a
     defect.
5. **File** — one issue per finding, one class, evidence inline.
6. **Fix:**
   - **Inline** when you hold the cause, the fix is local, and the tier's tests run now.
   - **Dispatch** when it needs judgment, an area you have not read, or disjoint files from other
     live work.

## Retraction

A finding overturned by later evidence is retracted explicitly: name the wrong call, what it was
based on, and the evidence that overturned it. A silent drop puts every sibling finding in doubt.

Before filing "X is wrong or missing", read the file header and the ledger decision that govern X.

## Reading verdicts

Read every screenshot you cite and say what you saw — a cited-but-unread image is a claim without
a verdict.

File taste notes too: `broken` when they block or mislead, `ugly` when they are taste. "Instruments
were green" does not close a taste question.

The app reports through dev console channels (manual:
`packages/client/src/lib/agent-tools.README.md`): `[bus]` `[trpc]` `[perf]` `[frame]` `[reflow]`
`[input]` `[anim]` `[drop]` `[css]` `[space]` `[cls]`. Investigate every class that appears in a
drive.

Known-fine, skip these:

- `[cls]` entries tagged `virtualized: true`. CLS evidence rule: `snap-driving` skill §5.
- Shifts within 500ms of an `__orb.nav` call.
- `sandbox-trace-noise` console errors (`snap-driving` skill §5).
