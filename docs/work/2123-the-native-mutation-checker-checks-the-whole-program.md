---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tooling
plan: test-foundation
---

# The native mutation checker checks the whole program when a mutant's file augments a global or a module

## What

tooling/src/mutation-checker/lib/mutant-world.ts passes mutants whose only compile break is in a file reached through declare global or declare module augmentation. Live sites include packages/client/src/routes/router.tsx, packages/client/src/data/query-client.ts and packages/client/src/lib/agent-bridge.ts. Check the whole program when the mutated file's declaration emit carries an augmentation.

## Why

A mutant the checker wrongly passes runs as a survivor, which adds noise to the mutation score of exactly the files that shape global types.

## Done when

A fixture mutant whose break is only visible through an augmentation is rejected by the checker, and a run on router.tsx matches the classic checker's verdicts.

## Evidence

Filled at landing: what ran and where its output is.
