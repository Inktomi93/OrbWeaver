---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: character
plan: unwired-code
---

# Mark already-imported characters on hub search

## What

CharacterService.findByImportedFrom has no caller. Wire it so hub search results mark characters the user has already imported.

## Why

Owner ruling: wanted feature, built server-side and never surfaced.

## Done when

Hub search shows the marker for an imported card through the production verb; a CT and an integration test cover it.

## Evidence

Filled at landing: what ran and where its output is.
