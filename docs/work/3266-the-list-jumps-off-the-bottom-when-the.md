---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
plan: import-robustness
---

# The list jumps off the bottom when the newest reply's frame lands

## What

When the newest styled reply's frame routes and grows past its seeded height, the transcript sits off the bottom for a moment, then re-pins. It reproduced in both a game room and a normal room. A reader scrolled mid-list is unaffected.

## Why

The last message jolts upward on every room open, which is the moment the user is reading it.

## Done when

While the list is pinned to the bottom, a reply-frame height change re-pins in the same frame. A recorder or CT across the swap shows no off-bottom gap.

## Evidence

Filled at landing: what ran and where its output is.
