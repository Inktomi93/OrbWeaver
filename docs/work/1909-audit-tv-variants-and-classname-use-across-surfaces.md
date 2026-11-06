---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Audit tv() variants and className use across surfaces for token, size and state consistency

## What

Compare how related surfaces use recipes, classes, tokens, control sizes, spacing and interaction states. Record each divergence with its surfaces and its owning recipe, then fix shared owners and file what needs a design ruling.

## Why

The stylesheet review covered the sheets only. Consistency between surfaces lives in tv() variants and className use, and nothing has audited that layer as a whole.

## Done when

Every related surface family has a recorded result, each divergence is fixed or filed, and the variant census runs on exact data.

## Evidence

Filled at landing: what ran and where its output is.
