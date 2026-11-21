---
kind: work
status: open
updated: 2026-11-21
priority: P2
area: contracts
plan: typed-enforcers
---

# Every pair of shape spellings is linked by the compiler under one written rule

## What

Two spellings of one shape are linked six ways: z.infer; a documented interface plus a schema with satisfies z.ZodType<T>, which checks one direction only (about 280 real twins in packages/contracts); deliberately looser or stricter parsers (healing stored data, stricter outputs, transforms) with no marker saying so; db rows restated in contracts, which cannot import db; the plugin SDK declarations held by tests/contracts/plugin/sdk-conformance.test-d.ts; and tooling copies of client shapes. Spine-TypeScript-and-Patterns.md says the schema is the source and never names type-first, so a reader cannot tell which pattern is meant.

## Why

A one-way link lets a schema accept a key the type lacks or require a field the type makes optional, and both compile.

## Done when

Spine-TypeScript-and-Patterns.md states the rule: internal and derived shapes are schema-first with z.infer; documented contracts are an interface plus z.toZod<T>()(schema), an exact two-way check; a one-way satisfies z.ZodType<T> carries a stated reason (heals stored data, stricter output or transform) on its line; a shape split by a package wall has a type-equality test in the package that sees both, or moves to a package both import. A census classifies every satisfies z.ZodType site first; a codemod applies the classes; every drift the exact check exposes is fixed; a lint rule refuses a bare satisfies z.ZodType without a reason, at zero; the sdk-conformance test covers every published plugin type.

## Evidence

Filled at landing: what ran and where its output is.
