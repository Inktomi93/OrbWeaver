---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: chat
plan: cross-surface-consistency
---

# The message name row and actions row stay inside the transcript scroller

## What

At 200% text the message name row (flat, 390) and the actions row (ripple, 320) sit 4px past the transcript scroller, which makes message-list-scroll scroll sideways in the chat-room walk checkpoints; both point at message-name-row-frame.tsx (a wrap row with the avatar reach and inset).

## Why

A transcript that drifts sideways by a few pixels misplaces every control at the edge.

## Done when

No message row descendant extends past the scroller at 200% and 300% on 320 and 390 in any chat style, with a CT that measures each child.

## Evidence

Filled at landing: what ran and where its output is.
