---
kind: decision
status: open
updated: 2026-09-25
priority: P3
---

# Decide the api-surface freeze and its unheld internal-versus-public half

## What

Nothing holds drift between the public and internal package surfaces. ui-exports-map-complete covers @orb/ui only, and deps:orphan-ratchet covers only the unused half. tooling/src/verify/lib/registry.ts:274-275 says the freeze promotes after buildout, and has never run. Decide when the freeze fires and what gate or stage holds that half.

## Why

Confirmed live at registry.ts:274-275. A symbol can move from internal to public, or back, with every check still green.

## Done when

The owner has ruled on the trigger. Either a surface-freeze stage exists in the registry, or an ADR records that the half stays unheld and why.

## Evidence

Filled at landing: what ran and where its output is.
