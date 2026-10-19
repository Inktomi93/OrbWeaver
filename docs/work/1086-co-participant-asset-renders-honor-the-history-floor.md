---
kind: bug
status: open
updated: 2026-10-19
priority: P2
area: server
---

# Co-participant asset renders honor the history floor

## What

co-participant-assets.ts grants a present member a render of an asset referenced in the room with no seq or history-floor term. A member admitted with history from their join may render a picture posted before the join when a later message quotes its id. Unverified lead from the 1071 security review; the floor may be applied by the caller.

## Why

History floors decide what a joiner may see, and a render grant that skips the floor would leak pre-join pictures.

## Done when

A test shows a from-join member cannot render a pre-join picture through a later quote, or the caller's floor is cited and the lead closed.

## Evidence

Filled at landing: what ran and where its output is.
