---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# The brand-flow scan reads brands from types

## What

tooling/src/unwired/brand-names.ts BrandTable decides an id brand by identifier spelling for pnpm brand-flow and orb/no-raw-id. A typed site can read the brand from its declared type: a type assignable to the constraint of the castId type parameter is a brand (tooling/src/eslint/unsafe-cast.ts brandedString). The mining reports name the other typed answers to fold in: carriesBrand (viewer-visibility.ts), roleAxes literal sets (role-comparison.ts) and the narrowed-json mint (narrowed-json.ts).

## Why

A name guess misses a renamed id and flags a lookalike.

## Done when

Typed sites read the brand from the type and the name table serves only the untyped sites the item names; planted cases for a renamed id and a lookalike; every real-tree disagreement between the two answers is listed.

## Evidence

Filled at landing: what ran and where its output is.
