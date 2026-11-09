---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: client
lane: wt/agent-aeeecdd1ff632fbb2
plan: cross-surface-consistency
---

# Schedule rows stay distinct on the phone

## What

At 320 the schedule row title truncates its cadence and owner, so the weekly and monthly Assets garbage collection rows both read Assets garbage collection · Every …; the accessible names are distinct.

## Why

Two rows that look identical cannot be told apart by a sighted user.

## Done when

At 320 two schedules of one kind are visibly distinct, the cadence and owner wrap or move to a second line, with a CT at 320.

## Evidence

Filled at landing: what ran and where its output is.
