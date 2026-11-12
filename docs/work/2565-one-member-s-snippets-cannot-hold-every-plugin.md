---
kind: bug
status: doing
updated: 2026-11-12
priority: P2
area: plugins
lane: wt/agent-a84eabc3e8d8f0a49
---

# One member's snippets cannot hold every plugin Worker

## What

One member can run enough concurrent snippets to occupy every plugin Worker, and another owner's call waits for a Worker until one frees.

## Why

The Worker pool is shared across owners, so one member's load delays every other owner's plugins.

## Done when

A per-owner bound on concurrently held Workers leaves a Worker available to another owner, with the bound's home and value ruled in the ledger. A test fills one member's allowance and shows another owner's call served without waiting on that member. The leg 7 security review under reports/review, finding F-2, holds the probe.

## Evidence

Filled at landing: what ran and where its output is.
