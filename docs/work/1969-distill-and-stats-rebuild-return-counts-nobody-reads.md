---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: server
plan: unwired-code
---

# Distill and stats rebuild return counts nobody reads

## What

Drop the tagsStaged count and return from stageSuggestions in discovery/verbs/distill.ts, and the bucketCount and modelCount returns from computeOwner in stats/persistence/rebuild-from-canon.ts.

## Why

The result fields they fed were deleted, and each function has one caller that ignores the value, so the counting is dead work.

## Done when

Neither function returns the count, charCount stays, and the discovery and stats rebuild suites pass.

## Evidence

Filled at landing: what ran and where its output is.
