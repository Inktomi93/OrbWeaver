---
kind: work
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
---

# respell --near names declaration-level differences

## What

A respell --near pair at 100% that differs only by an index signature (or another declaration-level member) prints an empty diff, so the reader sees a near-duplicate with no stated difference. From the 954 lane.

## Why

A near-pair report with no visible difference cannot be acted on.

## Done when

respell --near names each declaration-level difference (index signatures, call and construct signatures) in its diff, with a red-first case.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
