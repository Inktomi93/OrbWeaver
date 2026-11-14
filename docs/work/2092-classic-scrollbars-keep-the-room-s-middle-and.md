---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: client
plan: cross-surface-consistency
---

# Classic scrollbars keep the room's middle and the door glides on one axis

## What

On a browser with classic scrollbars, the chat thread's scroll port takes a one-sided gutter. The transcript rows centre in the port without the gutter and the composer centres in the whole room, so their middles stand half a gutter apart. The shell door and flank glides start from the same offset, because `--shell-room-track` in `packages/client/src/features/app-shell/surfaces/shell/grid.css` has no gutter term. Reserving the gutter on both edges in `packages/ui/src/primitives/message-list/variants.ts` closes the rest offset but breaks the door arithmetic in the default browser. Publish the measured gutter from the thread scroller as a CSS variable and subtract it in `grid.css` and the shell motion stylesheet, and rule one-sided against both edges with the rendered result.

## Why

Windows and Linux desktops draw classic scrollbars by default, so most desktop readers see the transcript and the composer out of line and a jump at the start of every door glide.

## Done when

`tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` runs its one-axis, door and flank cases under a classic-scrollbar browser fixture as well as the default one, and both pass. The classic cases are red before the change.

## Evidence

Filled at landing: what ran and where its output is.
