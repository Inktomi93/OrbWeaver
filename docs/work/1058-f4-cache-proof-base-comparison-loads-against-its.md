---
kind: tooling
status: doing
updated: 2026-10-19
priority: P3
area: tooling
lane: wt/agent-acb14f15173490df8
plan: test-foundation
---

# f4 cache proof base comparison loads against its pinned base

## What

pnpm probe:f4-cache-proof fails on main in its base comparison: the pinned BASE_REF's history-budget.ts lacks contextLimitOf.

## Why

The probe's base comparison cannot run, so it proves nothing.

## Done when

The base comparison loads, by re-pinning or by shimming only that export, and both comparisons run.

## Evidence

Filled at landing: what ran and where its output is.
