---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: tooling
plan: checked-law
---

# Catches that ignore the error and answer a modeled value hide faults the same way a null does

## What

The census for the blind-catch lint rule found a second group in server and inference source: catches that never read the caught error and return a modeled value such as false, an empty list or a failure result. The rule as mounted refuses only a catch that answers null, undefined or nothing, so these pass. Each turns any fault, a database error or a programming error included, into an ordinary negative answer. The same defect also has a promise spelling, a catch callback that returns a constant. The site list is in the gate lane's report for the blind-catch rule under reports/lanes.

## Why

A fault reported as false or an empty list is as invisible as one reported as null, and the caller acts on a wrong answer. The rule already walks every catch, so widening it is the cheap part; the sites are the work.

## Done when

Each listed site is narrowed to the error classes it expects with the rest rethrown, or reads and logs the error under a cited ruling. The rule then refuses a catch or a promise catch callback that never reads its error whatever it returns, with planted controls for each new shape, and lands at zero with no suppression. Sites where a fault now fails a turn or a background run are named for the reviewer.

## Evidence

Filled at landing: what ran and where its output is.
