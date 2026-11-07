---
kind: tooling
status: open
updated: 2026-11-07
priority: P2
area: testing
plan: test-foundation
---

# Restore Stryker mutation testing on the current Stryker and compiler

## What

Owner ruling: bring mutation testing back so lanes stop writing their own mutation scripts. Restore stryker.config.ts, vitest.stryker.config.ts, tooling/src/floor/testing/stryker-config.ts, the three Stryker patches, the ARID plugin in tooling/src/mutation-arid and their tests from the origin savepoint branch named pre-tooling-deletion. Move to the latest Stryker, re-derive each patch against that version and the current native compiler, and amend D333 in the same commit. A lane runs it on named files through one pnpm script.

## Why

Hand-planted mutants differ per lane, die with the lane and prove only what the author thought to plant. Reading a test cannot measure what it would catch; a mutant run can.

## Done when

pnpm test:mutation on a named file reports killed and survived mutants from a real sandbox run. A planted control shows the sandbox runs mutated code, ARID drops an equivalent mutant, D333 states the ruling, and the lane skill names the command in place of hand mutation.

## Evidence

Filled at landing: what ran and where its output is.
