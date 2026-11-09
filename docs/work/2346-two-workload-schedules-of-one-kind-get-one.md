---
kind: bug
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-a9bacfb72c2c0d9ff
plan: cross-surface-consistency
---

# Two workload schedules of one kind get one name

## What

scheduleEnabledSwitchName in packages/client/src/features/workloads/lib/workloads-schedule-model.ts names a schedule by its kind label only, and so do the row title, Edit and Delete. Two schedules of one kind, such as a daily and a weekly token usage backfill, or another user's row seen by an admin, share every name.

## Why

Controls with one name for two rows cannot be told apart by a screen reader, by speech input or by a test.

## Done when

A schedule row's title, switch, Edit and Delete name the schedule by kind and cadence, plus the owner handle on another user's row, and a CT with two schedules of one kind finds each switch by its own name.

## Evidence

Filled at landing: what ran and where its output is.
