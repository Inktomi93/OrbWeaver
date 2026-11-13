---
kind: work
status: open
updated: 2026-11-13
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

The story name has one home that both the story file and the suite import, and `pnpm depcruise` is clean. A separate names module beside the story is refused by the dependency rule `browser-mounts-closed-imports`, so the home is the story file itself or a module that rule allows.

## Evidence

Filled at landing: what ran and where its output is.
