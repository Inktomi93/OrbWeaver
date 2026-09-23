---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: rpg
---

# Measure the rpg extraction prose wiring with an A/B run

## What

Run the A/B that the prose-1 follow-on left open: rpg extraction with and without the prose slot wired into the extraction prompt (see `packages/contracts/src/rpg/prose.ts`), on the same transcripts, and compare extraction quality.

## Why

The wiring shipped without the measurement that was meant to justify it.

## Done when

The A/B ran on a named model and transcript set, and its result is recorded here with a keep or revert call.

## Evidence

Filled at landing: what ran and where its output is.
