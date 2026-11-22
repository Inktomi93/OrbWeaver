---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
plan: unwired-code
---

# The procedures scan covers the debug routes or rules them out

## What

pnpm unwired procedures covers routes under packages/server/src/entry/http but not the debug routes under packages/server/src/foundation/observability/debug.

## Why

An uncalled debug route is surface nobody watches.

## Done when

The debug routes are in the scan with planted cases, or the design section records why they stay out.

## Evidence

Filled at landing: what ran and where its output is.
