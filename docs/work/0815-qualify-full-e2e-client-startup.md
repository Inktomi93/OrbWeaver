---
kind: tooling
status: open
updated: 2026-10-22
priority: P1
area: ci
plan: test-foundation
---

# Qualify full E2E client startup

## What

Qualify existing model-free E2E startup across every selected mode. Exercise cold startup, global setup and genuine client readiness before specs begin.

## Why

A ready smoke mode does not establish readiness for the full mode selection.

## Done when

Selected-mode setup and full model-free E2E startup pass without weakening readiness, authentication, ownership or isolation. Diagnose any cold-start failure before changing budgets.

## Evidence

`tests/e2e/support/global-setup.ts` seeds and warms modes configured by `tests/e2e/support/modes.ts`. The mechanism exists; full runtime acceptance remains open.
