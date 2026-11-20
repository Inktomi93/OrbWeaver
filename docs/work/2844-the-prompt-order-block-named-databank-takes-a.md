---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: preset
plan: cross-surface-consistency
---

# The prompt-order block named Databank takes a name of its own

## What

The preset prompt-order rack names one block Databank, the same word as the Databank section. The row shows the stored section name from `DEFAULT_PROMPT_CONFIG` in `packages/contracts/src/preset/index.ts`, so client copy alone cannot rename it. Rename the default and `MARKER_COPY.databank.label` to Databank passages, lift `PROMPT_CONFIG_SCHEMA_VERSION` with a stamp-only lift so the seeder reseeds the built-in preset, add the forward migration for the `presets.schema_version` default, and republish the corpus fixture.

## Why

Two different things share one name, so a reader and the design audit both read the block as a door to the section.

## Done when

A seeded built-in preset shows Databank passages in the rack, a test reads the name from its production home, the migration runs on a copy of a real library, and the corpus fixture is republished.

## Evidence

Filled at landing: what ran and where its output is.
