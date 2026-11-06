---
kind: decision
status: open
updated: 2026-11-06
priority: P2
area: server
plan: unwired-code
---

# Decide the stats message_dates_approx flag

## What

Show approximate activity. Stats charts mark a bucket built from migrated, approximate dates, reading message_dates_approx through a stats view. Owner ruling: show it.

## Why

The rollup writes the flag on every rebuild and nothing reads it since its wire field was removed. No reader is not the same as dead.

## Done when

A stats view carries the flag, the activity chart marks approximate buckets, and a test pins it at the door with a CT for the mark.

## Evidence

Filled at landing: what ran and where its output is.
