---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: client
plan: cross-surface-consistency
---

# Persona model follow-ups from the 885 lane

## What

Gaps the 885 lane named and left: (1) when the pinned persona is deleted the host learns only from the room block line changing to Card follows the host's persona; decide whether a notification bell entry is owed. (2) The X is now your default notice after deleting the default ignores the showNotifications setting; gate it or record why not. (3) Saving a blank persona Name is never sent, so the saved name stands but the field shows blank until refetch; show a validation error instead. (4) A held pin's lore book is not in the turn's lore pool (spec B.10 in the persona-surfaces stickler report). (5) The header comment of the persona-resolution suite, a [restoration register](../plans/restoration-register/design.md) entry, still lists the old seed order; the suite is byte-protected, so the owner decides whether the comment may change. Verifier P3s on the merged code: (6) the delete reseat (captureSeatsForDelete, re-seat in packages/server/src/entry/compose/search-discovery.ts near line 315 via setParticipantActivePersona) can overwrite a seat the owner switched between capture and reseat, and a seat switched onto the doomed persona after capture is nulled and never re-seated; (7) if the owner leaves between capture and reseat, setParticipantActivePersona throws participantNotFound after the persona row is already deleted, so remove reports failure and skips fanReach and the audit entry (domain/persona/verbs/remove.ts); (8) a disabled but still seated pin owner: the room block says the owner is no longer in the room while the roster still lists them, and Re-pin offers their persona, which the server refuses with notPersonaOwner (persona-room-block.tsx, memberPins).

## Why

Each is a small correctness or clarity gap in a just-shipped model; filing keeps them from being lost after the lane closes.

## Done when

Each of the eight points is fixed or has a recorded ruling in this item's Evidence.

## Evidence

Fixed:

- Point 2. The new-default notice after deleting the default now follows `persona.showNotifications`, as the setting's own copy says ("the crown or the pin moves"). `packages/client/src/features/persona/components/persona-list.tsx` gates it; `nowDefaultNotice` in `packages/client/src/features/persona/hooks/use-playing-persona.ts` is the one spelling for both crown notices. Test: `tests/client/features/persona/components/persona-delete-default-notice.ct.tsx` (red on the ungated source for the notifications-off case; both cases green after; Chromium).
- Point 3. A blank Name shows "Name can't be empty." and holds the write (the form validator; the autosave driver gates on validity). `packages/client/src/features/persona/hooks/use-persona-form.ts`, `PERSONA_NAME_REQUIRED` in `packages/client/src/features/persona/lib/persona-editor-model.ts`; `personaInputFromForm` always sends the name now. Test: `tests/client/features/persona/components/persona-name-required.ct.tsx` (red on the old source, green after; Chromium).

Closed as gone:

- Point 5. The header of `tests/server/domain/chat/persona-resolution.suite.int.test.ts` was rebuilt and holds no seed order; nothing to correct (ast-grep is not the tool for comments; `rg -n -i 'seed|crown|default'` over the file finds only `DEFAULT_PROMPT_CONFIG`).

Open, each needs a decision or a wire change; recommended default given:

- Point 1 (bell entry when the pinned persona is deleted). Default: no bell entry. The room block line already changes and the host sees it where they act; a bell entry for a consequence of the host's own co-member's delete adds an inbox row with no action. Needs the owner.
- Point 4 (a held pin's lore book in the turn's lore pool). It changes what the model receives (inference request shaping); stop and rule it before any change.
- Points 6 and 7 (reseat after delete). The race needs two writers between the capture and the reseat in `packages/server/src/domain/chat/verbs/capture-persona-seats-for-delete.ts`; no test can drive that interleaving through the composed root. Recommended fix: at reseat time re-read the captured chats and write only seats that are still present and still empty, so a switched seat is kept and a left owner is skipped without throwing. A seat switched onto the doomed persona after capture stays unfixable without one transaction around capture, delete and reseat.
- Point 8 (a disabled but still seated pin owner). `ChatDetail` participants carry no enabled flag, so the client cannot tell. Recommended fix: add `enabled` to the participant wire shape from `resolveUserEnabled`, drop disabled owners from `memberPins`, and word the room block line for them. It is a contract change, so it is the owner's call.

Owner ruling (point 5): the stale seed-order header comment in the persona-resolution suite may be corrected; the suite's test code stays untouched and its comments may change.
