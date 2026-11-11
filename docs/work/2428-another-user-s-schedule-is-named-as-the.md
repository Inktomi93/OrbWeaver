---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: client
plan: cross-surface-consistency
---

# Another user's schedule is named as the viewer's own until the users list loads

## What

packages/client/src/features/workloads/components/schedules-section.tsx resolves a schedule's owner handle from admin.listUsers. Until that query loads, ownerHandleFor returns null for a foreign schedule, so its switch, Edit and Delete carry the same accessible name as the viewer's own schedule of the same kind and cadence. CI run 42926668922 failed tests/client/features/workloads/components/schedule-enabled-switch.ct.tsx at line 98 on a strict-mode duplicate; it passes locally.

## Why

A screen reader announces someone else's schedule as the viewer's own while the list loads, and two controls share one name.

## Done when

A schedule whose owner is not the viewer never reads as the viewer's own, before or after the users list loads, and a CT holds the users read pending and asserts the two names differ.

## Evidence

Filled at landing: what ran and where its output is.
