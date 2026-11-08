---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: client
plan: cross-surface-consistency
---

# Insights model labels stay distinguishable

## What

The Insights Generations by model chart truncates every label to the same anthropic/claude-… prefix, so the bars cannot be told apart.

## Why

A chart whose labels read the same carries no information.

## Done when

Each model label in the chart is distinguishable at desktop and phone widths, by keeping the distinctive suffix or a two-line label, with a CT on a corpus that has several models from one provider. Source: acceptance part 2 report K1.

## Evidence

Filled at landing: what ran and where its output is.
