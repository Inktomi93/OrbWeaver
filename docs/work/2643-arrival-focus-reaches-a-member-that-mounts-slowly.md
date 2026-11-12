---
kind: bug
status: doing
updated: 2026-11-12
priority: P3
area: client
lane: wt/agent-ab272ed4fef9cc84a
plan: cross-surface-consistency
---

# Arrival focus reaches a member that mounts slowly

## What

useFocusOnMount takes focus from the page body only within a fixed short window after the press that removed the opening row. A member whose read is slow mounts after the window and focus stays on the page. Under component test load the World Info entry's arrival missed the window once and then passed on repeat.

## Why

A slow real read drops a keyboard or screen reader user to the top of the page with no report.

## Done when

Arrival keys on the press that removed the control and not on a clock, or the window is justified against a measured read latency, with a component test under a held read that asserts the member takes focus when it mounts.

## Evidence

Filled at landing: what ran and where its output is.
