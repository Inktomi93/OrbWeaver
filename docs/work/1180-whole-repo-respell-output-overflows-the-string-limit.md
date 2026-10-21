---
kind: bug
status: blocked
updated: 2026-10-21
priority: P1
blocked: owner
---

# Whole-repo respell output overflows the string limit

## What

pnpm ast respell --near 60 --json over the whole repository fails after 2:56 at 6.4 GB with 'ast: Invalid string length': the result is serialized into one string larger than the V8 maximum.

## Why

The whole-repo respell is 1133's remaining done line; it now fails on output, not analysis.

## Done when

respell streams or chunks its JSON output so the whole-repo run completes, with output byte-identical to a scoped run's records for the same scope; measured time and peak are recorded on 1133.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
