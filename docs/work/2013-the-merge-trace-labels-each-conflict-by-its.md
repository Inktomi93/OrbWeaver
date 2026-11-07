---
kind: tooling
status: doing
updated: 2026-11-07
priority: P3
area: tooling
lane: wt/agent-a15da337713c922a6
plan: cross-surface-consistency
---

# The merge trace labels each conflict by its class family

## What

conflictAxis in packages/ui/src/lib/class-merge.ts labels layout classes wrongly: flex-col reads orb:spacing, inline-full reads orb:radius, whitespace-nowrap reads orb:font-weight.

## Why

A reader of snap --cascade must judge from the class pair, so the axis column misleads anyone who trusts it.

## Done when

Each trace row's axis matches the class family, with a test over the mislabelled pairs.

## Evidence

Filled at landing: what ran and where its output is.
