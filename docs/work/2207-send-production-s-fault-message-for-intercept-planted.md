---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Send production's fault message for intercept-planted CT failures

## What

Intercept-planted CT failures in tests/support/node/route-trpc.ts still send a scripted failure message instead of production's unclassified-fault message.

## Why

A CT that reads the planted failure asserts on wording production never sends.

## Done when

Planted failures go through the production fault formatter, with a case that reads the wire message.

## Evidence

Filled at landing: what ran and where its output is.
