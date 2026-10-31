---
kind: bug
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# The Presets arrival focus case in list-arrival-focus flakes under load

## What

tests/client/features/app-shell/surfaces/list-arrival-focus.ct.tsx "arriving in presets" failed in several lanes this session under load (the tab walk never reached a row), and passed alone each time; it has not been reproduced on a clean tree.

## Why

A flaky focus case hides a real arrival-order regression.

## Done when

The cause is named (a readiness signal the walk does not wait on, or a product focus race) and fixed with a real lifecycle signal; the case passes 30 of 30 repeated runs on Chromium under load.

## Evidence

Filled at landing: what ran and where its output is.
