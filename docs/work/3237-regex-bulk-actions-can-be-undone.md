---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: regex
---

# Regex bulk actions can be undone

## What

Bulk enable, placement and global change many scripts with no confirm and no undo (`packages/client/src/features/regex/components/regex-bulk-bar.tsx`). Offer an undo, or a confirm that names the count.

## Why

One mis-click changes many scripts and the previous state is not recoverable.

## Done when

A component test shows an undo or a count-naming confirm for each bulk change.

## Evidence

Filled at landing: what ran and where its output is.
