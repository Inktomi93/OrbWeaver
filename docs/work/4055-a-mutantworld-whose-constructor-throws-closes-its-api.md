---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: tooling
---

# A MutantWorld whose constructor throws closes its API

## What

tooling/src/mutation-checker/lib/mutant-world.ts open passes new API(...) straight into the MutantWorld constructor, which throws on a config read error or a missing project and never disposes the API.

## Why

The leaked compiler process outlives the mutation run and holds its memory, the same defect 4032 closed for the unwired world.

## Done when

The open path owns the API with a DisposableStack as NativeWorld does, and a case plants a throwing world and observes the close.

## Evidence

Filled at landing: what ran and where its output is.
