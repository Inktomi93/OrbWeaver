---
kind: tooling
status: open
updated: 2026-11-09
priority: P3
area: tooling
plan: cross-surface-consistency
---

# The all-caps-body rule exempts the caps-by-law chrome voices

## What

all-caps-body in tooling/src/ui-audit/lib/checks-typography.ts exempts only headings, while wide-tracking already exempts rendered caps, so a credit line of three or more names in the credit voice (mono, uppercase, tracked by its recipe in packages/ui/src/primitives/text/variants.ts) trips it, as on the Home hearth card.

## Why

A finding on a voice whose recipe rules uppercase reads as a defect no one can fix.

## Done when

The rule exempts the kicker, interactive kicker and credit voices by their declared voice, a fixture shows a credit line skipped and running prose in caps still flagged, and the Home hearth checkpoint reads clean for it.

## Evidence

Filled at landing: what ran and where its output is.
