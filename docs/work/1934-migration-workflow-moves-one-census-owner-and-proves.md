---
kind: tooling
status: doing
updated: 2026-11-06
priority: P2
area: tooling
lane: wt/agent-a00920a0fbd92d9db
plan: cross-surface-consistency
---

# Migration workflow moves one census owner and proves it

## What

A workflow\.yaml plus a plan generator: census to map, rewrite, Biome, census rerun, scoped typecheck. class-token-to-prop proves elements with importBindingOf and counts skips through metrics.

## Why

Hand migration of recipe moves is slow and error prone, and the census can be both plan and proof.

## Done when

One command migrates row\.justify and stack.justify in a scratch tree to zero census hits with a clean typecheck.

## Evidence

Filled at landing: what ran and where its output is.
