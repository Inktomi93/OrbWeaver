---
kind: work
status: open
updated: 2026-11-21
priority: P2
area: preset
plan: typed-enforcers
---

# Every preset control has one exhaustive label home in the client

## What

A control's label lives in one of three client tables: SAMPLING_KNOB_CATALOG, SAMPLING_FLAG_LABELS, or KNOB_LABELS in packages/client/src/features/preset/lib/effective-knobs.ts, which is a Record\<string, string>. knobLabel takes a string, searches with find and falls back to the raw key, so carryReasoning, reasoningSeed, quality and providerContextCompression have no label and print their code name.

## Why

A missing label shows an identifier to the user and nothing fails.

## Done when

One copy table keyed by every UserIntent field, each with a label (and the sampler step and description where it has one), replaces the three tables; knobLabel takes keyof UserIntent with no fallback, so a field without a label fails tsc; every reader moves to it in the same change.

## Evidence

Filled at landing: what ran and where its output is.
