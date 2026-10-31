---
kind: bug
status: open
updated: 2026-10-31
priority: P3
area: rpg
plan: cross-surface-consistency
---

# Attribute tiles are number inputs with a range

## What

A tile is a free-text box with no arrow-key step and no 1 to 20 hint. Owner ruling: keep click to type; use a number input with the ruleset's min and max; no stepper buttons. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

Tiles take numbers only, arrow keys step by one, and the range shows as a hint, with a test.

## Evidence

`tests/client/features/rpg/components/own-key-panels.ct.tsx` gains "an attribute tile takes numbers only, steps by one on the arrow keys and states the profile's range". With the tile's `range` prop withheld (old behaviour) it failed (ArrowUp left `14`, expected `15`; 5 other tests passed). With the fix all 6 pass, including the existing editor-height test (`pnpm test:ct`, chromium). The tile edits through the `NumberField` primitive's new stepper-less `tile` layout; its bounds description and the empty field's placeholder carry the profile's range. `pnpm typecheck packages/client/tsconfig.json packages/ui/tsconfig.json`, `pnpm lint:eslint` on the touched trees and `pnpm depcruise` exit 0.
