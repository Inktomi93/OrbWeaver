---
kind: bug
status: open
updated: 2026-11-23
priority: P1
area: client
---

# The renamed appearance attribute warning finds a rename with a successor

## What

tests/client/features/config/lib/theme-css-warnings.test.ts fails its renamed-attribute case: the test finds no renamed appearance attribute with a successor in the production rename table. The appearance settings consolidation changed the rename table the test draws its case from.

## Why

CI's Node job is red, and either the warning lost its subject or the test's premise no longer holds.

## Done when

The test passes against the production rename table: the warning still names a replacement for a renamed attribute, or the case is rebuilt on a real renamed attribute; the defect control turns it red.

## Evidence

Filled at landing: what ran and where its output is.
