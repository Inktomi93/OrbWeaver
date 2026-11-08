---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# Stop the citation parser reading a caller count as a line

## What

tooling/src/test-audit/lib/trace.ts reads a.ts:12, 3 callers as cited lines 12 and 3, and its comma list crosses a newline.

## Why

test-audit credits a test with lines it never cites.

## Done when

A comma list ends at a non-number word and at a newline, with a test for each.

## Evidence

Filled at landing: what ran and where its output is.
