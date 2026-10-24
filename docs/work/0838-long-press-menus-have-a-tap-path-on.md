---
kind: bug
status: open
updated: 2026-10-10
priority: P2
area: client
---

# Long-press menus have a tap path on iOS

## What

The tag chip at `packages/client/src/features/character/components/character-filter-rail-parts.tsx:224` opens its edit action only from onContextMenu, which iOS WebKit does not fire on long-press. Unverified on device. The row body in `packages/client/src/features/chat/components/member-row.tsx:81` is the menu trigger, so a tap already opens it; its onContextMenu serves the keyboard ContextMenu key only.

## Why

The owner uses iOS; a long-press-only door is dead there.

## Done when

The tag chip has a visible tap path to its edit action, or a long-press handler that fires on iOS, with a CT for the tap path.

## Evidence

Filled at landing: what ran and where its output is.
