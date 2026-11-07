---
kind: bug
status: open
updated: 2026-11-07
priority: P3
area: server
plan: test-foundation
---

# A refused stored schedule tells its holder why

## What

A member's stored bare import-st schedule now refuses at run time and only logs a warning each cadence, and the owner's Retry on a member's legacy bare row shows a misleading toast. Show the holder the refusal and name it on the row.

## Why

A schedule that silently does nothing looks broken.

## Done when

The schedule's holder sees why it refused, and the Retry toast names the real reason.

## Evidence

Filled at landing: what ran and where its output is.
