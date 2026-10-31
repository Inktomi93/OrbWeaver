---
kind: bug
status: open
updated: 2026-10-31
priority: P3
area: tests
plan: test-foundation
---

# Opening a room in the enlarged-text suite sometimes finds no Message field on WebKit

## What

In tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx on WebKit, about one full run in four fails when the Message textbox is not found right after the room opens (seen on the 300% phone Jump to latest case and once on the 200% desktop case); the same case passes 6 of 6 alone.

## Why

The room-open step waits on something other than the room's own readiness, so a slow mount fails the case.

## Done when

The room-open helper waits on the room's real ready signal; the suite passes 20 of 20 full WebKit runs.

## Evidence

Filled at landing: what ran and where its output is.
