---
kind: tooling
status: open
updated: 2026-10-11
priority: P1
area: ci
---

# Restore full E2E client startup

## What

Make the full model-free E2E harness reach genuine client readiness for every selected mode before its tests begin. Run the diagnostics workflow once and keep its startup transcript as this item's evidence.

## Why

Full qualification stops in single-user warm-up while waiting for the app-ready marker. Smoke succeeds with its isolated mode.

## Done when

The cold-start failure has a demonstrated cause and discriminating controls. Selected-mode setup and real model-free E2E startup pass without weakening readiness, authentication, ownership or production isolation.

## Evidence

Orphaned claim: its codex branch is fully merged into main and no session holds it. Done when still needs a hosted run to confirm.

Hosted check: the scheduled CI qualification on e88487bf62 failed in every ct and node partition; e2e-smoke did not run.

Filled at landing: what ran and where its output is.
