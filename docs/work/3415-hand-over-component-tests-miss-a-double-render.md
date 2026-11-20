---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: tests
plan: test-foundation
---

# Hand-over component tests miss a double render and the anchored-window rule

## What

The hand-over case in `tests/client/features/chat/components/stopped-reply-row.ct.tsx` stops sampling at the first frame with the kept row and never checks that the ghost is gone. The held-bubble window rule (`!edges.later` in `message-list-surface.tsx`) has no test that goes red without it.

## Why

A frame that shows the ghost and the kept row together passes, and a later edit can drop the window rule unseen.

## Done when

The hand-over case samples frames past the swap and asserts no frame holds the ghost text and the kept row together. A second case holds a ghost, opens a search-jump window short of the tail, and asserts no bubble shows there and the row shows once on return.

## Evidence

Filled at landing: what ran and where its output is.
