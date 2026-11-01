---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: chat
plan: unwired-code
---

# Read chat stream events back for replay and resume

## What

`chat_stream_events` is gone, with `chats.stream_seq`, `replayStreamEvents` and `streamEventBounds`. Owner's words: "whatever makes a second device, a second tab or someone joining work best and smoothest." That bar overrode the earlier ruling to keep the table.

The table could not do the job. Its rows landed only in the commit batch, so it held nothing for a turn in flight, and `chat_events` already held every token of that turn with its member bytes stamped. `chat_events` has no pruner and no ring: its rows leave only by the chat delete cascade.

The defect was the cursor-less attach: a reload, a second tab, a second device, or another member opening the room during a turn saw no ghost until the commit. `replayLiveTurn` now replays that turn from `chat_events`, from generation start through the attach's bounds read. The chat room folds each token run into one frame under its last row's `seq`, so one cursor hands over to the live tail. Log reads take a page at a time and yield the loop between pages.

## Why

Owner ruling above: one log per token, and the join is the bar.

## Done when

A device attaching with no cursor mid-turn shows the turn so far at once and continues live with no doubled, missing or reordered text; an integration test drives it through the production room with a member who must not see a frame; no write-only column or table remains.

## Evidence

- `tests/server/transport/trpc/stream/chat-late-join.int.test.ts` drives real sockets against a held scripted provider: catch-up and live tail, hidden span across the join, outsider, from-join floor on a pre-join reroll, abort, swipe.
- Red on the old pump: 6 of 6 fail with the catch-up disabled. Removing the floor and member scrub fails the member and floor cases.
- Load with a 20,000-token live turn, verifier's figures: one replay 367 ms wall; 6 at once 82 ms gap p50; 30 at once 484 ms p50. Attaches have no bound. This is not user-felt at production size: the longest stored turn is 545 deltas. Noted, not built.
- A refused send and a `generate` beside a send keep the ghost: every lifecycle event names its turn. `chatOpened` on a cursor-less attach stamps a floor below the turn in flight, so a drop before the replay frames replays the head.
- Owed: a rendered check of a reload mid-turn showing the ghost at once.
