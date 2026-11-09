---
kind: tooling
status: open
updated: 2026-11-09
priority: P3
area: tooling
plan: cross-surface-consistency
---

# off-theme-font skips a face a control declares to name a choice

## What

off-theme-font (tooling/src/ui-audit/lib/checks-font-census.ts) fires on an open font picker, whose option labels are painted in the face each one names, and reports the subject as page rather than the option.

## Why

A picker that previews its fonts is the design, and a page-level finding names no owner.

## Done when

An element that declares it previews a font face is skipped, the finding carries a real selector, an open-picker fixture reads clean, and a stray face elsewhere still flags.

## Evidence

Filled at landing: what ran and where its output is.
