---
kind: decision
status: open
updated: 2026-10-02
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

The owner approved enforcement now, with intentional export changes updating the contract. Implementation remains outside the launch-closeout assignment. This item stays open until its enforcement exists.
