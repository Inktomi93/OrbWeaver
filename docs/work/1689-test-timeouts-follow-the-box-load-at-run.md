---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# Test timeouts follow the box load at run time, not at config load

## What

vitest.config.ts computes testTimeout and hookTimeout with budget() once, when the config loads (lines 85, 86, 143), so a run that starts quiet and meets load keeps the quiet 5 s and 10 s budgets. budget() itself re-reads the box on each call (tooling/src/floor/host/load-budget.ts:239). Apply the scaled budgets per file through a setup file (vi.setConfig) so the stretch follows load at run time. Also move canon-input-writers.suite's public Stop case onto registerCancellationRoom() (7.4 s per-case boot today) and check handoff-debt-rows.suite's detached SDK marker case, which failed once under load.

## Why

Suites that boot real processes pass only with the load-scaled budget, and the budget is frozen at config time, so a loaded run that started quiet times out.

## Done when

A run started at low load that then meets load stretches its budgets; a planted control proves the per-file reread; the two named suites pass ten runs under load.

## Evidence

Filled at landing: what ran and where its output is.
