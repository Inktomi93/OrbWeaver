---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: tests
plan: test-foundation
---

# The hidden-value test cases each fail when the projection is removed

## What

Five of the per-kind cases in hidden-values-inert pass even with statedIntent passing everything through (effort, budget, display, parallel tools, compression on a model with no reasoning), and an agent-sdk adaptive model whose daemon reports no effort levels may lose its effort under the projection.

## Why

A case that passes without the code it guards proves nothing, and a lost effort silently changes a Claude reply.

## Done when

Each per-kind case fails with the projection removed, or is dropped with its reason; the agent-sdk adaptive case keeps its effort, with a test.

## Evidence

Filled at landing: what ran and where its output is.
