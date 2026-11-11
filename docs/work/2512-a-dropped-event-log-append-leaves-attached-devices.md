---
kind: bug
status: doing
updated: 2026-11-11
priority: P2
area: chat
lane: wt/agent-a672cae2c753c5fe3
---

# A dropped event-log append leaves attached devices stuck in an open turn

## What

When the append of a chat event to the event log fails after canon has committed, the bus reports the drop and fans nothing (packages/server/src/domain/chat, the publication substrate and the bus; emit stays total by its flag). Reproduced on the composed root with the event-log insert refused: when the dropped event is the one that closes a turn, the reply is stored and a reload is correct, but every attached device keeps the turn open, with Stop in place of Send and a Stop press spinning until the device reattaches. A dropped announcement of a canon change outside a turn leaves other devices showing stale canon. Dropped in-turn events are harmless, because the closing event invalidates canon. The comment that described this cited a design fork with no record.

## Why

Live devices hang on a log row that was never written, though canon is correct. The engine cannot fix it by failing the turn, because the turn succeeded.

## Done when

A dropped event that closes a turn or announces a canon change is still fanned live, without a sequence, by a per-event policy that is exhaustive over the event types. A test drops each closing event and shows an attached device's turn closes, the log has no gap and a reattach is still correct. A decision record holds the ruling and the server rule's durable-first sentence states the exception.

## Evidence

Filled at landing: what ran and where its output is.
