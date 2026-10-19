---
kind: bug
status: open
updated: 2026-10-19
priority: P2
---

# caught-failure readers miss the false positives the 1049 phase 3 audit escalated

## What

The 1049 phase 3 audit found caught-failure-ownership findings that are reader gaps, not defects. Among them: frameworkOwns and underlyingWorkCall stop at Promise.all, and the isFailureOutcome CallExpression branch returns before preservesFailureValue. Records and proposed mustPass rows are in claude-b's 1049p3 output (gfp.json) and the per-shard reports under reports/review/1049-p3/. Sequence after 1098, which owns the caught-failure readers.

## Why

A reader gap makes the gate demand a waiver for code that already owns its failure, so real waivers hide among false ones.

## Done when

Each escalated case is a planted mustPass row that passes, with a red-first control that still flags the near-miss, and its waiver is removed; bounded under D328.

## Evidence

Filled at landing: what ran and where its output is.
