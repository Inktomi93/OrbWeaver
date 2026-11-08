---
kind: tooling
status: doing
updated: 2026-11-08
priority: P2
area: tests
lane: wt/agent-a05d401fe0a7ad9c7
plan: test-foundation
---

# A freshness check refuses a corpus capture that lags the migration chain

## What

Corpus captures carry the migration head and a schema hash, and a freshness check refuses a capture that lags the migration chain.

## Why

A stale capture tests an old schema with no report.

## Done when

A capture behind the migration head fails the check with the lag named.

## Evidence

Filled at landing: what ran and where its output is.
