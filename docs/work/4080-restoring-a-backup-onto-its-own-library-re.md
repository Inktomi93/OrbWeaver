---
kind: bug
status: open
updated: 2026-11-27
priority: P2
area: import
---

# Restoring a backup onto its own library re-adds no persona that has an avatar

## What

The persona backup drops the avatar (packages/contracts/src/persona/schemas.ts, packages/server/src/domain/persona/verbs/export.ts), and import compares an art-less candidate against owned rows whose candidate carries the avatar hash (verbs/import.ts, persistence/queries.ts), so every self-restore of a persona with an avatar mints a second persona such as Traveler 2.

## Why

D290 rules that a whole-library backup restored onto the library that wrote it adds no row and an export re-imports as the persona it came from; the owner rules a same-name persona never becomes a silent copy.

## Done when

The persona backup carries an optional avatar hash that import resolves against the owner's restored assets, a self-restore adds no persona row, a lone persona file imported twice still dedups, and the corpus-settings backup e2e passes in every layout.

## Evidence

Filled at landing: what ran and where its output is.
