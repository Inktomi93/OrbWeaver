---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: client
---

# One Retry leaves the World Info list failed when both its reads failed

## What

When the count and the list reads both fail, one Retry recovers the count and leaves the list's error. A component test case that reproduces it is at `reports/cb-walk-text/worldinfo-retry-probe.ct.tsx.txt`.

## Why

A person presses Retry once after a dropped request and still sees an error.

## Done when

One Retry recovers both reads, proved by that case committed green, and the walk's read-recovery checkpoint passes.

## Evidence

Filled at landing: what ran and where its output is.
