---
kind: tooling
status: doing
updated: 2026-11-27
priority: P3
area: tooling
lane: wt/agent-aa44702c7ee3d87c4
plan: unwired-code
---

# The delete trial traces a refutation through type narrowing back to its write

## What

For prefixCacheSchemas.none.format the trial's error at packages/inference/src/funnel/resolve-cache.ts cascades through narrowing from the write a few lines up, and the trial counts it as a read.

## Why

A refutation the trial cannot attribute hides whether the member is really read.

## Done when

The trial attributes a narrowing-cascade error to the write that caused it, with a red-first case, and the row's verdict follows from its real readers.

## Evidence

Filled at landing: what ran and where its output is.
