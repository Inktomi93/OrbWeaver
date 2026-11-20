---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: server
plan: import-robustness
---

# Server tests for the continue depth offset and the author scope

## What

`packages/server/src/domain/chat/assembly/history-regex.ts` subtracts one from the depth on a continue, and the prompt pass reads each row's author stamps and the room standing (`roomStandingOf(standingSeatsOf(seats))` in `packages/server/src/domain/chat/assembly/gather.ts`). No composed-root case can fail on either: tests/kit/regex/author-scope.test.ts (on its branch) drives the kit executor alone.

## Why

Replacing the room standing with no seats, or nulling the stamps, passes every server test.

## Done when

One composed-root case runs a continue under a `{min: -1, max: -1}` prompt script on the extended reply; one runs a host-only prompt script in a two-human room and again after a handoff. Each is red with its input removed.

## Evidence

Filled at landing: what ran and where its output is.
