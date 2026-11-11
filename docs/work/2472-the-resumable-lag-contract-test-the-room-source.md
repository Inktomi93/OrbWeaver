---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: testing
lane: wt/agent-a06d7ca7c655446af
---

# The resumable-lag contract test the room-source header promises does not exist

## What

packages/server/src/transport/trpc/contract/room-source.ts says the resumable property is pinned against the queue overflow-policy table by a contract test ("a contract test pins the two tables against each other"). No such test exists: no file under tests/ imports ROOM_SOURCES, the frame queue, roomLagged, or the policy table (the only resumable hits in the tree are an unrelated e2e workload case and a surface-data case), and OVERFLOW_POLICIES in transport/trpc/stream/frame-queue.ts is module-local, not exported, so a cross-checking test cannot read it today. The invariant itself HOLDS, verified by hand: the two lag rows (chat, notifications) are exactly the two resumable: true rooms. Stream tests exercise shed and resume behaviorally (\_held-room.ts, chat-late-join) but never compare the tables. Source: reports/code-write context: reports/codebase-review/units/server-transport.md.

## Why

A header promising a door that is not there is the dead-reference shape inside live source: a new channel row can pair resumable: true with collapse (a shed that can never heal, the lost-terminal class the socket header mourns) and tsc stays green because both tables are total Records and nothing cross-checks the columns. The claim also misleads the next author into skipping the test as already covered.

## Done when

Either export OVERFLOW_POLICIES and add the contract test the header promises (for every channel: policy is lag exactly when the source is resumable), or fix the header to name the real enforcement. A type-level pairing (one table deriving the other column) is the stronger fix if the owner prefers a build error over a test.

## Evidence

Filled at landing: what ran and where its output is.
