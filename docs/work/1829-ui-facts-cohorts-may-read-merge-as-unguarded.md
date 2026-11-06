---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: testing
---

# ui-facts cohorts may read Merge as unguarded through the same literal-only gap KEEP_BESIDE had

## What

Make the ui-facts destructive cohort accept a Keep or Cancel step spelled with the shared DIALOG_VERBS constants, not only literal text, so a Merge control confirmed that way is not read as unguarded. Reproduce first.

## Why

tooling/src/ui-facts/cohorts.ts finds an inline confirm by button text through buttonWithText. The eslint rule KEEP_BESIDE had the same literal-only gap before it learned the constants. A control confirmed through the constant may read as unguarded.

## Done when

A fixture where a destructive control sits beside a Cancel spelled with the constant reads as guarded. If the cohort already reads it so, the item lands with that evidence.

## Evidence

Filled at landing: what ran and where its output is.
