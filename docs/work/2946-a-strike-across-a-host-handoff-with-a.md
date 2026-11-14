---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# A strike across a host handoff with a card copy re-keys to the copy, proven

## What

The handoff restamp in `packages/server/src/domain/chat/memory/strikes.ts` (`restampStrikesForHandoff`) moves a strike's record of the struck copy from the departing host's card to the nominee's copy. No case runs it: the handoff case hands off with no card offer, so the plan carries no card copies.

## Why

With the character column set to null on delete, the restamp no longer guards the strike itself; it keeps the view's struck entry on the copied character's summary. Nothing proves that.

## Done when

A composed-root case hands off with an offer that copies the seated card, strikes the card's own summary before the handoff, and after it the view carries the strike on the copy's summary; the case goes red with the restamp removed.

## Evidence

Filled at landing: what ran and where its output is.
