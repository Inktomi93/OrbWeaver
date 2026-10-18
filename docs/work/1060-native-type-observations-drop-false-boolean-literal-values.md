---
kind: bug
status: open
updated: 2026-10-18
priority: P2
area: tooling
plan: test-foundation
---

# Native type observations drop false boolean literal values

## What

In the shared native type observations, getLiteralValue drops a false boolean literal (tooling/src/floor/code-facts/type-observations.ts around line 353, found by claude-b's 1049 lane), so a consumer that reads a literal type sees no value for false.

## Why

Any gate that dispatches on a boolean literal type, such as an ok:false refusal case, misreads the false value.

## Done when

False literal values are observed like true ones, with a planted control showing a consumer that reads ok:false.

## Evidence

Filled at landing: what ran and where its output is.
