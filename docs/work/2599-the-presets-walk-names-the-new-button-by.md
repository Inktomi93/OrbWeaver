---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: testing
plan: surface-walk
---

# The presets walk names the New button by hand

## What

`tests/e2e/support/surface-sections.ts` creates a disposable preset through a button named with a typed literal, because production has no name module for it.

## Why

A renamed button would fail the walk for the wrong reason.

## Done when

Production prints the name from a copy module and the driver reads it.

## Evidence

Filled at landing: what ran and where its output is.
