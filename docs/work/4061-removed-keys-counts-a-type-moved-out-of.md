---
kind: tooling
status: open
updated: 2026-11-27
priority: P2
area: tooling
plan: unwired-code
---

# removed-keys counts a type moved out of contracts as moved, not removed

## What

A member whose declaration leaves packages/contracts/src but survives under a domain contract with the same name and owner type is reported as a removed key with many unresolved rows.

## Why

Moves bury a real removal in noise.

## Done when

A planted move reports no removed key and a planted deletion still reports.

## Evidence

Filled at landing: what ran and where its output is.
