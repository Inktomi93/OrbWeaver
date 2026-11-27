---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: unwired-code
---

# The procedures report drops its vestigial disagreements field

## What

tooling/src/unwired/graph/procedures.ts always emits an empty disagreements list; D357 rules the tool is one reference graph with no second engine.

## Why

The field claims a cross-check that cannot exist.

## Done when

The field and its readers are gone.

## Evidence

Filled at landing: what ran and where its output is.
