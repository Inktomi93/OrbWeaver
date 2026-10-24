---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: client
---

# A Labels prune on a phone lands focus on More tag actions, not the finder root

## What

After Prune unused tags and its confirm, focus lands on the overflow trigger instead of the labels finder root. `pruneFinalFocus` in `packages/client/src/features/tag/components/tag-collection-rows.tsx:149-156` calls `libraryOrFinder().focus()` while the confirm dialog still holds the background inert, so the focus does not stick; it returns `true` and Base UI falls back to the trigger. `deleteFinalFocus` beside it appears to have the same shape.

## Why

Keyboard and screen-reader users lose their place after a prune.

## Done when

Focus after a prune and after a delete lands on the finder root, proven by a CT on the focus handoff with a control that fails on the current early focus call.

## Evidence

Filled at landing: what ran and where its output is.
