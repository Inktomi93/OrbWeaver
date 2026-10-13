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

The reviewed source and correction are integrated. Bounded controls and affected tooling/root checks pass. Dependency-origin declarations remain selectable; unsupported stored references refuse instead of becoming false deletion candidates. The dependency-barrel control proves native consumption, stored refusal and valid authored zero-reference results. Native repository equivalence remains pending. Keep native views until store coverage is proven; preserve extensionless importer controls and unresolved outcomes.
