---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# The regex editor's pipeline stage separator stays inside its stage

## What

In the regex editor page on a phone at 200% and 300% text, a separator inside a pipeline stage is wider than the stage and the settings column scrolls sideways. The stages are drawn in `packages/client/src/features/regex/components/regex-pipeline-panel.tsx`.

## Why

A column that scrolls sideways has stopped reflowing.

## Done when

A component test in `tests/client/features/config/surfaces/` mounts the regex editor page at 390px wide with 200% and 300% text and asserts that the column's scroll width equals its client width. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
