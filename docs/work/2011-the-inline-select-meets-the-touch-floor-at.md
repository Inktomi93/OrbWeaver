---
kind: bug
status: open
updated: 2026-11-07
priority: P2
area: ui
plan: cross-surface-consistency
---

# The inline Select meets the touch floor at a coarse pointer

## What

The Inventory subject select measures 64x22 at a coarse pointer. layout inline writes block-auto min-block-0 and has no hit area, so the coarse floor never applies. Owners: packages/ui/src/primitives/select/variants.ts and packages/client/src/features/rpg/components/rpg-subject-select.tsx. Finding F4 in the UI rendered review report under reports/ux-reviewer.

## Why

It fails the 44px touch floor. The variant is deliberate for desktop, so the fix adds a coarse floor and desktop stays as it is.

## Done when

Every inline Select has a 44px target at a coarse pointer and keeps its desktop size, proved by a CT at both pointers.

## Evidence

Filled at landing: what ran and where its output is.
