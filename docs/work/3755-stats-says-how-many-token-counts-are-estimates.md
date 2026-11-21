---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: stats
---

# Stats says how many token counts are estimates

## What

statsDeltaSchema (packages/contracts/src/stats/index.ts) has tokensInEstimatedSamples and five sibling counts that nothing writes, so Stats cannot tell reported counts from estimated ones; local servers often report none.

## Why

A token total that mixes estimates with reported counts reads as exact.

## Done when

The stats writer fills the estimated-sample counts from each turn's usage, Stats shows the share of estimated counts where it is above zero, a rebuild from canon reproduces them, and a stats test drives an estimated and a reported turn.

## Evidence

Filled at landing: what ran and where its output is.
