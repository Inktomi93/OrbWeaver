---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: docs
plan: import-robustness
---

# Presets imported before the slot sections differ from the same file imported now

## What

Since 91e906748d a SillyTavern preset import gains four sections for orbweaver's own slots (`withOrbSlots` in packages/contracts/src/preset/index.ts). A preset imported before it lacks them, so importing the same file again differs in config and lands beside the old preset instead of reusing it.

## Why

Only the owner has installed orbweaver, so no backfill is owed; the owner should still know why a re-import doubles.

## Done when

The next release note says that a SillyTavern preset imported before this release lands beside its old copy on re-import, and that the old one can be removed.

## Evidence

Filled at landing: what ran and where its output is.
