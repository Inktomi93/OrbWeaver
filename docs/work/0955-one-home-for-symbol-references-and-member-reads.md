---
kind: work
status: doing
updated: 2026-10-19
priority: P2
lane: wt/agent-a765652d97d940753
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

Reviewed `0081f49051` preserves strict defaults while capturing requested authored absence and native String VALUE/signature evidence. Runtime guards reject annotation-only narrowing. Canonical documentation-link judgments preserve real code escapes. Affected native controls and tooling types pass; root retains off-owned errors. Shape consumers and the retained-owner reader still require their own qualification.
