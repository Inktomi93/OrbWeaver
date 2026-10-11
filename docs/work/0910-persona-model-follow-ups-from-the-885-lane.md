---
kind: work
status: open
updated: 2026-10-11
priority: P3
area: client
---

# Persona model follow-ups from the 885 lane

## What

Gaps the 885 lane named and left: (1) when the pinned persona is deleted the host learns only from the room block line changing to Card follows the host's persona; decide whether a notification bell entry is owed. (2) The X is now your default notice after deleting the default ignores the showNotifications setting; gate it or record why not. (3) Saving a blank persona Name is never sent, so the saved name stands but the field shows blank until refetch; show a validation error instead. (4) A held pin's lore book is not in the turn's lore pool (spec B.10 in the persona-surfaces stickler report). (5) The header comment of tests/server/domain/chat/persona-resolution.suite.int.test.ts still lists the old seed order; the suite is byte-protected, so the owner decides whether the comment may change.

## Why

Each is a small correctness or clarity gap in a just-shipped model; filing keeps them from being lost after the lane closes.

## Done when

Each of the five points is fixed or has a recorded ruling in this item's Evidence.

## Evidence

Filled at landing: what ran and where its output is.
