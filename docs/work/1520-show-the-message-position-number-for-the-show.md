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

Built with a read-time position, not a stored field. This departs from the brief's stored `position`; primary approved it.

Why read-time: a stored number needs renumbering on delete, move and undo, a backfill, and a per-recipient floor offset. A read-time count of the viewer's rows needs no migration and no write path, and `seq` keeps its delete gaps (`deleteMessagesStatement`, `healPersonaAttribution`).

"Rows the viewer can see" is every canon row at or above the viewer's history floor. That is the `loadMessagesPage` predicate, and `useMessageItems` renders every such row, including rows hidden from the model. Rows under the floor are never counted, so no number discloses them.

`MessageView.position` is optional on purpose. It is stamped only at viewer-scoped delivery: `listMessages`, `getMessageWindow`, the durable replay and the live fan-out. Durable `chat_events` rows hold no position, so an old log needs no backfill and a floorless server read cannot carry a room-wide count to a floored viewer. Mutation returns and turn outcomes stay unnumbered; only the `startChat` seed reaches the cache that way, and its confirming read numbers the row.

Read cost, measured on a 20,000-row room: the page count over `messages_chat_seq_unique` takes about 3 ms, because a page is one unbroken run of the viewer's rows. The `row_number()` read for view events takes about 56 ms unfloored and about 9 ms for a floor near the tail. It runs once per view event per subscriber, or once per replay, and never for a delta. Delete, move and swipe events already refetch `listMessages` and `getMessageWindow` through `chatCanonReads`, which renumbers every loaded page.

Integration: `tests/server/domain/chat/verbs/message-position.int.test.ts` and `tests/server/transport/trpc/stream/recipient-isolation.int.test.ts`. Rendered: the "message number" cases in `tests/client/features/chat/components/platform-moonlit-card-shape.suite.ct.tsx`.
