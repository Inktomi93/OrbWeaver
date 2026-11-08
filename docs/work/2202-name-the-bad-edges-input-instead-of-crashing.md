---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# Name the bad edges input instead of crashing test-audit

## What

An empty file or a directory passed as --edges to test-audit dies with a raw stack and exit 2 in tooling/src/test-audit/ops/edges.ts.

## Why

The operator gets a stack trace instead of the missing step.

## Done when

Both inputs exit with a usage error that names the expected file, with a test each.

## Evidence

Filled at landing: what ran and where its output is.
