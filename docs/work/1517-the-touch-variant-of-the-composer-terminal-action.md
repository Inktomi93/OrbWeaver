---
kind: bug
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# The touch variant of the composer terminal action suite flakes on main

## What

tests/client/features/app-shell/surfaces/platform-composer-terminal-action.suite.ct.tsx fails about one run in five in its touch variant only (4 of 20 on main, 3 to 4 of 6 to 10 solo on a branch): revealByTouch times out at 30 s waiting for the action to come into view. Attaching the scrollend listener before the pan did not fix it; no product timing bug was found yet.

## Why

A flaky CT gives no verdict and hides a real regression in the composer's terminal action reach.

## Done when

The cause is named (the touch pan, the scroll settle signal, or a product timing defect) and fixed with a real lifecycle signal, never a delay or retry; the suite passes 30 of 30 repeated runs on Chromium and WebKit.

## Evidence

Filled at landing: what ran and where its output is.
