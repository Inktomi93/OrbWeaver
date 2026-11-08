---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tooling
plan: surface-walk
---

# A later snap session call keeps its CPU throttle after a motion window

## What

The motion window restores rate 1 on a later --session call because the applied rate lives in LOAD_EMULATIONS in tooling/src/snap/ops/session.ts, which the motion motion window cannot import without a cycle through the motion window registry.

## Why

A session that set --cpu-throttle loses it after one motion action, so later timing runs measure an unthrottled page.

## Done when

A --session call that set --cpu-throttle still holds its rate after a motion action, with a case, and no import cycle.

## Evidence

Filled at landing: what ran and where its output is.
