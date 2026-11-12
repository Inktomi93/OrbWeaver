---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: testing
plan: test-foundation
---

# Eight integration tests hit the 5 second budget under whole-suite load and pass alone: remove their repeated work

## What

Remove the repeated work from the eight integration tests that hit the 5 second budget under whole-suite load and pass alone. Folded in, "Thin-margin tests: remove repeated work in corpus-image-variants, the imageBeforeTool completion case and the theme accent sweep": Remove repeated work from the corpus-image-variants tests, the imageBeforeTool completion case and the theme accent sweep. Its done line was: The corpus image variants test and the theme accent sweep each finish well inside their budget in a whole-suite run, and none repeats setup that another case in the same file already does. The `imageBeforeTool` cases stay unless a whole-suite run shows them near budget. Folded in, "The imageBeforeTool cases share one guest plugin root": The imageBeforeTool cases install the same guest plugin four times. Share one root across them, and bring corpus-image-variants under its budget for 1785. Its done line was: The cases install the plugin once and still assert each case's own outcome, and the image-variants suite runs within its budget. Folded in, "corpus-knowledge-variants holds its time budget under load": The corpus-knowledge-variants suite runs near its time budget and times out under load. Its done line was: The suite runs well inside its budget, by sharing setup or splitting it, and passes repeatedly at the load where it timed out.

## Why

A whole pnpm test run on a loaded machine failed eight tests that pass alone. The owner rule is to remove repeated work and never raise the timeout. The files are in the Evidence.

## Done when

Each of the eight tests passes in a whole pnpm test run at the load that failed them, with no raised timeout.

## Evidence

Filled at landing: what ran and where its output is.

Whole `pnpm test` on main after T2 (load about 21 on 24 cores): eight failed. Every test in the affected files passes alone. The files: `tests/server/entry/rate-limit-gate.int.test.ts` (2), `tests/support/node/portability-box.int.test.ts`, `tests/server/entry/compose/share-acme.int.test.ts` (2), `tests/server/entry/http/bundle-body-limit.int.test.ts`, `tests/support/node/factories/execution-outputs.int.test.ts`, and the guest placement membrane test. Owner rule: remove repeated work; never raise the timeout.
