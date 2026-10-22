---
kind: bug
status: open
updated: 2026-10-22
priority: P2
area: server
plan: test-foundation
---

# Qualify retained-cohort continuation

## What

Qualify the native-continuation cases in `tests/server/domain/stats/persistence/retained-cohort.suite.int.test.ts`. Diagnose any incomplete run through the real retained-generation path.

## Why

An incomplete run supplies no behavioral verdict for transfer of paid facts and first-write guards.

## Done when

The selected continuation cases complete with their ownership and accounting assertions intact. Establish contention before changing timing budgets.

## Evidence

The maintained suite contains retained-owner, accepted-copy, stale-owner refusal and native-continuation cases. Current runtime acceptance remains open.
