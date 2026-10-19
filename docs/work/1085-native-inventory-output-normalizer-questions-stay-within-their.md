---
kind: tooling
status: open
updated: 2026-10-19
priority: P1
area: tooling
plan: test-foundation
---

# Native inventory output-normalizer questions stay within their bound

## What

The output normalizer branch in ordinary-observations.ts still plans one key per column, field and parser call in a cohort closure. With the db program override fields it can exceed the Map size limit when one cohort closure holds enough output calls. The remap set is also spelled a second time as PURE_MEMBERS in json-column-array-field-proof.ts.

## Why

The same overflow class as 1070 can return as the closure grows.

## Done when

The output branch plans only the calls its readers consume, a test bounds its plan size, and the remap set has one home.

## Evidence

Filled at landing: what ran and where its output is.
