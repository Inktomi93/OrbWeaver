---
kind: tooling
status: doing
updated: 2026-11-12
priority: P3
lane: wt/agent-a672cae2c753c5fe3
plan: checked-law
---

# Single-chokepoint rulings get dependency rules: notifications.record, the settings store and the whole-blob settings writers

## What

The leg four law census under `reports/law-census` reports that the law names `notifications.record` and the settings key-value store as single chokepoints and names a whole-blob write guard for the settings writers, with no dependency rule or test behind any of them. Confirm on the tree, then add a dependency-cruiser rule per chokepoint and a test for the write guard.

## Why

A chokepoint that nothing enforces gains a second caller without a failure.

## Done when

Each rule is on at zero with a planted control in the native cruise tests, and the write guard has a test with a shown red.

## Evidence

Filled at landing: what ran and where its output is.
