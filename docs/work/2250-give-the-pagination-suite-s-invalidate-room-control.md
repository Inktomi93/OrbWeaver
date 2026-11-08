---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Give the pagination suite's invalidate-room control one name constant

## What

platform-history-pagination.suite.ct.tsx spells the Invalidate the room control name three times, while the story file \_chat-room-shell-stories.tsx defines it.

## Why

Three copies of one test-control name drift apart.

## Done when

The story file exports the name and the suite imports it.

## Evidence

Filled at landing: what ran and where its output is.
