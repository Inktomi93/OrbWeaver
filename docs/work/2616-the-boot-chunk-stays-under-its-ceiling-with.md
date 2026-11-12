---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: checked-law
---

# The boot chunk stays under its ceiling with no dev-only instrument

## What

A build check that fails when the aggregate boot chunk passes its ceiling or carries a dev-only instrument. The sites whose comments claimed the checker are listed under M6 in the missing-checker list under reports/law-census.

## Why

Two comments claimed a script that does not exist.

## Done when

The check fails on a planted dev-only import and on an over-ceiling build, and both comments cite it.

## Evidence

Filled at landing: what ran and where its output is.
