---
kind: bug
status: open
updated: 2026-10-20
priority: P2
area: tooling
plan: test-foundation
---

# Hosted maintained node controls fail project selection and corpus lifecycle qualification

## What

The maintained node CI artifact at `reports/review/ci-39469280964-node-artifact/test-report.json` records a project-selection assertion mismatch and timeouts in corpus-fixture-lifetime, corpus-search and corpus controls. The project-selection case includes the native argv separator; its configured mode set includes OIDC while the asserted set omits it. The timeout causes are not diagnosed.

## Why

These maintained controls prevent complete node qualification. A timeout is not a behavioral verdict or evidence of a flake.

## Done when

Reproduce each failure against the exact selected population, correct the actual runner or fixture defect without dropping cases, and qualify native project selection plus corpus producer, clone and search lifetimes. Measure contention before changing timing budgets.

## Evidence

Filled at landing: what ran and where its output is.
