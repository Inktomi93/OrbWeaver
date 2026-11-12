---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: client
plan: surface-walk
---

# Overflow rows measure positioned-out siblings as room-taking boxes

## What

`roomFor` in `packages/client/src/components/overflow-actions.tsx` counted an absolutely positioned sibling, the topbar's visually hidden heading, as an in-flow box with a floor. WebKit reports that sibling's automatic minimum width as `auto`, so its text width became a floor and the trail folded every action into More on a phone.

## Why

On phone Safari the trail hid New character, Import and Show details behind More with room to spare, and Chromium counted one gap too few of room.

## Done when

`roomFor` skips absolutely and fixed positioned siblings, and `pnpm test:ct:webkit` passes on the overflow room, text scale and context recovery platform suites.

## Evidence

Filled at landing: what ran and where its output is.
