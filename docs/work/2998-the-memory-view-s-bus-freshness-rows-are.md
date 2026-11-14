---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: test-foundation
---

# The memory view's bus freshness rows are proven

## What

Three invalidation rows re-read `chat.memoryView`: `chatUpdated` and `turnCompleted` in `packages/client/src/data/invalidation.ts`, and `settingsChanged` in `packages/client/src/data/invalidation-user.ts`. No test proves any of them; the Memory tab CT has no bus, so a strike from another tab, a host's strike while a member watches, a handoff and the host's Memory switch are covered by reading alone.

## Why

A dropped row leaves a member or a second tab showing a struck scene as remembered, or a restored one as struck, with nothing to say the list is stale.

## Done when

A case delivers each of the three events to an open Memory tab and sees the list change: a strike made on another device shows struck, a turn's new summary shows after `turnCompleted`, and the host's switch turning memory off shows the host-off state.

## Evidence

Filled at landing: what ran and where its output is.
