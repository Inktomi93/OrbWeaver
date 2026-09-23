---
kind: bug
status: done
updated: 2026-09-23
priority: P2
area: inference
evidence: 41815d9b5
---

# Record per-turn cost on resumed agent-sdk sessions

## What

The SDK's total_cost_usd, modelUsage.costUSD and webSearchRequests are session totals that a resumed or forked session carries forward from its transcript, so every resumed turn records the whole session's cost.

## Why

Stats and cost rollups for subscription chats are inflated.

## Done when

Each turn records its own cost (session-total bookkeeping across resume and fork, subtracting the prior total), with a red-first test on a resumed frame.

## Evidence

Filled at landing: what ran and where its output is.
