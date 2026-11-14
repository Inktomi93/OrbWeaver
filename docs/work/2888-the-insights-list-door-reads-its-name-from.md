---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# The Insights list door reads its name from a names module

## What

The Insights list door is named by a literal inside `packages/client/src/features/discovery/lib/corpus-section.tsx`. A test finds it through the section label for characters, which is the same word by convention only.

## Why

A name with no home drifts from the tests and the other controls that read it.

## Done when

The name is exported from the discovery feature's names module, the component renders the export, and the leaderboard text-scale test imports it.

## Evidence

Filled at landing: what ran and where its output is.
