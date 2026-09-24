---
kind: work
status: open
updated: 2026-09-24
priority: P1
area: chat
---

# Measure the history cache with per-turn sections active

## What

Run a live cache check with Memory, Databank and a guided steer active. Use the default preset, on an Anthropic wire and on one automatic-prefix provider. Record the history cache read ratio before any placement change.

## Why

The dynamic system half sits before the history, so any per-turn change there misses every history breakpoint. The size of that loss is unmeasured.

## Done when

Cache read ratios per provider are recorded in the probe results, with Memory and Databank on and off.

## Evidence

Filled at landing: what ran and where its output is.
