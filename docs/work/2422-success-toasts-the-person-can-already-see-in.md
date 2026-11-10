---
kind: work
status: open
updated: 2026-11-10
priority: P3
area: client
plan: cross-surface-consistency
---

# Success toasts the person can already see in place are removed

## What

reports/cb-rule-tools/success-sites.md lists notify.success sites whose result shows where the person acted, which the success rule in docs/law/client-architecture-state-and-gates.md section 11.5 calls a defect, plus one candidate.

## Why

A toast that repeats what the screen already shows is noise and breaks the success rule.

## Done when

Each listed site is removed or ruled out of sight in SUCCESS_OUT_OF_SIGHT with where its result lands, and the feedback cohort lists no in-place success.

## Evidence

Filled at landing: what ran and where its output is.
