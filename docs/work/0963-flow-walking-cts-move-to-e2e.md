---
kind: work
status: open
updated: 2026-10-24
priority: P2
plan: restoration-register
---

# Flow-walking CTs move to e2e

## What

Classify flow-walking CT cases using the [restoration decisions](../plans/test-foundation/design.md#restoration-decisions). Move uncovered critical journeys to corpus E2E. Reuse existing E2E coverage for duplicates and delete superseded flow CTs. Keep component, measurement and controlled-state cases in CT.

## Why

A flow CT pays the cost of stubbing every call and still cannot see a broken wire, which e2e sees for free.

## Done when

No CT uses a fabricated backend to walk a complete route or app-shell journey. Each selected case names its retained coverage, replacement or reason for removal. Cross-layer cases identify distinct failures; they do not repeat the same permutation matrix.

## Evidence

Filled at landing: what ran and where its output is.
