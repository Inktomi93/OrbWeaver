---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
plan: unwired-code
---

# Variant values a DOM hook or a carrier prop reaches count as used

## What

packages/ui/src/lib/variant-attrs.ts STAMPED_VARIANT_AXES stamps variant, size, square, tone, glyph and step values onto data-\* attributes, which sheets and the ui-audit walker select. Class names also ride carrier props (of= and the core.tsx carriers named in tooling/src/eslint/ui-classes/classes.ts). The graph variant pass reads neither door.

## Why

A variant value only a stamped attribute selector reads is reported unused, and a class a carrier forwards is not seen as written.

## Done when

A variant-value-unused row names every sheet or walker selector that selects that value, so one delete removes both; a selector that names a value no recipe declares is reported stale; a selector alone never keeps a value, since variantAttrs stamps only the values callers select. A carrier prop forwards its class value. Each has a planted case and a positive control, and the real-tree variant-value-unused rows that move are listed.

## Evidence

Filled at landing: what ran and where its output is.
