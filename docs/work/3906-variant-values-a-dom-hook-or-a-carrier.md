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

A stamped axis value that a sheet or walker selector names counts as used, and a carrier prop forwards its class value, each with a planted case and a positive control; the real-tree variant-value-unused rows that move are listed.

## Evidence

Filled at landing: what ran and where its output is.
