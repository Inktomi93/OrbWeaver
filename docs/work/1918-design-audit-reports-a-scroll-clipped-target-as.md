---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
plan: surface-walk
---

# Design audit reports a scroll-clipped target as obscured

## What

tooling/src/ui-audit/ops/walker/obscured-reach.ts treats a point clipped by a scroll ancestor as covered, so it reports Databank at 844x390 although a real tap scrolls the rail and opens it. Treat a target reachable by scrolling as reachable.

## Why

A false P0 trains readers of the audit to skip its findings.

## Done when

The audit passes that case, and a truly covered target still reports.

## Evidence

Filled at landing: what ran and where its output is.
