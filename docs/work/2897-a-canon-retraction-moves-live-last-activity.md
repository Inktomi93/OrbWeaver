---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: server
---

# A canon retraction moves live last activity

## What

Deleting a message, selecting another variant, an edit that appends a variant and a reattribution each set live last activity to the time of the change, because every retraction in `packages/server/src/domain/chat/substrate/stats-delta.ts` stamps the current time. A rebuild from canon keeps the time of the last turn, so the live figure and the rebuilt figure disagree after any of those verbs.

## Why

Only turns count as activity by an owner ruling, and a statistic that changes when it is rebuilt cannot be trusted.

## Done when

A composed case for each of the four verbs shows live last activity equal to the rebuilt value, red before the change.

## Evidence

Filled at landing: what ran and where its output is.
