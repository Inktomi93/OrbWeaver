---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
plan: unwired-code
---

# The columns scan reads a spread row parse and buckets primary keys

## What

schema.parse({ ...row }) over a selected row reads the keys the schema names, and a declared primary key is the row identity; the scan reports both as never-read (24 rows).

## Why

False never-read rows hide the real ones.

## Done when

Red-first planted cases from reports/unwired/columns-judge.md pass through tooling/src/unwired/index.ts, and the orchestrator reruns pnpm unwired columns.

## Evidence

Filled at landing: what ran and where its output is.
