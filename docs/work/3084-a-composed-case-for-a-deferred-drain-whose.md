---
kind: work
status: open
updated: 2026-11-14
priority: P2
area: tests
plan: test-foundation
---

# A composed case for a deferred drain whose frozen host is disabled

## What

`tests/server/domain/chat/persistence/deferred-reclaim-rows.suite.int.test.ts` drains after a host self-leave and a handoff, but no case drains a row whose frozen host is disabled. `runDeferredRound` in `packages/server/src/domain/chat/verbs/turn.ts` drops that row through `loadRoom`'s consent read. A review probe showed the drop: `{ ran: 0, dropped: 1 }`, no completion, and a `deferred-turn-dropped` notice with reason `consent` to the member.

## Why

The disabled-host drop is the drain's consent control and nothing pins it.

## Done when

The suite holds a case where a member queues a turn, the frozen host is disabled, and the drain drops it as `consent` with no completion; a positive control with the host enabled runs the row.

## Evidence

Filled at landing: what ran and where its output is.
