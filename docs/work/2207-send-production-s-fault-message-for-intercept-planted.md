---
kind: bug
status: doing
updated: 2026-11-13
priority: P3
area: tests
lane: wt/agent-a1818ad5924fb1c71
plan: test-foundation
---

# Send production's fault message for intercept-planted CT failures

## What

Intercept-planted CT failures in tests/support/node/route-trpc.ts still send a scripted failure message instead of production's unclassified-fault message.

## Why

A CT that reads the planted failure asserts on wording production never sends.

## Done when

Planted failures go through the production fault formatter, with a case that reads the wire message, and every case that plants its own failure text as a server fault still proves the client hides it: `tests/client/data/husk-reaper-failure.ct.tsx` and `tests/client/features/chat/lib/temp-chat-sweep-failure.ct.tsx` read the planted text from the wire before asserting its absence on screen.

## Evidence

Filled at landing: what ran and where its output is.
