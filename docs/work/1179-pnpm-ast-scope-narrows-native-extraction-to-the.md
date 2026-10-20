---
kind: bug
status: open
updated: 2026-10-20
priority: P1
plan: test-foundation
---

# pnpm ast scope narrows native extraction to the worlds it reads

## What

rot server ran 1:44:07 at 14.1 GB peak on main after 1133, 1154 and 1155: the server scope still extracted the whole root tsconfig.json world in one single-core worker, because the scope argument does not narrow which native worlds are extracted. testonly kit took 4:37 at 6.5 GB. Timings are in reports/review/heavy1/.

## Why

One verb over one package must not pay for the whole repository, and 14.1 GB leaves no margin under the 16 GB per-run bar on a standard runner.

## Done when

A scoped verb extracts only the worlds whose files it reads or whose consumers it must count, with identical findings; rot server runs in minutes well under 16 GB, measured with /usr/bin/time beside the 1:44:07 baseline.

## Evidence

Filled at landing: what ran and where its output is.

Prior-art review (`reports/review/semantic-store-prior-art.md`): currentDemandDescriptors returns every program whenever a shape plan is set (tooling/src/floor/code-facts/semantic-inventory.ts:261), demandShapePartitions then runs a membership extraction per descriptor (:519-521), each loading a whole Program, one worker at a time. Scope the acquired worlds first, then make membership a cached cheap read.
