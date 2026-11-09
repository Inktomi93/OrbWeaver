---
kind: tooling
status: open
updated: 2026-11-09
priority: P3
area: tooling
plan: cross-surface-consistency
---

# The design-audit line-length rule skips truncated single-line runs

## What

The line-length rule counts single-line truncated aria-hidden facet previews (about 100 characters) as prose lines.

## Why

A false line-length finding on a truncated preview buries the real prose findings.

## Done when

A truncated single-line run is not judged as prose, a real long prose line still is, and the rerun on the walked surfaces drops the false hits.

## Evidence

Filled at landing: what ran and where its output is.
