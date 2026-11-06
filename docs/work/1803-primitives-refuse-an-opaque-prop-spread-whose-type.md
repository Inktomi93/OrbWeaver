---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: type-law
---

# Primitives refuse an opaque prop spread whose type can carry a variant axis, so the variant census is exact

## What

orb/no-opaque-variant-spread refuses a JSX spread in the client whose type can write a variant-like prop of the @orb/ui element it lands on, unless the variant census reads the spread: an object literal, a conditional or logical of literals, or a same-file const of one. The census counts any other spread as writing nothing.

## Why

A spread of a prop bag could write any variant axis, so the census had to mark every axis of the door unclaimable and could not call any value unused. The type checker knows which spreads can carry an axis, so the rule keeps only those out and leaves harmless spreads (src, aria, data-\*) alone.

## Done when

The rule is registered in tooling/src/eslint/index.ts and enabled for packages/client/src in eslint.config.ts. pnpm lint:eslint packages/client/src is clean. tests/tooling/eslint-opaque-variant-spread.test.ts proves the flagged and passing shapes, and the checker-contract test lists the rule. The ui-facts census no longer reports a spread as an unresolved use.

## Evidence

Filled at landing: what ran and where its output is.
