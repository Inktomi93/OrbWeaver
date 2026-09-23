---
kind: bug
status: open
updated: 2026-09-23
priority: P3
area: client
---

# Give the chat activity list a live in-view freshness driver

## What

The client query for `automation.listChatActivity` has no bus signal or reachable invalidation row, so a chat's rule activity list goes stale while it is on screen. The warning policy `query-freshness-coverage-debt` (`tooling/src/verify/gates/query-freshness-coverage-debt.ts`) reports that one consumption. Add the activity signal and its seam invalidation, then delete `query-freshness-coverage-debt` in the same change.

## Why

The debt was parked at warning under GitHub issue 1965, and that board no longer tracks work. The warning needs a live owner or it reads as tracked forever.

## Done when

`automation.listChatActivity` refreshes in view from a bus signal, `query-freshness-coverage` covers it, and `query-freshness-coverage-debt.ts` is deleted.

## Evidence

Filled at landing: what ran and where its output is.
