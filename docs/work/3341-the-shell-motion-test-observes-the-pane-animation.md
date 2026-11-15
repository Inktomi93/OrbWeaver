---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: client
plan: test-foundation
---

# The shell motion test observes the pane animation without racing it

## What

The app-shell motion CT presses Hide list panel and then waits for the main region to hold a running animation. On a slow runner the animation has ended before the wait first looks, so the wait times out. It passes on a fast box and fails in CI.

## Why

A test that depends on catching an animation in flight fails by machine speed and hides real failures in its shard.

## Done when

The case records the animation from the press itself (a listener armed before the click, or the motion's start and end events) and passes with the CPU throttled; it still fails when the pane's motion is removed.

## Evidence

Filled at landing: what ran and where its output is.
