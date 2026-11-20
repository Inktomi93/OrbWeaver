---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: testing
plan: test-foundation
---

# The history pagination CT reaches its original canon within its budget

## What

The case "ordinary history reaches its original canon" in the platform history pagination suite times out at its budget in about half of runs on a clean tree at moderate load.

## Why

A case that fails without a product defect hides real reds.

## Done when

The cause is named (the product is slow, or the case waits on the wrong signal) and fixed there, with no larger budget, and the case passes ten runs in a row at load under the core count.

## Evidence

Filled at landing: what ran and where its output is.
