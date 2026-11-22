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

BrandTable in tooling/src/eslint/brand-names.ts (re-exported by tooling/src/brand-names/index.ts) decides an id brand by identifier spelling for pnpm brand-flow and orb/no-raw-id, even on typed sites: raw-id names a brand by typeToString and alias spelling, and raw-id and brand-flow name a plain-string declaration brand from its spelling even when a branded value flows into it. A typed site can read the brand from its declared type and from the brands that flow into it; carriesBrand, roleAxes and the narrowed-json mint show the method (identity keyed on the brand declaration, not a type name).

## Why

A name guess misses a renamed id and flags a lookalike.

## Done when

Typed sites read the brand from the type and the name table serves only the untyped sites the item names; planted cases for a renamed id and a lookalike; every real-tree disagreement between the two answers is listed.

## Evidence

Filled at landing: what ran and where its output is.
