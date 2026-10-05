---
kind: bug
status: open
updated: 2026-10-05
priority: P1
area: inference
---

# Connections stored with more than 32 utility calls at once are clamped on read

## What

The write-time bound of 32 on features.concurrency.summarize does not cover rows stored before it: user_connections.declared is read raw (packages/db/src/schema/connection.ts:78) and the agent-sdk runtime check was removed (backends/agent-sdk/index.ts:114), so an old row above 32 spawns that many subprocesses and fails connection.list output validation. Found by the inference round 2 review.

## Why

One stale row can break the connection list and over-spawn the agent SDK.

## Done when

A value above the bound is clamped where declared features are read, or the final baseline regen proves no stored row can carry one; a test covers the read.

## Evidence

Filled at landing: what ran and where its output is.
