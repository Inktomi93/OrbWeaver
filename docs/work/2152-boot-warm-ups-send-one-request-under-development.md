---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: client
plan: cross-surface-consistency
---

# Boot warm-ups send one request under development React

## What

useWarmSavedRosters sends rosterPreset.list twice on a Chats boot under development React: the effect replays while the query is still pending with no data, so the cache check misses. Its CT passes on the first moment it sees one call. Warm through the query client's own deduplicating prefetch, check other warm-ups that use the same check-then-fetch shape, and make the CT count requests after the network settles.

## Why

A duplicate boot request in development hides the real request count that production tests and reviews read, and the same shape may duplicate elsewhere.

## Done when

A Chats boot sends exactly one rosterPreset.list request under development React, measured after the network settles, and the CT fails when a second request goes out.

## Evidence

Filled at landing: what ran and where its output is.
