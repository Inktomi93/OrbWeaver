---
kind: tooling
status: open
updated: 2026-11-10
priority: P3
area: testing
plan: test-foundation
---

# Type-law closeout follow-ups from the final review

## What

The accept-review chips in packages/client/src/features/refinery/components/accept-review\.tsx moved off micro caps onto the shared status pill when the status vocabulary took them over, and no rendered review has judged the change. Before and after CT captures are in reports/cb-tlclose (before is the source from bfaf1da851^). The rest of the type-law closeout landed at the cb-tlclose merge.

## Why

Each is a gap between what the type-law rules claim and what a test proves.

## Done when

A rendered review judges the accept-review chips against the shared status pill and either accepts them or files the fix.

## Evidence

Filled at landing: what ran and where its output is.
