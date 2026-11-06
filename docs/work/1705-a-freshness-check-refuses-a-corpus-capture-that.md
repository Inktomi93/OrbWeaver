---
kind: tooling
status: open
updated: 2026-11-06
priority: P2
area: tests
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
