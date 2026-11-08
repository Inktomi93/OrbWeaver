---
kind: work
status: doing
updated: 2026-11-08
priority: P2
area: client
lane: wt/agent-a799dd0a8dea091dc
plan: test-foundation
---

# Coalesce chat-bus refetches without losing a newer row or a press

## What

The client refetches a room's reads once per chat-bus frame, so a burst of frames starts one refetch round each and every loaded page restarts. Reports lane cb-tfK and review cb-tfK hold the measurements and the failed design.

## Why

The storm costs the pager suite seconds per case and runs the same way in a busy room.

## Done when

A wave of bus events coalesces its refetch; invalidation-chat-wave and invalidation-chat-press DOM tests stay green; a burst case shows the coalesced read count; ARRIVALS_SETTLE_MS and its uses leave platform-history-pagination.suite.ct.tsx. Hazards: cancel stale reads synchronously at enqueue, spend at most one press attempt per wave, and do not revert inactive reads the wave will not refetch.

## Evidence

Filled at landing: what ran and where its output is.
