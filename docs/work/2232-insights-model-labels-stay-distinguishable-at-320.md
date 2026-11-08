---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: client
plan: cross-surface-consistency
---

# Insights model labels stay distinguishable at 320

## What

The Generations by model labels now differ at desktop and 390, but at 320 they collide again: several Gemini preview models and several Claude models share one truncated label.

## Why

A chart whose labels read the same carries no information on the narrowest phone.

## Done when

Every model label is distinguishable at 320, with a CT cell at 320 on a corpus with several models from one provider. Source: acceptance part 3 report, 2171.

## Evidence

Filled at landing: what ran and where its output is.
