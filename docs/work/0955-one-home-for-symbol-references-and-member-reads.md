---
kind: work
status: doing
updated: 2026-10-13
priority: P2
lane: codex/shared-references-955
plan: test-foundation
---

# One home for symbol references and member reads

## What

Consolidate named declaration selection, module targets and literal member/index extraction in the floor. Reference commands live in `ast/ops/symbols.ts`; wiring and checker adapters preserve their own admission and reporting. `ast/lib/usage.ts` is help text, not a reader. Preserve native/store identity, relative-only import policy, optional and bracket spellings, type-index distinctions and literal-versus-const judgments. Carry ViewerView client-gap, JSDoc-not-consumer and mutable-binding controls.

## Why

Two reference stacks mean a `pnpm ast` verb and a gate can disagree about who calls what.

## Done when

`pnpm ast` reference verbs run on the floor reader; output diffed unchanged; the ast copies are deleted.

## Evidence

The bounded source batch is authored; its floor and native repository equivalence remain pending. Existing reference verbs already use the canonical reference reader. Keep native views until store coverage is proven: dynamic importer file lookup differs from typed module targets, and dependency-origin reference keys are not completely extracted. An absent stored key must not become a false empty-reference verdict. Preserve extensionless importer controls and unresolved outcomes rather than routing through synthetic compiler options.
