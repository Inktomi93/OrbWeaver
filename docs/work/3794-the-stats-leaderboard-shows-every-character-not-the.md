---
kind: bug
status: doing
updated: 2026-11-27
priority: P3
area: stats
lane: wt/agent-a6726678d1a085caf
plan: unwired-code
---

# The Stats leaderboard shows every character, not the first fifty

## What

The leaderboard client sends no limit (packages/client/src/features/stats/surfaces/analytics-list-surface.tsx), the server defaults to 50 (packages/server/src/domain/stats/verbs/leaderboard.ts) and returns the uncapped total, and the client never reads the total.

## Why

A library past fifty characters loses the rest of the ranking with no sign, reachable only by search.

## Done when

The leaderboard is a server-paged list that loads past the first page and states the total, and a CT covers a library larger than one page.

## Evidence

Filled at landing: what ran and where its output is.
