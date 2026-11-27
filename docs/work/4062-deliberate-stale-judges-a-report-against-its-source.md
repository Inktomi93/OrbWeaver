---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: unwired-code
---

# deliberate-stale judges a report against its source, not HEAD

## What

tooling/src/unwired/deliberate.ts marks a report unjudged whenever HEAD moved, so a docs-only commit marks every report unjudged.

## Why

Staleness that ignores what changed teaches the reader to ignore it.

## Done when

A docs-only commit after a run leaves the report judged and a commit touching a scanned world still marks it.

## Evidence

Filled at landing: what ran and where its output is.
