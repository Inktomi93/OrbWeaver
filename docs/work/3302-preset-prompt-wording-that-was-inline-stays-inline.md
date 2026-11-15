---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: client
plan: cross-surface-consistency
---

# Preset prompt wording that was inline stays inline

## What

The tab label and the two chips moved to `preset-names.ts`. The "prompt" rewording of prose that was already written inline (`section-drill-in.tsx`, `prompt-readout.tsx`, `actions-readout.tsx`, `marker-copy.ts`, `template-rows.ts`, `format-count.ts`, `assembly-rack.tsx`, `delivery-cluster.tsx`, `assembly-preview.tsx`) was changed where it lived. No identifier changed. A test selects none of these strings, but they will not move with a future rename of the noun.

## Why

Prose that spells a noun inline cannot follow a rename of that noun from one place.

## Done when

The prose either reads the noun from a names module, or the rename is ruled not worth a constant per sentence.

## Evidence

Filled at landing: what ran and where its output is.
