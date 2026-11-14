---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: stats
---

# Deleting a message leaves last activity equal to a rebuild

## What

Only turns count as character activity. The message-delete path's stats delta still moves the live last activity, so the live value and a rebuild from canon differ after a delete. The delta is built in `packages/server/src/domain/chat/substrate/stats-delta.ts` and the rebuild is `packages/server/src/domain/stats/persistence/rebuild-from-canon.ts`.

## Why

The law states the live path equals a rebuild over the same data, and a last-activity time that changes on Recompute cannot be trusted.

## Done when

A server case through the composed root deletes a message and finds last activity equal on the live path and after a rebuild, red before and green after.

## Evidence

Filled at landing: what ran and where its output is.
