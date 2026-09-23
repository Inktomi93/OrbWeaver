---
kind: decision
status: open
updated: 2026-09-23
priority: P2
area: verify
---

# Decide the time budget and home for type-aware real-corpus liveness pins

## What

Decide where the real-corpus pins for `analysis: "types"` policies run. One type-graph corpus over `@client` pushed the existing suite past the integration timeout. Options: one shared type-graph corpus in its own `.repo.int` file with its own budget; that file in `--full` only; or per-family files. Recommended default: one shared corpus, its own file, run in `--full`.

Owner ruling: mirror the verify runtime's shared design in the test. Verify loads each compiler world
once and runs every policy through one walker. The pins should work the same way:

- One liveness runner builds each distinct corpus once per run, including one shared type graph per
  world.
- It runs every pin against the corpus it shares, instead of a project per file or per family.
- The pins stay data (`RealCorpusLivenessArm` rows) that the runner collects.
- The tier is set by the measured cost of that single shared run after it is built.

## Why

Item 0042 cannot finish the type-aware policies until this is ruled. The mechanism already supports `types: true`; only the schedule is open.

## Done when

The ruling is recorded here, and the type-aware pins in item 0042 follow it.

## Evidence

Filled at landing: what ran and where its output is.

Built by lane cb-pins. The runner loads the structure run's own corpus once (`projectCtx`, the
harness globs) and runs a shared baseline pass over every armed policy. Each pin's overlay then runs against
that same project. Verify has one compiler world with one lazy type graph, so the runner has the same. The
first chunk carries 23 `analysis: "types"` pins, 24 of the 47 in all. Measured at 47 pins: a baseline of
about 46 to 69 seconds, a `types` pin of about 6 to 26 seconds, and 240 to 460 seconds for the whole file.
The file stays in the `repository` project inside `--full` with per-test budgets.
