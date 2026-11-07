---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: testing
plan: test-foundation
---

# The library-planes restore case holds its budget under load

## What

The restore case timed out at the default test budget under a parallel run and passed alone. Tag it slow or split it.

## Why

A shared box gives false reds, and a false red hides a real one.

## Done when

The case holds under a parallel run.

## Evidence

Filled at landing: what ran and where its output is.
