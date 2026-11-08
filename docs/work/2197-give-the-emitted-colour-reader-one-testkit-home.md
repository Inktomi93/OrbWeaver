---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Give the emitted-colour reader one testkit home

## What

The emitted-colour reader the derivation audit row U7 names is still copied in crossover-base.test.ts and input-border.test.ts from tone-scope-misses.ts.

## Why

Three copies of one reader drift apart, and U7 of item 1495 stays open while they exist.

## Done when

One home exports the reader and every copy imports it.

## Evidence

Filled at landing: what ran and where its output is.
