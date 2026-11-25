---
kind: bug
status: open
updated: 2026-11-25
priority: P3
area: tooling
plan: test-foundation
---

# The brand-flow multi-kind profile case reads a compiler peak that is sampled at zero under suite load

## What

tests/tooling/brand-flow/profile.int.test.ts expects every compiler peak above zero, but in a directory run of the unwired, brand-flow and doc suites one compiler's sampled peak read 0 MB, while the case passes alone.

## Why

A sampled peak that can miss a short-lived compiler turns the case red under load with no defect, and a flaky red teaches people to rerun reds.

## Done when

The profile records each compiler's peak from a reading that cannot miss it (a final sample at the compiler's exit, or its own reported peak), and the case passes in the directory run under load.

## Evidence

Filled at landing: what ran and where its output is.
