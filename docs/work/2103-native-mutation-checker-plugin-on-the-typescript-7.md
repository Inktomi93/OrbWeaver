---
kind: tooling
status: doing
updated: 2026-11-08
priority: P3
area: tooling
lane: wt/agent-abbf352dd70937fd8
plan: test-foundation
---

# Native mutation checker plugin on the TypeScript 7.1 sync API

## What

A Stryker checker plugin on @typescript/native/sync that opens one world per run with the classic option overrides, builds a layer snapshot per mutant, checks the file and compares its declaration emit, and runs importer diagnostics only when the declaration changed. Reuse the world loader and overlay in tooling/src/unwired/native.ts.

## Why

The classic checker sets the length of every mutation run at seconds per mutant, and the measured native path checks a mutant in a fraction of a second with the same verdicts.

## Done when

pnpm test:mutation uses it, gives the same verdicts as classic on the admin guard and template-rows files, including a caller-only break, and the run time drops.

## Evidence

Filled at landing: what ran and where its output is.
