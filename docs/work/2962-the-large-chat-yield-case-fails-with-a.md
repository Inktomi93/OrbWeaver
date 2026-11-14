---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: import
plan: test-foundation
---

# The large-chat yield case fails with a wide margin when stages are not bounded

## What

`tests/server/domain/import/loader/large-chat-yields.int.test.ts` uses the smallest one-line chat that spans several stages, so the case runs fast. With the stage bounds removed, the one-line shape exceeds the gap bound by a small factor; the swipe shape exceeds it by a large one.

## Why

On a faster runner the one-line shape could pass with the bound removed.

## Done when

The one-line shape fails by a wide margin with the stage bounds removed, without a slow tag: a larger shape that still runs under the slow threshold, or a bound the case can inject.

## Evidence

Filled at landing: what ran and where its output is.
