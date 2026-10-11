---
kind: work
status: open
updated: 2026-10-11
priority: P3
area: client
---

# Persona model follow-ups from the 885 lane

## What

Gaps the 885 lane named and left: (1) when the pinned persona is deleted the host learns only from the room block line changing to Card follows the host's persona; decide whether a notification bell entry is owed. (2) The X is now your default notice after deleting the default ignores the showNotifications setting; gate it or record why not. (3) Saving a blank persona Name is never sent, so the saved name stands but the field shows blank until refetch; show a validation error instead. (4) A held pin's lore book is not in the turn's lore pool (spec B.10 in the persona-surfaces stickler report). (5) The header comment of tests/server/domain/chat/persona-resolution.suite.int.test.ts still lists the old seed order; the suite is byte-protected, so the owner decides whether the comment may change. Verifier P3s on the merged code: (6) the delete reseat (captureSeatsForDelete, re-seat in packages/server/src/entry/compose/search-discovery.ts near line 315 via setParticipantActivePersona) can overwrite a seat the owner switched between capture and reseat, and a seat switched onto the doomed persona after capture is nulled and never re-seated; (7) if the owner leaves between capture and reseat, setParticipantActivePersona throws participantNotFound after the persona row is already deleted, so remove reports failure and skips fanReach and the audit entry (domain/persona/verbs/remove.ts); (8) a disabled but still seated pin owner: the room block says the owner is no longer in the room while the roster still lists them, and Re-pin offers their persona, which the server refuses with notPersonaOwner (persona-room-block.tsx, memberPins).

## Why

Each is a small correctness or clarity gap in a just-shipped model; filing keeps them from being lost after the lane closes.

## Done when

Each of the eight points is fixed or has a recorded ruling in this item's Evidence.

## Evidence

Filled at landing: what ran and where its output is.

Owner ruling 2026-10-11 (point 5): the stale seed-order header comment in tests/server/domain/chat/persona-resolution.suite.int.test.ts may be corrected (owner approved the change despite the byte protection).
