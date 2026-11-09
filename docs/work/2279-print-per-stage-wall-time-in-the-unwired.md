---
kind: tooling
status: open
updated: 2026-11-09
priority: P3
area: tooling
plan: unwired-code
---

# Print per-stage wall time in the unwired fields log

## What

The fields log prints field counts and site counts but no stage time.

## Why

Finding the slow stage needed a hand-built timing harness, and the modest-hardware rule needs that answer cheaply.

## Done when

The fields log prints wall time per world and for the literal stage.

## Evidence

Filled at landing: what ran and where its output is.
