---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: checked-law
---

# Gate tests write only through the scratch writers

## What

A lint rule that refuses raw fs write calls in gate family tests. The sites whose comments claimed the checker are listed under M7 in the missing-checker list under reports/law-census.

## Why

The comments named a rule that does not exist.

## Done when

The rule runs at zero, a planted raw write fails its test, and the fixture comments cite it.

## Evidence

Filled at landing: what ran and where its output is.
