---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: client
plan: cross-surface-consistency
---

# "Use this preset" can be offered for a preset that is already active

## What

packages/client/src/features/preset/hooks/use-preset-import.tsx (on its branch) reads `settings.data` from a query that does not suspend. If that read has not landed when the import lands, the notice says "not active yet" and offers the action. A suspicion, not reproduced; the read is usually warm by the time someone imports.

## Why

A notice that says a preset is not active when it is, and offers to activate it, is a false line.

## Done when

The notice's wording waits for the settings read, or the case is proved unreachable, with a case that imports before the settings read lands.

## Evidence

Filled at landing: what ran and where its output is.
