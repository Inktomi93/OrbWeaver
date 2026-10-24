---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: plugin
---

# Pocket Arcade fits its flank and its grant reads as a sentence

## What

The grant text starts lowercase ('runs its own interface code…') in `packages/client/src/features/plugin/lib/plugin-copy.ts:145`. `packages/client/src/features/plugin/components/plugin-grant-list.tsx:246` renders it as a continuation clause. Whether it takes sentence case is the open question. The 'New game' wrap is fixed (`packages/showcase-plugins/bundles/pocket-arcade/main.ts:73-74`).

## Why

Plugin final pass finding.

## Done when

The owner rules the grant copy form, and the rendered grant line reads as a sentence in that form.

## Evidence

Filled at landing: what ran and where its output is.
