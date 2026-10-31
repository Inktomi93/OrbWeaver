---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: chat
plan: cross-surface-consistency
---

# Show the message position number for the Show message ID setting

## What

Owner ruling: the Show message ID toggle shows the message's position in the room as #n, as SillyTavern and Moonlit do, not the stable internal TypeID, which wraps to two lines under the Ripple portrait. Derive n from the message's sequence in the room the way the transcript orders rows.

## Why

The internal id reads as noise and breaks the Ripple portrait layout; the owner chose parity.

## Done when

Every chat style shows #n when the toggle is on; the number matches the row's position after edits, deletes and swipes; a CT pins it under the Ripple portrait and in the metadata row of one other style.

## Evidence

Not built; the number needs a source the client does not hold. `MessageNumber` in `packages/client/src/features/chat/components/message-metadata-row.tsx` and the Ripple welded slot in `packages/client/src/features/chat/components/message-row-avatar.tsx` render `message.id`. The transcript orders rows by `seq` (`mergePages` in `packages/client/src/features/chat/components/transcript-window.tsx`), but `seq` is not a position: `deleteMessagesStatement` in `packages/server/src/domain/chat/persistence/canon-write.ts` leaves a gap and `healPersonaAttribution` in `packages/server/src/domain/chat/persistence/import-write.ts` relies on that. The client also holds only a window of the room (the live tail plus loaded earlier pages), so counting loaded rows gives a number that changes as history loads. A true #n is the count of rows the viewer can see up to and including this one. That count must come from the server with the viewer's history floor applied (`resolveHistoryFloorSeq`), on `MessageView` or on the page, and must refresh on delete, move and swipe events. That is a wire shape and a read-path change the owner has not ruled on. The existing CT (`tests/client/features/chat/components/platform-moonlit-card-shape.suite.ct.tsx`, "message number") already pins the Ripple portrait and the bubble metadata row and is the place to assert the number once the source exists.
