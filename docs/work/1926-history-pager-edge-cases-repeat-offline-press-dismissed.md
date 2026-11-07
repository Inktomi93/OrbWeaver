---
kind: bug
status: doing
updated: 2026-11-07
priority: P2
area: ui
lane: wt/agent-a301ae7da33728c6d
plan: cross-surface-consistency
---

# History pager edge cases: repeat offline press, dismissed press over a live bridge failure, invalidation dropping a press

## What

A room invalidation during a press cancels the read with no retry, and the press is dropped silently. create-collection-surface.ts has that retry and transcript-window\.tsx does not.

## Why

A press the reader made must end in rows or a visible reason, and a live failure must not hide behind a dismissed one.

## Done when

A press interrupted by an invalidation ends in new rows or a visible state, with a test at the production entry.

## Evidence

Filled at landing: what ran and where its output is.
