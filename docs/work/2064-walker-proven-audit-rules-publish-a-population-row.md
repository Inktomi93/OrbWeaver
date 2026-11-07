---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: tooling
plan: cross-surface-consistency
---

# Walker-proven audit rules publish a population row

## What

The audit rules that collect.ts lists as walker-proven, gradient-text included, publish no population row, so a silent result has no denominator and reads the same as a collector that looked at nothing.

## Why

Acceptance reads silence as clean, so a rule that never looked must say so.

## Done when

Each walker-proven rule publishes a population row and its silent proof reads judged or no-candidate from it.

## Evidence

Filled at landing: what ran and where its output is.
