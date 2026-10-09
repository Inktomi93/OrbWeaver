---
kind: tooling
status: doing
updated: 2026-10-09
priority: P1
area: ci
lane: codex/nightly-e2e-repair
---

# Restore full E2E client startup

## What

Make the full model-free E2E harness reach genuine client readiness for every selected mode before its tests begin.

## Why

Full qualification stops in single-user warm-up while waiting for the app-ready marker. Smoke succeeds with its isolated mode.

## Done when

The cold-start failure has a demonstrated cause and discriminating controls. Selected-mode setup and real model-free E2E startup pass without weakening readiness, authentication, ownership or production isolation.

## Evidence

Filled at landing: what ran and where its output is.
