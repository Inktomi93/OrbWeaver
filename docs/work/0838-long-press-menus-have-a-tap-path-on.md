---
kind: bug
status: open
updated: 2026-10-10
priority: P2
area: client
---

# Long-press menus have a tap path on iOS

## What

member-row\.tsx:81 and character-filter-rail-parts.tsx:224 open menus from onContextMenu, which iOS WebKit does not fire on long-press. Unverified on device. Source: ~/Archives/orbweaver-reviews/phone-pass-oct10.md Suspicions.

## Why

The owner uses iOS; a long-press-only door is dead there.

## Done when

Every onContextMenu-opened menu has a visible tap fallback, or a long-press handler that fires on iOS, with a CT for the tap path.

## Evidence

Filled at landing: what ran and where its output is.
