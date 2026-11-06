---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# History pager edge cases: repeat offline press, dismissed press over a live bridge failure, invalidation dropping a press

## What

Three cases in the pager's failure state. Press offline, Dismiss, press again gives no alert, because connection in history-failures.ts reacts only to a new offline state. A dismissed press failure hides a live bridge failure, because press stays true so the shown failure never falls through. A room invalidation during a press cancels the read with no retry, and the press is dropped silently; create-collection-surface.ts has that retry and transcript-window\.tsx does not.

## Why

A press the reader made must end in rows or a visible reason, and a live failure must not hide behind a dismissed one.

## Done when

Each case has a test at the production entry, and a press always ends in new rows or a visible state.

## Evidence

Filled at landing: what ran and where its output is.
