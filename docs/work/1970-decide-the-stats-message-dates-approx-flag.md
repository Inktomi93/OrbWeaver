---
kind: decision
status: blocked
updated: 2026-11-06
priority: P3
area: server
blocked: owner
plan: unwired-code
---

# Decide the stats message_dates_approx flag

## What

Decide whether the flag marking an activity bucket as built from migrated, approximate dates gets a door or is removed with its column and accumulator.

## Why

The rollup writes the flag on every rebuild and nothing reads it since its wire field was removed. No reader is not the same as dead.

## Done when

The decision is recorded. If kept, a stats view shows approximate buckets and a test pins it. If dropped, a numbered migration removes the column and the accumulator field is gone.

## Evidence

Filled at landing: what ran and where its output is.
