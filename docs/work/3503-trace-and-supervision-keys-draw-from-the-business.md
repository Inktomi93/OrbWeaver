---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: server
plan: test-foundation
---

# Trace and supervision keys draw from the business id source

## What

`newOpaqueId` keys detached supervision and domain event dispatch traces, for example in `packages/server/src/entry/compose/event-bus.ts`. The keys are never stored. Each draw sits inside its emitting chain, so none races a seeded write now.

## Why

A draw that a request or a timer reaches shifts every seeded id after it, and a corpus publish then depends on timing.

## Done when

Trace keys come from a source separate from business ids, or a probe shows every remaining draw is ordered by its chain.

## Evidence

Filled at landing: what ran and where its output is.
