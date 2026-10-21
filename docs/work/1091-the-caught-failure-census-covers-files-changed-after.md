---
kind: tooling
status: blocked
updated: 2026-10-21
priority: P2
area: tooling
blocked: owner
---

# The caught-failure census covers files changed after its generation

## What

The caught-failure census misses sites in files changed after it was generated; controller.ts has real unproven sites the census never listed.

## Why

A census that misses changed files reports less work than exists.

## Done when

The census is regenerated or keyed to current content, and the missed sites are listed with their owners or verdicts.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
