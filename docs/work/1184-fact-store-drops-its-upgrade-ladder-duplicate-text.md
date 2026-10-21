---
kind: work
status: blocked
updated: 2026-10-21
priority: P2
blocked: owner
---

# Fact store drops its upgrade ladder, duplicate text and repeated rechecks

## What

The semantic inventory cache migrates in place through a long upgrade ladder (floor/code-facts database.ts) although it is rebuildable from source; it stores each source text once per world (about twice the distinct texts); and it rechecks the same inputs and coverage several times per call beyond the one post-worker recheck the plan requires (semantic-inventory.ts:152-176, 433-441). Evidence: reports/review/semantic-store-prior-art.md section 6.

## Why

A derived cache needs a version and a rebuild, one copy of each text and one recheck; the rest is cost and migration risk with no guarantee behind it.

## Done when

A storage version mismatch discards and rebuilds the cache; source text is content-addressed once across worlds with pinned generations intact; only the plan's post-worker pre-publication recheck remains; identical facts on the scoped worlds and measured store size and warm time before and after.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
