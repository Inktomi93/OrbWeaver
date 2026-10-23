---
kind: bug
status: open
updated: 2026-10-23
priority: P2
area: tooling
---

# Tooling project reds that reproduce alone

## What

A full `pnpm test:tools` run left about 17 red files after the six known ones were fixed. Two reproduce alone: `tests/tooling/workflow-feedback.int.test.ts` (the gate runner exits 4 where the test expects 1) and `tests/tooling/floor/host/concurrency-profile.test.ts` (a broken `stageBudgets` row no longer throws). `tests/tooling/snap/cascade.suite.int.test.ts` fails on a Playwright drift: 1.64.1 installed against a 1.61.1 pin. The rest timed out under box load. Full output: the primary session scratchpad `tred-full.txt`; rerun on an idle box to separate load from real.

## Why

The tooling project is outside `pnpm test` and CI by owner ruling, so a real red there rots unseen.

## Done when

The two reproducible reds are fixed at the cause and the Playwright pin agrees with the installed version; a full `pnpm test:tools` on an idle box lists only load-bound failures, each named.

## Evidence

Filled at landing: what ran and where its output is.
