---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: regex
plan: import-robustness
---

# Bound how many compile-door workers run at once

## What

`probeFindCompiles` (`packages/server/src/primitives/regex/compile-probe.ts`) starts one worker per save, each with its own heap limit and a wall deadline, and only the general request bucket limits how many run together.

## Why

A burst of saves can hold many workers and their heaps at once on a small host.

## Done when

A fixed number of probe workers run at once and the rest queue, with a case that saves past that number and sees each verdict.

## Evidence

Filled at landing: what ran and where its output is.
