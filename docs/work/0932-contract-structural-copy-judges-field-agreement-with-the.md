---
kind: tooling
status: open
updated: 2026-10-12
priority: P2
area: tooling
plan: test-mirror
---

# contract-structural-copy judges field agreement with the type checker

## What

contract-structural-copy decides that a shape copies a contract by comparing normalized field type text through a cross-file text index, so two fields whose types agree only after resolution, or a contract whose fields come from z.infer and have no field node, are judged by spelling. pnpm ast respell already decides structural identity with the checker (tooling/src/ast/lib/respell-shapes.ts assignabilityChecker). Judge per-field agreement with the checker by loading both declarations in one program (floor/compiler coLocatedSemanticNodes), sharing the detector with respell through a floor home.

## Why

A gate that compares type text misses copies whose spelling differs and flags pairs whose text matches but types differ; the plan requires judging by type, never by name.

## Done when

The gate and pnpm ast respell share one checker-based agreement detector, a planted copy whose field types differ only in spelling flags, a z.infer contract is compared, and respell output is unchanged.

## Evidence

Filled at landing: what ran and where its output is.
